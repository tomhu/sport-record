/**
 * BLE 心率监测模块
 *
 * 基于微信小程序 BLE API，连接标准心率服务 (0x180D) 获取实时心率。
 * 兼容华为手表及其他支持标准心率 Profile 的 BLE 设备。
 *
 * 标准心率服务:
 *   Service UUID:        0000180d-0000-1000-8000-00805f9b34fb
 *   Measurement Char:    00002a37-0000-1000-8000-00805f9b34fb
 *   Body Sensor Location: 00002a38-0000-1000-8000-00805f9b34fb
 *
 * 心率数据格式 (BLE Spec):
 *   Byte 0: Flags
 *     bit 0: Heart Rate Format (0=UINT8, 1=UINT16)
 *     bit 1-2: Sensor Contact Status
 *     bit 3: Energy Expended Present
 *     bit 4: RR-Interval Present
 *   Byte 1: Heart Rate (UINT8 格式)
 *   Byte 1-2: Heart Rate (UINT16 格式, little-endian)
 */

var storage = require('./storage');

// 标准 BLE 心率服务 UUID
var HR_SERVICE_UUID = '0000180d-0000-1000-8000-00805f9b34fb';
var HR_MEASUREMENT_UUID = '00002a37-0000-1000-8000-00805f9b34fb';

// ========== 工具函数 ==========

/**
 * 将 ArrayBuffer 转为字节数组
 */
function buf2Bytes(buf) {
  var arr = new Uint8Array(buf);
  var bytes = [];
  for (var i = 0; i < arr.length; i++) {
    bytes.push(arr[i]);
  }
  return bytes;
}

/**
 * 解析心率测量值
 * @param {ArrayBuffer} buf - BLE characteristic value
 * @returns {number} 心率 BPM
 */
function parseHeartRate(buf) {
  var bytes = buf2Bytes(buf);
  if (bytes.length < 2) return 0;

  var flags = bytes[0];
  var isUINT16 = (flags & 0x01) === 1;

  var hr;
  if (isUINT16) {
    // UINT16 little-endian
    hr = bytes[1] | (bytes[2] << 8);
  } else {
    hr = bytes[1];
  }

  return hr;
}

// ========== BLE 心率连接器 ==========

/**
 * 创建一个心率连接器实例
 *
 * 用法:
 *   var hr = createHRMonitor();
 *   hr.connect(deviceId, function(bpm) { ... });
 *   hr.disconnect();
 */
function createHRMonitor() {
  var _deviceId = '';
  var _connected = false;
  var _subscribed = false;
  var _onHRChange = null;
  var _onStateChange = null;

  return {
    /** 当前连接状态 */
    isConnected: function () {
      return _connected;
    },

    /**
     * 设置状态变化回调
     * @param {function} cb - function(state: 'connecting'|'connected'|'disconnected'|'error', msg?)
     */
    onStateChange: function (cb) {
      _onStateChange = cb;
    },

    /**
     * 连接到已保存的设备
     * @param {function} onHR - 心率回调 function(bpm)
     * @param {function} [onError] - 错误回调
     */
    connectSaved: function (onHR, onError) {
      var saved = storage.getBLEDevice();
      if (!saved || !saved.deviceId) {
        if (onError) onError('未配对蓝牙设备，请先在设置中连接');
        return;
      }
      this.connect(saved.deviceId, onHR, onError);
    },

    /**
     * 连接到指定设备
     * @param {string} deviceId
     * @param {function} onHR - 心率回调 function(bpm)
     * @param {function} [onError]
     */
    connect: function (deviceId, onHR, onError) {
      var that = this;
      _deviceId = deviceId;
      _onHRChange = onHR;

      if (_onStateChange) _onStateChange('connecting');

      // 1. 打开蓝牙适配器
      wx.openBluetoothAdapter({
        success: function () {
          that._createConnection(deviceId, onError);
        },
        fail: function (err) {
          console.error('[BLE-HR] 打开蓝牙适配器失败:', err);
          if (_onStateChange) _onStateChange('error', '请确保蓝牙已开启');
          if (onError) onError('请确保手机蓝牙已开启');
        }
      });
    },

    /** 内部：创建 BLE 连接 */
    _createConnection: function (deviceId, onError) {
      var that = this;

      // 监听连接断开
      wx.onBLEConnectionStateChange(function (res) {
        if (res.deviceId === _deviceId) {
          _connected = res.connected;
          _subscribed = false;
          if (!res.connected) {
            if (_onStateChange) _onStateChange('disconnected');
          }
        }
      });

      wx.createBLEConnection({
        deviceId: deviceId,
        timeout: 10000,
        success: function () {
          _connected = true;
          console.log('[BLE-HR] 已连接:', deviceId);
          // 获取服务（需延迟，部分设备需要时间发现服务）
          setTimeout(function () {
            that._discoverServices(deviceId, onError);
          }, 500);
        },
        fail: function (err) {
          console.error('[BLE-HR] 连接失败:', err);
          if (_onStateChange) _onStateChange('error', '连接设备失败');
          if (onError) onError('连接设备失败，请靠近设备重试');
        }
      });
    },

    /** 内部：发现服务并订阅心率 */
    _discoverServices: function (deviceId, onError) {
      var that = this;

      wx.getBLEDeviceServices({
        deviceId: deviceId,
        success: function (res) {
          var services = res.services;
          var hrService = null;

          // 查找心率服务
          for (var i = 0; i < services.length; i++) {
            var uuid = services[i].uuid.toLowerCase();
            // 兼容不同格式: 完整UUID 或 短UUID
            if (uuid === HR_SERVICE_UUID || uuid === '180d') {
              hrService = services[i];
              break;
            }
          }

          if (!hrService) {
            // 遍历所有服务尝试查找心率特征
            that._tryAllServices(deviceId, services, onError);
            return;
          }

          that._subscribeHR(deviceId, hrService.uuid, onError);
        },
        fail: function (err) {
          console.error('[BLE-HR] 获取服务失败:', err);
          if (_onStateChange) _onStateChange('error', '获取设备服务失败');
          if (onError) onError('获取设备服务失败');
        }
      });
    },

    /** 内部：遍历所有服务查找心率特征（兼容华为等设备） */
    _tryAllServices: function (deviceId, services, onError) {
      var that = this;
      var found = false;
      var tried = 0;

      for (var i = 0; i < services.length; i++) {
        (function (svc) {
          wx.getBLEDeviceCharacteristics({
            deviceId: deviceId,
            serviceId: svc.uuid,
            success: function (res) {
              tried++;
              for (var j = 0; j < res.characteristics.length; j++) {
                var charUuid = res.characteristics[j].uuid.toLowerCase();
                if (charUuid === HR_MEASUREMENT_UUID || charUuid === '2a37') {
                  found = true;
                  that._subscribeHR(deviceId, svc.uuid, onError);
                  return;
                }
              }
              // 所有服务都试过且没找到
              if (!found && tried === services.length) {
                console.error('[BLE-HR] 未找到心率服务');
                if (_onStateChange) _onStateChange('error', '设备不支持心率服务');
                if (onError) onError('该设备不支持标准心率服务');
              }
            },
            fail: function () {
              tried++;
              if (!found && tried === services.length) {
                if (_onStateChange) _onStateChange('error', '设备不支持心率服务');
                if (onError) onError('该设备不支持标准心率服务');
              }
            }
          });
        })(services[i]);
      }
    },

    /** 内部：订阅心率特征 */
    _subscribeHR: function (deviceId, serviceId, onError) {
      var that = this;

      wx.getBLEDeviceCharacteristics({
        deviceId: deviceId,
        serviceId: serviceId,
        success: function (res) {
          var hrChar = null;
          for (var i = 0; i < res.characteristics.length; i++) {
            var c = res.characteristics[i];
            var uuid = c.uuid.toLowerCase();
            if (uuid === HR_MEASUREMENT_UUID || uuid === '2a37') {
              hrChar = c;
              break;
            }
          }

          if (!hrChar) {
            if (_onStateChange) _onStateChange('error', '未找到心率特征');
            if (onError) onError('未找到心率特征');
            return;
          }

          // 开启 notify
          wx.notifyBLECharacteristicValueChange({
            deviceId: deviceId,
            serviceId: serviceId,
            characteristicId: hrChar.uuid,
            state: true,
            success: function () {
              _subscribed = true;
              if (_onStateChange) _onStateChange('connected');
              console.log('[BLE-HR] 心率订阅成功');
            },
            fail: function (err) {
              console.error('[BLE-HR] 订阅失败:', err);
              if (_onStateChange) _onStateChange('error', '订阅心率数据失败');
              if (onError) onError('订阅心率数据失败');
            }
          });

          // 监听心率数据
          wx.onBLECharacteristicValueChange(function (res) {
            if (res.deviceId === _deviceId && res.characteristicId.toLowerCase() === hrChar.uuid.toLowerCase()) {
              var bpm = parseHeartRate(res.value);
              if (bpm > 0 && bpm < 255 && _onHRChange) {
                _onHRChange(bpm);
              }
            }
          });
        },
        fail: function (err) {
          console.error('[BLE-HR] 获取特征失败:', err);
          if (_onStateChange) _onStateChange('error', '获取心率特征失败');
          if (onError) onError('获取心率特征失败');
        }
      });
    },

    /**
     * 断开连接
     */
    disconnect: function () {
      if (_deviceId && _connected) {
        wx.closeBLEConnection({
          deviceId: _deviceId,
          complete: function () {}
        });
      }
      _connected = false;
      _subscribed = false;
      _onHRChange = null;
    }
  };
}

// ========== 扫描 & 设备管理 ==========

/**
 * 扫描支持心率服务的 BLE 设备
 * @param {function} onFound - 每发现一个设备回调 function({deviceId, name, RSSI})
 * @param {function} onComplete - 扫描结束回调
 */
function startScan(onFound, onComplete) {
  wx.openBluetoothAdapter({
    success: function () {
      // 先停止之前的扫描
      wx.stopBluetoothDevicesDiscovery({
        complete: function () {
          // 设置监听
          wx.onBluetoothDeviceFound(function (res) {
            var devices = res.devices || [];
            for (var i = 0; i < devices.length; i++) {
              var d = devices[i];
              // 过滤: 有名称且 RSSI 合理
              if (d.name && d.name !== '未知设备' && d.RSSI > -90) {
                // 检查是否广播了心率服务
                var hasHR = false;
                if (d.serviceData) {
                  for (var k in d.serviceData) {
                    var uuid = k.toLowerCase();
                    if (uuid === HR_SERVICE_UUID || uuid.indexOf('180d') !== -1) {
                      hasHR = true;
                      break;
                    }
                  }
                }
                // 也上报不确定的设备，让用户选择
                onFound({
                  deviceId: d.deviceId,
                  name: d.name,
                  RSSI: d.RSSI,
                  hasHRService: hasHR
                });
              }
            }
          });

          // 开始扫描（指定心率服务 UUID 过滤）
          wx.startBluetoothDevicesDiscovery({
            services: [HR_SERVICE_UUID],
            allowDuplicatesKey: true,
            interval: 0,
            success: function () {
              console.log('[BLE-HR] 开始扫描心率设备...');
              // 10秒后自动停止
              setTimeout(function () {
                stopScan();
                if (onComplete) onComplete();
              }, 10000);
            },
            fail: function () {
              // 不指定服务再试一次（部分设备可能不在广播包中包含服务UUID）
              wx.startBluetoothDevicesDiscovery({
                allowDuplicatesKey: true,
                interval: 0,
                success: function () {
                  console.log('[BLE-HR] 开始扫描(全量)...');
                  setTimeout(function () {
                    stopScan();
                    if (onComplete) onComplete();
                  }, 10000);
                },
                fail: function (err) {
                  console.error('[BLE-HR] 扫描失败:', err);
                  if (onComplete) onComplete();
                }
              });
            }
          });
        }
      });
    },
    fail: function (err) {
      console.error('[BLE-HR] 打开蓝牙适配器失败:', err);
      if (onComplete) onComplete();
    }
  });
}

/**
 * 停止扫描
 */
function stopScan() {
  wx.stopBluetoothDevicesDiscovery({
    complete: function () {}
  });
  wx.offBluetoothDeviceFound();
}

/**
 * 断开 BLE 连接并关闭适配器
 */
function closeAdapter() {
  wx.closeBluetoothAdapter({
    complete: function () {}
  });
}

module.exports = {
  HR_SERVICE_UUID: HR_SERVICE_UUID,
  HR_MEASUREMENT_UUID: HR_MEASUREMENT_UUID,
  createHRMonitor: createHRMonitor,
  parseHeartRate: parseHeartRate,
  startScan: startScan,
  stopScan: stopScan,
  closeAdapter: closeAdapter
};
