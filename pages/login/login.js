var storage = require('../../utils/storage');

// 可用头像列表
var AVATARS = ['🏃', '🚴', '🏊', '🧘', '⚽', '🏀', '🎾', '🥾', '💪', '🦵', '🔥', '🌟'];

Page({
  data: {
    nickname: '',
    avatar: '🏃',
    existingUsers: [],
    isNewUser: true
  },

  onLoad: function () {
    // 检查是否已有当前用户
    var currentUser = storage.getCurrentUser();
    var users = storage.getUsers();

    this.setData({
      existingUsers: users,
      isNewUser: !currentUser
    });

    // 如果是从首页直接启动且已登录，自动跳转
    var pages = getCurrentPages();
    if (currentUser && pages.length <= 1) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    // 如果有当前用户，用其信息预填
    if (currentUser) {
      this.setData({
        nickname: currentUser.name,
        avatar: currentUser.avatar
      });
    }
  },

  // ====== 头像选择 ======
  onPickAvatar: function () {
    var that = this;
    var current = this.data.avatar;
    var idx = AVATARS.indexOf(current);
    var next = AVATARS[(idx + 1) % AVATARS.length];
    this.setData({ avatar: next });
  },

  // ====== 昵称输入 ======
  onNicknameInput: function (e) {
    this.setData({ nickname: e.detail.value });
  },

  onNicknameBlur: function (e) {
    if (e.detail.value && !this.data.nickname) {
      this.setData({ nickname: e.detail.value });
    }
  },

  onClearNickname: function () {
    this.setData({ nickname: '' });
  },

  // ====== 选择已有用户 ======
  onSelectExisting: function (e) {
    var userId = e.currentTarget.dataset.userid;
    storage.setCurrentUser(userId);
    wx.showToast({ title: '已切换用户', icon: 'success', duration: 1500 });
    var that = this;
    setTimeout(function () {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1500);
  },

  // ====== 开始/创建 ======
  onStart: function () {
    var nickname = (this.data.nickname || '').trim();
    if (!nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return;
    }

    // 检查是否已有同名的用户
    var users = storage.getUsers();
    var existing = null;
    for (var i = 0; i < users.length; i++) {
      if (users[i].name === nickname) {
        existing = users[i];
        break;
      }
    }

    if (existing) {
      // 同名用户：直接切换
      storage.setCurrentUser(existing.userId);
    } else {
      // 创建新用户
      var user = storage.createUser(nickname, this.data.avatar);
      storage.setCurrentUser(user.userId);
    }

    wx.showToast({ title: '欢迎！', icon: 'success', duration: 1500 });
    var that = this;
    setTimeout(function () {
      wx.switchTab({ url: '/pages/index/index' });
    }, 1500);
  }
});
