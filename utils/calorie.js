/**
 * 热量计算引擎
 *
 * 计时类: 卡路里(kcal) = MET × 体重(kg) × 时长(小时)
 * 计次类: 卡路里(kcal) = 次数 × 单次消耗(kcalPerUnit)
 * 距离类: 卡路里(kcal) = 距离(km) × 体重(kg) × 每km每kg消耗(caloriePerKm)
 */

function calculateCalories(met, weight, durationMinutes) {
  if (!met || !weight || !durationMinutes || durationMinutes <= 0) return 0;
  return Math.round(met * weight * (durationMinutes / 60));
}

function calculateCountCalories(count, kcalPerUnit) {
  if (!count || !kcalPerUnit || count <= 0) return 0;
  return Math.round(count * kcalPerUnit);
}

/**
 * 根据距离计算热量
 * @param {number} distanceKm - 距离(公里)
 * @param {number} weight - 体重(kg)
 * @param {number} caloriePerKm - 每公里每kg消耗
 */
function calculateDistanceCalories(distanceKm, weight, caloriePerKm) {
  if (!distanceKm || !weight || !caloriePerKm || distanceKm <= 0) return 0;
  return Math.round(distanceKm * weight * caloriePerKm);
}

function calculateTotalCalories(records) {
  if (!records || records.length === 0) return 0;
  return records.reduce(function(sum, r) { return sum + (r.calories || 0); }, 0);
}

function calculateTotalDuration(records) {
  if (!records || records.length === 0) return 0;
  return records.reduce(function(sum, r) { return sum + (r.duration || 0); }, 0);
}

function calculateTotalCount(records) {
  if (!records || records.length === 0) return 0;
  return records.reduce(function(sum, r) { return sum + (r.count || 0); }, 0);
}

function calculateTotalDistance(records) {
  if (!records || records.length === 0) return 0;
  return records.reduce(function(sum, r) { return sum + (r.distance || 0); }, 0);
}

module.exports = {
  calculateCalories: calculateCalories,
  calculateCountCalories: calculateCountCalories,
  calculateDistanceCalories: calculateDistanceCalories,
  calculateTotalCalories: calculateTotalCalories,
  calculateTotalDuration: calculateTotalDuration,
  calculateTotalCount: calculateTotalCount,
  calculateTotalDistance: calculateTotalDistance
};
