var app = getApp();
var sports = require('../../utils/sports');
var calorie = require('../../utils/calorie');
var storage = require('../../utils/storage');

// 运动分类定义
var SPORT_CATEGORIES = [
  { name: '有氧运动', icon: '🏃', keys: ['walking', 'running', 'running_fast', 'swimming', 'cycling', 'hiking'] },
  { name: '球类运动', icon: '🏀', keys: ['basketball', 'football', 'badminton', 'table_tennis', 'tennis'] },
  { name: '力量训练', icon: '💪', keys: ['fitness', 'sit_up', 'push_up', 'plank', 'squat', 'pull_up', 'jump_rope'] },
  { name: '柔韧放松', icon: '🧘', keys: ['yoga', 'dancing'] }
];

/**
 * 将 flat sport list 按分类归类
 * 返回 categories 数组，每项包含 name/icon/collapsed/sports
 */
function buildCategories(sportList) {
  var usedKeys = {};
  var categories = [];

  for (var i = 0; i < SPORT_CATEGORIES.length; i++) {
    var cat = SPORT_CATEGORIES[i];
    var catSports = [];
    for (var j = 0; j < cat.keys.length; j++) {
      var key = cat.keys[j];
      for (var k = 0; k < sportList.length; k++) {
        if (sportList[k].key === key) {
          catSports.push(sportList[k]);
          usedKeys[key] = true;
          break;
        }
      }
    }
    categories.push({
      name: cat.name,
      icon: cat.icon,
      collapsed: false,
      sports: catSports
    });
  }

  // 收集未归类的运动（自定义运动）
  var customSports = [];
  for (var m = 0; m < sportList.length; m++) {
    if (!usedKeys[sportList[m].key]) {
      customSports.push(sportList[m]);
    }
  }
  if (customSports.length > 0) {
    categories.push({
      name: '自定义',
      icon: '⭐',
      collapsed: false,
      sports: customSports
    });
  }

  return categories;
}

Page({
  data: {
    categories: [],
    selectedSport: null,
    selectedSportShortName: '',
    needDuration: false,
    needCount: false,
    needDistance: false,
    showLabel: '',
    date: '',
    duration: '',
    count: '',
    distance: '',
    estimatedCalories: 0,
    calorieDetail: '',
    canSave: false,
    scrollTop: 0
  },

  onLoad: function() {
    if (!app.checkLogin()) return;
    var now = new Date();
    var today = this.formatDate(now);
    var rawList = sports.getAllSports();
    var sportList = rawList.map(function(s) {
      var copy = {};
      for (var k in s) { if (s.hasOwnProperty(k)) copy[k] = s[k]; }
      copy.shortName = s.name.replace(/[^一-龥]/g, '');
      return copy;
    });

    var categories = buildCategories(sportList);
    this.setData({ categories: categories, date: today });
  },

  onShow: function() {
    var rawList = sports.getAllSports();
    var sportList = rawList.map(function(s) {
      var copy = {};
      for (var k in s) { if (s.hasOwnProperty(k)) copy[k] = s[k]; }
      copy.shortName = s.name.replace(/[^一-龥]/g, '');
      return copy;
    });
    var categories = buildCategories(sportList);
    // 保持折叠状态
    var oldCats = this.data.categories;
    if (oldCats && oldCats.length > 0) {
      for (var i = 0; i < categories.length; i++) {
        for (var j = 0; j < oldCats.length; j++) {
          if (categories[i].name === oldCats[j].name) {
            categories[i].collapsed = oldCats[j].collapsed;
            break;
          }
        }
      }
    }
    this.setData({ categories: categories });
  },

  /** 切换分类折叠/展开 */
  onToggleCategory: function(e) {
    var index = e.currentTarget.dataset.index;
    var categories = this.data.categories;
    categories[index].collapsed = !categories[index].collapsed;
    this.setData({ categories: categories });
  },

  onSelectSport: function(e) {
    var key = e.currentTarget.dataset.key;
    var sport = sports.getSportByKey(key);
    var shortName = sport.name.replace(/[^一-龥]/g, '');
    var mt = sport.measureType || 'duration';

    this.setData({
      selectedSport: sport,
      selectedSportShortName: shortName,
      needDuration: (mt === 'duration' || mt === 'both'),
      needCount: (mt === 'count' || mt === 'both'),
      needDistance: (sport.caloriePerKm > 0),
      showLabel: mt === 'duration' ? (sport.caloriePerKm > 0 ? '计时/距离' : '计时') : mt === 'count' ? '计次' : '计时+计次',
      duration: '',
      count: '',
      distance: '',
      estimatedCalories: 0,
      calorieDetail: '',
      canSave: false
    });
  },

  /** 滚动到顶部查看运动项目 */
  onScrollToSports: function() {
    this.setData({ scrollTop: 0 });
  },

  onDateChange: function(e) {
    this.setData({ date: e.detail.value });
  },

  onDurationInput: function(e) {
    this.setData({ duration: e.detail.value });
    this.updateEstimate();
  },

  onCountInput: function(e) {
    this.setData({ count: e.detail.value });
    this.updateEstimate();
  },

  onDistanceInput: function(e) {
    this.setData({ distance: e.detail.value });
    this.updateEstimate();
  },

  updateEstimate: function() {
    var s = this.data.selectedSport;
    if (!s) return;
    var weight = storage.getWeight();
    var dur = parseInt(this.data.duration) || 0;
    var cnt = parseInt(this.data.count) || 0;
    var dist = parseFloat(this.data.distance) || 0;
    var mt = s.measureType;
    var total = 0;
    var details = [];
    var hasInput = false;

    // 计时: MET公式
    if ((mt === 'duration' || mt === 'both') && dur > 0) {
      var durCal = calorie.calculateCalories(s.met, weight, dur);
      total += durCal;
      details.push('计时: ' + s.met + ' MET × ' + weight + 'kg × ' + (dur / 60).toFixed(2) + 'h = ' + durCal + '千卡');
      hasInput = true;
    }

    // 计次
    if ((mt === 'count' || mt === 'both') && cnt > 0) {
      var cntCal = calorie.calculateCountCalories(cnt, s.kcalPerUnit);
      total += cntCal;
      details.push('计次: ' + cnt + '次 × ' + s.kcalPerUnit + '千卡/次 = ' + cntCal + '千卡');
      hasInput = true;
    }

    // 距离: 距离公式 (仅在有时长输入时代替时长，不叠加)
    if (s.caloriePerKm > 0 && dist > 0 && dur === 0) {
      var distCal = calorie.calculateDistanceCalories(dist, weight, s.caloriePerKm);
      total += distCal;
      details.push('距离: ' + dist + 'km × ' + weight + 'kg × ' + s.caloriePerKm + ' = ' + distCal + '千卡');
      hasInput = true;
    }

    this.setData({
      estimatedCalories: total,
      calorieDetail: details.join('\n'),
      canSave: hasInput
    });
  },

  onSave: function() {
    var data = this.data;
    var s = data.selectedSport;
    var dur = parseInt(data.duration) || 0;
    var cnt = parseInt(data.count) || 0;
    var dist = parseFloat(data.distance) || 0;
    var mt = s.measureType;

    if (!s) {
      wx.showToast({ title: '请选择运动项目', icon: 'none' });
      return;
    }

    var hasInput = false;
    if (dur > 0) hasInput = true;
    if (cnt > 0) hasInput = true;
    if (dist > 0) hasInput = true;

    if (!hasInput) {
      wx.showToast({ title: '请输入有效的运动量', icon: 'none' });
      return;
    }
    if (dur > 600) {
      wx.showToast({ title: '运动时长不能超过10小时', icon: 'none' });
      return;
    }
    if (cnt > 99999 || dist > 999) {
      wx.showToast({ title: '数值过大，请核实', icon: 'none' });
      return;
    }

    var record = {
      id: storage.generateId(),
      sportType: s.key,
      sportName: s.name,
      icon: s.icon,
      duration: dur,
      count: cnt,
      distance: dist,
      date: data.date,
      calories: data.estimatedCalories,
      met: s.met,
      measureType: mt,
      createdAt: Date.now()
    };

    storage.addRecord(record);

    wx.showToast({ title: '记录成功!', icon: 'success', duration: 1500 });
    setTimeout(function() { wx.navigateBack(); }, 1500);
  },

  formatDate: function(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
});
