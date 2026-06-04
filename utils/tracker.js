/**
 * GPS 轨迹追踪引擎
 *
 * 基于 wx.startLocationUpdate / wx.onLocationChange 进行实时定位追踪。
 * 使用 Haversine 公式计算距离，提供速度、海拔等统计数据。
 * 增量存储路径点，支持暂停/恢复/结束。
 */

// ========== 常量 ==========

var EARTH_R = 6371000;           // 地球半径 (米)
var MIN_DIST_M = 3;              // 最小记录间距 (米)，过滤漂移
var DEFAULT_INTERVAL_MS = 2000;  // 默认定位间隔 2s

// ========== 工具函数 ==========

/** 角度转弧度 */
function toRad(d) { return d * Math.PI / 180; }

/**
 * Haversine 距离 (米)
 */
function haversine(lat1, lng1, lat2, lng2) {
  var dLat = toRad(lat2 - lat1);
  var dLng = toRad(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 计算速度 km/h
 */
function calcSpeedKmh(distM, dtMs) {
  if (dtMs <= 0 || distM <= 0) return 0;
  return (distM / dtMs) * 3600;
}

/**
 * 时间格式化 mm:ss 或 hh:mm:ss
 */
function fmtDuration(ms) {
  var s = Math.floor(ms / 1000);
  var m = Math.floor(s / 60);
  var h = Math.floor(m / 60);
  s = s % 60;
  m = m % 60;
  if (h > 0) return h + ':' + pad2(m) + ':' + pad2(s);
  return pad2(m) + ':' + pad2(s);
}
function pad2(n) { return String(n).padStart(2, '0'); }

// ========== 核心状态机 ==========

var Tracker = function () {
  this._state = 'idle';      // idle | tracking | paused
  this._waypoints = [];      // [{ lat, lng, alt, accuracy, speed, ts }]
  this._totalDist = 0;       // 累计距离 (米)
  this._trackTime = 0;       // 实际运动时间 (ms)
  this._pauseStart = 0;
  this._pausedTotal = 0;     // 累计暂停时间
  this._startTs = 0;
  this._lastPt = null;
  this._maxSpeed = 0;
  this._elevGain = 0;        // 累计爬升 (米)
  this._timerId = 0;
  this._updateCb = null;     // 每次位置更新回调
  this._lastAlt = null;      // 上次海拔
};

Tracker.prototype = {

  /**
   * 开始追踪
   * @param {function} onUpdate - 每次有效定位后回调 (stats)
   */
  start: function (onUpdate) {
    if (this._state === 'tracking') return;
    var that = this;

    this._updateCb = onUpdate || null;

    // 重置
    this._waypoints = [];
    this._totalDist = 0;
    this._trackTime = 0;
    this._pausedTotal = 0;
    this._maxSpeed = 0;
    this._elevGain = 0;
    this._lastPt = null;
    this._lastAlt = null;
    this._startTs = Date.now();

    // 先停止旧的定位
    wx.stopLocationUpdate({ complete: function () {} });

    // 开始定位
    wx.startLocationUpdate({
      success: function () {
        that._state = 'tracking';
        that._onLocationChange(function (loc) {
          that._handleLocation(loc);
        });
        that._emitUpdate();
      },
      fail: function (err) {
        console.error('[Tracker] 定位失败:', err);
        wx.showModal({
          title: '定位失败',
          content: '请确保已开启位置权限，然后在手机设置中允许微信访问位置信息',
          showCancel: false
        });
      }
    });
  },

  /**
   * 暂停追踪
   */
  pause: function () {
    if (this._state !== 'tracking') return;
    this._state = 'paused';
    this._pauseStart = Date.now();
    wx.offLocationChange(this._onLocationChange);
    this._emitUpdate();
  },

  /**
   * 恢复追踪
   */
  resume: function () {
    if (this._state !== 'paused') return;
    var that = this;
    this._pausedTotal += Date.now() - this._pauseStart;
    this._state = 'tracking';

    this._onLocationChange(function (loc) {
      that._handleLocation(loc);
    });
    wx.onLocationChange(this._onLocationChange);
    this._emitUpdate();
  },

  /**
   * 结束追踪，返回摘要
   * @returns {object} { waypoints, totalDist, trackTime, maxSpeed, elevGain, avgSpeed }
   */
  stop: function () {
    if (this._state === 'paused') {
      this._pausedTotal += Date.now() - this._pauseStart;
    }

    wx.offLocationChange(this._onLocationChange);
    wx.stopLocationUpdate({ complete: function () {} });

    this._state = 'idle';
    var durationMs = this._trackTime - this._pausedTotal;
    var avgSpeed = durationMs > 0 ? (this._totalDist / durationMs) * 3600 : 0;

    return {
      waypoints: this._waypoints,
      totalDist: this._totalDist,           // 米
      trackTime: Math.max(0, durationMs),   // 实际运动时间 ms
      totalTime: this._waypoints.length > 1
        ? this._waypoints[this._waypoints.length - 1].ts - this._waypoints[0].ts
        : 0,                                 // 总用时 ms (含暂停)
      maxSpeed: this._maxSpeed,             // km/h
      avgSpeed: avgSpeed,                   // km/h
      elevGain: this._elevGain,             // 米
      pointCount: this._waypoints.length
    };
  },

  /**
   * 获取当前实时统计数据
   */
  getStats: function () {
    var curSpeed = 0;
    if (this._waypoints.length >= 1 && this._state === 'tracking') {
      var last = this._waypoints[this._waypoints.length - 1];
      var elapsed = Date.now() - last.ts;
      if (elapsed < 30000) curSpeed = this._lastSpeed || 0;
    }

    var now = Date.now();
    var totalMs = now - this._startTs;
    if (this._state === 'paused') {
      totalMs = this._pauseStart - this._startTs;
    }
    var activeMs = this._trackTime - this._pausedTotal;
    if (this._state === 'paused' && this._pauseStart > 0) {
      activeMs -= (now - this._pauseStart);
    }
    activeMs = Math.max(0, activeMs);

    return {
      state: this._state,
      distKm: parseFloat((this._totalDist / 1000).toFixed(2)),
      durationStr: fmtDuration(Math.max(0, activeMs)),
      curSpeed: parseFloat(curSpeed.toFixed(1)),
      avgSpeed: activeMs > 0 ? parseFloat(((this._totalDist / activeMs) * 3600).toFixed(1)) : 0,
      maxSpeed: parseFloat(this._maxSpeed.toFixed(1)),
      elevGain: Math.round(this._elevGain),
      pointCount: this._waypoints.length
    };
  },

  getWaypoints: function () {
    return this._waypoints;
  },

  // ========== 内部 ==========

  _onLocationChange: function (fn) {
    this._onLocationChange = fn;
    wx.onLocationChange(fn);
  },

  _handleLocation: function (loc) {
    if (this._state !== 'tracking') return;

    var lat = loc.latitude;
    var lng = loc.longitude;
    var alt = loc.altitude || 0;
    var accuracy = loc.accuracy;
    var speed = loc.speed || 0; // 设备GPS速度 m/s
    var ts = Date.now();

    // 过滤低精度或重复点
    if (accuracy > 30) return; // 精度 > 30m 丢弃

    if (this._lastPt) {
      var segDist = haversine(this._lastPt.lat, this._lastPt.lng, lat, lng);
      if (segDist < MIN_DIST_M && !this._waypoints.length) return; // 第一点不过滤
    }

    // 计算段距离
    var segDist = 0;
    if (this._lastPt) {
      segDist = haversine(this._lastPt.lat, this._lastPt.lng, lat, lng);
    }

    // 过滤异常飞跃
    if (this._lastPt && segDist > 200 && accuracy > 15) return;

    if (segDist > 0) {
      this._totalDist += segDist;

      var dtMs = ts - this._lastPt.ts;
      if (dtMs > 0 && dtMs < 30000) {
        var kmh = calcSpeedKmh(segDist, dtMs);
        this._lastSpeed = kmh;
        if (kmh > this._maxSpeed && kmh < 80) this._maxSpeed = kmh;
      }
    }

    // 海拔
    if (this._lastAlt != null && alt > this._lastAlt) {
      this._elevGain += alt - this._lastAlt;
    }

    // 运动时间（排除静止）
    if (this._lastPt && segDist < 1 && dtMs && dtMs < 10000) {
      // 连续静止 < 1m 不计入运动时间超过 10s
      if (dtMs <= 10000) {
        this._trackTime += dtMs;
      }
    } else if (this._lastPt) {
      this._trackTime += dtMs;
    }

    this._lastPt = { lat: lat, lng: lng, ts: ts };
    this._lastAlt = alt;

    // 存储路径点（精简版，只保留关键字段）
    var wp = {
      t: lat.toFixed(6),
      n: lng.toFixed(6),
      a: Math.round(alt),
      d: Math.round(segDist * 10) / 10,
      s: Math.round(Date.now() / 1000)
    };
    this._waypoints.push(wp);

    // 回调
    this._emitUpdate();
  },

  _emitUpdate: function () {
    if (this._updateCb) {
      this._updateCb(this.getStats());
    }
  }
};

module.exports = {
  createTracker: function () { return new Tracker(); },
  haversine: haversine,
  fmtDuration: fmtDuration
};
