/* ==========================================================================
   assets/location.js · 智能定位模块（零依赖，可给全组复用）
   --------------------------------------------------------------------------
   引用方式：<script src="assets/location.js"></script>
   对外接口：window.NavLocation
   设计前提：
     1. 拿坐标用浏览器原生 Geolocation，不需要任何地图 API、不需要 key、可离线。
     2. 把坐标变成看得懂的地址才需要 key（逆地理编码）。没 key 时自动降级，
        用内置区域表做最近匹配，页面照样完整可用。
     3. 浏览器 GPS 多为 WGS-84，高德用 GCJ-02，直接混用会有数百米偏移，
        因此调高德前先做本地坐标转换（可用 configure 关掉）。
   合规：国内位置服务仅使用具备测绘资质的服务商（高德/腾讯/百度）。
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------
     配置区：拿到高德 Web服务 Key 后，只改下面这一行即可
     ------------------------------------------------------------------ */
  var CONFIG = {
    amapKey: '',              // ← 把 Key 粘进引号里，例如 'a1b2c3...'
    provider: 'auto',         // 'auto' 有key走高德 | 'offline' 强制离线 | 'amap' 强制高德
    convertCoord: true,       // WGS-84 → GCJ-02；若发现地址偏了，改成 false
    highAccuracy: true,       // 先尝试高精度；超时后自动用低精度重试一次
    timeout: 15000,
    fallbackTimeout: 10000,
    maximumAge: 600000,
    apiTimeout: 6000,
    outOfRangeKm: 60,
    cityName: '演示城市 · 杭州市',
    // 离线兜底用的区域表；整合真实数据后可整体替换
    regions: [
      { id: 'east',  name: '城东 · 居民区', district: '城东片区', lat: 30.290, lng: 120.230 },
      { id: 'west',  name: '城西 · 商圈',   district: '城西片区', lat: 30.270, lng: 120.130 },
      { id: 'south', name: '城南 · 车站',   district: '城南片区', lat: 30.230, lng: 120.200 },
      { id: 'north', name: '城北 · 学校',   district: '城北片区', lat: 30.330, lng: 120.170 }
    ]
  };

  var state = { current: null, busy: false, listeners: [], seq: 0,
                lastGps: null, lastPermission: null };

  /* ---------------------------- 基础工具 ---------------------------- */

  function hasKey() { return !!(CONFIG.amapKey && String(CONFIG.amapKey).trim()); }
  function useAmap() {
    if (CONFIG.provider === 'offline') return false;
    if (CONFIG.provider === 'amap') return true;
    return hasKey();
  }

  function distanceKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  /* WGS-84 → GCJ-02：公开标准算法，纯本地计算，不额外发请求 */
  function outOfChina(lat, lng) {
    return (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271);
  }
  function transformLat(x, y) {
    var r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3;
    r += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3;
    return r;
  }
  function transformLng(x, y) {
    var r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3;
    r += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3;
    r += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3;
    return r;
  }
  function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return { lat: lat, lng: lng, converted: false };
    var a = 6378245.0, ee = 0.00669342162296594323;
    var dLat = transformLat(lng - 105.0, lat - 35.0);
    var dLng = transformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return { lat: lat + dLat, lng: lng + dLng, converted: true };
  }

  /* GCJ-02 → WGS-84：迭代逼近反解。高德 IP 定位与地理编码返回的是 GCJ-02，
     统一转回 WGS-84，页面其余部分就只用一套坐标系。 */
  function gcj02ToWgs84(lat, lng) {
    var w = { lat: lat, lng: lng };
    for (var i = 0; i < 3; i++) {
      var g = wgs84ToGcj02(w.lat, w.lng);
      w.lat += lat - g.lat;
      w.lng += lng - g.lng;
    }
    return w;
  }

  /* JSONP：file:// 下也能跨域，不需要后端代理 */
  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var cb = '__navloc_' + (++state.seq) + '_' + Date.now();
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () { finish(new Error('接口超时')); }, timeoutMs || CONFIG.apiTimeout);
      function finish(err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { delete root[cb]; } catch (e) { root[cb] = undefined; }
        if (s.parentNode) s.parentNode.removeChild(s);
        if (err) reject(err); else resolve(data);
      }
      root[cb] = function (data) { finish(null, data); };
      s.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + cb + '&_=' + Date.now();
      s.onerror = function () { finish(new Error('网络不可达')); };
      document.head.appendChild(s);
    });
  }

  /* ---------------------- 离线兜底：最近区域匹配 ---------------------- */

  function offlineLabel(lat, lng) {
    var best = null, bestKm = Infinity;
    CONFIG.regions.forEach(function (r) {
      var d = distanceKm({ lat: lat, lng: lng }, r);
      if (d < bestKm) { bestKm = d; best = r; }
    });
    if (!best) return { district: '当前位置', name: '当前位置', km: 0 };
    return {
      district: best.district,
      name: best.name,
      km: bestKm,
      label: best.name + '附近（离线估算）'
    };
  }

  /* ---------------------- 高德：逆地理编码 ---------------------- */

  function fetchAmapAddress(lat, lng) {
    var g = CONFIG.convertCoord ? wgs84ToGcj02(lat, lng) : { lat: lat, lng: lng, converted: false };
    // 高德 location 顺序是「经度,纬度」，小数点后不超过 6 位
    var loc = g.lng.toFixed(6) + ',' + g.lat.toFixed(6);
    var url = 'https://restapi.amap.com/v3/geocode/regeo' +
              '?location=' + encodeURIComponent(loc) +
              '&output=JSON&extensions=base&radius=1000' +
              '&key=' + encodeURIComponent(String(CONFIG.amapKey).trim());
    return jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') {
        throw new Error((data && data.info) || '接口未返回地址');
      }
      var rg = data.regeocode || {};
      var ac = rg.addressComponent || {};
      var sn = ac.streetNumber || {};
      var city = typeof ac.city === 'string' ? ac.city : (typeof ac.province === 'string' ? ac.province : '');
      var district = typeof ac.district === 'string' ? ac.district : '';
      var addr = rg.formatted_address || '';
      // 有些返回会把省市区重复拼一遍，这里拼一个更简短的展示名
      var short = [city, district].filter(Boolean).join(' · ') ||
                  (typeof ac.township === 'string' ? ac.township : '') || addr;
      return {
        address: addr,
        shortLabel: short,
        district: district,
        city: city,
        street: typeof sn.street === 'string' ? sn.street : '',
        number: typeof sn.number === 'string' ? sn.number : '',
        coordSys: g.converted ? 'GCJ-02' : 'WGS-84',
        gcjLat: g.lat, gcjLng: g.lng,
        apiOk: true,
        info: data.info
      };
    });
  }

  /* ---------------------- 高德 IP 定位：不依赖浏览器 GPS ----------------------
     国内桌面 Chrome 的 geolocation 常因无法访问境外位置服务而超时。
     v3/ip 依据公网出口返回真实省 / 市 / 区与城市矩形范围，无需授权、无需 GPS。 */
  function fetchIpLocation() {
    var key = String(CONFIG.amapKey).trim();
    var url = 'https://restapi.amap.com/v3/ip?output=JSON&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') throw new Error((data && data.info) || 'IP 定位失败');
      var rect = String(data.rectangle || '').split(';');
      var lat, lng;
      if (rect.length === 2) {
        var a = rect[0].split(','), b = rect[1].split(',');
        lng = (parseFloat(a[0]) + parseFloat(b[0])) / 2;
        lat = (parseFloat(a[1]) + parseFloat(b[1])) / 2;
      }
      if (!isFinite(lat) || !isFinite(lng)) throw new Error('IP 定位未返回坐标范围');
      var w = CONFIG.convertCoord ? gcj02ToWgs84(lat, lng) : { lat: lat, lng: lng };
      var province = typeof data.province === 'string' ? data.province : '';
      var city = typeof data.city === 'string' ? data.city : '';
      var district = typeof data.district === 'string' ? data.district : '';
      return {
        lat: w.lat, lng: w.lng,
        province: province, city: city, district: district,
        adcode: typeof data.adcode === 'string' ? data.adcode : '',
        address: [province, city, district].filter(Boolean).join(' ')
      };
    });
  }

  function ipLocate(opts) {
    opts = opts || {};
    if (!useAmap()) return Promise.reject(new Error('未配置 Web服务 Key'));
    return fetchIpLocation().then(function (ip) {
      var loc = makeResult({
        lat: ip.lat, lng: ip.lng, accuracy: null,
        address: ip.address, shortLabel: ip.city || ip.address,
        label: ip.address, district: ip.district, city: ip.city,
        province: ip.province, adcode: ip.adcode,
        mode: 'ip', source: 'amap-ip', coordSys: 'WGS-84',
        locationLevel: 'city',
        message: '位置来自网络出口 IP，精度到城市级。想精确到街道，在下面输入地址或小区名即可。',
        provider: 'amap'
      });
      if (!opts.silent) emit(loc, opts.force);
      return loc;
    });
  }

  /* 地址输入提示：用户可精确到街道 / 小区 / 路口 */
  function suggest(keyword, city) {
    var key = String(CONFIG.amapKey).trim();
    var url = 'https://restapi.amap.com/v3/assistant/inputtips' +
              '?keywords=' + encodeURIComponent(keyword) +
              '&city=' + encodeURIComponent(city || '') +
              '&output=JSON&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') throw new Error((data && data.info) || '地址检索失败');
      return (data.tips || []).filter(function (t) { return t.location && String(t.location).indexOf(',') > 0; })
        .slice(0, 6).map(function (t) {
          return {
            id: t.id || '', name: t.name || '', district: t.district || '',
            address: t.address || '', location: t.location
          };
        });
    });
  }

  /* 选中一条地址：把高德返回的 GCJ-02 坐标转回 WGS-84 后作为精确起点 */
  function setByTip(tip) {
    var ll = String(tip.location).split(',');
    var lng = parseFloat(ll[0]), lat = parseFloat(ll[1]);
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve(state.current);
    var w = CONFIG.convertCoord ? gcj02ToWgs84(lat, lng) : { lat: lat, lng: lng };
    var full = [tip.district, tip.name].filter(Boolean).join(' ');
    var loc = makeResult({
      lat: w.lat, lng: w.lng, accuracy: null,
      address: full, shortLabel: tip.name, label: full,
      district: tip.district, city: state.current && state.current.city || '',
      adcode: state.current && state.current.adcode || '',
      mode: 'address', source: 'amap-geocode', coordSys: 'WGS-84',
      locationLevel: 'address',
      message: '位置来自高德地址检索，已精确到这个地点。',
      provider: 'amap'
    });
    emit(loc);
    return Promise.resolve(loc);
  }

  /* 用户所在区：行政区中心是 GCJ-02，转回 WGS-84 后作为精确起点 */
  function setByDistrict(d, city) {
    var ll = String(d.center || '').split(',');
    var lng = parseFloat(ll[0]), lat = parseFloat(ll[1]);
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve(state.current);
    var w = CONFIG.convertCoord ? gcj02ToWgs84(lat, lng) : { lat: lat, lng: lng };
    var full = (city ? city + ' · ' : '') + d.name;
    var loc = makeResult({
      lat: w.lat, lng: w.lng, accuracy: null,
      address: full, shortLabel: full, label: full,
      district: d.name, city: city || '',
      adcode: state.current && state.current.adcode || '',   // 保持城市级，供认证索引 / 区列表使用
      districtCode: d.adcode || '',
      mode: 'district', source: 'amap-district', coordSys: 'WGS-84',
      locationLevel: 'district',
      message: '已按你选的区重新找附近医院。想更精确，再输入小区或街道名。',
      provider: 'amap'
    });
    emit(loc);
    return Promise.resolve(loc);
  }

  /* 已授权时静默尝试浏览器精确定位；未授权不打扰，交给 IP 定位 */
  function permissionState() { return permissionHint(); }

  /* ---------------------- 错误分类（温柔文案） ---------------------- */

  function describeError(e) {
    var code = e && e.code;
    if (code === 1) return {
      kind: 'denied',
      text: '浏览器没给定位权限。点地址栏左边的小锁，把「位置」改成允许再试；也可以直接用下面的手动选择。'
    };
    if (code === 2) return {
      kind: 'unavailable',
      text: '这会儿拿不到位置信号，先手动挑一个起点就好，后面的建议一样能用。'
    };
    if (code === 3) return {
      kind: 'timeout',
      text: '定位花的时间有点久。已经切到低精度重试过了，还是不行就用手动选择。'
    };
    return { kind: 'unknown', text: '定位没成功，先用手动选择，不影响后面的功能。' };
  }

  /* ---------------------- 标准化结果对象 ---------------------- */

  function makeResult(o) {
    var r = {
      lat: o.lat, lng: o.lng,
      accuracy: (typeof o.accuracy === 'number' && isFinite(o.accuracy)) ? Math.round(o.accuracy) : null,
      address: o.address || '',
      shortLabel: o.shortLabel || o.label || '当前位置',
      label: o.label || o.shortLabel || '当前位置',
      district: o.district || '',
      city: o.city || '',
      mode: o.mode || 'gps',
      source: o.source || 'browser',
      coordSys: o.coordSys || 'WGS-84',
      coordConverted: !!o.coordConverted,
      outOfRange: !!o.outOfRange,
      degraded: !!o.degraded,
      message: o.message || '',
      timestamp: o.timestamp || Date.now(),
      provider: o.provider || 'offline',
      adcode: o.adcode || '',
      districtCode: o.districtCode || '',
      restored: !!o.restored,
      province: o.province || '',
      district: o.district || '',
      locationLevel: o.locationLevel || ''
    };
    if (!r.label || r.label === '当前位置') r.label = r.shortLabel;
    return r;
  }

  function nearestRegionKm(lat, lng) {
    return offlineLabel(lat, lng).km;
  }

  /* ---------------------- 本机记住精确位置 ----------------------
     第一次选区 / 输入地址 / GPS 成功后记下来，下次打开 0 秒恢复到街道级。
     只存本机 localStorage，不上传；用户可随时清除。城市级 IP 结果不记。 */
  var STORE_KEY = 'nav.location.precise.v1';
  function remember(loc) {
    if (!loc || loc.mode === 'fail' || loc.locationLevel === 'city' || loc.degraded) return;
    try {
      root.localStorage.setItem(STORE_KEY, JSON.stringify({
        lat: loc.lat, lng: loc.lng, address: loc.address, shortLabel: loc.shortLabel,
        label: loc.label, district: loc.district, city: loc.city, province: loc.province,
        adcode: loc.adcode, mode: loc.mode, source: loc.source,
        coordSys: loc.coordSys, accuracy: loc.accuracy,
        locationLevel: loc.locationLevel, at: Date.now()
      }));
    } catch (e) { /* 隐私模式 / 禁用存储时忽略 */ }
  }
  function recall() {
    try {
      var raw = root.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!isFinite(d.lat) || !isFinite(d.lng)) return null;
      return d;
    } catch (e) { return null; }
  }
  function forget() {
    try { root.localStorage.removeItem(STORE_KEY); } catch (e) {}
  }
  function restoreSaved() {
    var d = recall();
    if (!d) return null;
    var loc = makeResult({
      lat: d.lat, lng: d.lng, accuracy: d.accuracy,
      address: d.address, shortLabel: d.shortLabel, label: d.label,
      district: d.district, city: d.city, province: d.province, adcode: d.adcode,
      mode: d.mode || 'address', source: 'saved', restored: true,
      coordSys: d.coordSys || 'WGS-84', locationLevel: d.locationLevel || 'address',
      message: '已恢复你上次的位置。', provider: 'amap'
    });
    emit(loc);
    return loc;
  }

  /* ---------------------- 后台持续监听精确坐标 ----------------------
     getCurrentPosition 在国内常 3–6 秒就超时，但 watchPosition 有时要
     10–30 秒才补到 WiFi / 系统缓存的位置。这里后台静默监听 60 秒，成功就升级到街道级，
     失败完全不打扰用户，也不阻塞页面。 */
  var watchId = null, watchDone = false;
  function stopWatch() {
    if (watchId != null && root.navigator && root.navigator.geolocation &&
        root.navigator.geolocation.clearWatch) {
      try { root.navigator.geolocation.clearWatch(watchId); } catch (e) {}
    }
    watchId = null;
  }
  function watchPrecise() {
    if (watchDone || watchId != null) return Promise.resolve(state.current);
    var geo = root.navigator && root.navigator.geolocation;
    if (!geo || !geo.watchPosition) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (settled) return; settled = true; stopWatch(); resolve(v); }
      try {
        var watchT0 = Date.now();
        watchId = geo.watchPosition(function (pos) {
          if (!pos || !pos.coords) return;
          state.lastGps = { ok: true, ms: Date.now() - watchT0,
            accuracy: pos.coords.accuracy, code: 0, at: Date.now() };
          watchDone = true;
          var c = pos.coords;
          enrich({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, mode: 'gps' })
            .then(function (loc) { emit(loc); done(loc); })
            .catch(function () { done(null); });
        }, function (err) {
          // 记录失败原因供诊断面板显示；不弹提示打扰用户
          if (!state.lastGps || state.lastGps.ok) {
            state.lastGps = { ok: false, ms: Date.now() - watchT0,
              code: err && err.code || 3, message: err && err.message || '', at: Date.now() };
          }
        },
        { enableHighAccuracy: true, maximumAge: 600000, timeout: 60000 });
      } catch (e) { done(null); }
      setTimeout(function () { done(null); }, 65000);
    });
  }

  function isPreciseLevel(x) {
    return !!(x && x.mode !== 'fail' && (
      x.locationLevel === 'address' || x.locationLevel === 'district' ||
      x.mode === 'gps' || x.mode === 'manual'));
  }
  function emit(loc, force) {
    // 迟到的 IP 城市级结果不能覆盖已拿到的精确坐标：
    // 否则页面显示街道级，对外复制/分享的却是城市中心，等于又骗一次。
    // force 用于用户主动「这不是我的位置」后强制回到城市级。
    if (!force && isPreciseLevel(state.current) && loc && loc.locationLevel === 'city') return;
    remember(loc);
    state.current = loc;
    state.listeners.slice().forEach(function (fn) {
      try { fn(loc); } catch (e) { /* 订阅者出错不影响定位主流程 */ }
    });
  }

  /* ---------------------- 地址补全（可失败，失败即降级） ---------------------- */

  function enrich(base) {
    if (!useAmap()) {
      var off = offlineLabel(base.lat, base.lng);
      return Promise.resolve(makeResult({
        lat: base.lat, lng: base.lng, accuracy: base.accuracy,
        shortLabel: off.name, label: off.label, district: off.district,
        mode: base.mode, source: 'offline-region',
        coordSys: 'WGS-84', outOfRange: off.km > CONFIG.outOfRangeKm,
        message: hasKey() ? '' : '未配置地图 Key，位置按内置区域估算；填 Key 后可显示完整街道地址。',
        provider: 'offline'
      }));
    }
    return fetchAmapAddress(base.lat, base.lng).then(function (a) {
      return makeResult({
        lat: base.lat, lng: base.lng, accuracy: base.accuracy,
        address: a.address, shortLabel: a.shortLabel, district: a.district, city: a.city,
        label: a.address || a.shortLabel,
        mode: base.mode, source: 'amap-regeo',
        coordSys: a.coordSys, coordConverted: CONFIG.convertCoord,
        adcode: state.current && state.current.adcode || '',
        city: a.city, province: state.current && state.current.province || '',
        locationLevel: 'address',
        outOfRange: nearestRegionKm(base.lat, base.lng) > CONFIG.outOfRangeKm,
        message: a.address ? '地址来自高德逆地理编码，附近医院为高德真实数据。' : '',
        provider: 'amap'
      });
    }).catch(function (err) {
      // 接口失败不阻断主流程：退回离线区域名，并明确说明原因
      var off = offlineLabel(base.lat, base.lng);
      return makeResult({
        lat: base.lat, lng: base.lng, accuracy: base.accuracy,
        shortLabel: off.name, label: off.label, district: off.district,
        mode: base.mode, source: 'offline-fallback',
        coordSys: 'WGS-84', outOfRange: off.km > CONFIG.outOfRangeKm,
        degraded: true,
        message: '地图接口暂时没连上（' + (err.message || '未知原因') + '），已改用内置区域估算，功能不受影响。',
        provider: 'amap-failed'
      });
    });
  }

  /* ---------------------- 浏览器取坐标（含分级重试） ---------------------- */

  function getCoords(options) {
    return new Promise(function (resolve, reject) {
      if (!root.navigator || !root.navigator.geolocation) {
        reject({ kind: 'unsupported', text: '这个浏览器不支持定位，手动选一个起点就好。' });
        return;
      }
      var t0 = Date.now();
      root.navigator.geolocation.getCurrentPosition(
        function (pos) {
          state.lastGps = { ok: true, ms: Date.now() - t0,
            accuracy: pos.coords.accuracy, code: 0, at: Date.now() };
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp
          });
        },
        function (err) {
          state.lastGps = { ok: false, ms: Date.now() - t0,
            code: err.code, message: err.message || '', at: Date.now() };
          reject(describeError(err));
        },
        options
      );
    });
  }

  function permissionHint() {
    if (!root.navigator || !root.navigator.permissions ||
        !root.navigator.permissions.query) return Promise.resolve(null);
    try {
      return root.navigator.permissions.query({ name: 'geolocation' }).then(function (p) {
        state.lastPermission = p.state; // 'granted' | 'prompt' | 'denied'
        return p.state;
      }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }

  /* ---------------------------- 主入口 ---------------------------- */

  function locate(opts) {
    opts = opts || {};
    if (state.busy) return Promise.resolve(state.current);
    state.busy = true;

    var first = {
      enableHighAccuracy: CONFIG.highAccuracy,
      timeout: CONFIG.timeout,
      maximumAge: CONFIG.maximumAge
    };
    var second = {
      enableHighAccuracy: false,
      timeout: CONFIG.fallbackTimeout,
      maximumAge: CONFIG.maximumAge
    };

    return permissionHint().then(function (perm) {
      if (perm === 'denied') {
        throw { kind: 'denied', text: '浏览器已经把定位权限关掉了。点地址栏左边的小锁改回「允许」，或者直接用手动选择。' };
      }
      return getCoords(first).catch(function (e) {
        // 超时/无信号时，用低精度再试一次；被明确拒绝则不重复打扰
        if (e && e.kind === 'denied') throw e;
        return getCoords(second);
      });
    }).then(function (c) {
      return enrich({ lat: c.lat, lng: c.lng, accuracy: c.accuracy, mode: 'gps' });
    }).catch(function (e) {
      var info = (e && e.text) ? e : { kind: 'unknown', text: '定位没成功，先用手动选择，不影响后面的功能。' };
      // 调用方已经单独做过 IP 定位时，失败就直接保持现状，不再重复等待
      if (opts.skipIpFallback && state.current) {
        var keep = {};
        Object.keys(state.current).forEach(function (k) { keep[k] = state.current[k]; });
        keep.noEmit = true;
        return keep;
      }
      // GPS 超时在国内很常见（浏览器位置服务不可达）。降级到 IP 定位拿真实城市，
      // 只有 IP 定位也失败时才回退到内置演示起点。
      return ipLocate({ silent: true }).catch(function () {
        var fallback = CONFIG.regions[0];
        return makeResult({
          lat: fallback.lat, lng: fallback.lng, accuracy: null,
          shortLabel: fallback.name, label: fallback.name, district: fallback.district,
          mode: 'fail', source: 'fallback', coordSys: 'WGS-84',
          degraded: true, message: info.text, provider: 'offline'
        });
      }).then(function (fallback) {
        // 已经有区级 / 地址级精确位置时，GPS 失败不该把它退回城市中心
        if (state.current && state.current.mode !== 'fail' &&
            state.current.locationLevel !== 'city') {
          var keep = {};
          Object.keys(state.current).forEach(function (k) { keep[k] = state.current[k]; });
          keep.noEmit = true;
          return keep;
        }
        return fallback;
      });
    }).then(function (loc) {
      state.busy = false;
      if (loc && loc.noEmit) return state.current;
      if (!opts.silent) emit(loc);
      else state.current = loc;
      return loc;
    });
  }

  /* 手动指定位置（组员模块传入坐标时走这里），同样会尝试补全地址 */
  function setManual(lat, lng, label) {
    lat = Number(lat); lng = Number(lng);
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve(state.current);
    var immediate = makeResult({
      lat: lat, lng: lng, accuracy: null,
      shortLabel: label || offlineLabel(lat, lng).name,
      label: label || offlineLabel(lat, lng).name,
      district: offlineLabel(lat, lng).district,
      mode: 'manual', source: 'external', coordSys: 'WGS-84', provider: 'offline'
    });
    emit(immediate);
    return enrich({ lat: lat, lng: lng, accuracy: null, mode: 'manual' }).then(function (loc) {
      // 外部传入的名字优先保留，避免把组员给的标签覆盖掉
      if (label && !loc.address) { loc.shortLabel = label; loc.label = label; }
      emit(loc);
      return loc;
    });
  }

  /* 定位诊断：把真实环境信息交给页面，不再含糊地说「已定位」 */
  function diagnostics() {
    return {
      protocol: root.location ? root.location.protocol : '',
      secureContext: !!root.isSecureContext,
      geolocationSupported: !!(root.navigator && root.navigator.geolocation),
      permission: state.lastPermission,
      lastGps: state.lastGps,
      savedLocation: recall(),
      currentLevel: state.current && state.current.locationLevel || '',
      currentSource: state.current && state.current.source || ''
    };
  }

  /* ---------------------------- 对外 API ---------------------------- */

  root.NavLocation = {
    version: '1.0.0',
    configure: function (o) {
      o = o || {};
      Object.keys(o).forEach(function (k) { if (k in CONFIG) CONFIG[k] = o[k]; });
      return this.status();
    },
    status: function () {
      return {
        hasKey: hasKey(), provider: useAmap() ? 'amap' : 'offline',
        configuredProvider: CONFIG.provider,
        convertCoord: CONFIG.convertCoord,
        secureContext: !!root.isSecureContext,
        geolocationSupported: !!(root.navigator && root.navigator.geolocation),
        regionCount: CONFIG.regions.length,
        city: state.current && state.current.city || '',
        adcode: state.current && state.current.adcode || ''
      };
    },
    locate: locate,
    ipLocate: ipLocate,
    suggest: suggest,
    setByTip: setByTip,
    setByDistrict: setByDistrict,
    permissionState: permissionState,
    diagnostics: diagnostics,
    watchPrecise: watchPrecise,
    recall: recall,
    forget: forget,
    restoreSaved: restoreSaved,
    remember: remember,
    gcj02ToWgs84: gcj02ToWgs84,
    setManual: setManual,
    current: function () { return state.current; },
    onChange: function (fn) {
      if (typeof fn === 'function') state.listeners.push(fn);
      return function () { state.listeners = state.listeners.filter(function (f) { return f !== fn; }); };
    },
    // 给需要算距离的同学用
    distanceKm: distanceKm,
    wgs84ToGcj02: wgs84ToGcj02,
    config: CONFIG
  };
})(window);
