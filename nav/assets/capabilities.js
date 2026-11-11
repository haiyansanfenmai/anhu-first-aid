/* ==========================================================================
   assets/capabilities.js · 医院能力核对模块  window.NavCapability
   --------------------------------------------------------------------------
   解决「能力为推断，未核实」：不再靠名称猜，改用两类真实数据
     ① 高德 place/text 关键词检索出的认证中心 POI（名称里直接写「胸痛中心」等）
     ② 公开公布的国家级认证名单（带来源链接与核对日期）
   医院等级 / 类型标签则直接取自高德 POI 的 type 字段（客观字段，非推断）。

   零第三方依赖、JSONP 可跨域、file:// 可用；全组统一 Nav* 前缀。
   ========================================================================== */
(function (root) {
  'use strict';

  var CACHE = {};                 // 城市 adcode -> { at, entries, status }
  var TTL = 30 * 60 * 1000;      // 30 分钟内不重复请求

  /* 区级 adcode（440305 南山区）统一归一到城市级（440300 深圳市），
     否则选完区之后官方名单与缓存都会对不上。 */
  function cityCode(adcode) {
    var v = String(adcode || '');
    return /^\d{6}$/.test(v) ? v.slice(0, 4) + '00' : v;
  }

  /* ---------------------- 公开公布的国家级认证名单 ----------------------
     只录入能被公开来源直接支撑的条目；每条都带 source，页面可展示来源。
     核对日期：2026-11-08。其余城市可持续往这个表里补，或完全依赖动态 POI。 */
  var OFFICIAL = [
    {
      adcode: '440300',
      keys: ['南山区人民医院', '深圳市第六人民医院'],
      label: '国家胸痛中心（标准版）',
      source: '中国胸痛中心总部 chinacpc.org；医院公开信息（2017 通过、2022 再认证）',
      url: 'http://www.chinacpc.org/'
    },
    {
      adcode: '440300',
      keys: ['南山区人民医院', '深圳市第六人民医院'],
      label: '国家高级卒中中心',
      source: '人民日报客户端《广东省卒中急救地图发布》',
      url: 'https://www.peopleapp.com/rmharticle/30035116650'
    },
    {
      adcode: '440300',
      keys: ['深圳市第三人民医院'],
      label: '国家胸痛中心（标准版）',
      source: '南方+《国家胸痛中心、国家高级卒中中心，深圳这家医院获得认证》2023-12',
      url: 'https://static.nfapp.southcn.com/content/202312/04/c8365028.html'
    },
    {
      adcode: '440300',
      keys: ['深圳市第三人民医院'],
      label: '国家高级卒中中心',
      source: '南方+ 同上（深圳市第七家高级卒中中心）',
      url: 'https://static.nfapp.southcn.com/content/202312/04/c8365028.html'
    },
    {
      adcode: '440300',
      keys: ['北京大学深圳医院', '深圳市人民医院', '南方医科大学深圳医院'],
      label: '国家高级卒中中心',
      source: '人民日报客户端《广东省卒中急救地图发布》',
      url: 'https://www.peopleapp.com/rmharticle/30035116650'
    },
    {
      adcode: '440300',
      keys: ['深圳市龙华区中心医院'],
      label: '国家卒中防治中心',
      source: '人民日报客户端《广东省卒中急救地图发布》',
      url: 'https://www.peopleapp.com/rmharticle/30035116650'
    }
  ];

  /* 检索词：只取「名称里明确写了中心」的 POI 作为已核对依据；
     其余命中记为「高德检索收录」，明确标注来源类型，不冒充认证。 */
  var QUERIES = [
    { kw: '胸痛中心', label: '胸痛中心', strong: /胸痛中心/ },
    { kw: '卒中中心', label: '卒中急救地图收录', strong: /卒中中心/ },
    { kw: '急救中心', label: '急救中心', strong: /急救中心/ },
    { kw: '创伤救治中心', label: '创伤中心', strong: /创伤(救治)?中心/ }
  ];

  var CENTER_RE = /(?:国家|标准版|基层版)?(?:胸痛|卒中|创伤(?:救治)?|急救)中心.*$/;

  /* 「深圳市第三人民医院胸痛中心」→「深圳市第三人民医院」 */
  function baseName(name) {
    return String(name || '')
      .replace(CENTER_RE, '')
      .replace(/[-－]\s*[东南西北]座.*$/, '')
      .replace(/[（(].*?[)）]/g, '')
      .replace(/\s+/g, '')
      .trim();
  }
  function isHospitalType(type) {
    return /医院|医疗保健|卫生院|急救/.test(String(type || ''));
  }
  function related(a, b) {
    if (!a || !b) return false;
    a = a.replace(/\s+/g, ''); b = b.replace(/\s+/g, '');
    if (a.length < 4 || b.length < 4) return false;
    return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  /* ---------------------- 客观类型标签（取自高德 type 字段） ---------------------- */
  function typeCaps(type) {
    var t = String(type || ''), out = [];
    if (/三级甲等|三甲/.test(t)) out.push('三级甲等');
    if (/三级乙等|三乙/.test(t)) out.push('三级乙等');
    if (/二级甲等|二级/.test(t)) out.push('二级医院');
    if (/儿童医院|妇幼保健|妇幼|妇产/.test(t)) out.push('儿科 / 妇幼');
    if (/肿瘤医院/.test(t)) out.push('肿瘤专科');
    if (/眼科医院/.test(t)) out.push('眼科专科');
    if (/口腔医院/.test(t)) out.push('口腔专科');
    if (/中医医院/.test(t)) out.push('中医');
    if (/专科医院/.test(t) && !out.some(function (x) { return /专科/.test(x); })) out.push('专科医院');
    if (/综合医院/.test(t)) out.push('综合医院');
    if (/社区卫生|卫生服务站|卫生院|诊所/.test(t) && !/医院/.test(t)) out.push('基层医疗机构');
    if (!out.length) out.push('医疗机构');
    return out;
  }

  /* ---------------------- 拉取并构建索引 ---------------------- */
  function load(adcode) {
    adcode = cityCode(adcode);
    var now = Date.now();
    if (CACHE[adcode] && now - CACHE[adcode].at < TTL && CACHE[adcode].done) {
      return Promise.resolve(CACHE[adcode]);
    }
    if (CACHE[adcode] && CACHE[adcode].pending) return CACHE[adcode].pending;

    var box = CACHE[adcode] = CACHE[adcode] || { at: now, entries: [], done: false, error: '' };
    box.at = now;
    if (!root.NavMap || !root.NavMap.placeText || !root.NavMap.webKey()) {
      box.done = true; box.error = 'offline';
      return Promise.resolve(box);
    }

    var tasks = QUERIES.map(function (q) {
      return root.NavMap.placeText(q.kw, adcode, 25).then(function (pois) {
        var strong = [], listed = [];
        pois.forEach(function (p) {
          if (!p.name) return;
          var base = baseName(p.name);
          if (q.strong.test(p.name) && base.length >= 4) {
            strong.push({
              base: base, label: q.label, poi: p.name,
              source: '高德地图认证中心 POI 收录', level: 'verified'
            });
          } else if (isHospitalType(p.type) && base.length >= 4 &&
                     !/创新中心|文化中心|科技中心|服务中心|会展|写字楼/.test(p.name)) {
            listed.push({
              base: base, label: q.label, poi: p.name,
              source: '高德地图「' + q.kw + '」检索结果', level: 'listed'
            });
          }
        });
        return { strong: strong, listed: listed };
      }).catch(function () { return { strong: [], listed: [] }; });
    });

    box.pending = Promise.all(tasks).then(function (groups) {
      var entries = [];
      groups.forEach(function (g) {
        g.strong.concat(g.listed).forEach(function (e) { entries.push(e); });
      });
      // 官方名单（带来源）放在最前，优先级更高
      OFFICIAL.filter(function (o) { return o.adcode === adcode; }).forEach(function (o) {
        o.keys.forEach(function (k) {
          entries.unshift({
            base: k, label: o.label, poi: k,
            source: o.source, url: o.url, level: 'official'
          });
        });
      });
      box.entries = entries;
      box.done = true; box.error = ''; box.pending = null;
      return box;
    });
    return box.pending;
  }

  /* ---------------------- 匹配单家医院 ---------------------- */
  function match(name, type, adcode) {
    var box = CACHE[cityCode(adcode)] || { entries: [] };
    var certs = [], listed = [], seen = {};
    box.entries.forEach(function (e) {
      if (!related(name, e.base)) return;
      var k = e.label + '|' + e.level;
      if (seen[k]) return;
      seen[k] = true;
      var item = { label: e.label, source: e.source, url: e.url || '', level: e.level };
      if (e.level === 'listed') listed.push(item);
      else certs.push(item);
    });
    return { caps: typeCaps(type), certs: certs, listed: listed };
  }

  function status(adcode) {
    var b = CACHE[cityCode(adcode)];
    return {
      loaded: !!(b && b.done),
      entries: b ? b.entries.length : 0,
      official: OFFICIAL.filter(function (o) { return !adcode || o.adcode === cityCode(adcode); }).length,
      error: b ? b.error : ''
    };
  }

  root.NavCapability = {
    version: '1.0.0',
    load: load,
    match: match,
    typeCaps: typeCaps,
    cityCode: cityCode,
    status: status,
    official: OFFICIAL,
    queries: QUERIES,
    sources: function (adcode) {
      var out = OFFICIAL.filter(function (o) { return !adcode || o.adcode === cityCode(adcode); })
        .map(function (o) { return { label: o.label, source: o.source, url: o.url }; });
      out.push({ label: '认证中心 POI', source: '高德地图 place/text 关键词检索', url: 'https://lbs.amap.com/api/webservice/guide/api/search/text' });
      return out;
    }
  };
})(window);
