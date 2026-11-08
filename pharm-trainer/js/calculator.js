/*
 * CSHealthED Pharmacology Trainer — pop-out calculator.
 * A floating, draggable calculator available on every page. Expressions are
 * evaluated by a small arithmetic parser (no eval). "Insert" puts the result
 * into the answer box the student was last working in.
 */
(function (global) {
  'use strict';

  /* ---------- safe arithmetic: + − × ÷ ( ) % and unary minus ---------- */
  function evaluate(src) {
    var s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/,/g, '').replace(/\s+/g, '');
    var i = 0;
    function peek() { return s[i]; }
    function num() {
      var m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new Error('Expected a number');
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function primary() {
      if (peek() === '(') { i++; var v = expr(); if (peek() !== ')') throw new Error('Missing )'); i++; return v; }
      return num();
    }
    function factor() {
      if (peek() === '-') { i++; return -factor(); }
      if (peek() === '+') { i++; return factor(); }
      var v = primary();
      while (peek() === '%') { i++; v = v / 100; }
      return v;
    }
    function term() {
      var v = factor();
      while (peek() === '*' || peek() === '/') {
        var op = s[i++], r = factor();
        if (op === '/' && r === 0) throw new Error('Cannot divide by zero');
        v = op === '*' ? v * r : v / r;
      }
      return v;
    }
    function expr() {
      var v = term();
      while (peek() === '+' || peek() === '-') { var op = s[i++], r = term(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    if (!s) throw new Error('Empty');
    var out = expr();
    if (i !== s.length) throw new Error('Unexpected “' + s[i] + '”');
    if (!isFinite(out)) throw new Error('Not a number');
    return parseFloat(out.toPrecision(12));
  }

  function fmt(n) {
    var parts = String(n).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  var KEYS = [
    ['C', 'clear', 'fn'], ['⌫', 'back', 'fn'], ['(', '(', 'op'], [')', ')', 'op'], ['÷', '÷', 'op'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['×', '×', 'op'], ['%', '%', 'op'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['−', '−', 'op'], ['Ans', 'ans', 'fn'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'], ['=', 'eq', 'eq'],
    ['0', '0', 'zero'], ['.', '.']
  ];
  var HELPERS = [['lb → kg', '÷2.2'], ['kg → lb', '×2.2'], ['× 1,000', '×1000'], ['÷ 1,000', '÷1000'], ['× 60', '×60'], ['÷ 60', '÷60']];
  var POS_KEY = 'cshealthed-calc-pos';

  function init() {
    var lastField = null;
    function answerBox(t) { return t && t.tagName === 'INPUT' && t.type === 'text' && t.closest && t.closest('main') ? t : null; }
    document.addEventListener('focusin', function (e) { if (answerBox(e.target)) lastField = e.target; });

    var fab = document.createElement('button');
    fab.type = 'button'; fab.className = 'calc-fab'; fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-controls', 'calc-panel');
    fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h.01M12 19h.01"/></svg><span>Calculator</span>';
    var panel = document.createElement('section');
    panel.className = 'calc-panel'; panel.id = 'calc-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Calculator');
    panel.innerHTML =
      '<div class="calc-head" title="Drag to move"><span class="calc-grip" aria-hidden="true">⋮⋮</span><b>Calculator</b><button type="button" class="calc-x" aria-label="Close calculator">×</button></div>' +
      '<div class="calc-screen"><div class="calc-hist" aria-live="polite"></div><input class="calc-expr" type="text" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Expression" placeholder="0"><div class="calc-out" aria-live="polite">&nbsp;</div></div>' +
      '<div class="calc-helpers">' + HELPERS.map(function (h) { return '<button type="button" data-help="' + h[1] + '">' + h[0] + '</button>'; }).join('') + '</div>' +
      '<div class="calc-keys">' + KEYS.map(function (k) { return '<button type="button" class="ck-' + (k[2] || 'num') + '" data-k="' + k[1] + '">' + k[0] + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="calc-insert" disabled>Insert result into answer box</button>';
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    var exprEl = panel.querySelector('.calc-expr'), outEl = panel.querySelector('.calc-out'), histEl = panel.querySelector('.calc-hist'), insertBtn = panel.querySelector('.calc-insert');
    var ans = null, history = [], justEvaluated = false;

    function preview() {
      var v = exprEl.value;
      if (!v) { outEl.textContent = ' '; outEl.classList.remove('err'); return; }
      try { outEl.textContent = '= ' + fmt(evaluate(v.replace(/Ans/g, ans == null ? '0' : String(ans)))); outEl.classList.remove('err'); } catch (e) { outEl.textContent = ' '; }
    }
    function equals() {
      var v = exprEl.value; if (!v) return;
      try {
        var r = evaluate(v.replace(/Ans/g, ans == null ? '0' : String(ans)));
        history.unshift(v + ' = ' + fmt(r)); history = history.slice(0, 3);
        histEl.innerHTML = history.map(function (h) { return '<div>' + h.replace(/[<>&]/g, '') + '</div>'; }).join('');
        ans = r; exprEl.value = String(r); outEl.textContent = ' '; justEvaluated = true;
        insertBtn.disabled = false;
      } catch (e) { outEl.textContent = e.message; outEl.classList.add('err'); }
    }
    function put(t) {
      var isOp = /^[×÷+−%)]/.test(t);
      if (justEvaluated && !isOp) exprEl.value = '';
      justEvaluated = false;
      exprEl.value += t; preview();
    }
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('calc-x')) return close();
      if (b === insertBtn) {
        if (ans == null) return;
        if (lastField && document.body.contains(lastField) && !lastField.disabled) {
          lastField.value = String(ans); lastField.dispatchEvent(new Event('input', { bubbles: true })); lastField.focus();
          insertBtn.textContent = 'Inserted ✓'; setTimeout(function () { insertBtn.textContent = 'Insert result into answer box'; }, 1400);
        } else { insertBtn.textContent = 'Click an answer box first'; setTimeout(function () { insertBtn.textContent = 'Insert result into answer box'; }, 1600); }
        return;
      }
      if (b.dataset.help) { justEvaluated = false; exprEl.value = (exprEl.value ? '(' + exprEl.value + ')' : (ans != null ? String(ans) : '0')) + b.dataset.help; preview(); if (!window.matchMedia('(pointer: coarse)').matches) exprEl.focus({ preventScroll: true }); return; }
      var k = b.dataset.k; if (!k) return;
      if (k === 'clear') { exprEl.value = ''; justEvaluated = false; preview(); }
      else if (k === 'back') { exprEl.value = exprEl.value.slice(0, -1); justEvaluated = false; preview(); }
      else if (k === 'eq') equals();
      else if (k === 'ans') put('Ans');
      else put(k);
      // keep typing focus in the expression so Enter means "=" (not a second button press);
      // on touch screens, skip it so the on-screen keyboard doesn't pop up
      if (!window.matchMedia('(pointer: coarse)').matches) exprEl.focus({ preventScroll: true });
    });
    exprEl.addEventListener('input', function () { justEvaluated = false; preview(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); close(); } });
    exprEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === '*') { e.preventDefault(); put('×'); }
      else if (e.key === '/') { e.preventDefault(); put('÷'); }
      else if (e.key === '-') { e.preventDefault(); put('−'); }
      else if (justEvaluated && /^[0-9.(]$/.test(e.key)) { exprEl.value = ''; justEvaluated = false; }
    });

    function open() {
      // an answer box can be focused before this script loads (no focusin), so check now
      if (answerBox(document.activeElement)) lastField = document.activeElement;
      if (!lastField || !document.body.contains(lastField)) lastField = answerBox(document.querySelector('main input[type="text"]:not(:disabled)'));
      panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); fab.classList.add('on');
      place(); exprEl.focus({ preventScroll: true }); exprEl.select();
    }
    function close() { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.classList.remove('on'); fab.focus({ preventScroll: true }); }
    fab.addEventListener('click', function () { if (panel.hidden) open(); else close(); });

    // dragging (header) — position is remembered in this browser
    var pos = null;
    try { pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch (e) { pos = null; }
    function clamp() {
      if (!pos) return;
      var w = panel.offsetWidth, h = panel.offsetHeight;
      pos.x = Math.max(8, Math.min(window.innerWidth - w - 8, pos.x));
      pos.y = Math.max(8, Math.min(window.innerHeight - h - 8, pos.y));
    }
    function place() {
      if (pos && window.innerWidth > 640) { clamp(); panel.style.left = pos.x + 'px'; panel.style.top = pos.y + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; }
      else { panel.style.left = panel.style.top = ''; panel.style.right = panel.style.bottom = ''; }
    }
    var head = panel.querySelector('.calc-head'), drag = null;
    head.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || window.innerWidth <= 640) return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', function (e) {
      if (!drag) return;
      pos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy }; place();
    });
    head.addEventListener('pointerup', function () {
      if (!drag) return; drag = null;
      try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (e) { /* ignore */ }
    });
    window.addEventListener('resize', function () { if (!panel.hidden) place(); });
  }

  global.PharmCalculator = { evaluate: evaluate };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
