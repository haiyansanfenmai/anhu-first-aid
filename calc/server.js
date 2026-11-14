/**
 * 单端口 HTTP 服务：托管前端页面 + 服务端安全转发混元视觉接口。
 * 密钥只存在于服务端，前端页面与 hunyuan.js 均不接触 Bearer Token。
 * 监听 process.env.PORT 并绑定 0.0.0.0，供云空间反向代理访问。
 */
'use strict';
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const ENV = require('./cloud-env.cjs');

/* ------------------------------------------------------------------
   模型供应方：默认沿用混元；设置 ZHIPU_API_KEY 即切到智谱（GLM-4V 系列）。
   切换只改环境变量，前端一行不用动 —— 模型名在这里统一改写。
   ------------------------------------------------------------------ */
const PROVIDER = String(
  process.env.AI_PROVIDER || (process.env.ZHIPU_API_KEY ? 'zhipu' : 'hunyuan')
).toLowerCase();
const IS_ZHIPU = PROVIDER === 'zhipu';
const UPSTREAM_URL = IS_ZHIPU
  ? (process.env.ZHIPU_BASE || 'https://open.bigmodel.cn/api/paas/v4/chat/completions')
  : ENV.UPSTREAM_URL;
const API_KEY = IS_ZHIPU ? (process.env.ZHIPU_API_KEY || '') : ENV.HUNYUAN_TOKEN;
const MODEL_OVERRIDE = IS_ZHIPU ? (process.env.ZHIPU_MODEL || 'glm-4v-flash') : null;
const PROVIDER_LABEL = IS_ZHIPU ? 'zhipu:' + MODEL_OVERRIDE : 'hunyuan:' + ENV.MODEL;

const ROOT = __dirname;
/* 部署到云托管时，把站点根目录指过来（默认仍是 calc 自己，本地行为不变） */
const STATIC_ROOT = process.env.STATIC_ROOT
  ? path.resolve(process.cwd(), process.env.STATIC_ROOT)   // 相对「启动目录」，部署时即仓库根
  : ROOT;
const DENY = /^(?:package\.json|package-lock\.json|server\.js|proxy\.js|render\.yaml|render\.yml|dockerfile|\.dockerignore)$|\.(?:cjs|env|md|log|pptx|zip)$/i;
const PORT = Number(process.env.PORT || 3000);

// 静态文件白名单：服务端配置、package.json、测试文件等一律不对外
const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/calc.html': 'calc.html',
  '/scan.html': 'scan.html',
  '/exam-scanner.html': 'exam-scanner.html',
  '/engine.js': 'engine.js',
  '/hunyuan.js': 'hunyuan.js',
  '/cloud.js': 'cloud.js',
  '/cloud-sdk.js': 'cloud-sdk.js'
};
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

/* 前端可能在别的域名（GitHub Pages / apps.workbuddy.host），必须给跨域头。
   本服务不使用 Cookie，故允许 *；如要收紧，把 ORIGIN 换成白名单判断。 */
const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function send(res, status, body, type) {
  res.writeHead(status, Object.assign({
    'Content-Type': type || 'application/json; charset=utf-8'
  }, CORS));
  res.end(body);
}

function serveStatic(req, res, pathname) {
  /* 部署模式（STATIC_ROOT 已配）：整站托管，按站点根目录取文件 */
  if (process.env.STATIC_ROOT) {
    const clean = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(STATIC_ROOT, clean);
    if (!file.startsWith(STATIC_ROOT) || DENY.test(path.basename(file))) {
      return send(res, 404, JSON.stringify({ error: 'Not found' }));
    }
    return fs.stat(file, (e, st) => {
      if (e || !st.isFile()) {
        /* 目录请求补 index.html；都没有就 404 */
        const idx = path.resolve(file, 'index.html');
        return fs.stat(idx, (e2, st2) => {
          if (e2 || !st2.isFile()) return send(res, 404, JSON.stringify({ error: 'Not found' }));
          fs.readFile(idx, (err, buf) => {
            if (err) return send(res, 500, JSON.stringify({ error: 'Read failed' }));
            send(res, 200, buf, 'text/html; charset=utf-8');
          });
        });
      }
      fs.readFile(file, (err2, buf) => {
        if (err2) return send(res, 500, JSON.stringify({ error: 'Read failed' }));
        const ext = path.extname(file).toLowerCase();
        const mime = MIME[ext] || (ext === '.mp4' ? 'video/mp4'
          : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml'
          : 'application/octet-stream');
        send(res, 200, buf, mime);
      });
    });
  }
  /* 本地模式：只放行白名单里的 calc 页面 */
  const rel = STATIC[pathname];
  if (!rel) return send(res, 404, JSON.stringify({ error: 'Not found' }));
  fs.readFile(path.join(ROOT, rel), (err, buf) => {
    if (err) return send(res, 500, JSON.stringify({ error: 'Read failed' }));
    send(res, 200, buf, MIME[path.extname(rel)] || 'application/octet-stream');
  });
}

/** 服务端转发：前端只发 model/messages，鉴权在这里注入 */
function proxyVision(req, res) {
  let body = '';
  req.on('data', c => {
    body += c;
    if (body.length > 20 * 1024 * 1024) req.destroy();
  });
  req.on('end', () => {
    if (!body) return send(res, 400, JSON.stringify({ error: 'Empty body' }));
    if (!API_KEY) {
      const hint = IS_ZHIPU ? '未配置 ZHIPU_API_KEY' : '未配置 HUNYUAN_TOKEN';
      return send(res, 500, JSON.stringify({ error: 'NO_KEY', message: hint }));
    }
    /* 换供应方时统一改写模型名，前端不用感知 */
    if (MODEL_OVERRIDE) {
      try { const o = JSON.parse(body); o.model = MODEL_OVERRIDE; body = JSON.stringify(o); }
      catch (e) { /* 非 JSON 就原样转发 */ }
    }
    let upstream;
    try { upstream = new URL(UPSTREAM_URL); }
    catch (e) { return send(res, 500, JSON.stringify({ error: 'Bad upstream config' })); }

    const r = https.request({
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname + upstream.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: ENV.TIMEOUT_MS
    }, up => {
      const chunks = [];
      up.on('data', c => chunks.push(c));
      up.on('end', () => {
        send(res, up.statusCode || 502, Buffer.concat(chunks),
          up.headers['content-type'] || 'application/json; charset=utf-8');
      });
    });
    r.on('timeout', () => {
      r.destroy();
      if (!res.headersSent) send(res, 504, JSON.stringify({ error: 'Upstream timeout' }));
    });
    r.on('error', err => {
      if (!res.headersSent) send(res, 502, JSON.stringify({ error: 'Upstream error', message: err.message }));
    });
    r.write(body);
    r.end();
  });
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (pathname === '/api/health') {
    return send(res, 200, JSON.stringify({
      ok: true, service: 'emergency-med-calc', provider: PROVIDER,
      model: MODEL_OVERRIDE || ENV.MODEL, hasKey: !!API_KEY
    }));
  }
  if (pathname === '/api/vision') {
    if (req.method !== 'POST') return send(res, 405, JSON.stringify({ error: 'POST only' }));
    return proxyVision(req, res);
  }
  return serveStatic(req, res, pathname);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('[server] listening on 0.0.0.0:' + PORT);
});
