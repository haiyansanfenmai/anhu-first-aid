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

const ROOT = __dirname;
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

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  const rel = STATIC[pathname];
  if (!rel) return send(res, 404, JSON.stringify({ error: 'Not found' }));
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 500, JSON.stringify({ error: 'Read failed' }));
    send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream');
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
    let upstream;
    try { upstream = new URL(ENV.UPSTREAM_URL); }
    catch (e) { return send(res, 500, JSON.stringify({ error: 'Bad upstream config' })); }

    const r = https.request({
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname + upstream.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ENV.HUNYUAN_TOKEN,
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
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (pathname === '/api/health') {
    return send(res, 200, JSON.stringify({ ok: true, service: 'emergency-med-calc', model: ENV.MODEL }));
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
