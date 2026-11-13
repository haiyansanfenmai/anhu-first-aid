/* ==========================================================================
   assets/amap.js · 高德地图服务层（零第三方依赖，全组可复用）
   --------------------------------------------------------------------------
   引用：<script src="assets/location.js"></script>
         <script src="assets/amap.js"></script>
   对外：window.NavMap
   职责：静态地图图片 URL、路径规划（真实距离/时间）、周边医院 POI、
         交互式大地图（按需加载 JS API）
   合规：国内位置服务仅使用具备测绘资质的服务商；本文件不内置任何有效 Key。
   ========================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------
     配置位：请在高德开放平台申请自己的 Key 后替换下面三个占位符
     申请入口 https://console.amap.com/dev/key/app →「添加 Key」
       · webKey  → 服务平台选「Web服务」：逆地理编码 / 路径规划 / 静态地图
       · jsKey   → 服务平台选「Web端(JS API)」：放大后的可缩放交互地图
       · jscode  → 与 jsKey 同一页面生成的「安全密钥 jscode」
     只填 webKey 也能完整使用（大地图自动用高清静态路线图，不会白屏）。
     注意：Key 明文放在前端仅适合作业演示；正式上线应由后端代理，
           并在控制台给 Key 配置 Referer 域名白名单。
     ------------------------------------------------------------------ */
  var CFG = {
    webKey: 'REPLACE_WITH_YOUR_AMAP_WEB_SERVICE_KEY',
    jsKey:  'REPLACE_WITH_YOUR_AMAP_JS_API_KEY',
    jscode: 'REPLACE_WITH_YOUR_AMAP_SECURITY_JSCODE',
    provider: 'auto',        // 'auto' | 'offline'（断网演示用，可用 ?offline=1 触发）
    apiTimeout: 7000,
    staticTimeout: 9000
  };

  /* 本机凭证文件 assets/key.local.js 若存在则覆盖占位符；主源码始终保持占位符 */
  if (root.NavKeys && typeof root.NavKeys === 'object') {
    ['webKey', 'jsKey', 'jscode'].forEach(function (k) {
      if (root.NavKeys[k]) CFG[k] = root.NavKeys[k];
    });
  }

  /* 高德 Key 是 32 位十六进制串；占位符一律视为「未配置」 */
  function isKey(v) { return /^[0-9a-f]{32}$/i.test(String(v || '').trim()); }
  function webKey() {
    if (CFG.provider === 'offline') return '';
    return isKey(CFG.webKey) ? String(CFG.webKey).trim() : '';
  }
  function jsKey() { return isKey(CFG.jsKey) ? String(CFG.jsKey).trim() : ''; }
  function jscode() {
    var s = String(CFG.jscode || '').trim();
    return (s && s !== 'REPLACE_WITH_YOUR_AMAP_SECURITY_JSCODE') ? s : '';
  }

  /* ------------------------------------------------------------------
     坐标：浏览器 GPS 是 WGS-84，高德底图是 GCJ-02，必须先转换
     复用 location.js 的公开转换函数，避免两份算法不一致
     ------------------------------------------------------------------ */
  function toGcj(lat, lng) {
    if (root.NavLocation && typeof root.NavLocation.wgs84ToGcj02 === 'function') {
      return root.NavLocation.wgs84ToGcj02(lat, lng);
    }
    return { lat: lat, lng: lng, converted: false };
  }
  function pair(lat, lng) {
    var g = toGcj(lat, lng);
    return g.lng.toFixed(6) + ',' + g.lat.toFixed(6);
  }
  /* 高德路径规划返回的 polyline / POI 坐标已经是 GCJ-02，不能再转一次 */
  function gcjPair(lat, lng) {
    return Number(lng).toFixed(6) + ',' + Number(lat).toFixed(6);
  }

  /* JSONP：file:// 双击打开也能跨域，不需要后端、不需要 CORS 配置 */
  var seq = 0;
  function jsonp(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var cb = '__navmap_' + (++seq) + '_' + Date.now();
      var s = document.createElement('script');
      var done = false;
      var timer = setTimeout(function () { finish(new Error('接口超时')); }, timeoutMs || CFG.apiTimeout);
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

  /* ------------------------------------------------------------------
     静态地图图片：可直接作为 <img src>，不受跨域限制
     markers 最多 10 个；label 只支持 0-9 / A-Z / 单个中文字，故用 S/A/B/C
     ------------------------------------------------------------------ */
  /* 按所有标注的经纬度跨度选 zoom：两点离得远就缩小，保证标记都在图内 */
  function autoZoom(points) {
    if (!points || points.length < 2) return 13;
    var lats = points.map(function (p) { return p.lat; });
    var lngs = points.map(function (p) { return p.lng; });
    var span = Math.max(
      Math.max.apply(null, lats) - Math.min.apply(null, lats),
      Math.max.apply(null, lngs) - Math.min.apply(null, lngs)
    );
    if (span > 2) return 6;
    if (span > .8) return 8;
    if (span > .3) return 10;
    if (span > .12) return 11;
    if (span > .05) return 12;
    return 13;
  }

  function staticUrl(o) {
    o = o || {};
    var key = webKey();
    if (!key) return '';
    var size = o.size || '900*340';
    var allPts = [o.origin].concat(o.destinations || []).filter(Boolean);
    var zoom = o.zoom || autoZoom(allPts);
    var center = o.center ? pair(o.center.lat, o.center.lng) : '';
    var params = [
      'size=' + size,
      'scale=2',
      'zoom=' + zoom,
      'key=' + encodeURIComponent(key)
    ];
    if (center) params.unshift('location=' + center);

    /* 官方格式：markers=样式1:点1|样式2:点2|...
       每个点必须单独成组（用 | 分隔），同组里不能再出现带字母标签的点，
       否则高德返回 UNKNOWN_ERROR(20003) 的 JSON，浏览器会用 ORB 挡掉。 */
    var mk = [];
    if (o.origin) mk.push('large,0xC47A48,S:' + pair(o.origin.lat, o.origin.lng));
    var letters = 'ABCDEFGHIJ';
    (o.destinations || []).slice(0, 8).forEach(function (d, i) {
      mk.push('mid,0x22845F,' + letters.charAt(i) + ':' + pair(d.lat, d.lng));
    });
    if (mk.length) params.push('markers=' + mk.join('|'));

    // 路径折线：路径规划返回的 polyline 点很多，URL 有长度上限，这里等距采样
    var pts = (o.path || []).slice();
    if (pts.length > 42) {
      var step = Math.ceil(pts.length / 42);
      var sampled = [];
      for (var i = 0; i < pts.length; i += step) sampled.push(pts[i]);
      if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
      pts = sampled;
    }
    if (pts.length >= 2) {
      // o.path 来自高德路径规划，坐标已是 GCJ-02，直接用原值
      var line = pts.map(function (p) { return gcjPair(p.lat, p.lng); }).join(';');
      params.push('paths=6,0xC47A48,0.9,,:' + line);
    }
    return 'https://restapi.amap.com/v3/staticmap?' + params.join('&');
  }

  /* ------------------------------------------------------------------
     路径规划：真实距离与耗时，并把 polyline 交回给静态图画路线
     mode: car(驾车/救护车) | walk(步行/公交) | transit(公交)
     ------------------------------------------------------------------ */
  var ROUTE_API = {
    car:     'https://restapi.amap.com/v3/direction/driving',
    walk:    'https://restapi.amap.com/v3/direction/walking',
    transit: 'https://restapi.amap.com/v3/direction/transit/integrated'
  };
  function parsePolyline(str) {
    if (typeof str !== 'string' || !str) return [];
    return str.split(';').map(function (p) {
      var a = p.split(',');
      if (a.length < 2) return null;
      return { lat: parseFloat(a[1]), lng: parseFloat(a[0]) };
    }).filter(function (p) { return p && isFinite(p.lat) && isFinite(p.lng); });
  }
  function route(o) {
    var key = webKey();
    if (!key) return Promise.reject(new Error('未配置 Web服务 Key'));
    var mode = ROUTE_API[o.mode] ? o.mode : 'car';
    var from = pair(o.origin.lat, o.origin.lng);
    var to = pair(o.destination.lat, o.destination.lng);
    var url = ROUTE_API[mode] + '?origin=' + from + '&destination=' + to +
              '&output=JSON&extensions=base&key=' + encodeURIComponent(key);
    if (mode === 'transit') url += '&city=' + encodeURIComponent(o.city || '杭州') + '&strategy=0';
    return jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') throw new Error((data && data.info) || '路径规划未返回结果');
      var p;
      if (mode === 'transit') {
        var tr = data.route && data.route.transits;
        p = tr && tr[0];
        if (!p) throw new Error('没有可用的公交方案');
      } else {
        var paths = data.route && data.route.paths;
        p = paths && paths[0];
        if (!p) throw new Error('没有可用的驾车/步行路线');
      }
      var steps = p.steps || [];
      var line = [];
      steps.forEach(function (s) { line = line.concat(parsePolyline(s.polyline)); });
      var instructions = steps.filter(function (s) { return s.instruction; })
                              .slice(0, 6).map(function (s) { return String(s.instruction).replace(/<[^>]+>/g, ''); });
      return {
        distance: Number(p.distance || 0),
        duration: Number(p.duration || 0),
        km: Math.round(Number(p.distance || 0) / 100) / 10,
        min: Math.max(1, Math.round(Number(p.duration || 0) / 60)),
        path: line,
        instructions: instructions,
        mode: mode,
        source: 'amap'
      };
    });
  }

  /* ------------------------------------------------------------------
     周边医院 POI（可选增强）：真实名称/地址/电话/距离
     注意：是否具备「胸痛中心 / 卒中中心」等救治能力不属于高德数据，
           需人工维护，因此本页面默认不自动替换演示名单。
     ------------------------------------------------------------------ */
  function nearby(o) {
    var key = webKey();
    if (!key) return Promise.reject(new Error('未配置 Web服务 Key'));
    var url = 'https://restapi.amap.com/v3/place/around' +
              '?location=' + pair(o.lat, o.lng) +
              '&keywords=' + encodeURIComponent('医院') +
              '&radius=8000&offset=20&page=1&extensions=base&output=JSON' +
              '&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') throw new Error((data && data.info) || '周边检索失败');
      return (data.pois || []).map(function (p) {
        var ll = String(p.location || '').split(',');
        return {
          id: p.id, name: p.name, address: p.address, tel: p.tel,
          distance: Number(p.distance || 0),
          lat: parseFloat(ll[1]), lng: parseFloat(ll[0]),
          type: p.type
        };
      });
    });
  }

  /* 真实行政区：IP 定位只到城市，用户选自己所在区后按区中心重新找医院。
     比把整个城市矩形中心（常落在别的区）当起点准得多。 */
  function districts(adcode) {
    var key = webKey();
    if (!key || !adcode) return Promise.reject(new Error('缺少城市编码'));
    var url = 'https://restapi.amap.com/v3/config/district' +
              '?keywords=' + encodeURIComponent(adcode) +
              '&subdistrict=1&extensions=base&output=JSON&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (d) {
      if (!d || String(d.status) !== '1') throw new Error((d && d.info) || '行政区查询失败');
      var top = (d.districts || [])[0] || {};
      return (top.districts || []).filter(function (x) { return x.center && x.name; })
        .map(function (x) {
          return { name: x.name, adcode: x.adcode, center: x.center };
        });
    });
  }

  /* 关键词检索（认证中心 / 急救地图 POI），供 NavCapability 使用 */
  function placeText(keywords, city, offset) {
    var key = webKey();
    if (!key) return Promise.reject(new Error('未配置 Web服务 Key'));
    var url = 'https://restapi.amap.com/v3/place/text' +
              '?keywords=' + encodeURIComponent(keywords) +
              '&city=' + encodeURIComponent(city || '') +
              '&offset=' + (offset || 25) + '&page=1&extensions=base&output=JSON' +
              '&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (d) {
      if (!d || String(d.status) !== '1') throw new Error((d && d.info) || '检索失败');
      return (d.pois || []).map(function (x) {
        return { name: x.name || '', type: x.type || '', address: x.address || '', id: x.id || '' };
      });
    });
  }

  /* ------------------------------------------------------------------
     POI 现场照片：place/text 带 extensions=all 会返回 photos[].url
     （高德自有图床 store.is.autonavi.com）。统一转成 https，避免混合内容。
     实测 25 家医院里 24 家有照片，单次请求约 260ms。
     ------------------------------------------------------------------ */
  function photos(name, adcode) {
    var key = webKey();
    if (!key || !name) return Promise.reject(new Error('缺少医院名称或 Key'));
    var url = 'https://restapi.amap.com/v3/place/text' +
              '?keywords=' + encodeURIComponent(name) +
              '&city=' + encodeURIComponent(adcode || '') +
              '&offset=3&page=1&extensions=all&output=JSON&key=' + encodeURIComponent(key);
    return jsonp(url).then(function (d) {
      if (!d || String(d.status) !== '1') throw new Error((d && d.info) || '照片检索失败');
      var out = [], q = String(name).replace(/\s+/g, '');
      (d.pois || []).forEach(function (p) {
        var pn = String(p.name || '').replace(/\s+/g, '');
        // 只取与查询医院同名的 POI，避免混进别的机构照片
        if (pn !== q && pn.indexOf(q) < 0 && q.indexOf(pn) < 0) return;
        (p.photos || []).forEach(function (ph) {
          var u = String(ph.url || '');
          if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7);
          if (u && out.indexOf(u) < 0) out.push(u);
        });
      });
      return out.slice(0, 6);
    });
  }

  /* ------------------------------------------------------------------
     真实医院 POI：按当前坐标检索附近医院，替换演示名单
     能力标签不再靠名称推断：
       · 医院等级 / 类型 = 高德 POI 的 type 客观字段
       · 胸痛 / 卒中 / 急救中心 = NavCapability 的认证索引
         （高德认证中心 POI + 公开公布名单，均带来源）
     ------------------------------------------------------------------ */
  function toWgs(lng, lat) {
    if (root.NavLocation && typeof root.NavLocation.gcj02ToWgs84 === 'function') {
      return root.NavLocation.gcj02ToWgs84(lat, lng);
    }
    return { lat: lat, lng: lng };
  }
  function typeCaps(type) {
    if (root.NavCapability && root.NavCapability.typeCaps) return root.NavCapability.typeCaps(type);
    return ['医疗机构'];
  }
  function decorate(list, adcode) {
    if (!root.NavCapability || !adcode) return list;
    list.forEach(function (h) {
      var m = root.NavCapability.match(h.name, h.type, adcode);
      h.caps = m.caps;
      h.certs = m.certs;
      h.listed = m.listed;
    });
    return list;
  }
  /* place/around 会混进「-北座」「行政综合楼」「XX胸痛中心」这类附属 POI，
     它们不是可就诊的医院主体。过滤掉，让真正的医院排到前面；
     若过滤后数量太少则保留原列表，避免把小区域清空。 */
  function mainHospitals(list) {
    var ancillary = /[-－][东南西北中]座|行政?综合楼|门诊楼|住院楼|医技楼|停车场|宿舍|食堂|门卫|锅炉房|配电|洗衣房|太平间|(胸痛|卒中|创伤|急救)中心$/;
    var kept = list.filter(function (h) { return !ancillary.test(h.name); });
    return kept.length >= 5 ? kept : list;
  }
  function capLoad(adcode) {
    if (!root.NavCapability || !adcode) return Promise.resolve(null);
    return root.NavCapability.load(adcode).catch(function () { return null; });
  }
  function normalizePoi(p, i) {
    var ll = String(p.location || '').split(',');
    var lng = parseFloat(ll[0]), lat = parseFloat(ll[1]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    var w = toWgs(lng, lat);
    var name = typeof p.name === 'string' ? p.name : '未命名医疗机构';
    var type = typeof p.type === 'string' ? p.type : '';
    return {
      id: String(p.id || 'poi-' + i),
      name: name,
      address: typeof p.address === 'string' ? p.address : '',
      tel: typeof p.tel === 'string' ? p.tel : '',
      type: type,
      typeShort: type.split(';').pop() || '医疗机构',
      distanceM: Number(p.distance || 0),
      lat: w.lat, lng: w.lng,
      caps: typeCaps(type),
      certs: [], listed: [],
      photos: (p.photos || []).map(function (ph) {
        var u = String((ph && ph.url) || '');
        if (u.indexOf('http://') === 0) u = 'https://' + u.slice(7);
        return u;
      }).filter(Boolean).slice(0, 6),
      // 到院动线属于现场信息，高德不提供；真实模式下页面改显真实地址与电话
      gate: '', park: '', night: '', where: '',
      note: '名称、地址、电话、距离与医院类型来自高德地图；认证信息来自认证中心 POI 与公开名单。',
      real: true
    };
  }
  function hospitals(o) {
    var key = webKey();
    if (!key) return Promise.reject(new Error('未配置 Web服务 Key'));
    o = o || {};
    var loc = pair(o.lat, o.lng);
    /* 未定位（只有城市级 IP）时不能以城市中心做「周边检索」：深圳的框中心在福田，
       会把南山用户全指到福田。改为按整个城市检索，距离一律不显示。 */
    if (o.cityOnly) {
      var t0 = 'https://restapi.amap.com/v3/place/text' +
               '?keywords=' + encodeURIComponent('医院') +
               '&city=' + encodeURIComponent(o.adcode || '') +
               '&citylimit=true&offset=25&page=1&extensions=all&output=JSON' +
               '&key=' + encodeURIComponent(key);
      return jsonp(t0).then(function (d) {
        if (!d || String(d.status) !== '1') throw new Error((d && d.info) || '城市检索失败');
        var ls = (d.pois || []).map(normalizePoi).filter(Boolean);
        ls.forEach(function (h) { h.distanceM = null; });
        ls = mainHospitals(ls);
        decorate(ls, o.adcode);
        return ls;
      });
    }
    var url = 'https://restapi.amap.com/v3/place/around' +
              '?location=' + loc +
              '&keywords=' + encodeURIComponent('医院') +
              '&radius=10000&offset=25&page=1&extensions=all&output=JSON' +
              '&key=' + encodeURIComponent(key);
    var poisP = jsonp(url).then(function (data) {
      if (!data || String(data.status) !== '1') throw new Error((data && data.info) || '周边检索失败');
      var list = (data.pois || []).map(normalizePoi).filter(Boolean);
      if (list.length >= 6 || !o.adcode) return list;
      // 附近结果太少时，用城市检索补充（真实城市内的三甲 / 专科医院）
      var text = 'https://restapi.amap.com/v3/place/text' +
                 '?keywords=' + encodeURIComponent('医院') +
                 '&city=' + encodeURIComponent(o.adcode) +
                 '&offset=15&page=1&extensions=all&output=JSON' +
                 '&key=' + encodeURIComponent(key);
      return jsonp(text).then(function (d2) {
        var more = ((d2 && d2.pois) || []).map(normalizePoi).filter(Boolean);
        var seen = {};
        list.forEach(function (h) { seen[h.id] = true; });
        more.forEach(function (h) { if (!seen[h.id]) { h.distanceM = null; list.push(h); } });
        return list.slice(0, 20);
      }).catch(function () { return list; });
    });
    /* 医院列表先返回，认证索引在后台补；首屏不必等 4 个检索请求 */
    return poisP.then(function (list) {
      list = mainHospitals(list);
      decorate(list, o.adcode);   // 已缓存时立刻生效
      var st = root.NavCapability && root.NavCapability.status(o.adcode);
      if (st && !st.loaded) {
        capLoad(o.adcode).then(function () {
          decorate(list, o.adcode);
          if (root.NavModule && root.NavModule.refreshCaps) root.NavModule.refreshCaps();
        });
      }
      return list;
    });
  }

  /* ------------------------------------------------------------------
     交互式大地图：仅在配置了 jsKey + 且不是 file:// 时才加载
     file:// 下 JS API 的安全密钥校验不了域名，强行加载会白屏
     ------------------------------------------------------------------ */
  var jsLoading = null;
  function canInteractive() {
    return !!(jsKey() && jscode() && CFG.provider !== 'offline' &&
                root.location && root.location.protocol !== 'file:');
  }
  function loadJsApi() {
    if (jsLoading) return jsLoading;
    jsLoading = new Promise(function (resolve, reject) {
      if (!canInteractive()) { reject(new Error('未配置 JS API Key，或当前是 file:// 环境')); return; }
      root._AMapSecurityConfig = { securityJsCode: jscode() };
      var cb = '__navmap_ready_' + Date.now();
      root[cb] = function () {
        try { delete root[cb]; } catch (e) { root[cb] = undefined; }
        if (root.AMap) resolve(root.AMap); else reject(new Error('JS API 加载后未就绪'));
      };
      var s = document.createElement('script');
      s.src = 'https://webapi.amap.com/maps?v=2.0&key=' + encodeURIComponent(jsKey()) + '&callback=' + cb;
      s.onerror = function () { reject(new Error('JS API 网络不可达')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!root.AMap) reject(new Error('JS API 加载超时')); }, CFG.staticTimeout);
    });
    return jsLoading;
  }
  function initInteractive(container, o) {
    o = o || {};
    return loadJsApi().then(function (AMap) {
      var center = o.origin ? toGcj(o.origin.lat, o.origin.lng) : null;
      var map = new AMap.Map(container, {
        zoom: 14,
        center: center ? [center.lng, center.lat] : [120.155, 30.274],
        resizeEnable: true,
        viewMode: '2D'
      });
      if (o.origin) {
        new AMap.Marker({
          position: [toGcj(o.origin.lat, o.origin.lng).lng, toGcj(o.origin.lat, o.origin.lng).lat],
          label: { content: '你在这里', direction: 'top' },
          title: '当前位置'
        }).setMap(map);
      }
      (o.destinations || []).forEach(function (d, i) {
        var g = toGcj(d.lat, d.lng);
        new AMap.Marker({
          position: [g.lng, g.lat],
          label: { content: String.fromCharCode(65 + i) + ' ' + (d.name || ''), direction: 'top' },
          title: d.name || ''
        }).setMap(map);
      });
      if (o.path && o.path.length >= 2) {
        var line = o.path.map(function (p) {
          var g = toGcj(p.lat, p.lng); return [g.lng, g.lat];
        });
        new AMap.Polyline({ path: line, strokeColor: '#C47A48', strokeWeight: 6, strokeOpacity: .85 }).setMap(map);
      }
      if (root.AMap.plugin) {
        AMap.plugin(['AMap.ToolBar', 'AMap.Scale'], function () {
          try { map.addControl(new AMap.ToolBar()); map.addControl(new AMap.Scale()); } catch (e) {}
        });
      }
      map.setFitView(null, false, [40, 40, 40, 40]);
      return map;
    });
  }

  /* ------------------------------------------------------------------ */
  root.NavMap = {
    version: '1.0.0',
    configure: function (o) {
      o = o || {};
      Object.keys(o).forEach(function (k) { if (k in CFG) CFG[k] = o[k]; });
      return this.status();
    },
    status: function () {
      return {
        hasWebKey: !!webKey(),
        provider: CFG.provider,
        hasInteractive: canInteractive(),
        jsKeyConfigured: !!jsKey(),
        jscodeConfigured: !!jscode(),
        secureContext: !!root.isSecureContext,
        protocol: root.location ? root.location.protocol : 'unknown'
      };
    },
    webKey: webKey,
    toGcj: toGcj,
    pair: pair,
    staticUrl: staticUrl,
    autoZoom: autoZoom,
    route: route,
    nearby: nearby,
    hospitals: hospitals,
    districts: districts,
    placeText: placeText,
    photos: photos,
    initInteractive: initInteractive,
    config: CFG
  };
})(window);
