var storage = require('../../utils/storage');
var chart = require('../../utils/chart');

Page({
  data: {
    // 周期选择
    period: 'week',
    periodList: [
      { key: 'week', label: '近7天' },
      { key: 'month', label: '近30天' },
      { key: 'all', label: '全部' }
    ],

    // 汇总卡片
    summary: { records: 0, calories: 0, duration: 0, distance: 0 },

    // 折线图数据
    lineData: [],
    barData: [],

    // 月度汇总列表
    monthlySummaries: [],

    // 状态
    hasData: false,
    loaded: false
  },

  onShow: function () {
    this.loadData();
  },

  onPeriodChange: function (e) {
    var key = e.currentTarget.dataset.key;
    if (key === this.data.period) return;
    this.setData({ period: key }, function () {
      this.loadData();
    });
  },

  loadData: function () {
    var allRecords = storage.getRecords();
    if (!allRecords || allRecords.length === 0) {
      this.setData({ hasData: false, loaded: true });
      return;
    }

    var period = this.data.period;
    var now = new Date();
    var todayStr = this._formatDate(now);

    // 计算时间范围
    var startDate;
    if (period === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'month') {
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      startDate = new Date(0);
    }
    var startStr = this._formatDate(startDate);

    // 筛选
    var filtered = allRecords.filter(function (r) {
      return r.date >= startStr && r.date <= todayStr;
    });

    if (filtered.length === 0) {
      this.setData({ hasData: false, loaded: true, summary: { records: 0, calories: 0, duration: 0, distance: 0 } });
      return;
    }

    // 汇总
    var summary = this._calcSummary(filtered);
    var lineData = this._buildLineData(filtered, startStr, todayStr);
    var barData = this._buildBarData(filtered);
    var monthly = this._buildMonthly(allRecords);

    this.setData({
      summary: summary,
      lineData: lineData,
      barData: barData,
      monthlySummaries: monthly,
      hasData: true,
      loaded: true
    }, function () {
      // 等待渲染完成后绘制图表
      var that = this;
      setTimeout(function () { that.drawCharts(); }, 300);
    });
  },

  // ====== 数据加工 ======

  _calcSummary: function (records) {
    var sum = { records: 0, calories: 0, duration: 0, distance: 0 };
    sum.records = records.length;
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      sum.calories += r.calories || 0;
      sum.duration += r.duration || 0;
      sum.distance += r.distance || 0;
    }
    return sum;
  },

  _buildLineData: function (records, startStr, todayStr) {
    // 按日期分组
    var map = {};
    for (var i = 0; i < records.length; i++) {
      var d = records[i].date;
      map[d] = (map[d] || 0) + (records[i].calories || 0);
    }

    // 填充日期范围（确保无数据的天也显示）
    var result = [];
    var start = new Date(startStr);
    var end = new Date(todayStr);
    var cur = new Date(start);
    while (cur <= end) {
      var dateStr = this._formatDate(cur);
      result.push({ label: dateStr, value: map[dateStr] || 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  },

  _buildBarData: function (records) {
    var map = {};
    for (var i = 0; i < records.length; i++) {
      var key = records[i].sportName || '其他';
      map[key] = (map[key] || 0) + (records[i].calories || 0);
    }

    var list = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) list.push({ label: k, value: map[k] });
    }
    list.sort(function (a, b) { return b.value - a.value; });

    // 取前 8 项
    var top = list.slice(0, 8);
    for (var j = 0; j < top.length; j++) {
      top[j].color = chart.COLORS[j % 12];
    }
    return top;
  },

  _buildMonthly: function (records) {
    var map = {};
    for (var i = 0; i < records.length; i++) {
      var d = records[i].date;
      var monthKey = d.substring(0, 7); // "2026-06"
      if (!map[monthKey]) map[monthKey] = { month: monthKey, records: 0, calories: 0, duration: 0 };
      map[monthKey].records++;
      map[monthKey].calories += records[i].calories || 0;
      map[monthKey].duration += records[i].duration || 0;
    }
    var list = [];
    for (var k in map) {
      if (map.hasOwnProperty(k)) list.push(map[k]);
    }
    list.sort(function (a, b) { return b.month.localeCompare(a.month); });
    return list;
  },

  // ====== 图表绘制 ======

  drawCharts: function () {
    if (!this.data.hasData) return;
    var sysInfo = wx.getSystemInfoSync();
    var dpr = sysInfo.pixelRatio || 2;
    var screenW = sysInfo.windowWidth;
    // 可用宽度 = 屏幕宽 - 容器内边距(32rpx×2) - 卡片内边距(24rpx×2)
    var rpxRatio = screenW / 750;
    var availW = screenW - (32 + 24) * 2 * rpxRatio;

    this._drawCanvas('lineChart', availW, 320 * rpxRatio, dpr, function (ctx, w, h) {
      chart.drawLineChart(ctx, w, h, this.data.lineData, {
        lineColor: '#10b981',
        yLabel: '千卡',
        fill: true
      });
    });

    this._drawCanvas('barChart', availW, 360 * rpxRatio, dpr, function (ctx, w, h) {
      chart.drawBarChart(ctx, w, h, this.data.barData, {
        yLabel: '千卡',
        showValue: true
      });
    });
  },

  _drawCanvas: function (canvasId, cssW, cssH, dpr, drawFn) {
    var that = this;
    cssW = Math.floor(cssW);
    cssH = Math.floor(cssH);
    var query = wx.createSelectorQuery();
    query.select('#' + canvasId).node(function (res) {
      var canvas = res.node;
      if (!canvas) return;
      var ctx = canvas.getContext('2d');
      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssW, cssH);
      drawFn.call(that, ctx, cssW, cssH);
    }).exec();
  },

  _formatDate: function (date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
});
