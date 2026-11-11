/**
 * hunyuan.js —— 独立的混元大模型实现
 * ------------------------------------------------------------------
 * 本文件是项目中「唯一」的混元视觉模型对接层，业务页面只依赖这里导出的接口，
 * 不重复定义 API 地址、模型名、鉴权信息或提示词。
 *
 * 对接规范严格对齐指定的 wx.request 实现（callHunyuanAPI）：
 *   上游 URL      : https://tcamp.qq.com/openai/chat/completions
 *   Method        : POST
 *   Content-Type  : application/json
 *   Authorization : Bearer <token>（由服务端持有并注入）
 *   model         : hunyuan-vision
 *   messages      : [{ role:'user', content:[ {type:'text',...}, {type:'image_url',...} ] }]
 *   image_url.url : data:image/jpeg;base64,${base64Data}
 *   prompt        : 当前业务为「急救费用单据识别」（CONFIG.PROMPT）；
 *                   原试卷识别提示词逐字保留在 CONFIG.PAPER_PROMPT 中，便于回溯对接规范。
 *   取结果        : choices[0].message.content
 *   结果解析      : parseExpense() 解析费用明细 → 交给 engine.js 生成报销方案
 *
 * 线上链路：浏览器 → 同源 /api/vision → server.js（注入 Bearer Token）→ 上游混元接口。
 * 上游 URL 与 Token 的完整值保存在服务端 cloud-env.cjs（静态白名单不暴露），
 * 与指定 js 文件逐字一致；前端源码不再包含任何 Bearer Token，避免部署到公网后泄露。
 * 本地直接双击 HTML 打开时没有服务端，可勾选页面的「本地开发模式」改用 proxy.js。
 *
 * 用法（浏览器）：
 *   <script src="hunyuan.js"></script>
 *   const base64 = await Hunyuan.imageFileToBase64Jpeg(file);
 *   const text   = await Hunyuan.callHunyuanAPI(base64);
 *
 * 用法（Node 测试）：
 *   const H = require('./hunyuan.js');
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Hunyuan = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 原试卷识别提示词（保留兼容，便于回溯指定 js 文件的对接规范）
  var PAPER_PROMPT = '请识别这张图片中的试卷内容，告诉我是什么学科题目，以及根据试卷答题情况生成得分。请按以下格式回答：\n学科名称：\n得分：';
  // 当前业务：急救费用单据识别，输出可解析的结构化费用明细
  var EXPENSE_PROMPT = '请识别这张急救医疗费用单据（发票、费用清单、收据或结算单）中的费用信息，逐项列出费用项目名称与金额，并判断其医保目录归属。请严格按以下格式回答，不要输出其它内容：\n费用明细：\n项目名称|金额|甲\n项目名称|金额|乙\n项目名称|金额|丙\n合计金额：\n数字\n说明：\n一句话说明\n其中「甲」表示甲类全额计入报销基数，「乙」表示乙类需个人先自付一部分，「丙」表示丙类或目录外全自费；金额只写数字，不带元、逗号或单位；无法判断归属时填「乙」。';

  // ===== 前端配置：上游地址与鉴权已移到服务端 cloud-env.cjs =====
  var CONFIG = {
    API_URL: '/api/vision',                 // 同源代理；线上由 server.js 转发
    UPSTREAM_URL: 'https://tcamp.qq.com/openai/chat/completions', // 与指定 js 文件一致（仅展示）
    MODEL: 'hunyuan-vision',
    PROMPT: EXPENSE_PROMPT,
    PAPER_PROMPT: PAPER_PROMPT,
    TIMEOUT_MS: 60000
  };

  function HunyuanError(code, message, detail) {
    var e = new Error(message);
    e.name = 'HunyuanError';
    e.code = code;
    e.detail = detail;
    return e;
  }

  /** 构造与 wx.request data 完全一致的请求体 */
  function buildPayload(base64Data, prompt) {
    var clean = String(base64Data || '').replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    return {
      model: CONFIG.MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt || CONFIG.PROMPT },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + clean } }
        ]
      }]
    };
  }

  /** 请求头：线上由服务端注入 Authorization，前端不再持有 Token */
  function buildHeaders(token) {
    var h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  /** 从 choices[0].message.content 提取文本（兼容字符串与多模态数组两种返回） */
  function extractContent(data) {
    var c = data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content : null;
    if (typeof c === 'string') return c.trim();
    if (Array.isArray(c)) {
      return c.map(function (x) { return typeof x === 'string' ? x : (x && x.text) || ''; })
              .join('').trim();
    }
    return '';
  }

  /**
   * 调用混元视觉接口，返回识别文本（学科名称 / 得分）。
   * @param {string} base64Data 纯 base64（不含 data: 前缀）或完整 data URL
   * @param {object} [options] { apiUrl, token, prompt, timeoutMs, fetchImpl }
   * @returns {Promise<string>}
   */
  function callHunyuanAPI(base64Data, options) {
    var opt = options || {};
    var url = opt.apiUrl || CONFIG.API_URL;
    var fetchFn = opt.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) return Promise.reject(HunyuanError('NO_FETCH', '当前环境不支持 fetch'));
    if (!base64Data) return Promise.reject(HunyuanError('EMPTY_IMAGE', '图片数据为空'));

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, opt.timeoutMs || CONFIG.TIMEOUT_MS);
    }

    var init = {
      method: 'POST',
      headers: buildHeaders(opt.token),
      body: JSON.stringify(buildPayload(base64Data, opt.prompt))
    };
    if (controller) init.signal = controller.signal;

    return fetchFn(url, init).then(function (res) {
      if (res.ok === false) {
        return (res.text ? res.text() : Promise.resolve('')).then(function (body) {
          var code = res.status === 401 || res.status === 403 ? 'AUTH_FAILED' : 'HTTP_' + res.status;
          throw HunyuanError(code, '接口返回 HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''), body.slice(0, 500));
        });
      }
      return res.json();
    }).then(function (data) {
      var text = extractContent(data);
      if (!text) throw HunyuanError('EMPTY_RESULT', '接口未返回识别内容', data);
      return text;
    }).catch(function (err) {
      if (err && err.name === 'HunyuanError') throw err;
      if (err && err.name === 'AbortError') throw HunyuanError('TIMEOUT', '请求超时，请检查网络或稍后重试');
      // 浏览器跨域被拦截时 TypeError: Failed to fetch，无法读取状态码
      throw HunyuanError('NETWORK_OR_CORS',
        '无法连接接口：可能是浏览器跨域(CORS)限制、网络不可达或地址错误。可改用本地代理后重试。',
        String(err && err.message || err));
    }).then(function (v) { if (timer) clearTimeout(timer); return v; },
            function (e) { if (timer) clearTimeout(timer); throw e; });
  }

  /** 解析模型返回的「学科名称：」「得分：」文本，兼容全角/半角冒号与多余空白 */
  function parseResult(text) {
    var src = String(text || '');
    var out = { subject: '', scoreText: '', score: null, scoreMax: null, raw: src };
    var sm = src.match(/学科名称\s*[:：]\s*([^\r\n]*)/);
    if (sm) out.subject = sm[1].trim().replace(/[。；;，,]$/, '');
    var gm = src.match(/得分\s*[:：]\s*([^\r\n]*)/);
    if (gm) {
      out.scoreText = gm[1].trim();
      var pair = out.scoreText.match(/(-?\d+(?:\.\d+)?)\s*[\/／]\s*(\d+(?:\.\d+)?)/);
      if (pair) { out.score = Number(pair[1]); out.scoreMax = Number(pair[2]); }
      else {
        var one = out.scoreText.match(/-?\d+(?:\.\d+)?/);
        if (one) out.score = Number(one[0]);
      }
    }
    if (!out.subject) {
      var alt = src.match(/(数学|语文|英语|物理|化学|生物|政治|历史|地理|科学|计算机|信息技术)/);
      if (alt) out.subject = alt[1];
    }
    return out;
  }

  /** 解析混元返回的急救费用明细（名称|金额|甲乙丙），供报销方案计算使用 */
  function parseExpense(text){
    var src = String(text || '');
    var out = { items: [], total: 0, note: '', raw: src };
    var expectNote = false, expectTotal = false;
    var lines = src.split(/\r?\n/);
    for (var i=0;i<lines.length;i++){
      var line = lines[i].trim().replace(/^`+|`+$/g,'').trim();
      if (!line) continue;
      if (/^合计金额\s*[:：]/.test(line)){
        var n = line.match(/-?\d+(?:\.\d+)?/);
        if (n) { out.total = Number(n[0]); expectTotal = false; }
        else expectTotal = true;
        continue;
      }
      if (/^说明\s*[:：]/.test(line)){
        var noteVal = line.replace(/^说明\s*[:：]\s*/,'').trim();
        if (noteVal) { out.note = noteVal; expectNote = false; }
        else expectNote = true;
        continue;
      }
      if (expectTotal && /^\d+(?:\.\d+)?$/.test(line)){
        out.total = Number(line); expectTotal = false; expectNote = false; continue;
      }
      if (expectNote && line.indexOf('|') < 0 && line.indexOf('｜') < 0){
        out.note = line; expectNote = false; continue;
      }
      if (/^费用明细\s*[:：]/.test(line)){ expectTotal = false; expectNote = false; continue; }
      if (/^[-=|:：\s]+$/.test(line)) continue;             // Markdown 分隔行
      if (line.indexOf('|') < 0 && line.indexOf('｜') < 0 && line.indexOf('\t') < 0){
        if (/^\d+(?:\.\d+)?$/.test(line) && !out.total) out.total = Number(line);
        continue;
      }
      var parts = line.split(/\s*[|｜\t]\s*/).filter(function(x){ return x && x.trim(); });
      if (parts.length < 2) continue;
      var name = parts[0].replace(/^(?:[-•*]\s*|\d+[.、)]\s*)/,'').trim();
      var amt = (parts[1] || '').replace(/[,，]/g,'').match(/-?\d+(?:\.\d+)?/);
      if (!name || !amt) continue;                            // 跳过表头等无金额行
      var cls = String(parts[2] || '乙').trim();
      var type = /丙|C/.test(cls) ? 'C' : (/甲|A/.test(cls) ? 'A' : 'B');
      out.items.push({ name: name, amount: Math.max(0, Number(amt[0])), type: type, prepay: '' });
    }
    if (!out.total && out.items.length){
      out.total = out.items.reduce(function(s,x){ return s + x.amount; }, 0);
    }
    return out;
  }

  /**
   * 图片文件 → 压缩后的 JPEG base64（不含 data: 前缀）。
   * 限制最长边，避免视觉接口因请求体过大而拒绝。
   */
  function imageFileToBase64Jpeg(file, options) {
    var opt = options || {};
    var maxSide = opt.maxSide || 1600;
    var quality = opt.quality || 0.86;
    return new Promise(function (resolve, reject) {
      if (!file) return reject(HunyuanError('NO_FILE', '未选择图片'));
      if (!/^image\//.test(file.type || '')) return reject(HunyuanError('BAD_TYPE', '请选择图片文件'));
      var objectUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
        ? URL.createObjectURL(file) : null;
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl.split(',')[1]);
        } catch (e) {
          reject(HunyuanError('IMAGE_ENCODE', '图片处理失败', String(e && e.message || e)));
        } finally {
          if (objectUrl && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
        }
      };
      img.onerror = function () {
        if (objectUrl && URL.revokeObjectURL) URL.revokeObjectURL(objectUrl);
        reject(HunyuanError('IMAGE_LOAD', '图片读取失败，请换一张图片'));
      };
      img.src = objectUrl || (file.dataUrl || '');
    });
  }

  return {
    CONFIG: CONFIG,
    HunyuanError: HunyuanError,
    buildPayload: buildPayload,
    buildHeaders: buildHeaders,
    extractContent: extractContent,
    callHunyuanAPI: callHunyuanAPI,
    parseResult: parseResult,
    parseExpense: parseExpense,
    imageFileToBase64Jpeg: imageFileToBase64Jpeg
  };
});
