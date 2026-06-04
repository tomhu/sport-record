var db = require('./utils/database');
var storage = require('./utils/storage');

App({
  onLaunch: function () {
    // 1. 初始化本地数据库（自动迁移旧数据）
    db.init();

    // 2. 迁移旧记录：给没有 userId 的记录打上标注
    this._migrateOldRecords();
  },

  /**
   * 全局登录检查 —— 每个页面在 onShow 中调用
   * 返回当前用户，未登录时跳转到登录页
   */
  checkLogin: function () {
    var user = storage.getCurrentUser();
    if (!user) {
      // 避免无限循环：如果已经在登录页则不跳转
      var pages = getCurrentPages();
      if (pages.length > 0) {
        var route = pages[pages.length - 1].route;
        if (route === 'pages/login/login') return null;
      }
      wx.redirectTo({ url: '/pages/login/login' });
      return null;
    }
    return user;
  },

  /**
   * 给旧记录添加 userId（保留已有 userId 的记录）
   * 将无主记录分配给当前用户，若无当前用户则标记为 'legacy'
   */
  _migrateOldRecords: function () {
    try {
      var records = storage.getRecords();
      var hasLegacy = false;
      var currentUser = storage.getCurrentUser();

      for (var i = 0; i < records.length; i++) {
        if (!records[i].userId) {
          records[i].userId = currentUser ? currentUser.userId : 'legacy';
          hasLegacy = true;
        }
      }

      if (hasLegacy) {
        storage.saveRecords(records);
        console.log('[App] 旧记录 userId 迁移完成');
      }
    } catch (e) {
      console.error('[App] 记录迁移失败:', e);
    }
  },

  getWeight: function () {
    var settings = storage.getSettings();
    return settings.weight || 65;
  },

  getRecords: function () {
    return storage.getRecords();
  },

  saveRecords: function (records) {
    storage.saveRecords(records);
  }
});
