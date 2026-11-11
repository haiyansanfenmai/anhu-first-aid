/* ============================================================
   theme.js — 视觉风格切换（warm / clarity / rescue）
   必须在 <head> 中同步加载：先定风格，再渲染页面，避免闪烁。
   选择保存在本机，六个页面共用；切换入口只出现在首页。
   正式展示若不想露出这个控件，访问时加 ?clean 即可隐藏。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'anjia-theme';
  var DEFAULT = 'warm';

  var THEMES = [
    { id: 'warm',    name: '温柔科普', note: '陶土橙 · 亲和', c1: '#C47A48', c2: '#F8EBDF' },
    { id: 'clarity', name: '澄净医疗', note: '青蓝 · 克制',  c1: '#0F7C86', c2: '#E3F3F4' },
    { id: 'rescue',  name: '急救响应', note: '深蓝 · 果断',  c1: '#1D5FA8', c2: '#E4EFF9' }
  ];

  var ids = THEMES.map(function (t) { return t.id; });

  function valid(v) { return ids.indexOf(v) > -1; }

  function readCookie() {
    var m = document.cookie.match(new RegExp('(?:^|; )' + KEY + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function writeCookie(v) {
    document.cookie = KEY + '=' + encodeURIComponent(v) + '; path=/; max-age=31536000; SameSite=Lax';
  }

  function read() {
    var v = '';
    try { v = localStorage.getItem(KEY) || ''; } catch (e) {}
    if (!valid(v)) v = readCookie();
    return valid(v) ? v : DEFAULT;
  }

  function apply(id) {
    document.documentElement.setAttribute('data-theme', id);
  }

  function set(id) {
    if (!valid(id)) return;
    apply(id);
    try { localStorage.setItem(KEY, id); } catch (e) {}
    writeCookie(id);
    document.dispatchEvent(new CustomEvent('themechange', { detail: { id: id } }));
  }

  /* 首屏前先落地主题 */
  apply(read());
  window.THEME = { list: THEMES, get: read, set: set };

  function build() {
    if (!document.body) return;
    if (!document.body.classList.contains('page-home')) return;
    if (new URLSearchParams(location.search).has('clean')) return;

    var wrap = document.createElement('div');
    wrap.className = 'style-switch';
    wrap.innerHTML =
      '<button class="style-switch-btn" type="button" aria-expanded="false" aria-controls="stylePanel">' +
        '<span class="style-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
        '<span>视觉风格</span>' +
      '</button>' +
      '<div class="style-panel" id="stylePanel" hidden>' +
        '<div class="style-panel-title">选择视觉风格</div>' +
        '<div class="style-options" role="radiogroup" aria-label="视觉风格">' +
          THEMES.map(function (t) {
            return '<button type="button" class="style-option" role="radio" aria-checked="false" data-theme-id="' + t.id + '">' +
              '<span class="style-swatch" aria-hidden="true"><i style="background:' + t.c1 + '"></i><i style="background:' + t.c2 + '"></i></span>' +
              '<span class="style-text"><b>' + t.name + '</b><small>' + t.note + '</small></span>' +
              '<span class="style-check" aria-hidden="true">✓</span>' +
            '</button>';
          }).join('') +
        '</div>' +
        '<p class="style-hint">选择会保存在本机，各页面保持一致。</p>' +
      '</div>';

    document.body.appendChild(wrap);

    var btn = wrap.querySelector('.style-switch-btn');
    var panel = wrap.querySelector('.style-panel');
    var options = wrap.querySelectorAll('.style-option');

    function sync() {
      var cur = read();
      for (var i = 0; i < options.length; i++) {
        options[i].setAttribute('aria-checked',
          options[i].getAttribute('data-theme-id') === cur ? 'true' : 'false');
      }
    }

    function open(v) {
      panel.hidden = !v;
      btn.setAttribute('aria-expanded', v ? 'true' : 'false');
    }

    btn.addEventListener('click', function () { open(panel.hidden); });

    wrap.addEventListener('click', function (e) {
      var opt = e.target.closest ? e.target.closest('.style-option') : null;
      if (!opt) return;
      set(opt.getAttribute('data-theme-id'));
      sync();
    });

    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) open(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') open(false);
    });

    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
