/*!
 * hunyuan.js —— 腾讯混元视觉大模型 · 独立实现模块
 * ===============================================================
 * 与课程指定的 js 文件保持完全一致：
 *   endpoint : https://tcamp.qq.com/openai/chat/completions
 *   model    : hunyuan-vision
 *   body     : messages[0].content = [ {type:'text'}, {type:'image_url'} ]
 *
 * 浏览器端用 fetch，小程序端用 wx.request，两者 header / body
 * 结构一一对应，命名也保持一致（callHunyuanAPI）。
 *
 * 用法：
 *   const res = await HunyuanVision.recognizeFile(file);
 *   // res -> { ok, text, score, elapsed, raw }
 *
 *   // 或完全对齐指定写法：
 *   const text = await HunyuanVision.callHunyuanAPI(base64Data);
 * ===============================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HunyuanVision = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------
   * 01 / 配置（与指定 js 文件同源，改这里即可）
   * ------------------------------------------------------------- */
  var CONFIG = {
    endpoint: 'https://tcamp.qq.com/openai/chat/completions',
    /* Token 已移到服务端（server.mjs 的 HUNYUAN_TOKEN）。
       前端不再持有密钥，避免随页面文件外泄。 */
    token: '',
    model: 'hunyuan-vision',
    timeout: 45000,          // 毫秒
    maxSize: 1280,           // 上传前最长边压缩到 1280px
    quality: 0.85,           // JPEG 质量
    /* 浏览器直连若被 CORS 拦截，把本地代理地址填到这里，例如：
     * proxy: 'http://127.0.0.1:8787/chat/completions' */
    proxy: ''
  };

  /* ---------------------------------------------------------------
   * 02 / 提示词
   *   exam  —— 原样保留指定文件中的提示词（试卷 / 学科 / 得分）
   *   generic —— 通用版：试卷与伤害现场都能给出「打分」
   * ------------------------------------------------------------- */
  var PROMPTS = {
    exam: '请识别这张图片中的试卷内容，告诉我是什么学科题目，以及根据试卷答题情况生成得分。请按以下格式回答：\n学科名称：\n得分：',

    generic: [
      '请识别这张图片中的内容，并给出评估结果。要求：',
      '1. 判断图片内容属于哪一类（试卷/作业、意外伤害现场、其他）；',
      '2. 若为试卷或作业，指出学科名称，并根据答题情况给出 0-100 的得分；',
      '3. 若为意外伤害现场，指出疑似伤情，并给出 0-100 的风险得分；',
      '4. 用不超过 3 行说明理由。',
      '请严格按以下格式回答：',
      '内容类型：',
      '名称：',
      '得分：',
      '说明：'
    ].join('\n')
  };

  /* ---------------------------------------------------------------
   * 03 / 工具：图片压缩 + 转 base64
   * ------------------------------------------------------------- */
  function fileToBase64(file, opts) {
    opts = opts || {};
    var max = opts.maxSize || CONFIG.maxSize;
    var quality = opts.quality || CONFIG.quality;

    return new Promise(function (resolve, reject) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        reject(new Error('请选择图片文件（JPG / PNG）'));
        return;
      }
      var url = URL.createObjectURL(file);
      var img = new Image();

      img.onload = function () {
        try {
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          var scale = Math.min(1, max / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));

          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);

          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);
          resolve(dataUrl.split(',')[1]);
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(new Error('图片处理失败：' + e.message));
        }
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片解析失败，请换一张试试'));
      };

      img.src = url;
    });
  }

  /* ---------------------------------------------------------------
   * 04 / 核心请求（与指定 js 的 data 结构逐字段一致）
   * ------------------------------------------------------------- */
  function buildBody(base64Data, prompt) {
    return {
      model: CONFIG.model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt || PROMPTS.generic
            },
            {
              type: 'image_url',
              image_url: {
                url: 'data:image/jpeg;base64,' + base64Data
              }
            }
          ]
        }
      ]
    };
  }

  function request(base64Data, prompt) {
    var url = CONFIG.proxy || CONFIG.endpoint;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;

    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, CONFIG.timeout);
    }

    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.token
      },
      body: JSON.stringify(buildBody(base64Data, prompt)),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        return res.text().then(function (raw) {
          if (!res.ok) {
            throw new Error('接口返回 HTTP ' + res.status + '：' + String(raw).slice(0, 140));
          }
          var data;
          try {
            data = JSON.parse(raw);
          } catch (e) {
            throw new Error('接口返回非 JSON：' + String(raw).slice(0, 140));
          }
          var content =
            data &&
            data.choices &&
            data.choices[0] &&
            data.choices[0].message &&
            data.choices[0].message.content;

          if (!content) throw new Error('接口返回结构异常（缺少 choices[0].message.content）');
          return { text: String(content).trim(), usage: data.usage || null, raw: data };
        });
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error('请求超时（' + Math.round(CONFIG.timeout / 1000) + ' 秒），请检查网络');
        }
        if (err instanceof TypeError) {
          throw new Error(
            '无法直连接口：可能是浏览器 CORS 策略拦截，或本地网络不可用。' +
            '请确认后端 server.mjs 已启动'
          );
        }
        throw err;
      });
  }

  /* ---------------------------------------------------------------
   * 05 / 结果解析
   * ------------------------------------------------------------- */
  function extractScore(text) {
    if (!text) return null;
    var m = text.match(/(?:得分|分数|分值|评分|score)\s*[：:＝=\s]*\s*(\d{1,3})/i);
    if (m) return Math.min(100, parseInt(m[1], 10));
    m = text.match(/(\d{1,3})\s*(?:分|\/\s*100)/);
    return m ? Math.min(100, parseInt(m[1], 10)) : null;
  }

  function extractField(text, names) {
    if (!text) return null;
    for (var i = 0; i < names.length; i++) {
      var re = new RegExp(names[i] + '\\s*[：:]\\s*([^\\n]+)');
      var m = text.match(re);
      if (m && m[1].trim()) return m[1].trim();
    }
    return null;
  }

  /* ---------------------------------------------------------------
   * 06 / 对外 API
   * ------------------------------------------------------------- */
  return {
    CONFIG: CONFIG,
    PROMPTS: PROMPTS,

    setProxy: function (url) { CONFIG.proxy = url || ''; return CONFIG.proxy; },
    setToken: function (t) { CONFIG.token = t; return CONFIG.token; },
    setPromptPreset: function (key) { return PROMPTS[key] || PROMPTS.generic; },

    fileToBase64: fileToBase64,
    buildBody: buildBody,
    extractScore: extractScore,
    extractField: extractField,

    /* 与指定 js 文件同名同签名：传入 base64，返回文字结果 */
    callHunyuanAPI: function (base64Data, prompt) {
      return request(base64Data, prompt).then(function (r) { return r.text; });
    },

    /* 直接传 base64，返回完整结果对象 */
    recognize: function (base64Data, opts) {
      opts = opts || {};
      var started = Date.now();
      return request(base64Data, opts.prompt).then(function (r) {
        return {
          ok: true,
          text: r.text,
          score: extractScore(r.text),
          usage: r.usage,
          raw: r.raw,
          elapsed: Date.now() - started
        };
      });
    },

    /* 主接口：只把图片发给自己的后端，由服务端组装请求、选模型、解析结构化结果
       返回 { ok, structured, isWound, type, level, levelText, score, advice[], call120, note, elapsed } */
    analyzeFile: function (file, opts) {
      opts = opts || {};
      var started = Date.now();

      return fileToBase64(file, opts).then(function (b64) {
        var url = CONFIG.proxy || '/api/analyze';
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, CONFIG.timeout) : null;

        return fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: b64, scene: opts.scene || '' }),
          signal: controller ? controller.signal : undefined
        }).then(function (res) {
          if (timer) clearTimeout(timer);

          /* 先取文本，避免空响应体导致 res.json() 抛 Unexpected end of JSON input */
          return res.text().then(function (raw) {
            var data = null;
            if (raw && raw.trim()) {
              try { data = JSON.parse(raw); } catch (e) { data = null; }
            }

            if (!res.ok) {
              var msg = (data && data.error && data.error.message) || ('接口返回 HTTP ' + res.status);
              var err = new Error(msg);
              err.hint = data && data.error && data.error.hint;
              if (!data) err.hint = '服务器返回的不是 JSON（前 120 字）：' + String(raw || '（空）').slice(0, 120);
              throw err;
            }

            if (!data) {
              var e2 = new Error('服务器没有返回有效数据');
              e2.hint = raw
                ? '返回内容不是 JSON：' + String(raw).slice(0, 120)
                : '响应体为空，通常是后端没有启动，或请求被反向代理拦截。';
              throw e2;
            }

            data.base64 = b64;
            if (!data.elapsed) data.elapsed = Date.now() - started;
            return data;
          });
        }).catch(function (err) {
          if (timer) clearTimeout(timer);
          if (err && err.name === 'AbortError') throw new Error('识别超时，请重试');
          if (err instanceof TypeError) throw new Error('无法连接识别服务，请确认后端已启动');
          throw err;
        });
      });
    },

    /* 最省事：传 File，内部完成压缩 + base64 + 调用 */
    recognizeFile: function (file, opts) {
      opts = opts || {};
      var started = Date.now();
      return fileToBase64(file, opts).then(function (b64) {
        return request(b64, opts.prompt).then(function (r) {
          return {
            ok: true,
            text: r.text,
            score: extractScore(r.text),
            subject: extractField(r.text, ['学科名称', '学科', '名称', '内容类型']),
            usage: r.usage,
            raw: r.raw,
            base64: b64,
            elapsed: Date.now() - started
          };
        });
      });
    }
  };
});
