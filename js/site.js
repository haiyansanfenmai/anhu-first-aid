/* ============================================================
   site.js — 全站共享外壳（顶栏 + 页脚）
   作用：各页面只写 <div id="site-topbar"></div> 和
        <div id="site-footer"></div>，顶栏与页脚由此统一注入。
   好处：导航只有一份来源，改这里五页同时生效，不会各写各的。

   想改导航：只改下面 NAV 数组。
   页面若要放置搜索框：把节点追加进 #site-search-slot 即可。
   ============================================================ */
(function () {
  'use strict';

  var NAV = [
    { href: 'index.html',       label: '首页' },
    { href: 'navigation.html',  label: '就医导航' },
    { href: 'scenarios.html',   label: '场景科普' },
    { href: 'https://emergency-med-calc.app.workbuddy.host/?sharecode=OXMKYNFLIT&shareId=0441919a1cc94482b4a4f58395ef1926', label: '费用测算' },
    { href: 'media/index.html', label: '视频科普' }
  ];

  /* 页面所在层级：默认根目录；子目录页面在 <html data-site-root="../"> 声明 */
  var ROOT = document.documentElement.getAttribute('data-site-root') || '';

  /* 子页面归属：让 detail.html 也高亮「场景科普」，测算子页高亮「费用测算」 */
  var ALIAS = {
    'detail.html': 'scenarios.html',
    'calc/index.html': 'calc/index.html',
    'calc/calc.html': 'calc/index.html',
    'calc/scan.html': 'calc/index.html',
    'calc/exam-scanner.html': 'calc/index.html',
    'media/index.html': 'media/index.html'
  };

  /* 品牌标：心形 + 医疗十字，避免被误读成「新增」按钮 */
  var MARK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 21s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.4-7 10-7 10z"/>' +
    '<path d="M12 8v6M9 11h6"/>' +
    '</svg>';

  function currentFile() {
    var parts = (location.pathname || '').split('/').filter(Boolean);
    var base = parts.pop() || 'index.html';
    var dir = parts.pop();
    /* 子目录页面按「目录/文件」比对，避免与根目录同名文件混淆 */
    if (ROOT && dir) {
      var key = dir + '/' + base;
      return ALIAS[key] || key;
    }
    return ALIAS[base] || base;
  }

  function buildTopbar() {
    var mount = document.getElementById('site-topbar');
    if (!mount) return;

    var cur = currentFile();
    /* 托管平台每条请求都校验 sharecode；链接带上它，换设备/换浏览器也能直达 */
    var sc = '';
    try { sc = new URLSearchParams(location.search).get('sharecode') || ''; } catch (e) {}
    var QS = sc ? '?sharecode=' + encodeURIComponent(sc) : '';
    var links = NAV.map(function (item) {
      /* 外链（如独立部署的费用测算模块）原样输出：不加 ROOT，也不追加 sharecode，
         否则会拼成 ...&shareId=xxx?sharecode=... 这种坏地址 */
      var abs = /^https?:/i.test(item.href);
      var href = abs ? item.href : (ROOT + item.href + QS);
      var active = (!abs && item.href === cur) ? ' class="is-active" aria-current="page"' : '';
      return '<a href="' + href + '"' + (abs ? ' target="_blank" rel="noopener"' : '') + active + '>' + item.label + '</a>';
    }).join('');

    mount.outerHTML =
      '<header class="topbar">' +
        '<div class="container topbar-inner">' +
          '<a class="brand" href="' + ROOT + 'index.html' + QS + '">' +
            '<span class="brand-mark" aria-hidden="true">' + MARK_SVG + '</span>' +
            '安护 · 急救通' +
          '</a>' +
          '<nav class="nav" aria-label="主导航">' + links + '</nav>' +
          '<div class="topbar-search" id="site-search-slot"></div>' +
        '</div>' +
      '</header>';
  }

  /* 顶栏高度会随断点与搜索框变化，写入 CSS 变量供吸顶元素对齐 */
  function syncHeaderHeight() {
    var header = document.querySelector('.topbar');
    if (!header) return;
    document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  }

  function buildFooter() {
    var mount = document.getElementById('site-footer');
    if (!mount) return;

    mount.outerHTML =
      '<footer class="footer">' +
        '<div class="container footer-inner">' +
          '<div>' +
            '<strong>安护 · 急救通</strong>　公益急救科普项目' +
            '<div class="footer-note mt-2">内容参考红十字会救护教材与 AHA 指南，仅用于科普，<strong>不替代专业培训与急救呼叫</strong>。</div>' +
          '</div>' +
          '<div class="footer-note">© <span id="site-year"></span>　小组设计作品</div>' +
        '</div>' +
      '</footer>';

    var year = document.getElementById('site-year');
    if (year) year.textContent = new Date().getFullYear();
  }

  function init() {
    buildTopbar();
    buildFooter();
    syncHeaderHeight();

    var header = document.querySelector('.topbar');
    if (header && 'ResizeObserver' in window) {
      new ResizeObserver(syncHeaderHeight).observe(header);
    }
    window.addEventListener('resize', syncHeaderHeight);

    window.SITE = { syncHeaderHeight: syncHeaderHeight };
  }

  /* 挂载点已在 DOM 中时立即构建，保证后续脚本能立刻拿到 #site-search-slot */
  if (document.getElementById('site-topbar') || document.getElementById('site-footer')) {
    init();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
