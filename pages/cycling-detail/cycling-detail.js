var app = getApp();
var trackDb = require('../../utils/track-db');
var chart = require('../../utils/chart');

Page({
  data: {
    hasTrack: false,
    recordId: '',

    // 地图
    centerLat: 30.5,
    centerLng: 114.3,
    mapScale: 14,
    polyline: [],
    startPoint: null,
    endPoint: null,

    // 统计
    summary: {
      distKm: 0, durationStr: '00:00',
      avgSpeed: 0, maxSpeed: 0,
      elevGain: 0, pointCount: 0, date: ''
    },

    // 图表
    speedData: [],
    altData: [],
    hasAlt: false,
    // 心率
    hrData: [],
    hasHR: false,
    hrStats: { avgBpm: 0, maxBpm: 0, minBpm: 0 }
  },

  onLoad: function (options) {
    if (!app.checkLogin()) return;
    var recordId = options.recordId || '';
    this.setData({ recordId: recordId });

    if (!recordId) {
      this.setData({ hasTrack: false });
      return;
    }

    var track = trackDb.loadTrackFull(recordId);
    if (!track || !track.waypoints || track.waypoints.length === 0) {
      this.setData({ hasTrack: false });
      return;
    }

    this._buildView(track);
  },

  _buildView: function (track) {
    var wps = track.waypoints;
    var stats = track.stats || {};

    // 地图折线
    var polyline = [{
      points: wps.map(function (w) { return { latitude: w.latitude, longitude: w.longitude }; }),
      color: '#10b981',
      width: 8,
      borderColor: '#059669',
      borderWidth: 2,
      arrowLine: true
    }];

    // 起点/终点
    var startPoint = wps.length > 0 ? { latitude: wps[0].latitude, longitude: wps[0].longitude } : null;
    var endPoint = wps.length > 1 ? { latitude: wps[wps.length - 1].latitude, longitude: wps[wps.length - 1].longitude } : null;

    // 地图中心（中间点）
    var midIdx = Math.floor(wps.length / 2);
    var centerLat = wps[midIdx].latitude;
    var centerLng = wps[midIdx].longitude;

    // 统计摘要
    var durMs = stats.trackTime || 0;
    var durMin = Math.floor(durMs / 60000);
    var durSec = Math.floor((durMs % 60000) / 1000);
    var durH = Math.floor(durMin / 60);
    durMin = durMin % 60;
    var durStr;
    if (durH > 0) {
      durStr = durH + ':' + String(durMin).padStart(2, '0') + ':' + String(durSec).padStart(2, '0');
    } else {
      durStr = String(durMin).padStart(2, '0') + ':' + String(durSec).padStart(2, '0');
    }

    // 速度曲线数据
    var speedData = this._buildSpeedData(wps);
    var altData = this._buildAltData(wps);
    var hasAlt = false;
    for (var i = 0; i < wps.length; i++) {
      if (wps[i].altitude > 0) { hasAlt = true; break; }
    }

    // 心率数据
    var hrData = this._buildHRData(wps);
    var hasHR = false;
    for (var j = 0; j < wps.length; j++) {
      if (wps[j].heartRate > 0) { hasHR = true; break; }
    }
    var hrStats = stats.heartRate || { avgBpm: 0, maxBpm: 0, minBpm: 0 };

    this.setData({
      hasTrack: true,
      centerLat: centerLat,
      centerLng: centerLng,
      polyline: polyline,
      startPoint: startPoint,
      endPoint: endPoint,
      summary: {
        distKm: parseFloat((stats.totalDist / 1000).toFixed(2)) || 0,
        durationStr: durStr,
        avgSpeed: parseFloat((stats.avgSpeed || 0).toFixed(1)),
        maxSpeed: parseFloat((stats.maxSpeed || 0).toFixed(1)),
        elevGain: Math.round(stats.elevGain || 0),
        pointCount: stats.pointCount || wps.length,
        date: track.date || ''
      },
      speedData: speedData,
      altData: altData,
      hasAlt: hasAlt,
      hrData: hrData,
      hasHR: hasHR,
      hrStats: hrStats
    }, function () {
      var that = this;
      setTimeout(function () { that._drawCharts(); }, 400);
    });
  },

  // ====== 速度曲线数据 ======

  _buildSpeedData: function (wps) {
    if (wps.length < 4) return [];
    // 采样：每 4 个点取一个，减少数据量
    var step = Math.max(1, Math.floor(wps.length / 60));
    var result = [];
    for (var i = 0; i < wps.length; i += step) {
      var segDist = wps[i].segDist || 0;
      var speed = segDist > 0 ? (segDist / (step * 2)) * 3.6 : 0; // 粗略估算 km/h
      speed = Math.min(speed, 60);
      result.push({ label: String(i), value: Math.round(speed * 10) / 10 });
    }
    return result;
  },

  _buildAltData: function (wps) {
    if (wps.length < 2) return [];
    var step = Math.max(1, Math.floor(wps.length / 80));
    var result = [];
    for (var i = 0; i < wps.length; i += step) {
      result.push({ label: String(i), value: wps[i].altitude || 0 });
    }
    return result;
  },

  _buildHRData: function (wps) {
    if (wps.length < 2) return [];
    var step = Math.max(1, Math.floor(wps.length / 80));
    var result = [];
    for (var i = 0; i < wps.length; i += step) {
      var hr = wps[i].heartRate || 0;
      if (hr > 0) {
        result.push({ label: String(i), value: hr });
      }
    }
    return result;
  },

  // ====== 图表绘制 ======

  _drawCharts: function () {
    if (this.data.speedData.length > 0) {
      this._drawCanvas('speedChart', function (ctx, w, h) {
        chart.drawLineChart(ctx, w, h, this.data.speedData, {
          lineColor: '#3b82f6',
          yLabel: 'km/h',
          fill: true
        });
      });
    }

    if (this.data.altData.length > 0 && this.data.hasAlt) {
      this._drawCanvas('altChart', function (ctx, w, h) {
        chart.drawLineChart(ctx, w, h, this.data.altData, {
          lineColor: '#8b5cf6',
          yLabel: 'm',
          fill: true
        });
      });
    }

    if (this.data.hrData.length > 0 && this.data.hasHR) {
      this._drawCanvas('hrChart', function (ctx, w, h) {
        chart.drawLineChart(ctx, w, h, this.data.hrData, {
          lineColor: '#ef4444',
          yLabel: 'bpm',
          fill: true
        });
      });
    }
  },

  _drawCanvas: function (canvasId, drawFn) {
    var that = this;
    var query = wx.createSelectorQuery();
    query.select('#' + canvasId).boundingClientRect(function (rect) {
      if (!rect) return;
      var cssW = Math.floor(rect.width);
      var cssH = Math.floor(rect.height);
      if (cssW <= 0 || cssH <= 0) return;

      var nodeQuery = wx.createSelectorQuery();
      nodeQuery.select('#' + canvasId).node(function (res) {
        var canvas = res.node;
        if (!canvas) return;
        var dpr = wx.getSystemInfoSync().pixelRatio || 2;
        var ctx = canvas.getContext('2d');
        canvas.width = Math.ceil(cssW * dpr);
        canvas.height = Math.ceil(cssH * dpr);
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, cssW, cssH);
        drawFn.call(that, ctx, cssW, cssH);
      }).exec();
    }).exec();
  },

  // ====== 地图操作 ======

  onFitRoute: function () {
    // 暂时先回到轨迹中心
    var wpsCount = this.data.polyline.length > 0 ? this.data.polyline[0].points.length : 0;
    if (wpsCount === 0) return;
    var pts = this.data.polyline[0].points;
    var midIdx = Math.floor(pts.length / 2);
    this.setData({
      centerLat: pts[midIdx].latitude,
      centerLng: pts[midIdx].longitude,
      mapScale: 13
    });
  }
});
