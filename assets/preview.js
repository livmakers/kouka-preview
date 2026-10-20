/* 確認ボード用：画面写しでは保存・提出・出力を止め、やさしく案内する */
(function () {
  'use strict';
  var msg = '確認用の画面写しのため、ここでは保存・提出・出力は動きません。';
  function toast() {
    var t = document.querySelector('.preview-toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'preview-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  // 通信は送らない
  window.fetch = function () {
    toast();
    return Promise.resolve(new Response(JSON.stringify({ ok: false, message: msg }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  };
  document.addEventListener('submit', function (e) { e.preventDefault(); e.stopImmediatePropagation(); toast(); }, true);
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href="#preview-off"]');
    if (a) { e.preventDefault(); toast(); }
  }, true);
})();
