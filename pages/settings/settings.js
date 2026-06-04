var storage = require('../../utils/storage');
var sportsData = require('../../utils/sports');

Page({
  data: {
    weight: 65,
    allSports: [],          // 预设(含编辑覆盖) + 自定义
    customSports: [],
    totalRecords: 0,
    // 编辑弹窗
    showEditModal: false,
    editSport: null,
    editMet: '',
    editMeasureType: 'duration',
    editKcalPerUnit: '',
    editCaloriePerKm: '',
    // 自定义运动表单
    customName: '',
    customIcon: '',
    customMet: '',
    customMeasureType: 'count',
    customKcalPerUnit: ''
  },

  onShow: function() {
    this.refresh();
  },

  refresh: function() {
    var settings = storage.getSettings();
    var records = storage.getRecords();
    var customs = sportsData.getCustomSports();

    var all = sportsData.getAllSports();
    var allSports = all.map(function(s) {
      var copy = {};
      for (var k in s) { if (s.hasOwnProperty(k)) copy[k] = s[k]; }
      copy.shortName = s.name.replace(/[^一-龥]/g, '');
      copy.isCustom = (s.key && s.key.indexOf('custom_') === 0);
      copy.isEdited = !!sportsData.getSportEdits()[s.key];
      return copy;
    });

    this.setData({
      weight: settings.weight || 65,
      allSports: allSports,
      customSports: customs,
      totalRecords: records.length
    });
  },

  // ========== 体重 ==========
  onWeightInput: function(e) {
    var val = parseInt(e.detail.value);
    this.setData({ weight: val || 65 });
  },
  onSaveWeight: function() {
    var weight = this.data.weight;
    if (weight < 30 || weight > 200) {
      wx.showToast({ title: '体重应在30-200kg之间', icon: 'none' });
      return;
    }
    storage.saveSettings({ weight: weight });
    wx.showToast({ title: '体重已保存', icon: 'success' });
  },

  // ========== 编辑运动 ==========
  onEditSport: function(e) {
    var key = e.currentTarget.dataset.key;
    var sport = sportsData.getSportByKey(key);
    if (!sport) return;
    this.setData({
      showEditModal: true,
      editSport: sport,
      editMet: String(sport.met),
      editMeasureType: sport.measureType || 'duration',
      editKcalPerUnit: String(sport.kcalPerUnit || 0),
      editCaloriePerKm: String(sport.caloriePerKm || 0)
    });
  },

  onCloseEdit: function() {
    this.setData({ showEditModal: false, editSport: null });
  },

  onEditMetInput: function(e) {
    this.setData({ editMet: e.detail.value });
  },
  onEditKcalInput: function(e) {
    this.setData({ editKcalPerUnit: e.detail.value });
  },
  onEditCalorieKmInput: function(e) {
    this.setData({ editCaloriePerKm: e.detail.value });
  },
  onEditMeasureChange: function(e) {
    var types = ['duration', 'count', 'both'];
    var idx = parseInt(e.detail.value);
    this.setData({ editMeasureType: types[idx] || 'duration' });
  },

  onSaveSportEdit: function() {
    var s = this.data.editSport;
    if (!s) return;
    var met = parseFloat(this.data.editMet);
    var kcal = parseFloat(this.data.editKcalPerUnit) || 0;
    var calKm = parseFloat(this.data.editCaloriePerKm) || 0;
    var mt = this.data.editMeasureType;

    if (!met || met <= 0) {
      wx.showToast({ title: '请输入有效的MET值', icon: 'none' });
      return;
    }

    var patch = {
      met: met,
      measureType: mt,
      kcalPerUnit: kcal,
      caloriePerKm: calKm
    };

    sportsData.updateSport(s.key, patch);
    this.setData({ showEditModal: false, editSport: null });
    this.refresh();
    wx.showToast({ title: '已更新', icon: 'success' });
  },

  onResetSportEdit: function() {
    var s = this.data.editSport;
    if (!s) return;
    var that = this;
    wx.showModal({
      title: '恢复默认',
      content: '确定要恢复「' + s.name + '」的默认参数吗？',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          sportsData.resetSportEdit(s.key);
          that.setData({ showEditModal: false, editSport: null });
          that.refresh();
          wx.showToast({ title: '已恢复默认', icon: 'success' });
        }
      }
    });
  },

  // ========== 自定义运动 ==========
  onCustomNameInput: function(e) { this.setData({ customName: e.detail.value }); },
  onCustomIconInput: function(e) { this.setData({ customIcon: e.detail.value }); },
  onCustomMetInput: function(e) { this.setData({ customMet: e.detail.value }); },
  onCustomKcalInput: function(e) { this.setData({ customKcalPerUnit: e.detail.value }); },
  onMeasureTypeChange: function(e) {
    var types = ['duration', 'count', 'both'];
    var idx = parseInt(e.detail.value);
    this.setData({ customMeasureType: types[idx] || 'count' });
  },

  onAddCustomSport: function() {
    var name = (this.data.customName || '').trim();
    var icon = (this.data.customIcon || '').trim();
    var met = parseFloat(this.data.customMet);
    var mt = this.data.customMeasureType;
    var kcal = parseFloat(this.data.customKcalPerUnit) || 0;

    if (!name) { wx.showToast({ title: '请输入运动名称', icon: 'none' }); return; }
    if (!icon) { wx.showToast({ title: '请输入emoji图标', icon: 'none' }); return; }
    if (!met || met <= 0) { wx.showToast({ title: '请输入有效的MET值', icon: 'none' }); return; }
    if ((mt === 'count' || mt === 'both') && kcal <= 0) {
      wx.showToast({ title: '计次类运动需填写单次热量', icon: 'none' }); return;
    }

    sportsData.addCustomSport({
      name: icon + ' ' + name,
      icon: icon,
      met: met,
      measureType: mt,
      kcalPerUnit: kcal,
      caloriePerKm: 0
    });

    this.setData({
      customSports: sportsData.getCustomSports(),
      customName: '', customIcon: '', customMet: '', customKcalPerUnit: ''
    });
    this.refresh();
    wx.showToast({ title: '已添加 ' + name, icon: 'success' });
  },

  onDeleteCustom: function(e) {
    var key = e.currentTarget.dataset.key;
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个自定义运动吗？',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          sportsData.deleteCustomSport(key);
          that.refresh();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // ========== 数据管理 ==========
  onClearRecords: function() {
    if (this.data.totalRecords === 0) {
      wx.showToast({ title: '没有可清除的记录', icon: 'none' });
      return;
    }
    var that = this;
    wx.showModal({
      title: '确认清除',
      content: '确定要清除所有运动记录吗？此操作不可恢复。',
      confirmText: '确认清除',
      confirmColor: '#F44336',
      success: function(res) {
        if (res.confirm) {
          storage.saveRecords([]);
          that.setData({ totalRecords: 0 });
          wx.showToast({ title: '已清除所有记录', icon: 'success' });
        }
      }
    });
  }
});
