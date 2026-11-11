/**
 * cloud.js —— 云数据库接入（唯一初始化点）
 * 通过 WorkBuddy Cloud SDK 写入 / 读取三张公开记录表：
 *   calc_records    —— 医保测算记录
 *   expense_records —— 急救费用识别与报销方案记录
 *   scan_records    —— 历史试卷识别记录（兼容保留）
 * 页面只需提供 <div id="cloudPanel"></div> 与 window.AppSnapshot.get()。
 */
(function () {
  'use strict';

  // 仅来自 workbuddy_cloud_service 激活返回的 publicConfig，不包含任何长期密钥
  var publicConfig = {
    endpoint: 'https://emergency-med-calc.app.workbuddy.host',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    publishableKey: 'wbpk_jMH2FMY2sX6TFQn6Ty54PO_mj2HXBW4WjUmGeunuk1Y2T6PjfliCm2o'
  };

  var cloud = null;
  var initError = '';
  try {
    if (!window.WorkBuddyCloud || typeof window.WorkBuddyCloud.createWorkBuddyCloud !== 'function') {
      throw new Error('云服务 SDK 未加载');
    }
    cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
      endpoint: publicConfig.endpoint,
      oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
      publishableKey: publicConfig.publishableKey
    });
  } catch (e) {
    initError = e && e.message ? e.message : String(e);
  }

  function visitorId() {
    var key = 'wb_calc_visitor_tag';
    var v = '';
    try { v = localStorage.getItem(key) || ''; } catch (e) { /* 隐私模式下忽略 */ }
    if (!v) {
      v = 'v_' + (window.crypto && crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      try { localStorage.setItem(key, v); } catch (e) { /* 忽略 */ }
    }
    return v;
  }
  var vid = visitorId();

  function friendly(err) {
    if (!err) return '未知错误';
    var code = err.code || '';
    if (code === '42P01') return '云端数据表尚未创建';
    if (code === '42501') return '没有写入权限（数据库策略拒绝）';
    if (code === '23505') return '记录已存在';
    if (/failed to fetch|network/i.test(err.message || '')) return '无法连接云数据库，请检查网络';
    return err.message || String(err);
  }

  /** 保存一条记录并读回，验证写入确实落库 */
  async function save(snapshot) {
    if (!cloud) throw new Error('云服务未就绪：' + initError);
    if (!snapshot || !snapshot.kind) throw new Error('请先完成一次测算或识别');
    var table = snapshot.kind === 'calc' ? 'calc_records'
      : snapshot.kind === 'expense' ? 'expense_records' : 'scan_records';
    var row = { visitor_id: vid };
    if (table === 'calc_records') {
      row.scenario = String(snapshot.scenario || '').slice(0, 60);
      row.insured_type = String(snapshot.insuredType || '').slice(0, 40);
      row.total = Number(snapshot.total) || 0;
      row.compliant = Number(snapshot.compliant) || 0;
      row.reimbursed = Number(snapshot.reimbursed) || 0;
      row.self_pay = Number(snapshot.selfPay) || 0;
      row.rate = Number(snapshot.rate) || 0;
      row.note = String(snapshot.note || '').slice(0, 200);
    } else if (table === 'expense_records') {
      row.title = String(snapshot.title || '急救费用识别方案').slice(0, 80);
      row.total = Number(snapshot.total) || 0;
      row.reimbursed = Number(snapshot.reimbursed) || 0;
      row.self_pay = Number(snapshot.selfPay) || 0;
      row.item_count = Number(snapshot.itemCount) || 0;
      row.raw_text = String(snapshot.rawText || '').slice(0, 2000);
    } else {
      row.subject = String(snapshot.subject || '未识别').slice(0, 60);
      row.score = snapshot.score === null || snapshot.score === undefined ? null : Number(snapshot.score);
      row.score_max = snapshot.scoreMax === null || snapshot.scoreMax === undefined ? null : Number(snapshot.scoreMax);
      row.raw_text = String(snapshot.rawText || '').slice(0, 2000);
    }
    var res = await cloud.database.from(table).insert(row).select();
    if (res.error) throw res.error;
    var created = Array.isArray(res.data) ? res.data[0] : null;
    if (!created) throw new Error('写入未返回记录，可能被数据库策略拦截');
    return created;
  }

  var COLS = {
    calc_records: 'id, visitor_id, created_at, scenario, insured_type, total, reimbursed, self_pay, rate',
    expense_records: 'id, visitor_id, created_at, title, total, reimbursed, self_pay, item_count',
    scan_records: 'id, visitor_id, created_at, subject, score, score_max'
  };

  async function list(table) {
    var res = await cloud.database.from(table)
      .select(COLS[table])
      .eq('visitor_id', vid)
      .order('created_at', { ascending: false })
      .limit(8);
    if (res.error) throw res.error;
    return Array.isArray(res.data) ? res.data : [];
  }

  async function listAll() {
    if (!cloud) throw new Error('云服务未就绪：' + initError);
    var a = await list('calc_records');
    var b = await list('scan_records');
    var c = await list('expense_records');
    return a.map(function (r) { r._kind = 'calc'; return r; })
      .concat(b.map(function (r) { r._kind = 'scan'; return r; }))
      .concat(c.map(function (r) { r._kind = 'expense'; return r; }))
      .sort(function (x, y) { return new Date(y.created_at) - new Date(x.created_at); })
      .slice(0, 10);
  }

  /* ---------------- UI ---------------- */
  /* 暖色温馨主题：与各页面共用同一套色板（注入式样式，使用字面色值以免依赖宿主变量） */
  var CSS = [
    '.wbc-card{background:#fffdf8;border:1px solid #e8dac5;border-radius:16px;padding:20px;margin-bottom:16px;box-shadow:0 1px 2px rgba(112,80,52,.05),0 10px 28px rgba(112,80,52,.07);font-size:14px;color:#3b2f26}',
    '.wbc-h{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:4px}',
    '.wbc-h b{font-size:15.5px;font-weight:650}',
    '.wbc-state{font-size:11.5px;border-radius:20px;padding:3px 10px;background:#f3e8d4;color:#6b4a2c}',
    '.wbc-state.off{background:#f9e9e3;color:#8f463a}',
    '.wbc-note{font-size:11.5px;color:#73604e;line-height:1.65;margin:6px 0 14px}',
    '.wbc-btns{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
    '.wbc-btn{background:linear-gradient(180deg,#a56238,#9a5a31);color:#fff;border:1px solid #7d4726;border-radius:9px;padding:8px 15px;font-size:12.5px;font-weight:600;cursor:pointer;min-height:36px}',
    '.wbc-btn:hover{filter:brightness(1.07)}',
    '.wbc-btn:disabled{background:#cbb49c;border-color:#cbb49c;cursor:not-allowed;filter:none}',
    '.wbc-btn.ghost{background:#fffdf8;color:#9a5a31;border-color:#e2d2bd}',
    '.wbc-btn.ghost:hover{background:#f8ecd8}',
    '.wbc-msg{font-size:12px;border-radius:8px;padding:9px 11px;margin-bottom:10px;line-height:1.6}',
    '.wbc-msg.ok{background:#f3e8d4;color:#6b4a2c}',
    '.wbc-msg.err{background:#f9e9e3;color:#8f463a}',
    '.wbc-list{display:grid;gap:7px}',
    '.wbc-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid #f2e8d9;border-radius:9px;padding:9px 11px;font-size:12.5px}',
    '.wbc-row .l{color:#5b4a3b;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.wbc-row .r{font-variant-numeric:tabular-nums;font-weight:650;color:#9a5a31;white-space:nowrap}',
    '.wbc-row .d{color:#73604e;font-size:11px;display:block}',
    '.wbc-empty{text-align:center;color:#73604e;font-size:12px;padding:14px}'
  ].join('');

  function money(v) { return '¥' + Number(v || 0).toFixed(2); }
  function fmtTime(s) {
    var d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderRows(rows) {
    if (!rows.length) return '<div class="wbc-empty">还没有云端记录，点击上方按钮保存本次结果</div>';
    return '<div class="wbc-list">' + rows.map(function (r) {
      var left, right;
      if (r._kind === 'calc') {
        left = '<span class="l">医保测算 · ' + esc(r.scenario || '本地') +
          '<span class="d">' + esc(fmtTime(r.created_at)) + ' · 总额 ' + money(r.total) + '</span></span>';
        right = '<span class="r">自付 ' + money(r.self_pay) + '</span>';
      } else if (r._kind === 'expense') {
        left = '<span class="l">急救费用方案 · ' + (r.item_count || 0) + ' 项' +
          '<span class="d">' + esc(fmtTime(r.created_at)) + ' · 总额 ' + money(r.total) + '</span></span>';
        right = '<span class="r">报销 ' + money(r.reimbursed) + '</span>';
      } else {
        left = '<span class="l">试卷识别 · ' + esc(r.subject || '未识别') +
          '<span class="d">' + esc(fmtTime(r.created_at)) + '</span></span>';
        right = '<span class="r">' + (r.score === null ? '—' : esc(r.score) + (r.score_max ? '/' + esc(r.score_max) : '')) + '</span>';
      }
      return '<div class="wbc-row">' + left + right + '</div>';
    }).join('') + '</div>';
  }

  function mount() {
    var slot = document.getElementById('cloudPanel');
    if (!slot) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    slot.innerHTML =
      '<div class="wbc-card">' +
        '<div class="wbc-h"><b>云端记录</b>' +
          '<span class="wbc-state' + (initError ? ' off' : '') + '" id="wbcState">' +
            (initError ? '云服务未就绪' : '云数据库已连接') + '</span></div>' +
        '<div class="wbc-note">测算记录与急救费用报销方案可保存到 WorkBuddy 云数据库，按本机标识归类查看。' +
          '记录为匿名演示数据，请勿填写真实姓名、身份证号等个人信息。</div>' +
        '<div id="wbcMsg"></div>' +
        '<div class="wbc-btns">' +
          '<button class="wbc-btn" id="wbcSave">保存本次结果到云端</button>' +
          '<button class="wbc-btn ghost" id="wbcRefresh">刷新记录</button>' +
        '</div>' +
        '<div id="wbcList"><div class="wbc-empty">正在读取云端记录…</div></div>' +
      '</div>';

    var msg = document.getElementById('wbcMsg');
    var listEl = document.getElementById('wbcList');
    var saveBtn = document.getElementById('wbcSave');
    var refreshBtn = document.getElementById('wbcRefresh');

    function say(text, isErr) {
      msg.innerHTML = text ? '<div class="wbc-msg ' + (isErr ? 'err' : 'ok') + '">' + esc(text) + '</div>' : '';
    }

    async function refresh() {
      if (!cloud) { listEl.innerHTML = '<div class="wbc-empty">' + esc(initError || '云服务未就绪') + '</div>'; return; }
      try {
        var rows = await listAll();
        listEl.innerHTML = renderRows(rows);
      } catch (e) {
        listEl.innerHTML = '<div class="wbc-empty">读取失败：' + esc(friendly(e)) + '</div>';
      }
    }

    saveBtn.addEventListener('click', async function () {
      saveBtn.disabled = true;
      say('正在保存…', false);
      try {
        var snap = window.AppSnapshot && typeof window.AppSnapshot.get === 'function'
          ? window.AppSnapshot.get() : null;
        var created = await save(snap);
        say('已保存并读回（记录 #' + created.id + '），数据已写入云端数据库。', false);
        await refresh();
      } catch (e) {
        say('保存失败：' + friendly(e), true);
      } finally {
        saveBtn.disabled = false;
      }
    });
    refreshBtn.addEventListener('click', refresh);
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.AppCloud = { save: save, listAll: listAll, visitorId: vid, ready: !initError, initError: initError };
})();
