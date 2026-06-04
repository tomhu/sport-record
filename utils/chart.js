/**
 * 轻量图表渲染引擎
 *
 * 基于 Canvas 2D API，无需外部依赖，完全兼容微信小程序。
 * 支持折线图、柱状图，有渐变填充、动画效果。
 */

// ========== 配色 ==========
var COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#06b6d4', '#84cc16', '#e11d48'
];

var CHART_PAD = { top: 40, right: 24, bottom: 56, left: 60 };

// ========== 工具函数 ==========

function roundRect(ctx, x, y, w, h, r) {
  if (h < 0) { y += h; h = -h; }
  if (w < 0) { x += w; w = -w; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function formatDateLabel(dateStr) {
  // "2026-06-04" → "6/4"
  var parts = dateStr.split('-');
  return parseInt(parts[1]) + '/' + parseInt(parts[2]);
}

function formatShortDate(dateStr) {
  var parts = dateStr.split('-');
  return parts[1] + '月' + parts[2] + '日';
}

// ========== 折线图 ==========

/**
 * 绘制折线图
 * @param {CanvasRenderingContext2D} ctx - 画布 context (type="2d")
 * @param {number} w - 画布宽度
 * @param {number} h - 画布高度
 * @param {Array} data - [{ label: '2026-06-01', value: 300 }, ...]
 * @param {object} [opts]
 * @param {string} [opts.lineColor='#10b981']
 * @param {string} [opts.fillColor] - 渐变填充色（默认从 lineColor 渐变到透明）
 * @param {string} [opts.dotColor='#ffffff']
 * @param {number} [opts.dpr=3] - 设备像素比
 * @param {string} [opts.yLabel='千卡']
 * @param {boolean} [opts.showGrid=true]
 * @param {boolean} [opts.fill=true]
 */
function drawLineChart(ctx, w, h, data, opts) {
  opts = opts || {};
  var lineColor = opts.lineColor || '#10b981';
  var dotColor = opts.dotColor || '#ffffff';
  var dpr = opts.dpr || 3;
  var yLabel = opts.yLabel || '';
  var showGrid = opts.showGrid !== false;
  var doFill = opts.fill !== false;

  if (!data || data.length === 0) return;

  var pad = CHART_PAD;
  var plotW = w - pad.left - pad.right;
  var plotH = h - pad.top - pad.bottom;

  // 计算 Y 范围（留 10% 余量）
  var maxVal = 0;
  var sum = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].value > maxVal) maxVal = data[i].value;
    sum += data[i].value;
  }
  var avg = sum / data.length;
  var yMax = Math.max(maxVal, avg * 1.3);
  if (yMax === 0) yMax = 100;
  yMax = Math.ceil(yMax * 1.1);

  // 网格线（4 条）
  var gridCount = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  for (var g = 0; g <= gridCount; g++) {
    var gy = pad.top + (plotH / gridCount) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y 轴标签
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = (11 * dpr) + 'px sans-serif';
  for (var g2 = 0; g2 <= gridCount; g2++) {
    var val = yMax - (yMax / gridCount) * g2;
    var ly = pad.top + (plotH / gridCount) * g2;
    ctx.fillText(Math.round(val) + (yLabel ? '' : ''), pad.left - 10 * dpr, ly);
  }

  // X 轴标签（显示首尾 + 中间若干）
  var xLabelInterval = Math.max(1, Math.floor(data.length / 5));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = (11 * dpr) + 'px sans-serif';
  for (var li = 0; li < data.length; li++) {
    if (li === 0 || li === data.length - 1 || li % xLabelInterval === 0) {
      var lx = pad.left + (plotW / (data.length - 1)) * li;
      ctx.fillText(formatDateLabel(data[li].label), lx, h - pad.bottom + 12 * dpr);
    }
  }

  // 收集点坐标
  var points = [];
  for (var pi = 0; pi < data.length; pi++) {
    var px = pad.left + (plotW / (data.length - 1)) * pi;
    var py = pad.top + plotH - (data[pi].value / yMax) * plotH;
    points.push({ x: px, y: Math.min(py, h - pad.bottom - 4 * dpr) });
  }

  // 渐变填充区域
  if (doFill && data.length > 1) {
    var grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, lineColor + '40');
    grad.addColorStop(0.5, lineColor + '15');
    grad.addColorStop(1, lineColor + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, h - pad.bottom);
    for (var fi = 0; fi < points.length; fi++) {
      ctx.lineTo(points[fi].x, points[fi].y);
    }
    ctx.lineTo(points[points.length - 1].x, h - pad.bottom);
    ctx.closePath();
    ctx.fill();
  }

  // 折线
  if (data.length > 1) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var li2 = 1; li2 < points.length; li2++) {
      ctx.lineTo(points[li2].x, points[li2].y);
    }
    ctx.stroke();
  }

  // 数据点圆点
  for (var di = 0; di < points.length; di++) {
    // 外圈（白色）
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(points[di].x, points[di].y, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // 内圈（主题色）
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(points[di].x, points[di].y, 3 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Y轴单位标签
  if (yLabel) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = (11 * dpr) + 'px sans-serif';
    ctx.fillText('单位: ' + yLabel, pad.left, 8 * dpr);
    ctx.restore();
  }
}

// ========== 柱状图 ==========

/**
 * 绘制柱状图
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w - 画布宽度
 * @param {number} h - 画布高度
 * @param {Array} data - [{ label: '跑步', value: 1200 }, ...]
 * @param {object} [opts]
 * @param {string} [opts.yLabel='千卡']
 * @param {number} [opts.dpr=3]
 * @param {boolean} [opts.showValue=true]
 */
function drawBarChart(ctx, w, h, data, opts) {
  opts = opts || {};
  var dpr = opts.dpr || 3;
  var yLabel = opts.yLabel || '';
  var showValue = opts.showValue !== false;
  var pad = CHART_PAD;
  pad.bottom = 64;
  var plotW = w - pad.left - pad.right;
  var plotH = h - pad.top - pad.bottom;

  if (!data || data.length === 0) return;

  // 计算 Y 范围
  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].value > maxVal) maxVal = data[i].value;
  }
  var yMax = maxVal === 0 ? 100 : Math.ceil(maxVal * 1.15);

  // 网格线
  var gridCount = 4;
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([4 * dpr, 4 * dpr]);
  for (var g = 0; g <= gridCount; g++) {
    var gy = pad.top + (plotH / gridCount) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Y 轴标签
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.font = (11 * dpr) + 'px sans-serif';
  for (var g2 = 0; g2 <= gridCount; g2++) {
    var val = yMax - (yMax / gridCount) * g2;
    var ly = pad.top + (plotH / gridCount) * g2;
    ctx.fillText(Math.round(val), pad.left - 10 * dpr, ly);
  }

  // 柱状图
  var barWidth = Math.min(48 * dpr, (plotW / data.length) * 0.55);
  var gap = (plotW - barWidth * data.length) / (data.length + 1);

  for (var bi = 0; bi < data.length; bi++) {
    var bx = pad.left + gap + (barWidth + gap) * bi;
    var barH = (data[bi].value / yMax) * plotH;
    var by = pad.top + plotH - barH;
    var color = data[bi].color || COLORS[bi % COLORS.length];

    // 圆角柱体
    var radius = Math.min(6 * dpr, barH / 2);
    roundRect(ctx, bx, by, barWidth, barH, radius);
    ctx.fillStyle = color + 'CC';
    ctx.fill();

    // 渐变色覆盖（增加层次感）
    var grad2 = ctx.createLinearGradient(bx, by, bx, by + barH);
    grad2.addColorStop(0, color);
    grad2.addColorStop(1, color + '88');
    ctx.fillStyle = grad2;
    ctx.fill();

    // 数值标签
    if (showValue) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = 'bold ' + (11 * dpr) + 'px sans-serif';
      ctx.fillText(Math.round(data[bi].value), bx + barWidth / 2, by - 6 * dpr);
    }

    // X 轴标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.font = (11 * dpr) + 'px sans-serif';
    var label = data[bi].label;
    if (label.length > 6) label = label.substring(0, 5) + '..';
    ctx.fillText(label, bx + barWidth / 2, h - pad.bottom + 10 * dpr);
  }

  // Y轴单位
  if (yLabel) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = (11 * dpr) + 'px sans-serif';
    ctx.fillText('单位: ' + yLabel, pad.left, 8 * dpr);
    ctx.restore();
  }
}

// ========== 便捷绘图函数 ==========

/**
 * 在 canvas 上绘制图表（初始化 + 绘制一步完成）
 * @param {string} canvasId - canvas 组件的 id
 * @param {string} type - 'line' | 'bar'
 * @param {Array} data - 数据数组
 * @param {object} [opts] - 见对应绘图函数
 */
function drawChart(canvasId, type, data, opts) {
  opts = opts || {};
  var query = wx.createSelectorQuery();
  query.select('#' + canvasId).node(function (res) {
    var canvas = res.node;
    var ctx = canvas.getContext('2d');
    var dpr = opts.dpr || wx.getSystemInfoSync().pixelRatio || 2;
    var width = opts.width || 690;
    var height = opts.height || 400;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 清空
    ctx.clearRect(0, 0, width, height);

    if (type === 'line') {
      drawLineChart(ctx, width, height, data, opts);
    } else if (type === 'bar') {
      drawBarChart(ctx, width, height, data, opts);
    }
  }).exec();
}

module.exports = {
  drawLineChart: drawLineChart,
  drawBarChart: drawBarChart,
  drawChart: drawChart,
  formatShortDate: formatShortDate,

  // 导出颜色供外部使用
  COLORS: COLORS
};
