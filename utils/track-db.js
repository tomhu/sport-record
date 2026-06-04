/**
 * 轨迹数据存储
 *
 * 基于 database.js，集合名 'tracks'。
 * 路径点以紧凑文本格式存储，减少 JSON 体积。
 */

var db = require('./database');

/**
 * 编码路径点数组 → 紧凑字符串
 * 格式: "lat,lng,alt,segDist;lat,lng,alt,segDist;..."
 *
 * 路径点来自 tracker.js，字段为 { t, n, a, d }
 */
function encodeWaypoints(wps) {
  if (!wps || wps.length === 0) return '';
  var parts = [];
  for (var i = 0; i < wps.length; i++) {
    var w = wps[i];
    parts.push(w.t + ',' + w.n + ',' + (w.a || 0) + ',' + (w.d || 0));
  }
  return parts.join(';');
}

/**
 * 解码字符串 → 路径点数组 [{ latitude, longitude, altitude, segDist }]
 */
function decodeWaypoints(s) {
  if (!s) return [];
  var items = s.split(';');
  var wps = [];
  for (var i = 0; i < items.length; i++) {
    var p = items[i].split(',');
    if (p.length >= 2) {
      wps.push({
        latitude: parseFloat(p[0]),
        longitude: parseFloat(p[1]),
        altitude: parseInt(p[2]) || 0,
        segDist: parseFloat(p[3]) || 0
      });
    }
  }
  return wps;
}

/**
 * 保存一条轨迹
 */
function saveTrack(trackData) {
  var track = {
    recordId: trackData.recordId,
    userId: trackData.userId || '',
    date: trackData.date || '',
    waypointsEncoded: encodeWaypoints(trackData.waypoints),
    pointCount: trackData.waypoints ? trackData.waypoints.length : 0,
    stats: trackData.stats || {},
    createdAt: Date.now()
  };
  return db.collection('tracks').insert(track);
}

/**
 * 按 recordId 查询轨迹（不含解码路径点）
 */
function getTrackByRecordId(recordId) {
  var list = db.collection('tracks').find({ recordId: recordId });
  return list.length > 0 ? list[0] : null;
}

/**
 * 删除某条轨迹
 */
function deleteTrackByRecordId(recordId) {
  db.collection('tracks').remove({ recordId: recordId });
}

/**
 * 获取用户轨迹列表（仅摘要，不含路径点详情）
 */
function getTrackList(userId, limit) {
  limit = limit || 50;
  var query = userId ? { userId: userId } : {};
  var list = db.collection('tracks').find(query, { sort: { createdAt: -1 }, limit: limit });
  return list.map(function (t) {
    return {
      _id: t._id,
      recordId: t.recordId,
      userId: t.userId,
      date: t.date,
      pointCount: t.pointCount,
      stats: t.stats,
      createdAt: t.createdAt
    };
  });
}

/**
 * 加载轨迹完整数据（含解码后的路径点）
 */
function loadTrackFull(recordId) {
  var t = getTrackByRecordId(recordId);
  if (!t) return null;
  t.waypoints = decodeWaypoints(t.waypointsEncoded);
  return t;
}

module.exports = {
  saveTrack: saveTrack,
  getTrackByRecordId: getTrackByRecordId,
  deleteTrackByRecordId: deleteTrackByRecordId,
  getTrackList: getTrackList,
  loadTrackFull: loadTrackFull,
  decodeWaypoints: decodeWaypoints
};
