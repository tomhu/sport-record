var app = getApp();
var Tracker = require('../../utils/tracker');
var trackDb = require('../../utils/track-db');
var storage = require('../../utils/storage');
var bleHR = require('../../utils/ble-hr');

Page({
  data: {
    // 地图
    centerLat: 30.5,
    centerLng: 114.3,
    mapScale: 16,
    polyline: [],       // 地图折线数据

    // 实时统计
    stats: {
      state: 'idle',
      distKm: 0,
      durationStr: '00:00',
      curSpeed: 0,
      avgSpeed: 0,
      maxSpeed: 0,
      elevGain: 0,
      pointCount: 0
    },

    // 状态
    hasStarted: false,
    gpsWeak: false,
    showFinishModal: false,
    finishPreview: { dist: 0, time: '', avg: 0, max: 0 },
    // 心率
    heartRate: 0,
    hrConnected: false,
    hrConnecting: false,
    hrDeviceName: '',
    hrAvgBpm: 0,
    hrMaxBpm: 0,
    hrMinBpm: 999,
    hrSampleCount: 0
  },

  _tracker: null,
  _startCenterSet: false,
  _hrMonitor: null,
  _hrSamples: [],
  _hrSum: 0,

  onLoad: function () {
    if (!app.checkLogin()) return;
    this._tracker = Tracker.createTracker();
    this._initMapCenter();
    this._initHRMonitor();
  },

  onUnload: function () {
    if (this._tracker) {
      this._tracker.stop();
    }
    if (this._hrMonitor) {
      this._hrMonitor.disconnect();
    }
  },

  /**
   * 初始化地图中心（获取当前位置）
   */
  _initMapCenter: function () {
    var that = this;
    wx.getLocation({
      type: 'gcj02',
      success: function (res) {
        that.setData({
          centerLat: res.latitude,
          centerLng: res.longitude
        });
      },
      fail: function () {
        // 使用默认坐标
      }
    });
  },

  // ====== 地图回中 ======
  onCenter: function () {
    var that = this;
    wx.getLocation({
      type: 'gcj02',
      success: function (res) {
        that.setData({
          centerLat: res.latitude,
          centerLng: res.longitude,
          mapScale: 17
        });
      }
    });
  },

  // ====== 心率初始化 ======
  _initHRMonitor: function () {
    var saved = storage.getBLEDevice();
    if (!saved || !saved.deviceId) {
      this.setData({ hrConnected: false, hrDeviceName: '' });
      return;
    }

    this.setData({ hrConnecting: true, hrDeviceName: saved.name || '设备' });

    var that = this;
    this._hrMonitor = bleHR.createHRMonitor();
    this._hrMonitor.onStateChange(function (state, msg) {
      if (state === 'connected') {
        that.setData({ hrConnected: true, hrConnecting: false });
        console.log('[Cycling] 心率设备已连接');
      } else if (state === 'disconnected') {
        that.setData({ hrConnected: false, hrConnecting: false, heartRate: 0 });
      } else if (state === 'error') {
        that.setData({ hrConnected: false, hrConnecting: false, heartRate: 0 });
        console.warn('[Cycling] 心率连接失败:', msg);
      }
    });

    this._hrMonitor.connect(saved.deviceId, function (bpm) {
      that._onHeartRate(bpm);
    }, function (err) {
      that.setData({ hrConnecting: false, hrConnected: false });
      // 心率连接失败不影响骑行，仅提示
      wx.showToast({ title: err || '心率连接失败', icon: 'none', duration: 2000 });
    });
  },

  /**
   * 心率数据回调
   */
  _onHeartRate: function (bpm) {
    if (bpm <= 0 || bpm > 250) return; // 异常值过滤

    this.setData({ heartRate: bpm });

    // 统计
    this._hrSamples.push(bpm);
    this._hrSum += bpm;
    var hrMaxBpm = this.data.hrMaxBpm;
    var hrMinBpm = this.data.hrMinBpm;
    if (bpm > hrMaxBpm) hrMaxBpm = bpm;
    if (bpm < hrMinBpm) hrMinBpm = bpm;
    var hrAvgBpm = Math.round(this._hrSum / this._hrSamples.length);

    this.setData({
      hrMaxBpm: hrMaxBpm,
      hrMinBpm: hrMinBpm,
      hrAvgBpm: hrAvgBpm,
      hrSampleCount: this._hrSamples.length
    });

    // 传递给 tracker 记录
    if (this._tracker && this._tracker.setHeartRate) {
      this._tracker.setHeartRate(bpm);
    }
  },

  // ====== 开始骑行 ======
  onStart: function () {
    var that = this;
    this.setData({ hasStarted: true });

    this._tracker.start(function (stats) {
      that._onTrackerUpdate(stats);
    });

    // 初始定位后移动地图
    setTimeout(function () {
      that.onCenter();
    }, 1500);
  },

  /**
   * 追踪器更新回调
   */
  _onTrackerUpdate: function (stats) {
    // 更新统计面板
    this.setData({ stats: stats });

    // 更新地图折线
    var wps = this._tracker.getWaypoints();
    if (wps.length > 0) {
      var polyline = [{
        points: wps.map(function (w) {
          return { latitude: parseFloat(w.t), longitude: parseFloat(w.n) };
        }),
        color: '#10b981',
        width: 7,
        borderColor: '#059669',
        borderWidth: 2,
        arrowLine: false
      }];
      this.setData({ polyline: polyline });

      // 跟随最后一点移动地图
      var lastWp = wps[wps.length - 1];
      if (lastWp && stats.state === 'tracking') {
        this.setData({
          centerLat: parseFloat(lastWp.t),
          centerLng: parseFloat(lastWp.n)
        });
      }
    }
  },

  // ====== 暂停 ======
  onPause: function () {
    this._tracker.pause();
    wx.showToast({ title: '已暂停', icon: 'none', duration: 1000 });
  },

  // ====== 恢复 ======
  onResume: function () {
    var that = this;
    this._tracker.resume();
    wx.showToast({ title: '已恢复', icon: 'none', duration: 1000 });
    that.onCenter();
  },

  // ====== 结束 ======
  onStop: function () {
    var summary = this._tracker.stop();
    if (summary.totalDist < 50) {
      // 距离太短，提示
      wx.showModal({
        title: '距离太短',
        content: '骑行距离不足50米，可能无法形成有效轨迹。确定要保存吗？',
        confirmText: '继续保存',
        cancelText: '放弃',
        success: function (res) {
          if (res.confirm) {
            this._showFinishModal(summary);
          } else {
            this._discardRide();
          }
        }.bind(this)
      });
      return;
    }
    this._showFinishModal(summary);
  },

  _showFinishModal: function (summary) {
    this._finishSummary = summary;
    this.setData({
      showFinishModal: true,
      finishPreview: {
        dist: (summary.totalDist / 1000).toFixed(2),
        time: Tracker.fmtDuration(summary.trackTime),
        avg: summary.avgSpeed.toFixed(1),
        max: summary.maxSpeed.toFixed(1)
      }
    });
  },

  onCancelFinish: function () {
    // 重新开始
    this._tracker.start(this._onTrackerUpdate.bind(this));
    this.setData({ showFinishModal: false });
  },

  onConfirmFinish: function () {
    var summary = this._finishSummary;
    if (!summary || summary.totalDist < 1) {
      wx.showToast({ title: '无有效轨迹', icon: 'none' });
      this.setData({ showFinishModal: false });
      this._discardRide();
      return;
    }

    var user = storage.getCurrentUser();
    var now = new Date();
    var dateStr = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    // 估算卡路里：骑行 MET≈6.0，体重65kg，时长(h)
    var weight = storage.getWeight();
    var durationH = summary.trackTime / 3600000;
    var calories = Math.round(6.0 * weight * durationH);

    // 1. 创建运动记录
    var record = {
      id: storage.generateId(),
      sportType: 'cycling',
      sportName: '🚴 骑行',
      icon: '🚴',
      duration: Math.round(summary.trackTime / 60000),
      distance: parseFloat((summary.totalDist / 1000).toFixed(2)),
      count: 0,
      date: dateStr,
      calories: calories,
      met: 6.0,
      measureType: 'duration',
      caloriePerKm: 0.38,
      hasTrack: true,
      createdAt: Date.now()
    };
    storage.addRecord(record);

    // 2. 保存轨迹
    var hrStats = {
      avgBpm: this.data.hrAvgBpm,
      maxBpm: this.data.hrMaxBpm,
      minBpm: this.data.hrMinBpm === 999 ? 0 : this.data.hrMinBpm,
      sampleCount: this._hrSamples.length
    };
    trackDb.saveTrack({
      recordId: record.id,
      userId: user ? user.userId : '',
      date: dateStr,
      waypoints: this._tracker.getWaypoints(),
      stats: {
        totalDist: summary.totalDist,
        trackTime: summary.trackTime,
        avgSpeed: summary.avgSpeed,
        maxSpeed: summary.maxSpeed,
        elevGain: summary.elevGain,
        pointCount: summary.pointCount,
        heartRate: hrStats
      }
    });

    // 3. 断开心率设备
    if (this._hrMonitor) {
      this._hrMonitor.disconnect();
    }

    this.setData({ showFinishModal: false });
    wx.showToast({ title: '骑行记录已保存！', icon: 'success', duration: 2000 });

    var that = this;
    setTimeout(function () {
      wx.navigateBack();
    }, 2000);
  },

  _discardRide: function () {
    this._tracker = Tracker.createTracker();
    // 重置心率统计
    this._hrSamples = [];
    this._hrSum = 0;
    this.setData({
      hasStarted: false,
      stats: { state: 'idle', distKm: 0, durationStr: '00:00', curSpeed: 0, avgSpeed: 0, maxSpeed: 0, elevGain: 0, pointCount: 0 },
      polyline: [],
      heartRate: 0,
      hrAvgBpm: 0,
      hrMaxBpm: 0,
      hrMinBpm: 999,
      hrSampleCount: 0
    });
  },

  // ====== 返回 ======
  onBack: function () {
    if (this.data.hasStarted && this.data.stats.state !== 'idle') {
      var that = this;
      wx.showModal({
        title: '确认退出',
        content: '正在记录骑行轨迹，退出将丢失当前记录。',
        confirmText: '确认退出',
        cancelText: '继续骑行',
        success: function (res) {
          if (res.confirm) {
            that._tracker.stop();
            wx.navigateBack();
          }
        }
      });
    } else {
      wx.navigateBack();
    }
  }
});
