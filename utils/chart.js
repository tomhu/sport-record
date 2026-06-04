/**
 * 轻量图表渲染引擎
 *
 * 基于 Canvas 2D API，无需外部依赖，完全兼容微信小程序。
 * 折线图 + 柱状图，适配移动端屏幕。
 *
 * ⚠️ 调用方应在 canvas 上先 ctx.scale(dpr, dpr)，
 * 本模块所有尺寸均为 CSS 像素，不再乘以 dpr。
 */

var COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#06b6d4', '#84cc16', '#e11d48'
];

// 内边距 (CSS px)，适配小屏适当压缩
var CHART_PAD = { top: 30, right: 12, bottom: 44, left: 44 };

// ========== 工具 ==========

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

function fmtDateLabel(s) {
  var p = s.split('-');
  return p[1] + '/' + p[2];
}

function fmtShortDate(s) {
  var p = s.split('-');
  return p[1] + '月' + p[2] + '日';
}

// ========== 折线图 ==========

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w  画布 CSS 宽度
 * @param {number} h  画布 CSS 高度
 * @param {Array}  data  [{ label, value }]
 * @param {object} [opts]
 *   lineColor   #10b981
 *   dotColor    #ffffff
 *   yLabel      单位
 *   showGrid    true
 *   fill        true
 */
function drawLineChart(ctx, w, h, data, opts) {
  opts = opts || {};
  var lineColor = opts.lineColor || '#10b981';
  var dotColor = opts.dotColor || '#ffffff';
  var yLabel = opts.yLabel || '';
  var showGrid = opts.showGrid !== false;
  var doFill = opts.fill !== false;

  if (!data || data.length === 0) return;

  var pad = CHART_PAD;
  var plotW = w - pad.left - pad.right;
  var plotH = h - pad.top - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return;

  // Y 轴范围
  var maxVal = 0, sum = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].value > maxVal) maxVal = data[i].value;
    sum += data[i].value;
  }
  var avg = sum / data.length;
  var yMax = Math.max(maxVal, avg * 1.3);
  if (yMax === 0) yMax = 100;
  yMax = Math.ceil(yMax * 1.08);

  // ---- 网格线 (虚线) ----
  var gridCount = 4;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (var g = 0; g <= gridCount; g++) {
    var gy = pad.top + (plotH / gridCount) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ---- Y 轴标签 ----
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.font = '10px sans-serif';
  for (var g2 = 0; g2 <= gridCount; g2++) {
    var val = Math.round(yMax - (yMax / gridCount) * g2);
    var ly = pad.top + (plotH / gridCount) * g2;
    ctx.fillText(String(val), pad.left - 6, ly);
  }

  // ---- X 轴标签 (最多 5 个) ----
  var xStep = Math.max(1, Math.floor((data.length - 1) / 4));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.font = '10px sans-serif';
  for (var li = 0; li < data.length; li += xStep) {
    var lx = pad.left + (plotW / (data.length - 1)) * li;
    ctx.fillText(fmtDateLabel(data[li].label), lx, h - pad.bottom + 6);
  }

  // ---- 数据点坐标 ----
  var pts = [];
  for (var pi = 0; pi < data.length; pi++) {
    var px = pad.left + (plotW / (data.length - 1)) * pi;
    var py = pad.top + plotH - (data[pi].value / yMax) * plotH;
    pts.push({ x: px, y: Math.max(pad.top, Math.min(py, h - pad.bottom - 2)) });
  }

  // ---- 渐变填充 ----
  if (doFill && data.length > 1) {
    var grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, lineColor + '35');
    grad.addColorStop(0.6, lineColor + '10');
    grad.addColorStop(1, lineColor + '00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, h - pad.bottom);
    for (var fi = 0; fi < pts.length; fi++) ctx.lineTo(pts[fi].x, pts[fi].y);
    ctx.lineTo(pts[pts.length - 1].x, h - pad.bottom);
    ctx.closePath();
    ctx.fill();
  }

  // ---- 折线 ----
  if (data.length > 1) {
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var li2 = 1; li2 < pts.length; li2++) ctx.lineTo(pts[li2].x, pts[li2].y);
    ctx.stroke();
  }

  // ---- 圆点 ----
  for (var di = 0; di < pts.length; di++) {
    ctx.fillStyle = dotColor;
    ctx.beginPath();
    ctx.arc(pts[di].x, pts[di].y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lineColor;
    ctx.beginPath();
    ctx.arc(pts[di].x, pts[di].y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- 单位 ----
  if (yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.font = '10px sans-serif';
    ctx.fillText(yLabel, pad.left, 4);
  }

  ctx.restore();
}

// ========== 柱状图 ==========

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w
 * @param {number} h
 * @param {Array}  data  [{ label, value, color }]
 * @param {object} [opts]
 *   yLabel
 *   showValue  true
 */
function drawBarChart(ctx, w, h, data, opts) {
  opts = opts || {};
  var yLabel = opts.yLabel || '';
  var showValue = opts.showValue !== false;
  var pad = { top: 28, right: 12, bottom: 52, left: 44 };

  if (!data || data.length === 0) return;

  var plotW = w - pad.left - pad.right;
  var plotH = h - pad.top - pad.bottom;
  if (plotW <= 0 || plotH <= 0) return;

  var maxVal = 0;
  for (var i = 0; i < data.length; i++) {
    if (data[i].value > maxVal) maxVal = data[i].value;
  }
  var yMax = maxVal === 0 ? 100 : Math.ceil(maxVal * 1.12);

  // ---- 网格线 ----
  var gridCount = 4;
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (var g = 0; g <= gridCount; g++) {
    var gy = pad.top + (plotH / gridCount) * g;
    ctx.beginPath();
    ctx.moveTo(pad.left, gy);
    ctx.lineTo(w - pad.right, gy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ---- Y 轴 ----
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.font = '10px sans-serif';
  for (var g2 = 0; g2 <= gridCount; g2++) {
    var val = Math.round(yMax - (yMax / gridCount) * g2);
    var ly = pad.top + (plotH / gridCount) * g2;
    ctx.fillText(String(val), pad.left - 6, ly);
  }

  // ---- 柱体 ----
  var maxBar = 36;
  var barW = Math.min(maxBar, (plotW / data.length) * 0.6);
  var gap = (plotW - barW * data.length) / (data.length + 1);

  for (var bi = 0; bi < data.length; bi++) {
    var bx = pad.left + gap + (barW + gap) * bi;
    var barH = (data[bi].value / yMax) * plotH;
    var by = pad.top + plotH - barH;
    if (barH < 2) continue;
    var color = data[bi].color || COLORS[bi % COLORS.length];
    var r = Math.min(4, barH / 2);

    // 柱体
    roundRect(ctx, bx, by, barW, barH, r);
    var g2d = ctx.createLinearGradient(bx, by, bx, by + barH);
    g2d.addColorStop(0, color);
    g2d.addColorStop(0.5, color);
    g2d.addColorStop(1, color + '99');
    ctx.fillStyle = g2d;
    ctx.fill();

    // 数值
    if (showValue && barH > 20) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(0,0,0,0.50)';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(String(Math.round(data[bi].value)), bx + barW / 2, by - 4);
    }

    // X 标签
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.font = '9px sans-serif';
    var lbl = data[bi].label;
    if (lbl.length > 4) lbl = lbl.substring(0, 4) + '..';
    ctx.fillText(lbl, bx + barW / 2, h - pad.bottom + 6);
  }

  // ---- 单位 ----
  if (yLabel) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.font = '10px sans-serif';
    ctx.fillText(yLabel, pad.left, 2);
  }

  ctx.restore();
}

module.exports = {
  drawLineChart: drawLineChart,
  drawBarChart: drawBarChart,
  fmtShortDate: fmtShortDate,
  COLORS: COLORS
};
