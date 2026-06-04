/**
 * 存储操作封装
 *
 * 底层已迁移至 database.js（文件型本地数据库），
 * 此处保持向后兼容的 API 接口。
 */

var db = require('./database');

// ========== 工具 ==========

/**
 * 生成唯一ID
 */
function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

// ========== 运动记录 ==========

function getRecords() {
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
    return doc || { weight: 65 };
  } catch (e) {
    return { weight: 65 };
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
  getRecords: getRecords,
  saveRecords: saveRecords,
  addRecord: addRecord,
  deleteRecord: deleteRecord,
  getSettings: getSettings,
  saveSettings: saveSettings,
  getWeight: getWeight
};
