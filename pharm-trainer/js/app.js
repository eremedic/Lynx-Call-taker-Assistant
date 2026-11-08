/* CSHealthED Pharmacology Trainer — application (hash-routed single page app) */
(function () {
  'use strict';

  var D = window.PharmData, L = window.PharmLabels, C = window.PharmCalc, SCN = window.PharmScenarios, Syringe = window.Syringe;
  var main = document.getElementById('main');
  var cleanup = [];

  /* ---------------------------------------------------------------- utils */
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function listHtml(v) { return Array.isArray(v) ? '<ul>' + v.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : esc(v); }
  function shortName(d) { return d.name.replace(/ \d.*$/, ''); }
  function onKey(fn) { document.addEventListener('keydown', fn); cleanup.push(function () { document.removeEventListener('keydown', fn); }); }
  function typing(e) { var t = e.target.tagName; return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA'; }

  /* ---------------------------------------------------------------- progress */
  var KEY = 'cshealthed-pharm-v1';
  var store = (function () {
    var data = { known: {}, calc: { att: 0, cor: 0 }, draw: { att: 0, cor: 0 }, scen: {}, exam: null };
    try { var raw = localStorage.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
    return {
      data: data, save: save,
      reset: function () { data.known = {}; data.calc = { att: 0, cor: 0 }; data.draw = { att: 0, cor: 0 }; data.scen = {}; data.exam = null; save(); }
    };
  })();
  function pct(o) { return o.att ? Math.round((o.cor / o.att) * 100) + '%' : '—'; }

  /* ---------------------------------------------------------------- icons */
  var ICON = {
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/></svg>',
    calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15v4M8 19h.01M12 19h.01"/></svg>',
    syringe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2l4 4M17 7l3-3M19 9 8.7 19.3a1 1 0 0 1-1.4 0l-2.6-2.6a1 1 0 0 1 0-1.4L15 5"/><path d="M9 11l4 4M5 19l-3 3M14 4l6 6"/></svg>',
    scenario: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4M3 17V7a1 1 0 0 1 1-1h10v11M14 9h4l3 4v4h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M7 9v4M5 11h4"/></svg>',
    exam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  function pageHead(color, crumbs, title, sub, right) {
    return '<section class="page-head" style="--c:' + color + '"><div class="wrap"><div class="head-row"><div>' +
      '<div class="crumbs">' + crumbs + '</div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (right || '') + '</div></div></section>';
  }

  /* ================================================================ HOME */
  function viewHome() {
    var total = D.DRUGS.length * Object.keys(D.FIELDS).length;
    var known = Object.keys(store.data.known).length;
    var done = Object.keys(store.data.scen).length;
    var tiles = [
      ['cards', 'Flashcards', 'Pick the drugs and facts to study: class, indications, contraindications, doses and more.', known + ' of ' + total + ' cards mastered', '#7b4bc4', 'cards'],
      ['calc', 'Medication Math', 'Conversions, weight-based doses, volume to give, drip rates and infusions with worked solutions.', 'Accuracy ' + pct(store.data.calc), '#1e88e5', 'calc'],
      ['drawup', 'Draw-Up Lab', 'Read a medication label, choose a syringe and pull the plunger to exactly the right volume.', 'Accuracy ' + pct(store.data.draw), '#e0262b', 'syringe'],
      ['scenarios', 'Practice Scenarios', 'Ten patient cases that combine drug decisions, calculations and draw-ups.', done + ' of ' + SCN.length + ' completed', '#f08a1c', 'scenario'],
      ['exam', 'Pharmacology Exam', '20 mixed questions: drug knowledge, medication math and draw-ups. Pass mark 80%.', store.data.exam != null ? 'Best ' + store.data.exam + '%' : 'Not attempted', '#1b2a5b', 'exam'],
      ['drugs', 'Drug Reference', D.DRUGS.length + ' paramedic medications with full monographs and labels.', D.DRUGS.length + ' drugs', '#3a9b3f', 'book']
    ];
    main.innerHTML =
      '<section class="hero"><div class="wrap hero-grid"><div>' +
      '<div class="eyebrow">Paramedic Pharmacology · Medication Math · Draw-Up Practice</div>' +
      '<h1>Know the drug. Do the math. <span class="hl">Draw it up right.</span></h1>' +
      '<p class="lead">Study ' + D.DRUGS.length + ' paramedic medications with flashcards you build yourself, practice unlimited medication-math problems, and pull the right volume into a real-scale syringe from realistic labels.</p>' +
      '<div class="hero-cta"><a class="btn btn-primary" href="#cards">Start flashcards</a><a class="btn btn-light" href="#drawup">Open the Draw-Up Lab</a><a class="btn btn-light" href="#scenarios">Scenarios</a></div>' +
      '<div class="hero-stats"><div><b>' + D.DRUGS.length + '</b><span>medications</span></div><div><b>' + Object.keys(C.TOPICS).length + '</b><span>math skill types</span></div><div><b>' + SCN.length + '</b><span>patient scenarios</span></div></div>' +
      '</div><div class="hero-pharm-visual">' + L.medCard(D.byId('fentanyl')) + '<div class="syr-wrap" style="width:100%"><div id="hero-syr"></div></div></div></div></section>' +
      '<section class="section"><div class="wrap"><div class="section-head"><div><h2>Training tools</h2><p>Use them in any order. Your progress is saved in this browser.</p></div></div>' +
      '<div class="tool-grid">' + tiles.map(function (t) {
        return '<a class="module-card" href="#' + t[0] + '" style="--c:' + t[4] + '"><div class="band"></div><div class="body">' +
          '<div class="num"><span class="icon-badge">' + ICON[t[5]] + '</span>' + t[1] + '</div>' +
          '<p>' + t[2] + '</p><div class="card-meta"><span>' + t[3] + '</span><span>Open →</span></div></div></a>';
      }).join('') + '</div></div></section>';
    var s = new Syringe($('#hero-syr'), { size: 3, tint: '#e11d48' });
    s.set(1.5); s.lock(true);
  }

  /* ================================================================ FLASHCARDS */
  var MC_FIELDS = ['cls', 'action', 'ind', 'adult', 'peds', 'supplied'];
  function viewCards() {
    var st = { cats: {}, fields: { cls: true, ind: true, adult: true }, mode: 'flip' };
    Object.keys(D.CATS).forEach(function (k) { st.cats[k] = true; });
    main.innerHTML = pageHead('#7b4bc4', '<a href="#home">Home</a> / Flashcards', 'Drug Flashcards', 'Choose which drugs and which facts you want to be tested on, then flip through the deck or quiz yourself with multiple choice.') +
      '<div class="wrap" style="padding-block:24px 56px"><div class="panel" id="fc-setup"></div><div id="fc-area" style="margin-top:18px"></div></div>';
    function renderSetup() {
      $('#fc-setup').innerHTML = '<div class="setup-grid">' +
        '<div class="setup-row"><div class="row-flex"><span class="lab-lbl">1 · Drug categories</span><span class="mini-links"><button data-all="cats">All</button><button data-none="cats">None</button></span></div><div class="check-grid">' +
        Object.keys(D.CATS).map(function (k) { var n = D.DRUGS.filter(function (d) { return d.cat.indexOf(k) >= 0; }).length; return '<label class="ck"><input type="checkbox" data-cat="' + k + '"' + (st.cats[k] ? ' checked' : '') + '>' + D.CATS[k].name + ' <span class="muted">(' + n + ')</span></label>'; }).join('') + '</div></div>' +
        '<div class="setup-row"><div class="row-flex"><span class="lab-lbl">2 · Test me on</span><span class="mini-links"><button data-all="fields">All</button><button data-none="fields">None</button></span></div><div class="check-grid">' +
        Object.keys(D.FIELDS).map(function (k) { return '<label class="ck"><input type="checkbox" data-field="' + k + '"' + (st.fields[k] ? ' checked' : '') + '>' + D.FIELDS[k] + '</label>'; }).join('') + '</div></div>' +
        '<div class="setup-row"><span class="lab-lbl">3 · Mode</span><div class="seg" id="fc-mode"><button data-mode="flip" class="' + (st.mode === 'flip' ? 'on' : '') + '">Flip cards</button><button data-mode="mc" class="' + (st.mode === 'mc' ? 'on' : '') + '">Multiple choice</button></div>' +
        '<p class="hint" id="fc-mode-note"></p></div>' +
        '<div class="row-flex"><button class="btn btn-primary" id="fc-start">Build my deck</button><span class="hint" id="fc-count"></span></div></div>';
      count();
    }
    function chosen() {
      var drugs = D.DRUGS.filter(function (d) { return d.cat.some(function (c) { return st.cats[c]; }); });
      var fields = Object.keys(D.FIELDS).filter(function (f) { return st.fields[f]; });
      if (st.mode === 'mc') fields = fields.filter(function (f) { return MC_FIELDS.indexOf(f) >= 0; });
      return { drugs: drugs, fields: fields };
    }
    function count() {
      var c = chosen();
      $('#fc-count').textContent = c.drugs.length + ' drugs × ' + c.fields.length + ' topics = ' + c.drugs.length * c.fields.length + ' cards';
      var skipped = st.mode === 'mc' && (st.fields.contra || st.fields.se);
      $('#fc-mode-note').textContent = skipped ? 'Contraindications and side effects overlap too much between drugs for fair multiple choice, so they are practiced as flip cards only.' : '';
      $('#fc-start').disabled = !(c.drugs.length && c.fields.length);
    }
    $('#fc-setup').addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset.cat) st.cats[t.dataset.cat] = t.checked;
      if (t.dataset.field) st.fields[t.dataset.field] = t.checked;
      count();
    });
    $('#fc-setup').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.all || b.dataset.none) {
        var k = b.dataset.all || b.dataset.none, on = !!b.dataset.all;
        if (k === 'cats') Object.keys(D.CATS).forEach(function (c) { st.cats[c] = on; });
        else Object.keys(D.FIELDS).forEach(function (f) { st.fields[f] = on; });
        renderSetup();
      } else if (b.dataset.mode) { st.mode = b.dataset.mode; renderSetup(); }
      else if (b.id === 'fc-start') start();
    });
    renderSetup();

    function start() {
      var c = chosen(), deck = [];
      c.drugs.forEach(function (d) { c.fields.forEach(function (f) { deck.push({ d: d, f: f }); }); });
      deck = shuffle(deck);
      if (st.mode === 'flip') runFlip(deck); else runMC(deck);
      $('#fc-area').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function cardKey(c) { return c.d.id + '|' + c.f; }
    function catTag(d) { var k = d.cat[0]; return '<span class="fc-cat" style="color:' + D.CATS[k].color + '">' + D.CATS[k].name + '</span>'; }

    function runFlip(deck) {
      var queue = deck.slice(), total = deck.length, mastered = 0, missed = [], seen = 0;
      function render() {
        if (!queue.length) return finish();
        var c = queue[0], d = c.d;
        $('#fc-area').innerHTML =
          '<div class="deck-bar"><div class="progress" style="--c:#7b4bc4"><i style="width:' + (mastered / total * 100) + '%"></i></div><div class="deck-stats"><span><b>' + mastered + '</b> mastered</span><span><b>' + queue.length + '</b> left</span><span><b>' + missed.length + '</b> to review</span></div></div>' +
          '<div class="fc-stage"><div class="flashcard" tabindex="0" role="button" aria-label="Flashcard. Press space to flip">' +
          '<div class="fc-inner"><div class="fc-face fc-front"><div class="fc-top">' + catTag(d) + (d.schedule ? '<span class="chip">' + d.schedule + '</span>' : '') + '</div>' +
          '<div class="fc-name">' + esc(d.name) + '</div><div class="fc-trade">' + (d.trade && d.trade !== '—' ? esc(d.trade) : '&nbsp;') + '</div>' +
          (c.f === 'supplied' ? '' : L.medCard(d, { compact: true })) +
          '<div class="fc-ask">' + D.FIELDS[c.f] + '?</div></div>' +
          '<div class="fc-face fc-back"><div class="fc-top">' + catTag(d) + '<span class="chip">' + D.FIELDS[c.f] + '</span></div><div class="fc-name" style="font-size:1.4rem">' + esc(d.name) + '</div>' +
          '<div class="fc-answer" style="margin-top:12px">' + listHtml(d[c.f]) + '</div>' +
          (c.f === 'adult' || c.f === 'peds' ? '<p class="protocol-note">Follow your local protocol.</p>' : '') + '</div></div></div>' +
          '<div class="fc-hint">Click the card or press <kbd>Space</kbd> to flip</div>' +
          '<div class="fc-actions"><button class="btn btn-warn" id="fc-miss" disabled>Still learning <kbd>1</kbd></button><button class="btn btn-ok" id="fc-got" disabled>Got it <kbd>2</kbd></button></div></div>';
        var card = $('.flashcard');
        function flip() { card.classList.toggle('flipped'); $('#fc-miss').disabled = $('#fc-got').disabled = false; }
        card.addEventListener('click', flip);
        $('#fc-miss').addEventListener('click', function () { grade(false); });
        $('#fc-got').addEventListener('click', function () { grade(true); });
        card.focus({ preventScroll: true });
        render.flip = flip;
      }
      function grade(ok) {
        var c = queue.shift(); seen++;
        if (ok) { mastered++; store.data.known[cardKey(c)] = true; }
        else {
          if (missed.indexOf(c) < 0) missed.push(c);
          delete store.data.known[cardKey(c)];
          queue.splice(Math.min(queue.length, 3 + Math.floor(Math.random() * 3)), 0, c); // see it again soon
        }
        store.save(); render();
      }
      function finish() {
        $('#fc-area').innerHTML = '<div class="panel result"><div class="ring" style="--p:100;--rc:var(--ok)"><div>✓</div></div><h2>Deck complete</h2>' +
          '<p class="muted">You mastered all ' + total + ' cards' + (missed.length ? ', after reviewing ' + missed.length + ' you missed the first time' : ' on the first try') + '.</p>' +
          '<div class="hero-cta" style="justify-content:center">' + (missed.length ? '<button class="btn btn-primary" id="fc-again">Drill the ' + missed.length + ' I missed</button>' : '') + '<button class="btn btn-ghost" id="fc-new">Shuffle the whole deck again</button></div></div>';
        if (missed.length) $('#fc-again').addEventListener('click', function () { runFlip(shuffle(missed)); });
        $('#fc-new').addEventListener('click', function () { runFlip(shuffle(deck)); });
      }
      onKey(function (e) {
        if (typing(e) || !$('.flashcard')) return;
        if (e.key === ' ') { e.preventDefault(); render.flip(); }
        else if (e.key === '1' && !$('#fc-miss').disabled) grade(false);
        else if (e.key === '2' && !$('#fc-got').disabled) grade(true);
      });
      render();
    }

    function runMC(deck) {
      var i = 0, score = 0, missed = [], answered = false;
      function render() {
        if (i >= deck.length) return finish();
        answered = false;
        var q = mcFor(deck[i].d, deck[i].f);
        $('#fc-area').innerHTML = '<div class="deck-bar"><div class="progress" style="--c:#7b4bc4"><i style="width:' + (i / deck.length * 100) + '%"></i></div><div class="deck-stats"><span>Question <b>' + (i + 1) + '</b> of ' + deck.length + '</span><span>Score <b>' + score + '</b></span></div></div>' +
          '<div class="panel"><div class="fc-top">' + catTag(deck[i].d) + '<span class="chip">' + D.FIELDS[deck[i].f] + '</span></div><h3 style="font-size:1.15rem">' + q.q + '</h3>' +
          '<div class="options">' + q.options.map(function (o, k) { return '<button class="option" data-k="' + k + '"><span class="key">' + (k + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div><div id="mc-fb"></div></div>';
        $all('.option').forEach(function (b) { b.addEventListener('click', function () { answer(+b.dataset.k, q); }); });
      }
      function answer(k, q) {
        if (answered) return; answered = true;
        var ok = k === q.answer;
        if (ok) { score++; store.data.known[cardKey(deck[i])] = true; } else { missed.push(deck[i]); }
        store.save();
        $all('.option').forEach(function (b) { b.disabled = true; var kk = +b.dataset.k; if (kk === q.answer) b.classList.add('correct'); else if (kk === k) b.classList.add('wrong'); });
        $('#mc-fb').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div>' + (q.explain || '') +
          '<div style="margin-top:12px;display:flex;justify-content:flex-end"><button class="btn btn-primary" id="mc-next">' + (i === deck.length - 1 ? 'See results' : 'Next →') + '</button></div></div>';
        $('#mc-next').addEventListener('click', function () { i++; render(); });
        $('#mc-next').focus({ preventScroll: true });
      }
      function finish() {
        var p = Math.round(score / deck.length * 100);
        $('#fc-area').innerHTML = '<div class="panel result"><div class="ring" style="--p:' + p + ';--rc:' + (p >= 80 ? 'var(--ok)' : 'var(--red)') + '"><div>' + p + '%</div></div><h2>' + score + ' of ' + deck.length + ' correct</h2>' +
          (missed.length ? '<div class="review-list"><h3>Review</h3><ul>' + missed.map(function (c) { return '<li><a href="#d-' + c.d.id + '">' + esc(c.d.name) + '</a> — ' + D.FIELDS[c.f].toLowerCase() + '</li>'; }).join('') + '</ul></div>' : '') +
          '<div class="hero-cta" style="justify-content:center">' + (missed.length ? '<button class="btn btn-primary" id="mc-again">Retry the ' + missed.length + ' I missed</button>' : '') + '<button class="btn btn-ghost" id="mc-new">New shuffle</button></div></div>';
        if (missed.length) $('#mc-again').addEventListener('click', function () { runMC(shuffle(missed)); });
        $('#mc-new').addEventListener('click', function () { runMC(shuffle(deck)); });
      }
      onKey(function (e) {
        if (typing(e)) return;
        if (!answered && /^[1-4]$/.test(e.key)) { var b = $all('.option')[+e.key - 1]; if (b) b.click(); }
        else if (answered && e.key === 'Enter' && $('#mc-next')) { e.preventDefault(); $('#mc-next').click(); }
      });
      render();
    }
  }

  // Multiple-choice question for one drug + field (fields with unambiguous distractors only)
  function sharesCat(a, b) { return a.cat.some(function (c) { return b.cat.indexOf(c) >= 0; }); }
  function mcFor(d, f) {
    var others = shuffle(D.DRUGS.filter(function (x) { return x.id !== d.id; }));
    if (f === 'ind') {
      var item = pick(d.ind);
      var dis = others.filter(function (x) { return !sharesCat(x, d); }).slice(0, 3);
      var opts = shuffle([d].concat(dis));
      return { q: 'Which drug is indicated for: <b>' + esc(item) + '</b>?', options: opts.map(function (x) { return x.name; }), answer: opts.indexOf(d),
        explain: '<p><b>' + esc(d.name) + '</b> indications:</p>' + listHtml(d.ind) };
    }
    var stem = { cls: 'What is the drug class of', action: 'What is the mechanism of action of', adult: 'What is the usual adult dose of', peds: 'What is the usual pediatric dose of', supplied: 'How is this drug commonly supplied:' }[f];
    var firstWords = function (s) { return String(s).toLowerCase().split(/[ (,]/).slice(0, 2).join(' '); };
    var pool = [];
    others.forEach(function (x) {
      var v = x[f];
      if (!v || pool.indexOf(v) >= 0 || v === d[f]) return;
      if (f === 'cls' && firstWords(v) === firstWords(d[f])) return;
      if ((f === 'peds' || f === 'adult') && /^Not /.test(v)) return;
      pool.push(v);
    });
    var choices = shuffle([d[f]].concat(pool.slice(0, 3)));
    return { q: stem + ' <b>' + esc(d.name) + '</b>?', options: choices, answer: choices.indexOf(d[f]),
      explain: '<p><b>' + esc(d.name) + '</b> — ' + D.FIELDS[f].toLowerCase() + ': ' + esc(d[f]) + '</p>' };
  }

  /* ================================================================ MED MATH */
  function viewCalc() {
    var st = { topics: {}, att: 0, cor: 0, streak: 0, p: null, checked: false };
    Object.keys(C.TOPICS).forEach(function (k) { st.topics[k] = true; });
    main.innerHTML = pageHead('#1e88e5', '<a href="#home">Home</a> / Medication Math', 'Medication Math', 'Unlimited, randomized problems. Choose the skills you want, answer with the units shown, and check your work against a step-by-step solution.') +
      '<div class="wrap" style="padding-block:24px 56px">' +
      '<div class="panel"><div class="setup-row"><div class="row-flex"><span class="lab-lbl">Skills to practice</span><span class="mini-links"><button data-all>All</button><button data-none>None</button></span></div><div class="check-grid" id="calc-topics">' +
      Object.keys(C.TOPICS).map(function (k) { return '<label class="ck" title="' + esc(C.TOPICS[k].desc) + '"><input type="checkbox" data-topic="' + k + '" checked>' + C.TOPICS[k].name + '</label>'; }).join('') + '</div></div>' +
      '<div class="lab-stats" style="margin-top:14px"><div><b id="cs-done">0</b><span>this session</span></div><div><b id="cs-pct">–</b><span>correct</span></div><div><b id="cs-streak">0</b><span>streak</span></div><div><b>' + pct(store.data.calc) + '</b><span>all-time accuracy</span></div></div></div>' +
      '<div class="calc-layout" style="margin-top:18px"><div class="panel" id="calc-card"></div>' +
      '<aside class="panel"><h3>Formula sheet</h3><div class="formula-list">' +
      '<div><b>Volume to give</b>' + C.frac('desired dose', 'concentration (per mL)') + ' = mL</div>' +
      '<div><b>Weight-based dose</b>dose/kg × weight (kg) — then check the maximum</div>' +
      '<div><b>Pounds to kilograms</b>lb ÷ 2.2 = kg</div>' +
      '<div><b>Percent solution</b>% × 10 = mg/mL<br>(% = grams per 100 mL)</div>' +
      '<div><b>Drip rate (gravity)</b>' + C.frac('mL × gtt/mL', 'minutes') + ' = gtt/min</div>' +
      '<div><b>Pump rate</b>' + C.frac('mL × 60', 'minutes') + ' = mL/hr</div>' +
      '<div><b>Infusion</b>' + C.frac('mcg/min × 60', 'mcg/mL') + ' = mL/hr</div>' +
      '<div><b>Metric</b>1 g = 1,000 mg · 1 mg = 1,000 mcg · 1 L = 1,000 mL</div>' +
      '</div></aside></div></div>';
    $('#calc-topics').addEventListener('change', function (e) { var t = e.target; if (t.dataset.topic) st.topics[t.dataset.topic] = t.checked; });
    $('.mini-links').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var on = b.hasAttribute('data-all');
      $all('#calc-topics input').forEach(function (i) { i.checked = on; st.topics[i.dataset.topic] = on; });
      if (on) next();
    });
    function topics() { return Object.keys(st.topics).filter(function (k) { return st.topics[k]; }); }
    function next() {
      var t = topics();
      if (!t.length) { $('#calc-card').innerHTML = '<p class="muted">Choose at least one skill above.</p>'; return; }
      st.p = C.generate(t); st.checked = false;
      var p = st.p, d = p.drug ? D.byId(p.drug) : null;
      $('#calc-card').innerHTML = '<div class="kicker" style="color:#1e88e5">' + C.TOPICS[p.topic].name + '</div>' +
        (d ? '<div style="margin:10px 0 14px">' + L.medCard(d) + '</div>' : '') +
        '<div class="calc-prompt">' + p.prompt + '</div>' +
        '<form class="ans-row" id="calc-form" autocomplete="off"><label class="sr-only" for="calc-in">Your answer</label><input id="calc-in" type="text" inputmode="decimal" placeholder="Answer"><span class="unit-tag">' + esc(p.unit) + '</span>' +
        '<button class="btn btn-primary" type="submit" id="calc-check">Check</button><button class="btn btn-ghost" type="button" id="calc-show">Show solution</button><button class="btn btn-navy" type="button" id="calc-next" hidden>Next problem →</button></form>' +
        '<div id="calc-fb"></div>';
      $('#calc-form').addEventListener('submit', function (e) { e.preventDefault(); if (st.checked) next(); else check(false); });
      $('#calc-show').addEventListener('click', function () { check(true); });
      $('#calc-next').addEventListener('click', next);
      $('#calc-in').focus({ preventScroll: true });
    }
    function check(reveal) {
      if (st.checked) return;
      var p = st.p, val = $('#calc-in').value, ok = C.check(p, val);
      if (!reveal && ok === null) { $('#calc-fb').innerHTML = '<p class="lf-mark bad" style="margin-top:10px">Enter a number first (or press “Show solution”).</p>'; return; }
      st.checked = true;
      if (!reveal || ok !== null) {
        st.att++; store.data.calc.att++;
        if (ok) { st.cor++; store.data.calc.cor++; st.streak++; } else st.streak = 0;
        store.save();
      }
      $('#calc-fb').innerHTML = '<div class="solution">' + (ok === null ? '' : '<span class="result-pill ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite — you entered ' + esc(val) + ' ' + esc(p.unit)) + '</span>') +
        '<p style="margin:12px 0 0"><b>Answer: ' + C.n(p.answer) + ' ' + esc(p.unit) + '</b></p><ol>' + p.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>';
      $('#calc-check').hidden = true; $('#calc-show').hidden = true; $('#calc-next').hidden = false; $('#calc-next').focus({ preventScroll: true });
      $('#cs-done').textContent = st.att; $('#cs-pct').textContent = st.att ? Math.round(st.cor / st.att * 100) + '%' : '–'; $('#cs-streak').textContent = st.streak;
    }
    next();
  }

  /* ================================================================ DRAW-UP component */
  var DRAW_TYPES = ['vial', 'ampule'];
  function drawTask() {
    for (var tries = 0; tries < 40; tries++) {
      if (Math.random() < 0.62) {
        var o = pick(C.ORDERS), dr = D.byId(o.d);
        if (DRAW_TYPES.indexOf(dr.label.type) < 0) continue;
        var dose = pick(o.doses), v = C.volumeFor(dr, dose, o.unit).vol;
        if (v > dr.label.vol + 1e-9 || v > 20 || v < 0.05) continue;
        return { drug: o.d, dose: dose, unit: o.unit, route: o.d === 'epi-im' ? 'IM' : 'IV' };
      }
      var w = pick(C.WB), d2 = D.byId(w.d);
      if (DRAW_TYPES.indexOf(d2.label.type) < 0) continue;
      var c = C.weightCase(w), v2 = C.volumeFor(d2, c.dose, w.unit).vol;
      if (v2 > d2.label.vol + 1e-9 || v2 > 20 || v2 < 0.05) continue;
      return { drug: w.d, dose: c.dose, unit: w.unit, route: /intranasal/.test(w.ctx) ? 'IN' : 'IV', patient: (w.who === 'child' ? 'Child' : 'Patient') + ' weighing ' + c.wtText + ' — ' + C.n(w.per) + ' ' + w.unit + '/kg ' + w.ctx, why: c.steps };
    }
    return { drug: 'fentanyl', dose: 50, unit: 'mcg', route: 'IV' };
  }

  // nearest line a student can actually draw to on the recommended syringe
  function measurable(target, size) {
    if (!size) return '';
    var m = Syringe.SIZES[size].minor, r = Math.round(target / m) * m;
    r = Math.round(r * 1000) / 1000;
    return Math.abs(r - target) > 1e-6 ? ' <span class="muted">→ draw to ' + C.n(r) + ' mL, the nearest ' + C.n(m) + ' mL line on a ' + size + ' mL syringe</span>' : '';
  }
  function DrawUp(host, task, opts) {
    opts = opts || {};
    var d = D.byId(task.drug), sol = C.volumeFor(d, task.dose, task.unit), target = sol.vol, syr = null, size = null, done = false;
    host.innerHTML =
      '<div class="order-card"><span class="lbl">Order</span><span class="ord">' + esc(shortName(d)) + ' ' + C.n(task.dose) + ' ' + esc(task.unit) + ' ' + esc(task.route || '') + '</span>' + (task.patient ? '<span class="muted">' + esc(task.patient) + '</span>' : '') + '</div>' +
      '<div style="margin-top:14px">' + L.medCard(d) + '</div>' +
      '<div class="draw-steps">' +
      '<div class="draw-step"><h3><span class="n">1</span>Calculate the volume <span class="hint">(optional)</span></h3><div class="ans-row" style="margin-top:0"><input class="du-calc" type="text" inputmode="decimal" placeholder="mL" aria-label="Your calculated volume in mL"><span class="unit-tag">mL</span></div></div>' +
      '<div class="draw-step"><h3><span class="n">2</span>Choose a syringe</h3><div class="syr-sizes">' + [1, 3, 5, 10, 20].map(function (s) { return '<button type="button" class="syr-size" data-size="' + s + '">' + s + ' mL</button>'; }).join('') + '</div></div>' +
      '<div class="draw-step"><h3><span class="n">3</span>Pull the plunger to your volume</h3><div class="syr-wrap"><div class="du-syr"><p class="muted" style="padding:28px;text-align:center;margin:0">Choose a syringe first.</p></div></div>' +
      '<p class="syr-help">Drag the plunger (or click the syringe and use the ← → keys; hold Shift for big steps). Read the volume at the <b style="color:#ef4444">red line</b> — the front edge of the rubber stopper.</p></div>' +
      '<div><button type="button" class="btn btn-primary du-check">Check my draw-up</button></div>' +
      '</div><div class="du-fb"></div>';
    $all('.syr-size', host).forEach(function (b) {
      b.addEventListener('click', function () {
        if (done) return;
        size = +b.dataset.size;
        $all('.syr-size', host).forEach(function (x) { x.classList.toggle('on', x === b); });
        if (!syr) syr = new Syringe($('.du-syr', host), { size: size, tint: d.label.color });
        else syr.setSize(size);
      });
    });
    $('.du-check', host).addEventListener('click', function () {
      if (done) return;
      if (!syr) { $('.du-fb', host).innerHTML = '<p class="lf-mark bad" style="margin-top:12px">Choose a syringe and draw up a volume first.</p>'; return; }
      done = true; syr.lock(true);
      $all('.syr-size', host).forEach(function (x) { x.disabled = true; });
      $('.du-check', host).hidden = true;
      var vol = syr.value, tol = Syringe.tolerance(size), best = Syringe.best(target);
      var okVol = Math.abs(vol - target) <= tol, fits = size >= target - 1e-9;
      var ok = okVol && fits;
      var conc = d.label.conc, labelUnit = d.label.concUnit.split('/')[0];
      var toMg = { mcg: 0.001, mg: 1, g: 1000, mEq: 1 };
      var given = vol * conc * (toMg[labelUnit] || 1) / (toMg[task.unit] || 1);
      var calcIn = $('.du-calc', host).value, calcOk = calcIn ? Math.abs(parseFloat(calcIn) - target) <= Math.max(0.011, target * 0.01) : null;
      var sizeMsg = !fits ? '✗ Too small — a ' + size + ' mL syringe cannot hold ' + C.n(target) + ' mL. Use a ' + best + ' mL syringe.' :
        size === best ? '✓ Good choice — the smallest syringe that holds the dose gives the most accurate measurement.' :
          '⚠ Works, but a ' + best + ' mL syringe would be more accurate (finer graduations).';
      var res = { ok: ok, vol: vol, target: target };
      $('.du-fb', host).innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct draw-up' : '✗ Not quite') + '</div>' +
        '<table class="fb-table"><tr><th>Correct volume</th><td><b>' + C.n(target) + ' mL</b>' + measurable(target, best) + '</td></tr>' +
        '<tr><th>You drew up</th><td>' + C.n(vol) + ' mL ' + (okVol ? '✓' : '✗ (needs to be within ' + C.n(Math.round(tol * 1000) / 1000) + ' mL on this syringe)') + '</td></tr>' +
        '<tr><th>Dose you would give</th><td>' + C.n(Math.round(given * 1000) / 1000) + ' ' + esc(task.unit) + ' (ordered ' + C.n(task.dose) + ' ' + esc(task.unit) + ')</td></tr>' +
        (calcIn ? '<tr><th>Your calculation</th><td>' + esc(calcIn) + ' mL ' + (calcOk ? '✓' : '✗') + '</td></tr>' : '') +
        '<tr><th>Syringe</th><td>' + sizeMsg + '</td></tr></table>' +
        '<div class="solution"><b>How to work it out</b><ol>' + (task.why || []).map(function (s) { return '<li>' + s + '</li>'; }).join('') + sol.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>' +
        (opts.nextLabel ? '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-navy du-next">' + opts.nextLabel + '</button></div>' : '') + '</div>';
      if (opts.nextLabel) $('.du-next', host).addEventListener('click', function () { opts.onNext && opts.onNext(res); });
      opts.onResult && opts.onResult(res);
    });
    return { target: target };
  }

  /* ================================================================ DRAW-UP LAB */
  function viewDrawup() {
    var st = { att: 0, cor: 0 };
    main.innerHTML = pageHead('#e0262b', '<a href="#home">Home</a> / Draw-Up Lab', 'Draw-Up Lab', 'Read the order and the label, work out the volume, pick the right syringe and pull the plunger to exactly that line. Every order is randomized.') +
      '<div class="wrap" style="padding-block:24px 56px"><div class="panel"><div class="lab-stats" style="border:0;padding:0"><div><b id="du-done">0</b><span>this session</span></div><div><b id="du-pct">–</b><span>correct</span></div><div><b>' + pct(store.data.draw) + '</b><span>all-time accuracy</span></div><div><b>5</b><span>syringe sizes</span></div></div></div>' +
      '<div class="panel" style="margin-top:18px" id="du-host"></div></div>';
    function next() {
      DrawUp($('#du-host'), drawTask(), {
        nextLabel: 'Next order →', onNext: next,
        onResult: function (r) {
          st.att++; store.data.draw.att++; if (r.ok) { st.cor++; store.data.draw.cor++; } store.save();
          $('#du-done').textContent = st.att; $('#du-pct').textContent = Math.round(st.cor / st.att * 100) + '%';
        }
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    next();
  }

  /* ================================================================ SCENARIOS */
  function viewScenarios() {
    main.innerHTML = pageHead('#f08a1c', '<a href="#home">Home</a> / Scenarios', 'Practice Scenarios', 'Work through real-world calls step by step: choose the drug, do the math and draw it up. You get feedback after every step.') +
      '<section class="section"><div class="wrap"><div class="scn-grid">' + SCN.map(function (s) {
        var cat = D.CATS[s.cat], best = store.data.scen[s.id];
        return '<a class="scn-card" href="#s-' + s.id + '" style="--c:' + cat.color + '"><div class="scn-meta"><span style="color:' + cat.color + '">' + cat.name + '</span><span>' + s.level + '</span></div><h3>' + esc(s.title) + '</h3><p>' + esc(s.setting) + '</p>' +
          '<div class="scn-meta"><span>' + s.steps.length + ' steps</span><span>' + (best != null ? 'Best ' + best + '%' : 'Not started') + '</span></div></a>';
      }).join('') + '</div></div></section>';
  }

  function viewScenario(id) {
    var s = SCN.filter(function (x) { return x.id === id; })[0];
    if (!s) return notFound();
    var cat = D.CATS[s.cat], i = 0, results = [];
    main.innerHTML = pageHead(cat.color, '<a href="#home">Home</a> / <a href="#scenarios">Scenarios</a> / ' + esc(s.title), esc(s.title), esc(s.setting)) +
      '<div class="wrap" style="padding-block:24px 56px;max-width:1000px"><div class="panel"><div class="kicker" style="color:' + cat.color + '">Patient</div><div class="vitals">' +
      Object.keys(s.vitals).map(function (k) { return '<div class="vital"><b>' + esc(k) + '</b><span>' + esc(s.vitals[k]) + '</span></div>'; }).join('') + '</div>' +
      '<div class="stepper" id="stepper">' + s.steps.map(function () { return '<i></i>'; }).join('') + '</div></div>' +
      '<div class="panel" style="margin-top:18px" id="step-host"></div></div>';
    function stepper() { $all('#stepper i').forEach(function (el, k) { el.className = k < results.length ? (results[k] ? 'done-ok' : 'done-bad') : k === i ? 'cur' : ''; }); }
    function nextBtn() { return '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn btn-primary" id="step-next">' + (i === s.steps.length - 1 ? 'Finish scenario' : 'Next step →') + '</button></div>'; }
    function wireNext() { $('#step-next').addEventListener('click', function () { i++; render(); }); $('#step-next').focus({ preventScroll: true }); }
    function render() {
      stepper();
      if (i >= s.steps.length) return finish();
      var st = s.steps[i], host = $('#step-host');
      var head = '<div class="kicker" style="color:' + cat.color + '">Step ' + (i + 1) + ' of ' + s.steps.length + '</div>';
      if (st.type === 'mc') {
        host.innerHTML = head + '<h3 style="font-size:1.15rem;margin-top:6px">' + esc(st.q) + '</h3><div class="options">' + st.options.map(function (o, k) { return '<button class="option" data-k="' + k + '"><span class="key">' + (k + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div><div id="step-fb"></div>';
        $all('.option', host).forEach(function (b) {
          b.addEventListener('click', function () {
            if (results.length > i) return;
            var k = +b.dataset.k, ok = k === st.answer; results.push(ok);
            $all('.option', host).forEach(function (x) { x.disabled = true; var kk = +x.dataset.k; if (kk === st.answer) x.classList.add('correct'); else if (kk === k) x.classList.add('wrong'); });
            $('#step-fb').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div><p style="margin:0">' + st.explain + '</p>' + nextBtn() + '</div>';
            stepper(); wireNext();
          });
        });
      } else if (st.type === 'num') {
        host.innerHTML = head + '<h3 style="font-size:1.15rem;margin-top:6px">' + st.q + '</h3><form class="ans-row" id="num-form" autocomplete="off"><input id="num-in" type="text" inputmode="decimal" placeholder="Answer" aria-label="Your answer"><span class="unit-tag">' + esc(st.unit) + '</span><button class="btn btn-primary" type="submit">Check</button></form><div id="step-fb"></div>';
        $('#num-in').focus({ preventScroll: true });
        $('#num-form').addEventListener('submit', function (e) {
          e.preventDefault(); if (results.length > i) return;
          var v = parseFloat($('#num-in').value.replace(/,/g, ''));
          if (isNaN(v)) { $('#step-fb').innerHTML = '<p class="lf-mark bad">Enter a number.</p>'; return; }
          var ok = Math.abs(v - st.answer) <= (st.tol || 0) + 1e-9; results.push(ok);
          $('#num-in').disabled = true;
          $('#step-fb').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite — the answer is ' + C.n(st.answer) + ' ' + esc(st.unit)) + '</div><p style="margin:0">' + st.explain + '</p>' + nextBtn() + '</div>';
          stepper(); wireNext();
        });
      } else {
        host.innerHTML = head + '<h3 style="font-size:1.15rem;margin-top:6px">' + esc(st.q) + '</h3><div id="draw-host"></div>';
        DrawUp($('#draw-host'), { drug: st.drug, dose: st.dose, unit: st.unit, route: '' }, {
          nextLabel: i === s.steps.length - 1 ? 'Finish scenario' : 'Next step →',
          onResult: function (r) { results.push(r.ok); stepper(); },
          onNext: function () { i++; render(); }
        });
      }
      window.scrollTo({ top: $('#step-host').getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    }
    function finish() {
      var score = results.filter(Boolean).length, p = Math.round(score / results.length * 100);
      if (!(store.data.scen[s.id] >= p)) { store.data.scen[s.id] = p; store.save(); }
      var nextS = SCN[(SCN.indexOf(s) + 1) % SCN.length];
      $('#step-host').innerHTML = '<div class="result"><div class="ring" style="--p:' + p + ';--rc:' + (p >= 80 ? 'var(--ok)' : 'var(--red)') + '"><div>' + p + '%</div></div><h2>' + (p === 100 ? 'Flawless run!' : p >= 80 ? 'Well managed' : 'Review and try again') + '</h2>' +
        '<p class="muted">' + score + ' of ' + results.length + ' steps correct on the first attempt.</p>' +
        '<div class="hero-cta" style="justify-content:center"><button class="btn btn-ghost" id="scn-retry">Run it again</button><a class="btn btn-primary" href="#s-' + nextS.id + '">Next scenario: ' + esc(nextS.title) + ' →</a></div></div>';
      $('#scn-retry').addEventListener('click', function () { route(); });
    }
    onKey(function (e) {
      if (typing(e)) return;
      var opts = $all('#step-host .option:not(:disabled)');
      if (opts.length && /^[1-4]$/.test(e.key)) { var b = opts[+e.key - 1]; if (b) b.click(); }
    });
    render();
  }

  /* ================================================================ EXAM */
  var CURATED = [
    { q: 'A patient with chest pain took tadalafil (Cialis) 30 hours ago. Which medication is contraindicated?', options: ['Aspirin', 'Nitroglycerin', 'Oxygen', 'Ondansetron'], answer: 1, explain: 'Nitrates are contraindicated within 48 hours of tadalafil (24 hours for sildenafil/vardenafil) because of severe hypotension.' },
    { q: 'Adenosine is contraindicated in which patient?', options: ['Regular narrow-complex tachycardia at 190', 'Third-degree AV block without a pacemaker', 'Hypertension', 'Age over 65'], answer: 1, explain: 'Adenosine blocks the AV node — avoid in 2nd/3rd-degree block or sick sinus syndrome without a pacemaker.' },
    { q: 'Succinylcholine is contraindicated in which patient because of hyperkalemia risk?', options: ['Acute asthma', 'A burn injury 4 days old', 'An isolated wrist fracture', 'Hypertension'], answer: 1, explain: 'Burns or crush injuries older than about 24 hours, neuromuscular disease and renal failure increase the risk of life-threatening hyperkalemia.' },
    { q: 'Diltiazem should be avoided in which rhythm?', options: ['A-fib with RVR in a stable patient', 'A-fib with WPW (pre-excitation)', 'Sinus rhythm', 'Atrial flutter with RVR'], answer: 1, explain: 'AV-nodal blockers in pre-excited A-fib can accelerate conduction down the accessory pathway and cause VF.' },
    { q: 'Atropine is unlikely to work for bradycardia in which patient?', options: ['Sinus bradycardia after vomiting', 'A heart-transplant recipient', 'An inferior MI with sinus bradycardia', 'A vagal reaction'], answer: 1, explain: 'A transplanted heart has no vagal innervation, so a vagolytic drug has no effect. Atropine is also often ineffective for Mobitz II and 3rd-degree block with wide QRS.' },
    { q: 'Which two drugs must never be given in the same IV line without flushing?', options: ['Sodium bicarbonate and calcium chloride', 'Normal saline and dextrose', 'Fentanyl and ondansetron', 'Adenosine and saline'], answer: 0, explain: 'Calcium and bicarbonate form calcium carbonate precipitate. Bicarbonate also inactivates catecholamines.' },
    { q: 'Epinephrine 1 mg/mL is given for anaphylaxis by which route?', options: ['IV push', 'IM into the anterolateral thigh', 'Subcutaneous in the deltoid', 'Nebulized'], answer: 1, explain: 'IM into the anterolateral thigh gives the fastest, most reliable absorption. 1 mg/mL must never be given IV push.' },
    { q: 'Why can a patient who wakes after naloxone stop breathing again later?', options: ['Naloxone is converted into an opioid', 'Naloxone wears off (30–90 min) before many opioids do', 'Naloxone causes allergic reactions', 'Naloxone lowers blood glucose'], answer: 1, explain: 'Re-sedation occurs when naloxone’s shorter duration ends while the opioid is still active.' },
    { q: 'Which is required before giving oral glucose?', options: ['IV access', 'The patient can swallow and protect the airway', 'A blood glucose below 40', 'Medical direction contact'], answer: 1, explain: 'Oral glucose is only for patients who are awake enough to swallow without aspiration risk.' },
    { q: 'Which adverse effect is most associated with ondansetron?', options: ['QT prolongation', 'Hyperkalemia', 'Bronchospasm', 'Hypoglycemia'], answer: 0, explain: 'Ondansetron can prolong the QT interval — avoid in congenital long QT syndrome.' },
    { q: 'Morphine causes hypotension and itching mainly through:', options: ['Beta-blockade', 'Histamine release', 'Calcium-channel blockade', 'Alpha-agonism'], answer: 1, explain: 'Morphine releases histamine (vasodilation, pruritus); fentanyl causes much less.' },
    { q: 'Which side effect is characteristic of ketamine?', options: ['Emergence reactions (vivid dreams, hallucinations)', 'Severe hypotension', 'Bronchospasm', 'Loss of airway reflexes at analgesic doses'], answer: 0, explain: 'Ketamine preserves airway reflexes and blood pressure but can cause emergence reactions and hypersalivation.' },
    { q: 'An early sign of magnesium toxicity is:', options: ['Hyperactive reflexes', 'Loss of deep-tendon reflexes', 'Hypertension', 'Tachycardia'], answer: 1, explain: 'Loss of reflexes precedes respiratory depression. Treat with calcium.' },
    { q: 'Tranexamic acid should be given within what time after injury?', options: ['1 hour', '3 hours', '12 hours', '24 hours'], answer: 1, explain: 'TXA is most effective early and should be started within 3 hours of injury.' },
    { q: 'After giving rocuronium for RSI, what must you also ensure?', options: ['Nothing — it sedates the patient', 'Ongoing sedation and analgesia, because paralytics provide neither', 'A naloxone drip', 'Oral glucose'], answer: 1, explain: 'Neuromuscular blockers paralyze but do not sedate. An awake, paralyzed patient is a never-event.' },
    { q: 'Calcium chloride should be used with caution in which patient?', options: ['Hyperkalemia with peaked T waves', 'Digoxin toxicity', 'Calcium-channel blocker overdose', 'Hypocalcemia'], answer: 1, explain: 'Calcium may worsen digoxin-induced dysrhythmias.' }
  ];

  function viewExam() {
    var items = [];
    var cur = shuffle(CURATED).slice(0, 5).map(function (c) { return { type: 'mc', q: esc(c.q), options: c.options, answer: c.answer, explain: '<p>' + c.explain + '</p>', topic: 'Drug knowledge' }; });
    var auto = shuffle(D.DRUGS).slice(0, 5).map(function (d) { var f = pick(MC_FIELDS); var m = mcFor(d, f); return { type: 'mc', q: m.q, options: m.options, answer: m.answer, explain: m.explain, topic: 'Drug knowledge' }; });
    var topics = Object.keys(C.TOPICS);
    var calcs = shuffle(topics.concat(topics)).slice(0, 7).map(function (t) { return { type: 'calc', p: C.generate([t]), topic: C.TOPICS[t].name }; });
    var draws = [0, 1, 2].map(function () { return { type: 'draw', task: drawTask(), topic: 'Draw-up' }; });
    items = shuffle(cur.concat(auto, calcs, draws));
    var N = items.length, i = 0, score = 0, missed = [];
    main.innerHTML = pageHead('#1b2a5b', '<a href="#home">Home</a> / Exam', 'Pharmacology Exam', N + ' questions: drug knowledge, medication math and draw-ups. Pass mark 80%.') +
      '<div class="wrap quiz-shell" id="exam"></div>';
    var root = $('#exam');
    function top() {
      return '<div class="quiz-top"><div class="quiz-progress"><div class="lbl"><span>Question ' + (i + 1) + ' of ' + N + ' · ' + items[i].topic + '</span><span>Score ' + score + '/' + i + '</span></div><div class="progress" style="--c:#1b2a5b"><i style="width:' + (i / N * 100) + '%"></i></div></div><a class="btn btn-ghost btn-sm" href="#home">Exit</a></div>';
    }
    function record(ok, label) { if (ok) score++; else missed.push(label); }
    function nextBtn(target) { target.insertAdjacentHTML('beforeend', '<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-primary" id="ex-next">' + (i === N - 1 ? 'See results' : 'Next question →') + '</button></div>'); $('#ex-next').addEventListener('click', function () { cleanupItem(); i++; render(); }); $('#ex-next').focus({ preventScroll: true }); }
    var itemCleanup = [];
    function cleanupItem() { itemCleanup.forEach(function (f) { f(); }); itemCleanup = []; }
    function render() {
      if (i >= N) return finish();
      var it = items[i];
      if (it.type === 'mc') {
        root.innerHTML = top() + '<div class="panel"><h3 style="font-size:1.15rem">' + it.q + '</h3><div class="options">' + it.options.map(function (o, k) { return '<button class="option" data-k="' + k + '"><span class="key">' + (k + 1) + '</span>' + esc(o) + '</button>'; }).join('') + '</div><div id="ex-fb"></div></div>';
        $all('.option', root).forEach(function (b) {
          b.addEventListener('click', function () {
            if ($('#ex-next')) return;
            var k = +b.dataset.k, ok = k === it.answer; record(ok, it.q.replace(/<[^>]+>/g, ''));
            $all('.option', root).forEach(function (x) { x.disabled = true; var kk = +x.dataset.k; if (kk === it.answer) x.classList.add('correct'); else if (kk === k) x.classList.add('wrong'); });
            $('#ex-fb').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div>' + it.explain + '</div>';
            nextBtn($('#ex-fb .explain'));
          });
        });
      } else if (it.type === 'calc') {
        var p = it.p, d = p.drug ? D.byId(p.drug) : null;
        root.innerHTML = top() + '<div class="panel">' + (d ? '<div style="margin-bottom:14px">' + L.medCard(d) + '</div>' : '') + '<div class="calc-prompt">' + p.prompt + '</div>' +
          '<form class="ans-row" id="ex-form" autocomplete="off"><input id="ex-in" type="text" inputmode="decimal" placeholder="Answer" aria-label="Your answer"><span class="unit-tag">' + esc(p.unit) + '</span><button class="btn btn-primary" type="submit">Submit</button></form><div id="ex-fb"></div></div>';
        $('#ex-in').focus({ preventScroll: true });
        $('#ex-form').addEventListener('submit', function (e) {
          e.preventDefault(); if ($('#ex-next')) return;
          var ok = C.check(p, $('#ex-in').value);
          if (ok === null) { $('#ex-fb').innerHTML = '<p class="lf-mark bad">Enter a number.</p>'; return; }
          record(ok, it.topic + ': ' + p.prompt.replace(/<[^>]+>/g, '').slice(0, 90) + '…');
          $('#ex-in').disabled = true;
          $('#ex-fb').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + ' — ' + C.n(p.answer) + ' ' + esc(p.unit) + '</div><ol>' + p.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol></div>';
          nextBtn($('#ex-fb .explain'));
        });
      } else {
        root.innerHTML = top() + '<div class="panel" id="ex-draw"></div>';
        var dd = D.byId(it.task.drug);
        DrawUp($('#ex-draw'), it.task, {
          nextLabel: i === N - 1 ? 'See results' : 'Next question →',
          onResult: function (r) { record(r.ok, 'Draw-up: ' + shortName(dd) + ' ' + C.n(it.task.dose) + ' ' + it.task.unit); },
          onNext: function () { i++; render(); }
        });
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function finish() {
      var p = Math.round(score / N * 100), pass = p >= 80;
      if (!(store.data.exam >= p)) { store.data.exam = p; store.save(); }
      root.innerHTML = '<div class="panel result"><div class="ring" style="--p:' + p + ';--rc:' + (pass ? 'var(--ok)' : 'var(--red)') + '"><div>' + p + '%</div></div><h2>' + (pass ? 'Passed — well done!' : 'Keep practicing') + '</h2><p class="muted">' + score + ' of ' + N + ' correct. ' + (pass ? '' : 'A score of 80% is needed to pass.') + '</p>' +
        (missed.length ? '<div class="review-list"><h3>Review these</h3><ul>' + missed.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<div class="hero-cta" style="justify-content:center"><button class="btn btn-primary" id="ex-retry">New exam</button><a class="btn btn-ghost" href="#calc">Practice med math</a><a class="btn btn-ghost" href="#cards">Flashcards</a></div></div>';
      $('#ex-retry').addEventListener('click', function () { route(); });
    }
    onKey(function (e) {
      if (typing(e)) return;
      var opts = $all('#exam .option:not(:disabled)');
      if (opts.length && /^[1-4]$/.test(e.key)) { var b = opts[+e.key - 1]; if (b) b.click(); }
    });
    render();
  }

  /* ================================================================ DRUG REFERENCE */
  function viewDrugs() {
    main.innerHTML = pageHead('#3a9b3f', '<a href="#home">Home</a> / Drug Reference', 'Drug Reference', D.DRUGS.length + ' paramedic medications with indications, contraindications, doses and simulated labels.') +
      '<section class="section"><div class="wrap"><input class="search-box" id="drug-q" type="search" placeholder="Search drugs, classes or indications…" aria-label="Search drugs"><div id="drug-list" style="margin-top:20px"></div></div></section>';
    function render(q) {
      q = (q || '').toLowerCase();
      var html = Object.keys(D.CATS).map(function (k) {
        var list = D.DRUGS.filter(function (d) { return d.cat[0] === k && (!q || JSON.stringify([d.name, d.trade, d.cls, d.ind]).toLowerCase().indexOf(q) >= 0); });
        if (!list.length) return '';
        return '<h2 style="font-size:1.25rem;margin:22px 0 12px;border-left:5px solid ' + D.CATS[k].color + ';padding-left:10px">' + D.CATS[k].name + '</h2><div class="drug-grid">' +
          list.map(function (d) { return '<a class="drug-tile" href="#d-' + d.id + '">' + L.containerSvg(d) + '<div><b>' + esc(d.name) + '</b><span>' + esc(d.cls) + '</span></div></a>'; }).join('') + '</div>';
      }).join('');
      $('#drug-list').innerHTML = html || '<p class="muted">No drugs match “' + esc(q) + '”.</p>';
    }
    $('#drug-q').addEventListener('input', function () { render(this.value); });
    render('');
  }

  function viewDrug(id) {
    var d = D.byId(id); if (!d) return notFound();
    var k = d.cat[0];
    main.innerHTML = pageHead(D.CATS[k].color, '<a href="#home">Home</a> / <a href="#drugs">Drug Reference</a> / ' + esc(d.name), esc(d.name), esc(d.cls) + (d.trade && d.trade !== '—' ? ' · ' + esc(d.trade) : '')) +
      '<div class="wrap" style="padding-block:24px 56px"><div class="panel">' + d.cat.map(function (c) { return '<span class="cat-chip" style="--c:' + D.CATS[c].color + '">' + D.CATS[c].name + '</span>'; }).join('') + (d.schedule ? '<span class="cat-chip" style="--c:#0f172a">Schedule ' + d.schedule.slice(1) + '</span>' : '') +
      '<div style="margin:12px 0 18px">' + L.medCard(d) + '</div><dl class="mono">' +
      Object.keys(D.FIELDS).map(function (f) { return '<dt>' + D.FIELDS[f] + '</dt><dd>' + listHtml(d[f]) + '</dd>'; }).join('') +
      '<dt>Clinical pearls</dt><dd>' + listHtml(d.pearls || []) + '</dd></dl><p class="protocol-note">General educational information — always follow your local protocols and medical direction.</p></div>' +
      '<div class="pager"><a class="btn btn-ghost" href="#drugs">← All drugs</a><a class="btn btn-primary" href="#cards">Study with flashcards →</a></div></div>';
  }

  function notFound() { main.innerHTML = pageHead('#1b2a5b', '<a href="#home">Home</a>', 'Page not found', 'That page doesn’t exist.', '<a class="btn btn-primary" href="#home">Home</a>'); }

  /* ================================================================ router */
  function route() {
    if (location.hash === '#main') return;
    cleanup.forEach(function (f) { f(); }); cleanup = [];
    var h = location.hash.replace(/^#\/?/, '') || 'home', nav = h;
    if (h === 'home') viewHome();
    else if (h === 'cards') viewCards();
    else if (h === 'calc') viewCalc();
    else if (h === 'drawup') viewDrawup();
    else if (h === 'scenarios') viewScenarios();
    else if (h.indexOf('s-') === 0) { nav = 'scenarios'; viewScenario(h.slice(2)); }
    else if (h === 'exam') viewExam();
    else if (h === 'drugs') viewDrugs();
    else if (h.indexOf('d-') === 0) { nav = 'drugs'; viewDrug(h.slice(2)); }
    else notFound();
    $all('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
    $('.site-nav').classList.remove('open');
    window.scrollTo(0, 0);
    var t = { home: 'Pharmacology Trainer', cards: 'Flashcards', calc: 'Medication Math', drawup: 'Draw-Up Lab', scenarios: 'Scenarios', exam: 'Exam', drugs: 'Drug Reference' }[nav] || 'Pharmacology Trainer';
    document.title = t + ' · CSHealthED';
  }
  window.addEventListener('hashchange', route);
  $('.nav-toggle').addEventListener('click', function () { var n = $('.site-nav'); n.classList.toggle('open'); this.setAttribute('aria-expanded', n.classList.contains('open')); });
  $('#reset-progress').addEventListener('click', function () {
    var b = this;
    if (b.dataset.armed) { store.reset(); delete b.dataset.armed; b.textContent = 'Progress reset'; route(); setTimeout(function () { b.textContent = 'Reset my progress'; }, 2500); return; }
    b.dataset.armed = '1'; b.textContent = 'Click again to erase all progress';
    setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Reset my progress'; } }, 4000);
  });

  /* theme: follows the device until the user picks; shared key with the ECG Trainer */
  function isDark() { var t = document.documentElement.getAttribute('data-theme'); if (t) return t === 'dark'; return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function syncTheme() { var dark = isDark(), b = $('#theme-toggle'); b.classList.toggle('is-dark', dark); var l = dark ? 'Switch to light mode' : 'Switch to dark mode'; b.setAttribute('aria-label', l); b.title = l; }
  $('#theme-toggle').addEventListener('click', function () { var n = isDark() ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', n); try { localStorage.setItem('cshealthed-theme', n); } catch (e) { /* ignore */ } syncTheme(); });
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', syncTheme); }
  syncTheme();

  $('#year').textContent = new Date().getFullYear();
  route();
})();
