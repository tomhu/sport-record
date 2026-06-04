/**
 * 本地文件数据库
 *
 * 使用 wx.getFileSystemManager 将数据持久化到本地文件系统。
 * 提供集合(collection)概念的 CRUD 操作，支持高级查询。
 * 完全兼容微信小程序，存储空间远大于 wx.getStorageSync (约 10MB 限制)。
 *
 * 集合:
 *   records       - 运动记录
 *   settings      - 设置（单文档）
 *   custom_sports - 自定义运动
 *   sport_edits   - 运动编辑覆盖（单文档）
 */

var fs = wx.getFileSystemManager();
var DB_BASE = wx.env.USER_DATA_PATH + '/sport-record-db/';

// 内存缓存 —— 每次读取操作命中内存，修改后同步写回文件
var cache = {};

/**
 * 确保数据库根目录存在
 */
function ensureDir() {
  try {
    fs.accessSync(DB_BASE);
  } catch (e) {
    fs.mkdirSync(DB_BASE, true);
  }
}

/**
 * 集合文件路径
 */
function colPath(name) {
  return DB_BASE + name + '.json';
}

/**
 * 从磁盘加载集合到缓存
 */
function loadCol(name) {
  if (cache[name]) return cache[name];
  try {
    var raw = fs.readFileSync(colPath(name), 'utf8');
    cache[name] = JSON.parse(raw);
  } catch (e) {
    cache[name] = [];
  }
  return cache[name];
}

/**
 * 将缓存中的集合写回磁盘
 */
function saveCol(name) {
  try {
    fs.writeFileSync(colPath(name), JSON.stringify(cache[name] || []), 'utf8');
  } catch (e) {
    console.error('[DB] 写入失败:', name, e);
    wx.showToast({ title: '数据保存失败', icon: 'error' });
  }
}

/**
 * 生成唯一 ID
 */
function genId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

/**
 * 判断文档是否匹配查询条件
 *
 * 支持操作符: $gt $gte $lt $lte $ne $in $regex
 * 无操作符时做严格相等比较
 */
function matchDoc(doc, query) {
  if (!query) return true;
  var keys = Object.keys(query);
  if (keys.length === 0) return true;

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var qv = query[key];
    var dv = doc[key];

    if (qv !== null && typeof qv === 'object' && !Array.isArray(qv)) {
      // 操作符对象
      var ops = Object.keys(qv);
      for (var j = 0; j < ops.length; j++) {
        var op = ops[j];
        var opVal = qv[op];
        switch (op) {
          case '$gt':   if (!(dv > opVal))   return false; break;
          case '$gte':  if (!(dv >= opVal))  return false; break;
          case '$lt':   if (!(dv < opVal))   return false; break;
          case '$lte':  if (!(dv <= opVal))  return false; break;
          case '$ne':   if (dv == opVal)     return false; break;
          case '$in':
            if (!opVal || opVal.indexOf(dv) === -1) return false;
            break;
          case '$regex':
            if (typeof dv !== 'string' || !new RegExp(opVal).test(dv)) return false;
            break;
          default:
            if (dv !== opVal) return false;
        }
      }
    } else {
      // 普通值 —— 严格相等
      if (dv !== qv) return false;
    }
  }
  return true;
}

// ============================================================
//  公开 API
// ============================================================

/**
 * 初始化数据库 —— 创建目录 & 迁移旧 wx storage 数据
 */
function init() {
  ensureDir();

  // 仅当 records 集合不存在时才尝试迁移
  try {
    fs.accessSync(colPath('records'));
    // 已存在，跳过迁移
  } catch (e) {
    // 文件不存在，执行迁移
    migrateFromStorage();
  }
}

function migrateFromStorage() {
  try {
    var hasOldData = false;

    // 迁移记录
    var oldRecords = wx.getStorageSync('records');
    if (oldRecords && oldRecords.length > 0) {
      var col = getCol('records');
      for (var i = 0; i < oldRecords.length; i++) {
        col.insert(oldRecords[i]);
      }
      hasOldData = true;
    }

    // 迁移设置
    var oldSettings = wx.getStorageSync('settings');
    if (oldSettings && Object.keys(oldSettings).length > 0) {
      var sCol = getCol('settings');
      sCol.insert(oldSettings);
      hasOldData = true;
    }

    // 迁移自定义运动
    var oldCustom = wx.getStorageSync('customSports');
    if (oldCustom && oldCustom.length > 0) {
      var cCol = getCol('custom_sports');
      for (var j = 0; j < oldCustom.length; j++) {
        cCol.insert(oldCustom[j]);
      }
      hasOldData = true;
    }

    // 迁移运动编辑
    var oldEdits = wx.getStorageSync('sportEdits');
    if (oldEdits && Object.keys(oldEdits).length > 0) {
      var eCol = getCol('sport_edits');
      eCol.insert(oldEdits);
      hasOldData = true;
    }

    // 清除旧 wx storage 数据
    if (hasOldData) {
      wx.removeStorageSync('records');
      wx.removeStorageSync('settings');
      wx.removeStorageSync('customSports');
      wx.removeStorageSync('sportEdits');
      console.log('[DB] 数据迁移完成');
    }
  } catch (e) {
    console.error('[DB] 迁移失败:', e);
  }
}

/**
 * 获取集合操作对象
 *
 * @param {string} name 集合名
 * @returns {object} { find, insert, insertMany, update, remove, count }
 */
function getCol(name) {
  loadCol(name);

  var col = cache[name];
  if (!col) {
    cache[name] = [];
    col = cache[name];
  }

  return {
    /**
     * 查询文档
     * @param {object}   [query]   查询条件
     * @param {object}   [options] { sort: { field: 1|-1 }, skip, limit }
     * @returns {array}
     */
    find: function (query, options) {
      var result = col.filter(function (d) { return matchDoc(d, query); });
      if (options) {
        if (options.sort) {
          var field = Object.keys(options.sort)[0];
          var dir = options.sort[field];
          result.sort(function (a, b) {
            var va = a[field], vb = b[field];
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
          });
        }
        if (options.skip) result = result.slice(options.skip);
        if (options.limit) result = result.slice(0, options.limit);
      }
      return result;
    },

    /**
     * 查询单条
     */
    findOne: function (query) {
      var result = this.find(query, { limit: 1 });
      return result.length > 0 ? result[0] : null;
    },

    /**
     * 插入一条
     * @returns {object} 插入后的文档（含 _id）
     */
    insert: function (doc) {
      var newDoc = {};
      for (var k in doc) {
        if (doc.hasOwnProperty(k)) newDoc[k] = doc[k];
      }
      newDoc._id = genId();
      col.push(newDoc);
      saveCol(name);
      return newDoc;
    },

    /**
     * 批量插入
     */
    insertMany: function (docs) {
      var inserted = [];
      for (var i = 0; i < docs.length; i++) {
        var d = {};
        for (var k in docs[i]) {
          if (docs[i].hasOwnProperty(k)) d[k] = docs[i][k];
        }
        d._id = genId();
        col.push(d);
        inserted.push(d);
      }
      saveCol(name);
      return inserted;
    },

    /**
     * 更新匹配文档
     * @returns {number} 更新的文档数
     */
    update: function (query, updates) {
      var count = 0;
      for (var i = 0; i < col.length; i++) {
        if (matchDoc(col[i], query)) {
          for (var k in updates) {
            if (updates.hasOwnProperty(k)) col[i][k] = updates[k];
          }
          count++;
        }
      }
      if (count > 0) saveCol(name);
      return count;
    },

    /**
     * 删除匹配文档
     * @returns {number} 删除的文档数
     */
    remove: function (query) {
      var before = col.length;
      cache[name] = col.filter(function (d) { return !matchDoc(d, query); });
      col = cache[name]; // ← 同步闭包引用，否则后续 insert 会写入旧数组
      var count = before - col.length;
      if (count > 0) saveCol(name);
      return count;
    },

    /**
     * 计数
     */
    count: function (query) {
      if (!query || Object.keys(query).length === 0) return col.length;
      return col.filter(function (d) { return matchDoc(d, query); }).length;
    }
  };
}

/**
 * 获取单文档集合的便捷方法（settings / sport_edits 这类 key-value 存储）
 */
function getDoc(name) {
  var docs = getCol(name).find();
  return docs.length > 0 ? docs[0] : null;
}

function setDoc(name, data) {
  var col = getCol(name);
  col.remove({});
  col.insert(data);
}

module.exports = {
  init: init,
  collection: getCol,
  getDoc: getDoc,
  setDoc: setDoc
};
