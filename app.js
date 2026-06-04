var db = require('./utils/database');

App({
  onLaunch: function () {
    // 初始化本地数据库（自动迁移旧数据）
    db.init();
  },

  // 获取当前体重设置
  getWeight: function () {
    var settings = require('./utils/storage').getSettings();
    return settings.weight || 65;
  },

  // 获取所有记录
  getRecords: function () {
    return require('./utils/storage').getRecords();
  },

  // 保存记录
  saveRecords: function (records) {
    require('./utils/storage').saveRecords(records);
  }
});
