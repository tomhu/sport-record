var storage = require('../../utils/storage');
var calorie = require('../../utils/calorie');

Page({
  data: {
    todayRecords: [],
    todayStats: { count: 0, duration: 0, totalCount: 0, distance: 0, calories: 0 },
    groupedHistory: [],
    isEmpty: true,
    todayDate: ''
  },

  onShow: function () { this.loadData(); },
  onPullDownRefresh: function () { this.loadData(); wx.stopPullDownRefresh(); },

  loadData: function () {
    var records = storage.getRecords();
    var today = this.getTodayStr();
    var todayRecords = records.filter(function (r) { return r.date === today; });
    var historyRecords = records.filter(function (r) { return r.date !== today; });

    var now = new Date();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    var days = ['日', '一', '二', '三', '四', '五', '六'];

    this.setData({
      todayRecords: todayRecords,
      todayDate: month + '月' + day + '日 周' + days[now.getDay()],
      todayStats: {
        count: todayRecords.length,
        duration: calorie.calculateTotalDuration(todayRecords),
        totalCount: calorie.calculateTotalCount(todayRecords),
        distance: calorie.calculateTotalDistance(todayRecords),
        calories: calorie.calculateTotalCalories(todayRecords)
      },
      groupedHistory: this.groupByDate(historyRecords),
      isEmpty: records.length === 0
    });
  },

  groupByDate: function (records) {
    var groups = {};
    records.forEach(function (r) {
      if (!groups[r.date]) {
        groups[r.date] = { date: r.date, records: [], totalCalories: 0, totalDuration: 0, totalCount: 0, totalDistance: 0 };
      }
      groups[r.date].records.push(r);
      groups[r.date].totalCalories += r.calories || 0;
      groups[r.date].totalDuration += r.duration || 0;
      groups[r.date].totalCount += r.count || 0;
      groups[r.date].totalDistance += r.distance || 0;
    });
    var list = [];
    for (var k in groups) { if (groups.hasOwnProperty(k)) list.push(groups[k]); }
    list.sort(function (a, b) { return b.date.localeCompare(a.date); });
    return list;
  },

  getTodayStr: function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  onAdd: function () { wx.navigateTo({ url: '/pages/add/add' }); },

  onDeleteRecord: function (e) {
    storage.deleteRecord(e.detail.id);
    wx.showToast({ title: '已删除', icon: 'success', duration: 1500 });
    this.loadData();
  },

  getDayOfWeek: function (dateStr) {
    var days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[new Date(dateStr).getDay()];
  }
});
