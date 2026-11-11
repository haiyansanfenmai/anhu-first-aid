/**
 * 仅服务端使用的配置（.cjs 后缀，静态服务白名单不暴露此文件）
 * 混元接口的 URL 与 Bearer Token 与用户指定的 wx.request 版 callHunyuanAPI 完全一致。
 * 生产环境建议改用环境变量 HUNYUAN_TOKEN 注入，避免把凭据写进源码。
 */
'use strict';
module.exports = {
  UPSTREAM_URL: 'https://tcamp.qq.com/openai/chat/completions',
  HUNYUAN_TOKEN: process.env.HUNYUAN_TOKEN || '',
  MODEL: 'hunyuan-vision',
  TIMEOUT_MS: 60000
};
