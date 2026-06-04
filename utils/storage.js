/**
 * 存储操作封装
 *
 * 底层已迁移至 database.js（文件型本地数据库），
 * 此处保持向后兼容的 API 接口 + 用户管理。
 */

var db = require('./database');

// ========== 工具 ==========

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

// ========== 用户管理 ==========

function getUsers() {
  return db.collection('users').find();
}

function getUserById(userId) {
  var list = db.collection('users').find({ userId: userId });
  return list.length > 0 ? list[0] : null;
}

function getCurrentUser() {
  var state = db.getDoc('app_state');
  if (!state || !state.currentUserId) return null;
  return getUserById(state.currentUserId);
}

function setCurrentUser(userId) {
  db.setDoc('app_state', { currentUserId: userId });
}

function createUser(name, avatar) {
  var users = getUsers();
  var userId = 'user_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  var user = {
    userId: userId,
    name: name || '用户',
    avatar: avatar || '🏃',
    isAdmin: users.length === 0,  // 第一个用户自动成为管理员
    createdAt: Date.now()
  };
  db.collection('users').insert(user);
  return user;
}

function updateUser(userId, data) {
  db.collection('users').update({ userId: userId }, data);
}

/**
 * 获取所有用户及其记录数（用于管理员面板）
 */
function getUsersWithStats() {
  var users = getUsers();
  var allRecords = db.collection('records').find();
  for (var i = 0; i < users.length; i++) {
    var cnt = 0;
    for (var j = 0; j < allRecords.length; j++) {
      if (allRecords[j].userId === users[i].userId) cnt++;
    }
    users[i].recordCount = cnt;
  }
  return users;
}

// ========== 数据查询辅助 ==========

/**
 * 按当前用户/管理员视角获取记录
 *
 * @param {string} mode - 'self'(默认) | 'all' | 指定 userId
 * @returns {Array}
 */
function getRecordsByView(mode) {
  var allRecords = db.collection('records').find({}, { sort: { createdAt: -1 } });

  if (mode === 'all') {
    var cur = getCurrentUser();
    if (cur && cur.isAdmin) return allRecords;
    mode = 'self';
  }

  if (mode && mode !== 'self') {
    return allRecords.filter(function (r) { return r.userId === mode; });
  }

  var user = getCurrentUser();
  if (!user) return [];
  return allRecords.filter(function (r) { return r.userId === user.userId; });
}

/**
 * 获取管理员视角设置
 */
function getAdminViewMode() {
  var s = getSettings();
  return s.adminViewMode || 'self';
}

function setAdminViewMode(mode) {
  var s = getSettings();
  s.adminViewMode = mode;
  saveSettings(s);
}

// ========== 运动记录 ==========

function getRecords() {
  // 兼容旧接口 —— 供非用户隔离场景使用
  // 新代码请用 getRecordsByView()
  try {
    return db.collection('records').find({}, { sort: { createdAt: -1 } });
  } catch (e) {
    console.error('读取记录失败:', e);
    return [];
  }
}

function saveRecords(records) {
  try {
    var col = db.collection('records');
    col.remove({});
    for (var i = 0; i < records.length; i++) {
      col.insert(records[i]);
    }
  } catch (e) {
    console.error('保存记录失败:', e);
    wx.showToast({ title: '保存失败', icon: 'error' });
  }
}

function addRecord(record) {
  var user = getCurrentUser();
  if (user) record.userId = user.userId;
  var col = db.collection('records');
  col.insert(record);
}

function deleteRecord(id) {
  db.collection('records').remove({ id: id });
}

// ========== 设置 ==========

function getSettings() {
  try {
    var doc = db.getDoc('settings');
    return doc || { weight: 65, adminViewMode: 'self' };
  } catch (e) {
    return { weight: 65, adminViewMode: 'self' };
  }
}

function saveSettings(settings) {
  try {
    db.setDoc('settings', settings);
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

function getWeight() {
  var settings = getSettings();
  return settings.weight || 65;
}

module.exports = {
  generateId: generateId,
  // 用户
  getUsers: getUsers,
  getUserById: getUserById,
  getCurrentUser: getCurrentUser,
  setCurrentUser: setCurrentUser,
  createUser: createUser,
  updateUser: updateUser,
  getUsersWithStats: getUsersWithStats,
  // 视角
  getRecordsByView: getRecordsByView,
  getAdminViewMode: getAdminViewMode,
  setAdminViewMode: setAdminViewMode,
  // 记录
  getRecords: getRecords,
  saveRecords: saveRecords,
  addRecord: addRecord,
  deleteRecord: deleteRecord,
  // 设置
  getSettings: getSettings,
  saveSettings: saveSettings,
  getWeight: getWeight
};
