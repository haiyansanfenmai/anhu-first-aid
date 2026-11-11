/**
 * proxy.js —— 可选的本地转发代理（零依赖）
 * ------------------------------------------------------------------
 * 解决浏览器直连 tcamp.qq.com 时可能遇到的 CORS 限制。
 * 仅监听 127.0.0.1，供本机开发 / 演示使用；生产环境请使用正式服务端转发。
 *
 * 启动：node proxy.js
 * 然后在网页「接口配置」中勾选「改用本地代理」。
 *
 * 上游地址与 Token 读取服务端 cloud-env.cjs，不在本文件重复定义。
 * 注意：线上版本由 server.js 提供同源 /api/vision，无需启动本代理。
 */
'use strict';
const http = require('http');
const https = require('https');
const ENV = require('./cloud-env.cjs');

const PORT = Number(process.env.PORT || 8787);
const HOST = '127.0.0.1';
const UPSTREAM = new URL(ENV.UPSTREAM_URL);
const TIMEOUT_MS = ENV.TIMEOUT_MS || 60000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.url !== '/vision' || req.method !== 'POST') {
    res.writeHead(404, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
    return res.end(JSON.stringify({ error: 'Not found', usage: 'POST /vision' }));
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk;
    // 简单体量保护，避免异常请求占满内存
    if (body.length > 20 * 1024 * 1024) {
      req.destroy();
    }
  });
  req.on('end', () => {
    const upstream = https.request({
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port || 443,
      path: UPSTREAM.pathname + UPSTREAM.search,
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Authorization': req.headers['authorization'] || ('Bearer ' + ENV.HUNYUAN_TOKEN),
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: TIMEOUT_MS
    }, up => {
      const chunks = [];
      up.on('data', c => chunks.push(c));
      up.on('end', () => {
        const buf = Buffer.concat(chunks);
        const headers = Object.assign({}, CORS, {
          'Content-Type': up.headers['content-type'] || 'application/json; charset=utf-8'
        });
        res.writeHead(up.statusCode || 502, headers);
        res.end(buf);
        console.log('[proxy] 上游返回', up.statusCode, '响应', buf.length, '字节');
      });
    });
    upstream.on('timeout', () => {
      upstream.destroy();
      if (!res.headersSent) {
        res.writeHead(504, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
        res.end(JSON.stringify({ error: 'upstream timeout' }));
      }
    });
    upstream.on('error', err => {
      console.error('[proxy] 上游请求失败:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS));
        res.end(JSON.stringify({ error: 'upstream error', message: err.message }));
      }
    });
    upstream.write(body);
    upstream.end();
    console.log('[proxy] 转发 POST', ENV.UPSTREAM_URL, '请求体', body.length, '字节');
  });
});

server.listen(PORT, HOST, () => {
  console.log('混元视觉接口本地代理已启动');
  console.log('  监听地址 : http://' + HOST + ':' + PORT + '/vision');
  console.log('  上游地址 : ' + ENV.UPSTREAM_URL + '（读取自 cloud-env.cjs）');
  console.log('  模型     : ' + ENV.MODEL);
  console.log('按 Ctrl+C 停止。');
});
