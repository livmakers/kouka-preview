/* 確認用の画面写し：ログインの再現と、保存・提出・出力を止めてやさしく案内する */
(function () {
  'use strict';
  var msg = '確認用の画面写しのため、ここでは保存・提出・出力は動きません。';
  function toast(text) {
    var t = document.querySelector('.preview-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'preview-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = text || msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('on'); }, 2800);
  }
  // 通信は送らない
  window.fetch = function () {
    toast();
    return Promise.resolve(new Response(JSON.stringify({ ok: false, message: msg }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };

  var logins = window.PREVIEW_LOGINS || {};
  var empInput = document.querySelector('input[name="emp_no"]');

  // デモの社員番号ボタン：押すと入力欄に入る
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-demo-id]');
    if (b && empInput) {
      empInput.value = b.getAttribute('data-demo-id');
      empInput.focus();
      return;
    }
    var a = e.target.closest && e.target.closest('a[href="#preview-off"]');
    if (a) { e.preventDefault(); toast(); }
  }, true);

  document.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    var f = e.target;
    // ログイン：社員番号で立場ごとのホームへ
    if (empInput && f.contains(empInput)) {
      var id = (empInput.value || '').trim().toUpperCase();
      if (logins[id]) { location.href = logins[id]; return; }
      toast(id ? 'この確認用ページでは、下のデモの社員番号で入れます。' : '社員番号を入れてください。下のデモの番号も使えます。');
      return;
    }
    // ログアウト：ログイン画面へ
    if (f.classList.contains('logout')) { location.href = 'index.html'; return; }
    toast();
  }, true);
})();
