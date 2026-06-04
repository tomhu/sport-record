/**
 * 运动类型定义 & MET值对照表
 *
 * measureType:   'duration' (计时) | 'count' (计次) | 'both' (两者)
 * kcalPerUnit:   单次动作消耗热量，count/both 类使用
 * caloriePerKm:  每公里每kg消耗热量，distance 类使用 (0表示不显示距离输入)
 */

var db = require('./database');

var PRESET_SPORTS = [
  // ---- 计时类 (部分支持距离) ----
  { key: 'walking',       name: '🚶 步行',         met: 3.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0.62 },
  { key: 'running',        name: '🏃 跑步(慢跑)',   met: 8.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0.97 },
  { key: 'running_fast',   name: '🏃‍♂️ 跑步(快跑)', met: 12.0, measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 1.03 },
  { key: 'swimming',       name: '🏊 游泳',         met: 7.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'cycling',        name: '🚴 骑行',         met: 6.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0.38 },
  { key: 'fitness',        name: '💪 健身',          met: 5.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'basketball',     name: '🏀 篮球',          met: 6.5,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'football',       name: '⚽ 足球',          met: 7.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'badminton',      name: '🏸 羽毛球',       met: 5.5,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'yoga',           name: '🧘 瑜伽',          met: 2.5,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'table_tennis',   name: '🏓 乒乓球',       met: 4.0,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'tennis',         name: '🎾 网球',          met: 7.3,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },
  { key: 'hiking',         name: '🥾 徒步',          met: 5.3,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0.53 },
  { key: 'dancing',        name: '💃 跳舞',          met: 4.8,  measureType: 'duration', kcalPerUnit: 0, caloriePerKm: 0 },

  // ---- both 类 ----
  { key: 'jump_rope',      name: '🪢 跳绳',          met: 10.0, measureType: 'both',     kcalPerUnit: 0.15, caloriePerKm: 0 },

  // ---- 计次类 ----
  { key: 'sit_up',         name: '🦵 仰卧起坐',     met: 3.8,  measureType: 'count',    kcalPerUnit: 0.5,  caloriePerKm: 0 },
  { key: 'push_up',        name: '💪 俯卧撑',        met: 3.8,  measureType: 'count',    kcalPerUnit: 0.6,  caloriePerKm: 0 },
  { key: 'plank',          name: '🧘 平板支撑',     met: 3.0,  measureType: 'count',    kcalPerUnit: 0.4,  caloriePerKm: 0 },
  { key: 'squat',          name: '🦿 深蹲',          met: 5.0,  measureType: 'count',    kcalPerUnit: 0.5,  caloriePerKm: 0 },
  { key: 'pull_up',        name: '🏋️ 引体向上',     met: 3.8,  measureType: 'count',    kcalPerUnit: 0.7,  caloriePerKm: 0 }
];

// ========== 运动编辑覆盖 ==========

function getSportEdits() {
  var doc = db.getDoc('sport_edits');
  return doc || {};
}

function saveSportEdits(edits) {
  db.setDoc('sport_edits', edits);
}

/**
 * 修改已有运动参数（预设或自定义均可）
 * @param {string} key   运动key
 * @param {object} patch 要更新的字段
 */
function updateSport(key, patch) {
  // 自定义运动：直接修改 custom_sports 集合
  var customs = getCustomSports();
  var found = false;
  for (var i = 0; i < customs.length; i++) {
    if (customs[i].key === key) {
      for (var k in patch) {
        if (patch.hasOwnProperty(k)) customs[i][k] = patch[k];
      }
      found = true;
      break;
    }
  }
  if (found) {
    saveCustomSports(customs);
    return;
  }

  // 预设运动：保存到 sport_edits
  var edits = getSportEdits();
  edits[key] = edits[key] || {};
  for (var k2 in patch) {
    if (patch.hasOwnProperty(k2)) edits[key][k2] = patch[k2];
  }
  saveSportEdits(edits);
}

/**
 * 恢复运动默认值
 */
function resetSportEdit(key) {
  var edits = getSportEdits();
  delete edits[key];
  saveSportEdits(edits);
}

// ========== 自定义运动 ==========

function getCustomSports() {
  return db.collection('custom_sports').find();
}

function saveCustomSports(list) {
  var col = db.collection('custom_sports');
  col.remove({});
  for (var i = 0; i < list.length; i++) {
    col.insert(list[i]);
  }
}

function addCustomSport(sport) {
  var col = db.collection('custom_sports');
  var newSport = {};
  for (var k in sport) {
    if (sport.hasOwnProperty(k)) newSport[k] = sport[k];
  }
  newSport.key = 'custom_' + Date.now();
  return col.insert(newSport);
}

function deleteCustomSport(key) {
  db.collection('custom_sports').remove({ key: key });
}

// ========== 查询（合并编辑覆盖） ==========

/** 对单个 sport 应用编辑覆盖 */
function applyEdits(sport) {
  var edits = getSportEdits();
  var patch = edits[sport.key];
  if (!patch) return sport;
  var merged = {};
  for (var k in sport) {
    if (sport.hasOwnProperty(k)) merged[k] = sport[k];
  }
  for (var k2 in patch) {
    if (patch.hasOwnProperty(k2)) merged[k2] = patch[k2];
  }
  return merged;
}

function getSportByKey(key) {
  var found = null;
  for (var i = 0; i < PRESET_SPORTS.length; i++) {
    if (PRESET_SPORTS[i].key === key) { found = PRESET_SPORTS[i]; break; }
  }
  if (found) return applyEdits(found);
  var customs = getCustomSports();
  for (var j = 0; j < customs.length; j++) {
    if (customs[j].key === key) return customs[j];
  }
  return null;
}

function getAllSports() {
  var presets = [];
  for (var i = 0; i < PRESET_SPORTS.length; i++) {
    presets.push(applyEdits(PRESET_SPORTS[i]));
  }
  return presets.concat(getCustomSports());
}

module.exports = {
  PRESET_SPORTS: PRESET_SPORTS,
  getSportByKey: getSportByKey,
  getAllSports: getAllSports,
  getCustomSports: getCustomSports,
  saveCustomSports: saveCustomSports,
  addCustomSport: addCustomSport,
  deleteCustomSport: deleteCustomSport,
  getSportEdits: getSportEdits,
  saveSportEdits: saveSportEdits,
  updateSport: updateSport,
  resetSportEdit: resetSportEdit
};
