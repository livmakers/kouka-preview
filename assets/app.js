/* 考課管理システム — 画面の動き（自動保存・リアルタイムチェック・提出・相談ボックス）
   外部のAI APIは呼ばない。通信先はこのシステム自身（同一オリジン）だけ。 */
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function stars(n, label) {
    if (n === null || n === undefined) return '<span class="stars none" aria-label="' + esc(label) + '未判定">―</span>';
    var s = '<span class="stars pop" role="img" aria-label="' + esc(label + n) + '（5段階）"><b>' + n + '</b>';
    for (var i = 1; i <= 5; i++) s += '<i class="' + (i <= n ? 'on' : '') + '"></i>';
    return s + '</span>';
  }

  // ---------- 残り文字数 ----------
  function counter(el) {
    var max = parseInt(el.getAttribute('maxlength') || '0', 10);
    var out = document.querySelector('[data-count-for="' + el.id + '"]');
    if (!max || !out) return;
    var left = max - Array.from(el.value).length;
    out.textContent = '残り' + left + '字';
    out.classList.toggle('near', left <= Math.max(5, Math.floor(max * 0.1)));
  }
  $$('textarea[maxlength], input[maxlength][type=text]').forEach(function (el) {
    counter(el);
    el.addEventListener('input', function () { counter(el); });
  });

  // ---------- 印刷 ----------
  $$('[data-print]').forEach(function (b) { b.addEventListener('click', function () { window.print(); }); });

  $$('[data-autosubmit]').forEach(function (s) { s.addEventListener('change', function () { s.form.submit(); }); });

  // ---------- やさしい確認ダイアログ ----------
  var dlg = $('#confirm');
  function ask(message, needReason, okLabel) {
    return new Promise(function (resolve) {
      if (!dlg || typeof dlg.showModal !== 'function') {
        if (needReason) { var r = window.prompt(message); resolve(r ? { ok: true, reason: r } : { ok: false }); }
        else resolve({ ok: window.confirm(message), reason: '' });
        return;
      }
      $('.dlg-msg', dlg).textContent = message;
      var box = $('.dlg-reason', dlg);
      var ta = $('#dlg-reason-input');
      box.hidden = !needReason;
      ta.value = '';
      counter(ta);
      $('.dlg-ok', dlg).textContent = okLabel || '提出する';
      dlg.returnValue = '';
      dlg.showModal();
      dlg.addEventListener('close', function onClose() {
        dlg.removeEventListener('close', onClose);
        resolve({ ok: dlg.returnValue === 'ok', reason: ta.value.trim() });
      });
    });
  }
  $$('[data-confirm-simple]').forEach(function (b) {
    b.addEventListener('click', function (ev) {
      if (b.dataset.confirmed) return;
      ev.preventDefault();
      ask(b.getAttribute('data-confirm-simple'), false, 'はい').then(function (r) {
        if (!r.ok) return;
        b.dataset.confirmed = '1';
        var f = b.form;
        if (b.name) { var h = document.createElement('input'); h.type = 'hidden'; h.name = b.name; h.value = b.value; f.appendChild(h); }
        f.submit();
      });
    });
  });

  // ---------- 考課表 ----------
  var sheet = $('#sheet');
  if (!sheet) return;
  sheet.addEventListener('submit', function (e) { e.preventDefault(); });
  var state = { version: parseInt(sheet.dataset.version, 10), pending: {}, timer: null, saving: null, conflict: false };
  var csrf = sheet.dataset.csrf;
  var saveState = $('[data-save-state]');

  function post(url, body) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) { j._status = res.status; return j; });
    });
  }

  function valueOf(el) {
    if (el.type === 'radio') {
      var c = sheet.querySelector('input[name="' + el.name + '"]:checked');
      return c ? c.value : '';
    }
    return el.value;
  }

  function setText(sel, v, empty) {
    $$(sel).forEach(function (e) { e.textContent = (v === null || v === undefined || v === '') ? (empty === undefined ? '―' : empty) : v; });
  }
  function grade(g) {
    return g ? '<span class="grade g-' + esc(g) + '" role="img" aria-label="総合評定' + esc(g) + '">' + esc(g) + '</span>' : '<span class="grade none">―</span>';
  }
  function tips(list) {
    return (list && list.length)
      ? list.slice(0, 3).map(function (c) { return '<li class="' + esc(c.level) + '">' + esc(c.text) + '</li>'; }).join('')
      : '<li class="muted">書き始めると、ここにヒントが出ます。</li>';
  }
  function applyEval(ev) {
    if (!ev) return;
    Object.keys(ev.items).forEach(function (k) {
      var it = ev.items[k];
      setText('[data-weight="' + k + '"]', it.weight);
      setText('[data-points="' + k + '"]', it.points);
      setText('[data-points-self="' + k + '"]', it.points_self);
      var sw = $('[data-points-self-wrap="' + k + '"]'); if (sw) sw.hidden = !(it.points === null && it.points_self !== null);
      var gw = $('[data-gap-warn="' + k + '"]'); if (gw) gw.hidden = !it.gap_note_needed;
      $$('[data-checks="' + k + '"], [data-checks-final="' + k + '"]').forEach(function (u) { u.innerHTML = tips(it.checks); });
      var adv = $('[data-advice="' + k + '"]');
      if (adv) { adv.hidden = !it.advice; var p = adv.querySelector('span'); if (p) p.textContent = it.advice || ''; }
    });
    Object.keys(ev.qual || {}).forEach(function (k) { setText('[data-qpoints="' + k + '"]', ev.qual[k].points); });
    var qc = $('[data-qual-checks]'); if (qc) qc.innerHTML = ev.qual_checks && ev.qual_checks.length ? tips(ev.qual_checks) : '';
    setText('[data-perf], [data-perf2]', ev.perf);
    setText('[data-perf-self]', ev.perf_self);
    var ps = $('[data-perf-self-wrap]'); if (ps) ps.hidden = !(ev.perf === '' && ev.perf_self !== '');
    setText('[data-qual], [data-qual2]', ev.qual_score);
    setText('[data-qual-self]', ev.qual_self);
    var qs = $('[data-qual-self-wrap]'); if (qs) qs.hidden = !(ev.qual_score === '' && ev.qual_self !== '');
    setText('[data-total]', ev.total);
    var g = $('[data-grade]'); if (g) g.innerHTML = grade(ev.grade);
    var pr = $('[data-promo]');
    if (pr) {
      pr.textContent = '昇進・役職登用の判定：' + ev.promo_label;
      pr.classList.toggle('hold', ev.promo === false);
      pr.classList.toggle('ok', ev.promo === true);
    }
    setText('[data-overall-comment]', ev.overall_comment, '');
  }

  function showErrors(errors) {
    $$('[data-err-for]').forEach(function (e) { e.textContent = ''; e.parentNode.classList.remove('has-err'); });
    Object.keys(errors || {}).forEach(function (path) {
      var e = document.querySelector('[data-err-for="' + path + '"]');
      if (e) { e.textContent = errors[path]; e.parentNode.classList.add('has-err'); }
    });
  }

  function flush() {
    if (state.conflict) return Promise.resolve(false);
    clearTimeout(state.timer);
    if (state.saving) return state.saving.then(flush);
    var fields = state.pending;
    if (!Object.keys(fields).length) return Promise.resolve(true);
    state.pending = {};
    if (saveState) saveState.textContent = '保存しています…';
    state.saving = post(sheet.dataset.saveUrl, { sheet_id: +sheet.dataset.sheetId, version: state.version, fields: fields })
      .then(function (j) {
        state.saving = null;
        if (j.ok) {
          state.version = j.version;
          $('#transition-form [name=version]').value = j.version;
          showErrors({});
          applyEval(j.eval);
          if (saveState) saveState.textContent = '保存しました ' + j.saved_at;
          updateHrButton();
          return Object.keys(state.pending).length ? flush() : true;
        }
        if (j._status === 409) {
          state.conflict = true;
          var c = $('[data-conflict]');
          c.hidden = false;
          c.innerHTML = esc(j.message) + ' <a href="' + esc(location.href) + '">最新を読み込む</a>';
          if (saveState) saveState.textContent = '保存を止めています';
          return false;
        }
        if (j._status === 422) {
          // 直せば保存できるよう、入力はそのまま残す
          Object.keys(fields).forEach(function (k) { if (!(k in state.pending)) state.pending[k] = fields[k]; });
          Object.keys(j.errors || {}).forEach(function (k) { delete state.pending[k]; });
          showErrors(j.errors);
          if (saveState) saveState.textContent = '入力の形を整えると保存できます';
          return false;
        }
        if (saveState) saveState.textContent = j.message || '保存できませんでした。通信状況をご確認ください';
        Object.keys(fields).forEach(function (k) { if (!(k in state.pending)) state.pending[k] = fields[k]; });
        return false;
      })
      .catch(function () {
        state.saving = null;
        Object.keys(fields).forEach(function (k) { if (!(k in state.pending)) state.pending[k] = fields[k]; });
        if (saveState) saveState.textContent = '通信がつながると、自動で保存します';
        state.timer = setTimeout(flush, 5000);
        return false;
      });
    return state.saving;
  }

  $$('[data-path]', sheet).forEach(function (el) {
    var ev = (el.type === 'radio' || el.type === 'date') ? 'change' : 'input';
    el.addEventListener(ev, function () {
      state.pending[el.getAttribute('data-path')] = valueOf(el);
      clearTimeout(state.timer);
      state.timer = setTimeout(flush, 700);
      if (saveState && !state.conflict) saveState.textContent = '入力中…';
    });
    if (ev === 'input') el.addEventListener('blur', function () { if (Object.keys(state.pending).length) flush(); });
  });
  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(state.pending).length || state.saving) { flush(); e.preventDefault(); e.returnValue = ''; }
  });

  // 上長コメントが入ったら「人事へ提出」を押せるように
  var hrBtn = $('[data-transition="submit_hr"]');
  function updateHrButton() {
    if (!hrBtn || !hrBtn.dataset.needComment) return;
    var src = document.querySelector('[data-path="' + hrBtn.dataset.needComment + '"]');
    if (!src) return;
    var ready = src.value.trim() !== '';
    hrBtn.disabled = !ready;
    var hint = $('[data-hr-hint]'); if (hint) hint.hidden = ready;
  }
  if (hrBtn && hrBtn.dataset.needComment) {
    var src = document.querySelector('[data-path="' + hrBtn.dataset.needComment + '"]');
    if (src) src.addEventListener('input', updateHrButton);
  }

  // 提出・差戻し
  $$('[data-transition]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.disabled) return;
      var needReason = b.hasAttribute('data-reason');
      ask(b.getAttribute('data-confirm'), needReason, needReason ? '差し戻す' : '提出する').then(function (r) {
        if (!r.ok) return;
        if (needReason && !r.reason) { ask('理由を書くと差し戻せます。', false, 'わかりました'); return; }
        b.disabled = true;
        flush().then(function (ok) {
          if (ok === false) { b.disabled = false; return; }
          var f = $('#transition-form');
          f.querySelector('[name=action]').value = b.getAttribute('data-transition');
          f.querySelector('[name=reason]').value = r.reason || '';
          f.querySelector('[name=version]').value = state.version;
          f.submit();
        });
      });
    });
  });

  // ---------- 相談ボックス ----------
  $$('.consult').forEach(function (box) {
    var item = box.getAttribute('data-item');
    var text = $('[data-consult-text]', box);
    var cat = $('[data-consult-cat]', box);
    var answers = $('[data-consult-answers]', box);
    var ext = $('[data-ext]', box);
    var prompt = $('[data-ext-prompt]', box);
    var consultId = null;
    $('[data-consult-send]', box).addEventListener('click', function () {
      var body = text.value.trim();
      if (!body) { answers.innerHTML = '<div class="ans">困っていることを一言でも書くと、ヒントをお出しします。</div>'; return; }
      answers.innerHTML = '<div class="ans">ヒントを探しています…</div>';
      var pick = $('[data-consult-item]', box);
      var target = pick ? pick.value : item;
      flush().then(function () {
        return post(sheet.dataset.consultUrl, { sheet_id: +sheet.dataset.sheetId, item: target, category: cat.value, body: body });
      }).then(function (j) {
        if (!j.ok) { answers.innerHTML = '<div class="ans">' + esc(j.message || 'もう一度お試しください。') + '</div>'; return; }
        consultId = j.id;
        var html = '<p class="small muted">相談を受け付けました（' + esc(j.category) + '）。こんな方法があります。</p>';
        html += j.answers.length ? j.answers.map(function (a) { return '<div class="ans"><b>' + esc(a.title) + '</b>' + esc(a.body) + '</div>'; }).join('')
          : '<div class="ans">ぴったりのヒントがまだ登録されていません。下の相談文で会社のAIに聞いてみましょう。</div>';
        answers.innerHTML = html;
        prompt.value = j.prompt;
        ext.hidden = false;
      });
    });
    $('[data-copy]', box).addEventListener('click', function () {
      var done = function () { $('[data-copied]', box).textContent = 'コピーしました。会社のAIに貼り付けてください。'; };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(prompt.value).then(done);
      else { prompt.removeAttribute('readonly'); prompt.select(); document.execCommand('copy'); prompt.setAttribute('readonly', ''); done(); }
    });
    $('[data-ext-save]', box).addEventListener('click', function () {
      var t = $('[data-ext-answer]', box).value.trim();
      if (!consultId || !t) { $('[data-copied]', box).textContent = 'AIの回答を貼り付けてから保存してください。'; return; }
      post(sheet.dataset.answerUrl, { id: consultId, answer: t }).then(function (j) {
        $('[data-copied]', box).textContent = j.ok ? '回答を保存しました。「これまでの相談」から見返せます。' : (j.message || '保存できませんでした。');
      });
    });
  });
})();
