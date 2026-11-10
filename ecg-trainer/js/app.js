/* CSHealthED ECG Trainer — application (hash-routed single page app) */
(function () {
  'use strict';

  var MODULES = ECGContent.MODULES;
  var RHYTHMS = ECGContent.RHYTHMS;
  var main = document.getElementById('main');
  var cleanup = [];

  /* ------------------------------------------------------------ utils */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function seed() { return Math.floor(Math.random() * 1e9); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function moduleById(id) { return MODULES.filter(function (m) { return m.id === id; })[0]; }
  function onResize(fn) {
    var t;
    function h() { clearTimeout(t); t = setTimeout(fn, 120); }
    window.addEventListener('resize', h);
    cleanup.push(function () { clearTimeout(t); window.removeEventListener('resize', h); });
  }
  var ALL_RHYTHMS = [];
  MODULES.forEach(function (m) { (m.rhythms || []).forEach(function (r) { ALL_RHYTHMS.push(r); }); });

  /* ------------------------------------------------------------ progress */
  var KEY = 'cshealthed-ecg-v1';
  var store = (function () {
    var data = { viewed: {}, quiz: {}, lessons: {}, lab: { attempted: 0, correct: 0, best: 0 } };
    try { var raw = localStorage.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
    return {
      data: data,
      view: function (id) { if (!data.viewed[id]) { data.viewed[id] = true; save(); } },
      lesson: function (id) { if (!data.lessons[id]) { data.lessons[id] = true; save(); } },
      score: function (mod, pct) { if (!(data.quiz[mod] >= pct)) { data.quiz[mod] = pct; save(); } },
      save: save,
      reset: function () { data.viewed = {}; data.quiz = {}; data.lessons = {}; data.lab = { attempted: 0, correct: 0, best: 0 }; save(); }
    };
  })();

  function moduleProgress(m) {
    if (m.lesson) return store.data.lessons[m.id] ? 1 : 0;
    if (m.exam) return store.data.quiz.exam != null ? Math.min(1, store.data.quiz.exam / 80) : 0;
    var seen = m.rhythms.filter(function (r) { return store.data.viewed[r]; }).length;
    var quiz = store.data.quiz[m.id] >= 80 ? 1 : 0;
    return (seen + quiz) / (m.rhythms.length + 1);
  }

  /* ------------------------------------------------------------ icons */
  var ICON = {
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/><path d="M3.5 12h4l2-3 3 6 2-3h6"/></svg>',
    atrial: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 14l3-4 3 4 3-4 3 4 3-4 3 4 2-2"/></svg>',
    junction: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="3"/><path d="M12 9v5M12 14l-6 6M12 14l6 6"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
    block: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h6M16 12h6"/><rect x="8" y="7" width="8" height="10" rx="2"/><path d="M10 10l4 4M14 10l-4 4"/></svg>',
    pacer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="10" rx="3"/><path d="M13 12h3l2-6v12l2-6h2"/></svg>',
    trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    caliper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18M18 3v18M6 12h12"/><path d="M9 9l-3 3 3 3M15 9l3 3-3 3"/></svg>',
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 17h4M3 17V7a1 1 0 0 1 1-1h10v11M14 9h4l3 4v4h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M7 9v4M5 11h4"/></svg>'
  };

  /* ------------------------------------------------------------ audio */
  var audioCtx = null;
  function beep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = 960;
      g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.09);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.1);
    } catch (e) { /* no audio */ }
  }

  function hrFromBeat(sig, q) {
    var qs = sig.qrsTimes, i = qs.indexOf(q);
    if (i < 1) return null;
    var n = Math.min(4, i), sum = qs[i] - qs[i - n];
    return Math.round((60 * n) / sum);
  }

  /* ------------------------------------------------------------ strip viewer */
  function StripViewer(host, opts) {
    opts = opts || {};
    var st = { id: opts.rhythm, seed: opts.seed || seed(), lead: opts.lead || 'II', mode: 'paper', cal: false, sound: false };
    var paperSig, monSig, monitor = null, calipers, info, lastBeat = 0, hrTimer;
    host.innerHTML =
      '<div class="toolbar">' +
      '<div class="seg" role="group" aria-label="Lead">' + ['I', 'II', 'III', 'All'].map(function (l) {
        return '<button data-lead="' + l + '" class="' + (l === st.lead ? 'on' : '') + '">' + (l === 'All' ? 'All 3 leads' : 'Lead ' + l) + '</button>';
      }).join('') + '</div>' +
      '<div class="seg" role="group" aria-label="View"><button data-mode="paper" class="on">Paper strip</button><button data-mode="monitor">Live monitor</button></div>' +
      '<span class="spacer"></span>' +
      '<button class="tool-btn" data-act="cal" title="Drag across the strip to measure">' + ICON.caliper + 'Calipers</button>' +
      '<button class="tool-btn" data-act="sound" title="QRS tone" hidden>' + ICON.sound + 'Tone</button>' +
      '<button class="tool-btn" data-act="new" title="Generate a new strip of this rhythm"' + (opts.hideNew ? ' hidden' : '') + '>' + ICON.refresh + 'New strip</button>' +
      '</div>' +
      '<div class="strip-wrap"><canvas aria-label="ECG rhythm strip" role="img"></canvas><div class="monitor-hr" hidden></div></div>' +
      '<div class="strip-caption"></div>';
    var wrap = $('.strip-wrap', host), canvas = $('canvas', host), cap = $('.strip-caption', host), hrEl = $('.monitor-hr', host);

    calipers = ECGRender.attachCalipers(wrap, canvas, function () { return st.mode === 'paper' ? info : null; });

    function leads() { return st.lead === 'All' ? ['I', 'II', 'III'] : [st.lead]; }
    function build() {
      paperSig = ECGEngine.generate(st.id, st.seed, 6.2, opts.genOpts);
      monSig = null;
    }
    function caption() {
      if (opts.hideCaption && !st.revealed) {
        cap.innerHTML = '<span class="hint">Tip: use <b>Calipers</b> to measure intervals · switch leads to confirm what you see.</span>';
        return;
      }
      var s = paperSig, parts = [];
      if (s.id !== 'vf' && s.id !== 'asystole' && s.id !== 'torsades') {
        parts.push('<span class="chip">' + ICON.search.replace('<svg', '<svg width="14" height="14"') + ' 6-second count: ' + s.sixSecondCount + ' × 10 = ' + s.sixSecondCount * 10 + '/min</span>');
        if (s.measuredRate) parts.push('<span class="chip teal">Average ventricular rate ≈ ' + s.measuredRate + '/min</span>');
      }
      if (s.meta.note) parts.push('<span class="hint">' + esc(s.meta.note) + '</span>');
      cap.innerHTML = parts.join(' ');
    }
    function stopMonitor() { if (monitor) { monitor.stop(); monitor = null; } clearInterval(hrTimer); }
    function draw() {
      if (st.mode === 'paper') {
        stopMonitor();
        wrap.classList.remove('monitor');
        hrEl.hidden = true;
        info = ECGRender.drawStrip(canvas, paperSig, { leads: leads(), mode: 'paper' });
      } else {
        wrap.classList.add('monitor');
        if (!monSig) monSig = ECGEngine.generate(st.id, st.seed, 60, opts.genOpts);
        stopMonitor();
        calipers.clear();
        hrEl.hidden = !!opts.hideHR;
        hrEl.innerHTML = '---<small>bpm</small>';
        monitor = new ECGRender.Monitor(canvas, monSig, {
          leads: leads(),
          onBeat: function (q) {
            lastBeat = performance.now();
            var hr = hrFromBeat(monSig, q);
            if (hr) hrEl.innerHTML = hr + '<small>bpm</small>';
            if (st.sound) beep();
          }
        });
        monitor.start();
        hrTimer = setInterval(function () { if (performance.now() - lastBeat > 3200) hrEl.innerHTML = '---<small>bpm</small>'; }, 500);
      }
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || !host.contains(b)) return;
      if (b.dataset.lead) {
        st.lead = b.dataset.lead;
        $all('[data-lead]', host).forEach(function (x) { x.classList.toggle('on', x === b); });
        calipers.clear();
        if (st.mode === 'monitor') monitor.opts.leads = leads(); else draw();
      } else if (b.dataset.mode) {
        st.mode = b.dataset.mode;
        $all('[data-mode]', host).forEach(function (x) { x.classList.toggle('on', x === b); });
        $('[data-act="cal"]', host).hidden = st.mode !== 'paper';
        $('[data-act="sound"]', host).hidden = st.mode !== 'monitor';
        draw();
      } else if (b.dataset.act === 'cal') {
        st.cal = !st.cal;
        b.classList.toggle('on', st.cal);
        wrap.classList.toggle('calipers-on', st.cal);
        if (!st.cal) calipers.clear();
      } else if (b.dataset.act === 'sound') {
        st.sound = !st.sound;
        b.classList.toggle('on', st.sound);
        if (st.sound) beep();
      } else if (b.dataset.act === 'new') {
        st.seed = seed();
        calipers.clear();
        build(); draw(); caption();
      }
    });

    build(); draw(); caption();
    onResize(function () { if (st.mode === 'paper') { calipers.clear(); draw(); } });
    cleanup.push(stopMonitor);

    return {
      set: function (id) { st.id = id; st.seed = seed(); st.revealed = false; calipers.clear(); build(); draw(); caption(); },
      reveal: function () { st.revealed = true; caption(); },
      sig: function () { return paperSig; },
      destroy: stopMonitor
    };
  }

  /* ------------------------------------------------------------ shared bits */
  function pageHead(color, crumbs, title, sub, right) {
    return '<section class="page-head" style="--c:' + color + '"><div class="wrap"><div class="head-row"><div>' +
      '<div class="crumbs">' + crumbs + '</div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (right || '') + '</div></div></section>';
  }

  function criteriaTable(r) {
    var c = r.criteria;
    var rows = [['Rate', c.rate], ['Rhythm', c.regularity], ['P waves', c.p], ['PR interval', c.pr], ['QRS', c.qrs]];
    return '<table class="criteria">' + rows.map(function (x, i) {
      return '<tr><th><span class="stepn">' + (i + 1) + '</span>' + x[0] + '</th><td>' + esc(x[1]) + '</td></tr>';
    }).join('') + '</table>';
  }

  function moduleCard(m) {
    var p = Math.round(moduleProgress(m) * 100);
    var href = m.exam ? '#q-exam' : '#m-' + m.id;
    var count = m.lesson ? 'Core lesson' : m.exam ? (ALL_RHYTHMS.length + ' rhythms · 20 questions') : (m.rhythms.length + ' rhythms + quiz');
    var best = store.data.quiz[m.id];
    return '<a class="module-card" href="' + href + '" style="--c:' + m.color + '"><div class="band"></div><div class="body">' +
      '<div class="num"><span class="icon-badge">' + ICON[m.icon] + '</span>Module ' + m.num + '</div>' +
      '<h3>' + m.title + '</h3><p>' + m.tagline + '</p>' +
      '<div class="progress"><i style="width:' + p + '%"></i></div>' +
      '<div class="card-meta"><span>' + count + '</span><span>' + (best != null ? 'Best ' + best + '%' : p + '%') + '</span></div>' +
      '</div></a>';
  }

  /* ------------------------------------------------------------ HOME */
  function viewHome() {
    var teaser = [['nsr', 'Sinus'], ['afib', 'A-Fib'], ['flutter', 'Flutter'], ['chb', '3° Block'], ['vt', 'V-Tach'], ['vf', 'V-Fib']];
    main.innerHTML =
      '<section class="hero"><div class="wrap hero-grid"><div>' +
      '<div class="eyebrow">Paramedic ECG Program · 3-Lead Rhythm Interpretation</div>' +
      '<h1>Read rhythms with <span class="hl">confidence</span> — one module at a time.</h1>' +
      '<p class="lead">Interactive lessons, live monitor simulation and unlimited practice strips for paramedic students. Learn the systematic approach, then master sinus, atrial, junctional, ventricular, AV-block and paced rhythms in Leads I, II and III.</p>' +
      '<div class="hero-cta"><a class="btn btn-primary" href="#m-foundations">Start with Foundations</a><a class="btn btn-light" href="#course">Self-paced course</a><a class="btn btn-light" href="#modules">Browse modules</a><a class="btn btn-light" href="#lab">Practice Lab</a></div>' +
      '<div class="hero-stats"><div><b>' + MODULES.length + '</b><span>learning modules</span></div><div><b>' + ALL_RHYTHMS.length + '</b><span>rhythms</span></div><div><b>∞</b><span>unique practice strips</span></div></div>' +
      '</div><div><div class="monitor-frame"><div class="monitor-top"><div><div class="mlabel">II · ECG · 25 mm/s</div><div class="seg" style="margin-top:8px;background:rgba(255,255,255,.06)" id="teaser">' +
      teaser.map(function (t, i) { return '<button data-r="' + t[0] + '" class="' + (i === 0 ? 'on' : '') + '" style="color:#9fe9c0">' + t[1] + '</button>'; }).join('') +
      '</div></div><div style="text-align:right"><div class="mlabel">HR <span class="heart">♥</span></div><div class="hr"><span id="hr">--</span><small>bpm</small></div></div></div>' +
      '<div class="monitor-canvas-wrap"><canvas id="hero-mon"></canvas></div>' +
      '<div class="monitor-foot"><span id="hero-name">Normal Sinus Rhythm</span><span>Simulated · for education</span></div></div></div></div></section>' +

      '<section class="section"><div class="wrap"><div class="section-head"><div><h2>Learning modules</h2><p>Work through the modules in order — each one builds on the last. Your progress is saved in this browser.</p></div>' +
      '<a class="btn btn-ghost" href="#practice">Practice &amp; exams →</a></div>' +
      '<div class="module-grid">' + MODULES.map(moduleCard).join('') + '</div></div></section>' +

      '<section class="section" style="padding-top:0"><div class="wrap"><div class="section-head"><div><h2>Basic 12-Lead ECG</h2><p>Once you can read rhythms, step up to the 12-lead: a separate course on lead placement, territories, axis and STEMI recognition.</p></div></div>' + twelveCard() + '</div></section>' +
      '<section class="section" style="padding-top:0"><div class="wrap"><div class="section-head"><div><h2>How it works</h2><p>Built around how paramedics actually read rhythms on a 3-lead monitor.</p></div></div>' +
      '<div class="steps">' +
      '<div class="step"><div class="n">1</div><h3>Learn the pattern</h3><p>Each rhythm has the five-step criteria, recognition tips and prehospital considerations beside a realistic strip.</p></div>' +
      '<div class="step"><div class="n">2</div><h3>Measure it yourself</h3><p>Switch between Leads I, II and III, watch it live on a monitor, and drag calipers to measure PR, QRS and R–R intervals.</p></div>' +
      '<div class="step"><div class="n">3</div><h3>Prove it</h3><p>Every strip is generated fresh, so you can’t memorize answers. Pass each module quiz with 80% and finish with the final exam.</p></div>' +
      '</div></div></section>';

    var canvas = $('#hero-mon'), hrEl = $('#hr'), heart = $('.heart'), name = $('#hero-name');
    var mon = null, last = 0;
    function run(id) {
      if (mon) mon.stop();
      var sig = ECGEngine.generate(id, seed(), 60);
      hrEl.textContent = '--';
      mon = new ECGRender.Monitor(canvas, sig, {
        leads: ['II'],
        onBeat: function (q) {
          last = performance.now();
          var hr = hrFromBeat(sig, q);
          if (hr) hrEl.textContent = hr;
          heart.classList.add('beat');
          setTimeout(function () { heart.classList.remove('beat'); }, 120);
        }
      });
      mon.start();
      name.textContent = RHYTHMS[id].name;
    }
    var t = setInterval(function () { if (performance.now() - last > 3200) hrEl.textContent = '---'; }, 500);
    $('#teaser').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $all('#teaser button').forEach(function (x) { x.classList.toggle('on', x === b); });
      run(b.dataset.r);
    });
    run('nsr');
    drawTwelveThumb();
    onResize(drawTwelveThumb);
    cleanup.push(function () { if (mon) mon.stop(); clearInterval(t); });
  }

  /* ------------------------------------------------------------ MODULES LIST */
  function viewModules() {
    main.innerHTML = pageHead('#1b7a8c', '<a href="#home">Home</a> / Modules', 'Learning Modules', 'A structured path from the basics of the ECG to complex blocks and paced rhythms. Complete each module’s rhythms and pass its quiz (80%) to finish it.') +
      '<section class="section"><div class="wrap"><div class="section-head"><div><h2>3-Lead Rhythm Interpretation</h2><p>Eight modules from foundations to the final exam.</p></div></div><div class="module-grid">' + MODULES.map(moduleCard).join('') + '</div>' +
      '<div class="section-head" style="margin-top:44px"><div><h2>Basic 12-Lead ECG</h2><p>A separate course, best taken after the 3-lead modules.</p></div></div>' + twelveCard() + '</div></section>';
    drawTwelveThumb();
    onResize(drawTwelveThumb);
  }

  /* ------------------------------------------------------------ MODULE */
  function viewModule(id, query) {
    var m = moduleById(id);
    if (!m) return viewNotFound();
    if (m.lesson) return viewFoundations(m, query);
    if (m.exam) { location.hash = '#q-exam'; return; }
    var current = query.r && m.rhythms.indexOf(query.r) >= 0 ? query.r : m.rhythms[0];
    var idx = MODULES.indexOf(m);
    var next = MODULES[idx + 1];

    main.innerHTML = pageHead(m.color, '<a href="#home">Home</a> / <a href="#modules">Modules</a> / Module ' + m.num, m.title, m.tagline,
      '<a class="btn btn-primary" href="#q-' + m.id + '">Take module quiz</a>') +
      '<div class="wrap module-layout" style="--c:' + m.color + '">' +
      '<aside class="rhythm-list" aria-label="Rhythms in this module"><h4>Rhythms</h4>' +
      m.rhythms.map(function (r) {
        return '<button data-r="' + r + '"><span class="dot' + (store.data.viewed[r] ? ' done' : '') + '"></span>' + esc(RHYTHMS[r].name) + '</button>';
      }).join('') +
      '<div class="quiz-link"><a class="btn btn-navy btn-sm" style="width:100%" href="#q-' + m.id + '">' + ICON.trophy.replace('<svg', '<svg width="16" height="16"') + ' Module quiz' + (store.data.quiz[m.id] != null ? ' · best ' + store.data.quiz[m.id] + '%' : '') + '</a></div>' +
      '</aside>' +
      '<div class="module-content">' +
      '<div class="panel intro-panel"><p>' + m.intro + '</p></div>' +
      '<div class="panel" id="viewer-panel" style="margin-top:18px"><div class="viewer-head"><div><div class="kicker" id="r-kicker"></div><h2 id="r-name"></h2></div></div><div id="viewer"></div></div>' +
      '<div class="panel"><h3><span class="ic">' + ICON.search + '</span>Five-step analysis</h3><div id="r-criteria"></div></div>' +
      '<div class="info-grid">' +
      '<div class="panel"><h3><span class="ic">' + ICON.info + '</span>What is happening</h3><p class="desc" id="r-desc"></p><h3 style="margin-top:14px"><span class="ic">' + ICON.eye + '</span>Recognition tips</h3><ul id="r-tips"></ul></div>' +
      '<div class="panel"><h3><span class="ic red">' + ICON.ambulance + '</span>Prehospital considerations</h3><ul id="r-care"></ul><p class="protocol-note">General educational guidance — always follow your local protocols and medical direction.</p></div>' +
      '</div>' +
      '<div class="pager"><button class="btn btn-ghost" id="prev">← Previous rhythm</button><button class="btn btn-navy" id="next">Next rhythm →</button></div>' +
      '</div></div>';

    var viewer = StripViewer($('#viewer'), { rhythm: current });

    function show(rid, scroll) {
      current = rid;
      var r = RHYTHMS[rid], i = m.rhythms.indexOf(rid);
      $('#r-kicker').textContent = 'Rhythm ' + (i + 1) + ' of ' + m.rhythms.length;
      $('#r-name').textContent = r.name;
      $('#r-criteria').innerHTML = criteriaTable(r);
      $('#r-desc').textContent = r.desc;
      $('#r-tips').innerHTML = r.tips.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      $('#r-care').innerHTML = r.care.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      $all('.rhythm-list [data-r]').forEach(function (b) { b.classList.toggle('active', b.dataset.r === rid); });
      store.view(rid);
      var dot = $('.rhythm-list [data-r="' + rid + '"] .dot'); if (dot) dot.classList.add('done');
      $('#prev').disabled = i === 0;
      $('#next').textContent = i === m.rhythms.length - 1 ? (next && !next.exam ? 'Take the quiz →' : 'Take the quiz →') : 'Next rhythm →';
      history.replaceState(null, '', '#m-' + m.id + '-r-' + rid);
      if (scroll) $('#viewer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('.rhythm-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]'); if (!b) return;
      viewer.set(b.dataset.r); show(b.dataset.r, window.innerWidth < 980);
    });
    $('#prev').addEventListener('click', function () { var i = m.rhythms.indexOf(current); if (i > 0) { viewer.set(m.rhythms[i - 1]); show(m.rhythms[i - 1], true); } });
    $('#next').addEventListener('click', function () {
      var i = m.rhythms.indexOf(current);
      if (i < m.rhythms.length - 1) { viewer.set(m.rhythms[i + 1]); show(m.rhythms[i + 1], true); } else location.hash = '#q-' + m.id;
    });
    show(current, false);
  }

  /* ------------------------------------------------------------ FOUNDATIONS */
  function viewFoundations(m, query) {
    main.innerHTML = pageHead(m.color, '<a href="#home">Home</a> / <a href="#modules">Modules</a> / Module 1', 'Foundations of ECG Interpretation', 'Everything you need before you read your first rhythm: how the heart conducts, what each wave means, how to read the paper, where the three leads go and a systematic way to analyze every strip.',
      '<a class="btn btn-primary" href="#m-sinus">Next: Sinus Rhythms →</a>') +
      '<div class="wrap" style="padding:28px 20px 56px">' +
      '<nav class="lesson-nav no-print"><a href="#" data-s="conduction">1 · Conduction system</a><a href="#" data-s="waves">2 · Waves &amp; intervals</a><a href="#" data-s="paper">3 · ECG paper</a><a href="#" data-s="leads">4 · 3-lead placement</a><a href="#" data-s="approach">5 · Systematic approach</a><a href="#" data-s="rate">6 · Rate trainer</a></nav>' +

      '<section class="panel lesson-section" id="s-conduction"><h2><span class="n">1</span>The cardiac conduction system</h2>' +
      '<p>Each heartbeat starts with an electrical impulse. On the ECG, you are watching that impulse travel through the heart. It follows a set pathway:</p>' +
      '<div class="pathway">' +
      '<div class="node"><b>SA node</b><span>Primary pacemaker in the right atrium</span></div>' +
      '<div class="node"><b>Atria</b><span>Internodal pathways → atrial depolarization (P wave)</span></div>' +
      '<div class="node"><b>AV node</b><span>Brief delay so the ventricles can fill (PR segment)</span></div>' +
      '<div class="node"><b>Bundle of His</b><span>Into the septum</span></div>' +
      '<div class="node"><b>Bundle branches</b><span>Right and left</span></div>' +
      '<div class="node"><b>Purkinje fibers</b><span>Rapid ventricular depolarization (QRS)</span></div></div>' +
      '<p style="margin-top:14px">If a higher pacemaker fails, a lower one takes over at its own slower <b>intrinsic rate</b>. Knowing these rates tells you where a rhythm is coming from:</p>' +
      '<div class="pacers"><div class="pacer" style="background:#3a9b3f"><b>60–100</b><span>SA node · sinus rhythms</span></div><div class="pacer" style="background:#f08a1c"><b>40–60</b><span>AV junction · junctional rhythms</span></div><div class="pacer" style="background:#e53935"><b>20–40</b><span>Ventricles · idioventricular rhythms</span></div></div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-waves"><h2><span class="n">2</span>Waves, segments and intervals</h2>' +
      '<p>Below is one cardiac cycle in Lead II, magnified. Each part reflects a specific electrical event.</p>' +
      '<div class="strip-wrap" style="max-width:760px;margin:0 auto"><canvas id="anatomy"></canvas></div>' +
      '<div class="normal-values">' +
      '<div class="nv"><b>P wave</b><span>Atrial depolarization · upright in II · ≤ 0.11 s</span></div>' +
      '<div class="nv"><b>PR interval 0.12–0.20 s</b><span>Start of P to start of QRS (3–5 small boxes)</span></div>' +
      '<div class="nv"><b>QRS &lt; 0.12 s</b><span>Ventricular depolarization (narrow = under 3 small boxes)</span></div>' +
      '<div class="nv"><b>T wave</b><span>Ventricular repolarization · the “vulnerable period”</span></div>' +
      '<div class="nv"><b>ST segment</b><span>End of QRS to start of T — should sit on the baseline</span></div>' +
      '<div class="nv"><b>QT interval</b><span>Start of QRS to end of T · roughly &lt; ½ the R–R</span></div>' +
      '<div class="nv"><b>J point</b><span>Where the QRS ends and the ST segment begins</span></div>' +
      '<div class="nv"><b>Atrial repolarization</b><span>Hidden inside the QRS — not seen</span></div>' +
      '</div></section>' +

      '<section class="panel lesson-section" id="s-paper"><h2><span class="n">3</span>Reading the ECG paper</h2>' +
      '<div class="two-col"><div><p>ECG paper runs at a standard speed of <b>25 mm/s</b> with a calibration of <b>10 mm/mV</b>. Time is measured horizontally; voltage vertically.</p>' +
      '<div class="paper-key"><div class="nv"><b>Small box (1 mm)</b><span>0.04 s · 0.1 mV</span></div><div class="nv"><b>Large box (5 mm)</b><span>0.20 s · 0.5 mV</span></div><div class="nv"><b>5 large boxes</b><span>= 1 second</span></div><div class="nv"><b>30 large boxes</b><span>= 6 seconds (a standard rhythm strip)</span></div></div>' +
      '<p style="margin-top:14px">Most monitor strips print a hash mark at every 3-second interval. Two marks = 6 seconds.</p></div>' +
      '<div><div class="strip-wrap"><canvas id="paper-demo"></canvas></div><p class="hint" style="margin-top:8px">Try the calipers: every rhythm viewer in this course has a <b>Calipers</b> button. Drag across the strip and the tool reports seconds, small boxes and the equivalent rate.</p></div></div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-leads"><h2><span class="n">4</span>3-lead placement and what each lead sees</h2>' +
      '<div class="two-col"><div class="lead-diagram">' + leadSvg() + '</div><div>' +
      '<div class="lead-legend">' +
      '<div class="el"><span class="sw" style="background:#fff"></span><span><b>RA — white</b> (IEC: red) · right arm or below right clavicle</span></div>' +
      '<div class="el"><span class="sw" style="background:#222"></span><span><b>LA — black</b> (IEC: yellow) · left arm or below left clavicle</span></div>' +
      '<div class="el"><span class="sw" style="background:#e0262b;border-color:#e0262b"></span><span><b>LL — red</b> (IEC: green) · left lower torso or left leg</span></div></div>' +
      '<p class="callout" style="margin-top:14px"><b>Memory aid (AHA colors):</b> “White on the right, smoke (black) over fire (red).”</p>' +
      '<table class="criteria" style="margin-top:10px"><tr><th>Lead I</th><td>RA (−) → LA (+) · views the lateral wall</td></tr><tr><th>Lead II</th><td>RA (−) → LL (+) · parallels normal conduction: the clearest P waves and tallest R waves — the standard monitoring lead</td></tr><tr><th>Lead III</th><td>LA (−) → LL (+) · inferior view</td></tr></table>' +
      '</div></div>' +
      '<h3 style="margin-top:22px">See the same heartbeat through each lead</h3><p class="muted">The same electrical activity looks different depending on the lead’s angle. Note that the complexes in Lead II equal Lead I + Lead III (Einthoven’s law).</p>' +
      '<div id="lead-demo"></div>' +
      '<div class="callout blue" style="margin-top:14px"><b>Remember:</b> a 3-lead ECG is for <b>rhythm</b> monitoring. It cannot rule out a STEMI — acquire a 12-lead ECG for chest pain or suspected ACS. Always confirm asystole in a second lead.</div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-approach"><h2><span class="n">5</span>The systematic approach — every strip, every time</h2>' +
      '<p>Experienced clinicians don’t “pattern-match” a strip at a glance; they work through the same steps every time. Use these five questions:</p>' +
      '<ol class="five-steps">' +
      '<li><div><b>What is the rate?</b> Atrial and ventricular. Slow (&lt; 60), normal (60–100) or fast (&gt; 100)?</div></li>' +
      '<li><div><b>Is the rhythm regular?</b> March out the R–R intervals with calipers or paper. Regular, regularly irregular (a pattern), or irregularly irregular?</div></li>' +
      '<li><div><b>Are there P waves?</b> Is there one before every QRS? Are they upright and alike in Lead II? Are there more P waves than QRS complexes?</div></li>' +
      '<li><div><b>What is the PR interval?</b> Normal (0.12–0.20 s), short, long, progressively lengthening or variable?</div></li>' +
      '<li><div><b>What is the QRS width?</b> Narrow (&lt; 0.12 s = supraventricular origin) or wide (≥ 0.12 s = ventricular origin or aberrant conduction)?</div></li>' +
      '</ol>' +
      '<div class="callout" style="margin-top:14px"><b>Then: treat the patient, not the monitor.</b> Correlate every rhythm with a pulse, perfusion, mental status and blood pressure. Artifact from movement or loose leads can mimic lethal rhythms.</div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-rate"><h2><span class="n">6</span>Calculating heart rate — rate trainer</h2>' +
      '<div class="rate-methods">' +
      '<div class="m"><b>6-second method</b>Count the QRS complexes in 6 seconds and multiply by 10. <i>Works for regular and irregular rhythms</i> — the paramedic go-to.</div>' +
      '<div class="m"><b>Large-box (300) method</b>Count large boxes between two R waves: <code>300 ÷ boxes</code>. Sequence: 300, 150, 100, 75, 60, 50. Regular rhythms only.</div>' +
      '<div class="m"><b>Small-box (1500) method</b>Count small boxes between two R waves: <code>1500 ÷ boxes</code>. Most accurate for regular rhythms.</div>' +
      '</div>' +
      '<p>Estimate the ventricular rate of this strip, then check your answer. Use the calipers if it helps.</p>' +
      '<div id="rate-viewer"></div>' +
      '<div class="inline-form"><label for="rate-in"><b>Your rate:</b></label><input id="rate-in" type="number" inputmode="numeric" min="0" max="350" placeholder="bpm"><button class="btn btn-navy" id="rate-check">Check</button><button class="btn btn-ghost" id="rate-new">New strip</button></div>' +
      '<div class="feedback" id="rate-fb"></div>' +
      '</section>' +

      '<div class="pager"><a class="btn btn-ghost" href="#modules">← All modules</a><a class="btn btn-primary" href="#m-sinus">Continue to Module 2: Sinus Rhythms →</a></div>' +
      '</div>';

    store.lesson('foundations');
    $all('.lesson-section').forEach(function (s) { s.style.marginTop = '18px'; });
    $('.lesson-nav').addEventListener('click', function (e) {
      var a = e.target.closest('[data-s]'); if (!a) return;
      e.preventDefault();
      $('#s-' + a.dataset.s).scrollIntoView({ behavior: 'smooth' });
    });

    // anatomy figure
    function drawAnatomy() { drawWaveAnatomy($('#anatomy')); }
    drawAnatomy();

    // paper demo (sinus, calipers enabled)
    var paperSig = ECGEngine.generate('nsr', 11, 3.2);
    var pc = $('#paper-demo'), pinfo;
    function drawPaper() { pinfo = ECGRender.drawStrip(pc, paperSig, { leads: ['II'], seconds: 3 }); }
    drawPaper();
    pc.parentElement.classList.add('calipers-on');
    ECGRender.attachCalipers(pc.parentElement, pc, function () { return pinfo; });

    // lead demo
    var lv = StripViewer($('#lead-demo'), { rhythm: 'nsr', lead: 'All', seed: 21 });

    // rate trainer
    var pool = ['nsr', 'sbrady', 'stach', 'junctEscape', 'accelJunct', 'idio', 'aivr', 'svt', 'firstDeg', 'vpaced'];
    var rv = StripViewer($('#rate-viewer'), { rhythm: shuffle(pool)[0], hideCaption: true });
    var fb = $('#rate-fb');
    $('#rate-check').addEventListener('click', function () {
      var g = parseInt($('#rate-in').value, 10), s = rv.sig(), truth = s.measuredRate;
      if (!g) { fb.className = 'feedback show bad'; fb.textContent = 'Enter a rate in beats per minute first.'; return; }
      var tol = Math.max(6, truth * 0.1), ok = Math.abs(g - truth) <= tol;
      var boxes = Math.round(1500 / truth);
      fb.className = 'feedback show ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = (ok ? '<b>Nice work!</b> ' : '<b>Not quite.</b> ') + 'The average rate is <b>' + truth + '/min</b> (' + esc(RHYTHMS[s.id].name) + '). ' +
        '6-second method: ' + s.sixSecondCount + ' complexes × 10 = ' + s.sixSecondCount * 10 + '/min. ' +
        'Small-box method: about ' + boxes + ' small boxes between R waves → 1500 ÷ ' + boxes + ' ≈ ' + Math.round(1500 / boxes) + '/min.';
      rv.reveal();
    });
    $('#rate-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#rate-check').click(); });
    $('#rate-new').addEventListener('click', function () { rv.set(shuffle(pool)[0]); fb.className = 'feedback'; $('#rate-in').value = ''; });

    onResize(function () { drawAnatomy(); drawPaper(); });
    if (query.s) setTimeout(function () { var el = $('#s-' + query.s); if (el) el.scrollIntoView(); }, 50);
    void lv;
  }

  var ANATOMY_SIG = null;
  function drawWaveAnatomy(c) {
    var demo = ANATOMY_SIG || (ANATOMY_SIG = ECGEngine.generate('demo', 7, 1.4));
    var w = Math.min(760, c.parentElement.clientWidth);
    var info = ECGRender.drawStrip(c, demo, { leads: ['II'], seconds: 1.4, width: w, bandMM: 24, start: 0.05 });
    var ctx = info.ctx, b = info.bands[0], pps = info.pps, ppmv = info.ppmv, t0 = 0.05;
    function X(t) { return (t - t0) * pps; }
    var q = 0.35, pOn = q - 0.16, pEnd = pOn + 0.1, qEnd = q + 0.085, tEnd = q + 0.4 + 0.02, tPeak = q + 0.4 - 0.075;
    ctx.font = '800 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    function lbl(t, mv, text, col) { ctx.fillStyle = col || ECGRender.paper().ink; ctx.fillText(text, X(t), b.base - mv * ppmv); }
    lbl(pOn + 0.05, 0.36, 'P');
    lbl(q + 0.04, 1.3, 'R');
    lbl(q + 0.008, -0.38, 'Q');
    lbl(q + 0.07, -0.55, 'S');
    lbl(tPeak, 0.52, 'T');
    function bracket(a, z, row, text, col) {
      var y = b.base + 0.55 * ppmv + 22 + row * 40;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(X(a), y - 6); ctx.lineTo(X(a), y); ctx.lineTo(X(z), y); ctx.lineTo(X(z), y - 6); ctx.stroke();
      ctx.font = '700 13px Inter, sans-serif';
      ctx.fillText(text, (X(a) + X(z)) / 2, y + 16);
    }
    bracket(pOn, q, 0, 'PR interval', '#1b7a8c');
    bracket(q, qEnd, 1, 'QRS', '#e0262b');
    bracket(qEnd, tPeak - 0.09, 0, 'ST segment', '#f08a1c');
    bracket(q, tEnd, 2, 'QT interval', '#7b4bc4');
    ctx.textAlign = 'left';
  }

  function leadSvg() {
    return '<svg viewBox="0 0 400 380" role="img" aria-label="Einthoven triangle showing 3-lead electrode placement">' +
      '<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" style="fill:var(--svg-text)"/></marker></defs>' +
      '<path d="M200 28c-30 0-46 22-46 48 0 18 8 32 20 40-46 6-92 20-108 56l-8 190h284l-8-190c-16-36-62-50-108-56 12-8 20-22 20-40 0-26-16-48-46-48z" style="fill:var(--chip);stroke:var(--input-border)" stroke-width="2"/>' +
      '<path d="M200 182c-24 0-40 18-40 40 0 30 40 52 40 52s40-22 40-52c0-22-16-40-40-40z" fill="#ffd9d9" stroke="#e8a3a3" opacity=".8"/>' +
      '<line x1="96" y1="150" x2="304" y2="150" style="stroke:var(--svg-text)" stroke-width="3" marker-end="url(#ar)"/>' +
      '<line x1="96" y1="150" x2="296" y2="322" stroke="#1b7a8c" stroke-width="3" marker-end="url(#ar)"/>' +
      '<line x1="304" y1="150" x2="304" y2="320" stroke="#7b4bc4" stroke-width="3" marker-end="url(#ar)"/>' +
      '<text x="200" y="140" text-anchor="middle" font-family="Inter" font-weight="700" font-size="15" style="fill:var(--svg-text)">Lead I</text>' +
      '<text x="180" y="262" text-anchor="middle" font-family="Inter" font-weight="700" font-size="15" fill="#1b7a8c" transform="rotate(40 180 262)">Lead II</text>' +
      '<text x="318" y="240" font-family="Inter" font-weight="700" font-size="15" fill="#7b4bc4">Lead III</text>' +
      '<circle cx="96" cy="150" r="17" fill="#fff" stroke="#55607a" stroke-width="3"/><text x="96" y="155" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12" fill="#1b2a5b">RA</text>' +
      '<circle cx="304" cy="150" r="17" fill="#222" stroke="#9aa4bb" stroke-width="2"/><text x="304" y="155" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12" fill="#fff">LA</text>' +
      '<circle cx="304" cy="336" r="17" fill="#e0262b" stroke="#b81d22" stroke-width="3"/><text x="304" y="341" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12" fill="#fff">LL</text>' +
      '<text x="62" y="128" font-family="Inter" font-weight="700" font-size="14" fill="#55607a">−</text><text x="330" y="128" font-family="Inter" font-weight="700" font-size="14" fill="#55607a">+</text>' +
      '</svg>';
  }

  /* ------------------------------------------------------------ QUIZ */
  function viewQuiz(id) {
    var exam = id === 'exam';
    var m = exam ? moduleById('exam') : moduleById(id);
    if (!m || m.lesson) return viewNotFound();
    var pool = exam ? ALL_RHYTHMS : m.rhythms;
    var N = exam ? 20 : 10;
    var order = [];
    while (order.length < N) order = order.concat(shuffle(pool));
    order = order.slice(0, N);
    var qi = 0, score = 0, answered = false, missed = [], rateHits = 0, rateTries = 0;

    main.innerHTML = pageHead(m.color, '<a href="#home">Home</a> / <a href="#practice">Practice</a> / ' + (exam ? 'Final exam' : 'Module ' + m.num + ' quiz'),
      exam ? 'Final Exam — Mixed Rhythms' : m.title + ' — Module Quiz',
      'Identify each rhythm. Work through the five steps before choosing. Pass mark: 80%.') +
      '<div class="wrap quiz-shell" id="quiz"></div>';
    var root = $('#quiz');

    function options(correct) {
      var same = pool.filter(function (r) { return r !== correct; });
      var cMod = RHYTHMS[correct].module;
      var related = ALL_RHYTHMS.filter(function (r) { return r !== correct && RHYTHMS[r].module === cMod; });
      var others = ALL_RHYTHMS.filter(function (r) { return r !== correct && RHYTHMS[r].module !== cMod; });
      var picks = shuffle(exam ? related : same).slice(0, exam ? 2 : 3);
      shuffle(others).forEach(function (r) { if (picks.length < 3 && picks.indexOf(r) < 0) picks.push(r); });
      return shuffle(picks.concat([correct]));
    }

    function renderQ() {
      answered = false;
      var rid = order[qi];
      var opts = options(rid);
      root.innerHTML =
        '<div class="quiz-top"><div class="quiz-progress"><div class="lbl"><span>Question ' + (qi + 1) + ' of ' + N + '</span><span>Score ' + score + '/' + qi + '</span></div>' +
        '<div class="progress" style="--c:' + m.color + '"><i style="width:' + ((qi / N) * 100) + '%"></i></div></div>' +
        '<a class="btn btn-ghost btn-sm" href="' + (exam ? '#practice' : '#m-' + m.id) + '">Exit</a></div>' +
        '<div class="panel"><h3 style="margin-bottom:12px">What rhythm is this?</h3><div id="qviewer"></div>' +
        '<div class="rate-guess"><label for="rg">Optional — your rate estimate:</label><input id="rg" type="number" inputmode="numeric" placeholder="bpm"><span>/min</span></div>' +
        '<div class="options">' + opts.map(function (o, i) {
          return '<button class="option" data-o="' + o + '"><span class="key">' + (i + 1) + '</span>' + esc(RHYTHMS[o].name) + '</button>';
        }).join('') + '</div><div id="explain"></div></div>';
      var viewer = StripViewer($('#qviewer'), { rhythm: rid, hideCaption: true, hideHR: true });
      $all('.option', root).forEach(function (b) { b.addEventListener('click', function () { answer(b.dataset.o, viewer); }); });
    }

    function answer(choice, viewer) {
      if (answered) return;
      answered = true;
      var rid = order[qi], r = RHYTHMS[rid], ok = choice === rid;
      if (ok) score++; else missed.push(rid);
      $all('.option', root).forEach(function (b) {
        b.disabled = true;
        if (b.dataset.o === rid) b.classList.add('correct');
        else if (b.dataset.o === choice) b.classList.add('wrong');
      });
      viewer.reveal();
      var sig = viewer.sig(), guess = parseInt($('#rg').value, 10), rateMsg = '';
      if (guess && sig.measuredRate) {
        rateTries++;
        var rOk = Math.abs(guess - sig.measuredRate) <= Math.max(6, sig.measuredRate * 0.1);
        if (rOk) rateHits++;
        rateMsg = '<p><b>Rate:</b> you estimated ' + guess + '/min; the average ventricular rate is ' + sig.measuredRate + '/min — ' + (rOk ? '✓ within 10%.' : 'outside 10%. Recount using the 6-second method.') + '</p>';
      }
      $('#explain').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(r.name) + '</div>' +
        rateMsg + '<p class="muted" style="margin-bottom:10px">' + esc(r.desc) + '</p>' + criteriaTable(r) +
        '<p style="margin:12px 0 0"><b>Key tip:</b> ' + esc(r.tips[0]) + '</p>' +
        '<div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" id="nextq">' + (qi === N - 1 ? 'See results' : 'Next question →') + '</button></div></div>';
      $('#nextq').addEventListener('click', next);
      $('#nextq').focus({ preventScroll: true });
      $('#explain').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function next() {
      cleanup.forEach(function (f) { f(); });
      cleanup = [];
      qi++;
      if (qi < N) { renderQ(); window.scrollTo({ top: $('.page-head').offsetHeight, behavior: 'smooth' }); } else results();
    }

    function results() {
      var pct = Math.round((score / N) * 100), pass = pct >= 80;
      store.score(m.id, pct);
      var uniqMissed = missed.filter(function (r, i) { return missed.indexOf(r) === i; });
      root.innerHTML = '<div class="panel result"><div class="ring" style="--p:' + pct + ';--rc:' + (pass ? 'var(--ok)' : 'var(--red)') + '"><div>' + pct + '%</div></div>' +
        '<h2>' + (pass ? 'Passed — great work!' : 'Keep practicing') + '</h2>' +
        '<p class="muted">You identified ' + score + ' of ' + N + ' rhythms correctly' + (rateTries ? ' and estimated ' + rateHits + ' of ' + rateTries + ' rates within 10%' : '') + '. ' + (pass ? 'This ' + (exam ? 'exam' : 'module') + ' is marked complete.' : 'A score of 80% is needed to pass.') + '</p>' +
        (uniqMissed.length ? '<div class="review-list"><h3>Review these rhythms</h3><ul>' + uniqMissed.map(function (r) {
          return '<li><a href="#m-' + RHYTHMS[r].module + '-r-' + r + '">' + esc(RHYTHMS[r].name) + '</a></li>';
        }).join('') + '</ul></div>' : '') +
        '<div class="hero-cta" style="justify-content:center"><button class="btn btn-primary" id="retry">Try again</button>' +
        (exam ? '<a class="btn btn-ghost" href="#practice">Back to practice</a>' : '<a class="btn btn-ghost" href="#m-' + m.id + '">Back to module</a>') + '</div></div>';
      $('#retry').addEventListener('click', function () { route(); });
    }

    function keys(e) {
      if (e.target.tagName === 'INPUT') return;
      if (!answered && /^[1-4]$/.test(e.key)) { var b = $all('.option', root)[+e.key - 1]; if (b) b.click(); }
      else if (answered && e.key === 'Enter' && $('#nextq')) { e.preventDefault(); $('#nextq').click(); }
    }
    document.addEventListener('keydown', keys);
    var detach = function () { document.removeEventListener('keydown', keys); };
    renderQ();
    // keep the keyboard handler for the whole quiz, but remove it on navigation
    quizDetach = detach;
  }
  var quizDetach = null;

  /* ------------------------------------------------------------ SELF-PACED COURSE */
  var CRS = window.ECGCourse, UNITS = CRS.UNITS, PASS = CRS.PASS;
  var course = (function () {
    var KEYC = 'cshealthed-ecg-course-v1';
    var d = { lessons: {}, kc: {}, quiz: {}, exam: null, name: '', passedOn: null, rate: 1 };
    try { var raw = localStorage.getItem(KEYC); if (raw) d = Object.assign(d, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    function save() { try { localStorage.setItem(KEYC, JSON.stringify(d)); } catch (e) { /* ignore */ } }
    return {
      data: d, save: save,
      done: function (k) { if (!d.lessons[k]) { d.lessons[k] = true; save(); } },
      reset: function () { d.lessons = {}; d.kc = {}; d.quiz = {}; d.exam = null; d.passedOn = null; save(); }
    };
  })();
  function lkey(u, l) { return u.id + '.' + l.id; }
  function unitIndex(u) { return UNITS.indexOf(u); }
  function lessonsDone(u) { return u.lessons.filter(function (l) { return course.data.lessons[lkey(u, l)]; }).length; }
  function unitPassed(u) { return course.data.quiz[u.id] >= PASS; }
  function unitOpen(u) { var i = unitIndex(u); return i === 0 || unitPassed(UNITS[i - 1]); }
  function quizOpen(u) { return lessonsDone(u) === u.lessons.length; }
  function examOpen() { return UNITS.every(unitPassed); }
  function examPassed() { return course.data.exam >= PASS; }
  function unitMinutes(u) { return u.lessons.reduce(function (a, l) { return a + (l.min || 5); }, 0); }
  function courseProgress() {
    var total = 1, done = examPassed() ? 1 : 0;
    UNITS.forEach(function (u) { total += u.lessons.length + 1; done += lessonsDone(u) + (unitPassed(u) ? 1 : 0); });
    return done / total;
  }
  function nextStep() {
    for (var i = 0; i < UNITS.length; i++) {
      var u = UNITS[i];
      if (unitPassed(u)) continue;
      for (var j = 0; j < u.lessons.length; j++) if (!course.data.lessons[lkey(u, u.lessons[j])]) return { href: '#course-' + u.id + '-' + u.lessons[j].id, label: 'Unit ' + (i + 1) + ': ' + u.lessons[j].title };
      return { href: '#course-' + u.id + '-quiz', label: 'Unit ' + (i + 1) + ' quiz' };
    }
    if (!examPassed()) return { href: '#course-exam', label: 'Final exam' };
    return { href: '#course-cert', label: 'Your certificate' };
  }
  function lockIcon() { return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'; }

  /* ---------- narration (browser speech synthesis) ---------- */
  var ROMAN = { I: 'one', II: 'two', III: 'three' };
  function speechify(t) {
    var acr = { STEMI: 'stemmy', ECG: 'E C G', ACLS: 'A C L S' };
    return String(t)
      .replace(/\(−\)/g, ' negative').replace(/\(\+\)/g, ' positive')
      .replace(/\b(Leads?|type|Type|Mobitz)\s+(III|II|I)\b/g, function (m, a, r) { return a + ' ' + ROMAN[r]; })
      .replace(/,\s*(III|II)\b/g, function (m, r) { return ', ' + ROMAN[r]; })
      .replace(/\band (III|II)\b/g, function (m, r) { return 'and ' + ROMAN[r]; })
      .replace(/(\d):(\d)/g, '$1 to $2')
      .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 to $2')
      .replace(/\b([A-Z])[–-]([A-Z])\b/g, '$1 to $2')
      .replace(/\s*[—–]\s*/g, ', ')
      .replace(/≥/g, ' greater than or equal to ').replace(/≤/g, ' less than or equal to ')
      .replace(/</g, ' less than ').replace(/>/g, ' greater than ').replace(/≈/g, ' about ')
      .replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/→/g, ' to ').replace(/½/g, 'half')
      .replace(/mm\/s\b/g, ' millimeters per second').replace(/mm\/mV\b/g, ' millimeters per millivolt')
      .replace(/\/min\b/g, ' per minute').replace(/\bbpm\b/g, 'beats per minute')
      .replace(/(\d)\s*mm\b/g, '$1 millimeters').replace(/(\d)\s*mV\b/g, '$1 millivolts').replace(/(\d)\s*s\b/g, '$1 seconds')
      .replace(/\be\.g\./g, 'for example').replace(/\bi\.e\./g, 'that is')
      .replace(/“|”|"/g, '')
      .replace(/\b([A-Z]{2,5})(s?)\b/g, function (m, a, pl) { return (acr[a] || a.split('').join(' ')) + pl; })
      .replace(/\s+/g, ' ').trim();
  }
  function rhythmSpeech(id) {
    var r = RHYTHMS[id], c = r.criteria;
    return speechify(r.name + '. ' + r.desc + ' Rate: ' + c.rate + '. Rhythm: ' + c.regularity + '. P waves: ' + c.p + '. PR interval: ' + c.pr + '. QRS: ' + c.qrs + '. Key tip: ' + r.tips[0] + (r.care && r.care[0] ? ' Prehospital care: ' + r.care[0] : ''));
  }
  function pickVoice(synth) {
    var vs = synth.getVoices().filter(function (v) { return /^en([-_]|$)/i.test(v.lang); });
    var prefs = [/Google US English/i, /Samantha/i, /Natural/i, /Aria|Jenny|Guy/i, /en[-_]US/i];
    for (var i = 0; i < prefs.length; i++) {
      var hit = vs.filter(function (v) { return prefs[i].test(v.name) || prefs[i].test(v.lang); })[0];
      if (hit) return hit;
    }
    return vs[0] || null;
  }
  function Narrator(bar, segs) {
    var synth = window.speechSynthesis, i = 0, playing = false, token = 0, cur = null;
    if (!synth || typeof window.SpeechSynthesisUtterance === 'undefined') {
      bar.innerHTML = '<span class="hint">Narration needs a browser with speech support (Chrome, Edge or Safari). You can still read every lesson.</span>';
      return { stop: function () {} };
    }
    bar.innerHTML =
      '<button class="btn btn-navy btn-sm" data-n="play">' + ICON.sound.replace('<svg', '<svg width="16" height="16"') + '<span>Listen to this lesson</span></button>' +
      '<button class="tool-btn" data-n="prev" title="Previous paragraph" aria-label="Previous paragraph">⏮</button>' +
      '<button class="tool-btn" data-n="next" title="Next paragraph" aria-label="Next paragraph">⏭</button>' +
      '<button class="tool-btn" data-n="stop" title="Stop" aria-label="Stop narration">■</button>' +
      '<label class="narr-speed">Speed <select aria-label="Narration speed">' + [0.85, 1, 1.15, 1.3].map(function (r) {
        return '<option value="' + r + '"' + (Number(course.data.rate) === r ? ' selected' : '') + '>' + r + '×</option>';
      }).join('') + '</select></label><span class="narr-status" aria-live="polite"></span>';
    var playBtn = $('[data-n="play"]', bar), status = $('.narr-status', bar);
    function mark(el, top) {
      if (cur) cur.classList.remove('narrating');
      cur = el;
      if (!el) return;
      el.classList.add('narrating');
      if (top) { if (Math.abs(top.getBoundingClientRect().top - 150) > 40) top.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      var r = el.getBoundingClientRect();
      if (r.top < 150 || r.bottom > window.innerHeight - 30) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    function ui() {
      $('span', playBtn).textContent = playing ? 'Pause' : i > 0 ? 'Resume' : 'Listen to this lesson';
      playBtn.classList.toggle('on', playing);
      status.textContent = playing || i > 0 ? 'Part ' + Math.min(i + 1, segs.length) + ' of ' + segs.length : '';
    }
    function speak() {
      if (i >= segs.length) { playing = false; i = 0; mark(null); ui(); status.textContent = 'Finished'; return; }
      var s = segs[i], my = ++token;
      if (s.before) s.before();
      mark(s.el, s.top);
      var u = new SpeechSynthesisUtterance(s.text), v = pickVoice(synth);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
      u.rate = Number(course.data.rate) || 1;
      u.onend = function () { if (my !== token || !playing) return; i++; speak(); };
      synth.speak(u);
      ui();
    }
    function halt() { token++; synth.cancel(); }
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-n]'); if (!b) return;
      var n = b.dataset.n;
      if (n === 'play') { if (playing) { playing = false; halt(); ui(); } else { playing = true; halt(); speak(); } }
      else if (n === 'stop') { playing = false; halt(); i = 0; mark(null); ui(); }
      else if (n === 'next' || n === 'prev') {
        i = Math.max(0, Math.min(segs.length - 1, i + (n === 'next' ? 1 : -1)));
        if (playing) { halt(); speak(); } else { var s = segs[i]; if (s.before) s.before(); mark(s.el, s.top); ui(); }
      }
    });
    $('select', bar).addEventListener('change', function () {
      course.data.rate = Number(this.value); course.save();
      if (playing) { halt(); speak(); }
    });
    ui();
    return { stop: function () { playing = false; halt(); mark(null); } };
  }

  /* ---------- course overview ---------- */
  function viewCourse() {
    var p = Math.round(courseProgress() * 100), ns = nextStep();
    var mins = UNITS.reduce(function (a, u) { return a + unitMinutes(u); }, 0);
    main.innerHTML = pageHead('#1b2a5b', '<a href="#home">Home</a> / Course', 'Basic ECG Interpretation Course',
      'A self-paced, narrated course for paramedic students. Work through ' + UNITS.length + ' units in order: listen to each lesson, answer the knowledge checks, practice on live ECGs, pass each unit quiz, then take the final exam.',
      '<a class="btn btn-primary" href="' + ns.href + '">' + (p ? 'Continue: ' + esc(ns.label) : 'Start the course') + ' →</a>') +
      '<section class="section"><div class="wrap">' +
      '<div class="panel course-summary"><div><div class="kicker">Your progress</div><div class="progress big" style="--c:var(--ok)"><i style="width:' + p + '%"></i></div>' +
      '<p class="muted" style="margin:8px 0 0">' + p + '% complete · about ' + Math.round(mins / 60 * 2) / 2 + ' hours of lessons · pass mark ' + PASS + '% on every quiz and the final exam</p></div>' +
      '<ul class="course-features"><li><b>Narrated lessons</b> read aloud with the text highlighted</li><li><b>Knowledge checks</b> and <b>activities</b> — matching, sorting, calipers and drills</li><li><b>Practice ECGs</b> and <b>patient scenarios</b> in every rhythm unit</li><li><b>Unit quizzes</b> and a <b>final exam</b> with a certificate</li></ul></div>' +
      '<div class="unit-list">' + UNITS.map(function (u, i) {
        var open = unitOpen(u), done = lessonsDone(u), best = course.data.quiz[u.id];
        var pct = Math.round((done + (unitPassed(u) ? 1 : 0)) / (u.lessons.length + 1) * 100);
        var state = unitPassed(u) ? '<span class="badge">✓ Passed · ' + best + '%</span>' : !open ? '<span class="unit-lock">' + lockIcon() + ' Pass Unit ' + i + ' to unlock</span>' : done ? '<span class="unit-state">In progress</span>' : '<span class="unit-state">Ready to start</span>';
        return '<' + (open ? 'a href="#course-' + u.id + '"' : 'div') + ' class="unit-card' + (open ? '' : ' locked') + '" style="--c:' + u.color + '">' +
          '<span class="unit-num">' + (i + 1) + '</span><div class="unit-body"><h3>' + esc(u.title) + '</h3><p>' + esc(u.summary) + '</p>' +
          '<div class="progress"><i style="width:' + pct + '%"></i></div>' +
          '<div class="card-meta"><span>' + u.lessons.length + ' lessons · ~' + unitMinutes(u) + ' min · quiz</span>' + state + '</div></div></' + (open ? 'a' : 'div') + '>';
      }).join('') +
      '<' + (examOpen() ? 'a href="#course-exam"' : 'div') + ' class="unit-card exam' + (examOpen() ? '' : ' locked') + '" style="--c:#0e1a3d"><span class="unit-num">' + ICON.trophy + '</span><div class="unit-body"><h3>Final Exam</h3>' +
      '<p>' + (CRS.EXAM.concept + CRS.EXAM.strips) + ' questions covering every unit: ' + CRS.EXAM.concept + ' concept questions and ' + CRS.EXAM.strips + ' rhythm strips. Pass with ' + PASS + '% to earn your certificate.</p>' +
      '<div class="card-meta"><span>' + (course.data.exam != null ? 'Best score ' + course.data.exam + '%' : 'Not attempted') + '</span>' +
      (examPassed() ? '<span class="badge">✓ Passed</span>' : examOpen() ? '<span class="unit-state">Unlocked</span>' : '<span class="unit-lock">' + lockIcon() + ' Pass every unit quiz to unlock</span>') + '</div></div></' + (examOpen() ? 'a' : 'div') + '>' +
      '</div>' +
      (examPassed() ? '<div class="exam-banner" style="margin-top:22px"><div><h3>Course complete</h3><p>You passed the final exam with ' + course.data.exam + '%. View or print your certificate.</p></div><a class="btn btn-primary" href="#course-cert">View certificate</a></div>' : '') +
      '</div></section>';
  }

  /* ---------- unit page ---------- */
  function unitLocked(u) {
    var i = unitIndex(u);
    main.innerHTML = pageHead(u.color, '<a href="#home">Home</a> / <a href="#course">Course</a> / Unit ' + (i + 1), esc(u.title), 'This unit is locked.') +
      '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><h3>' + lockIcon() + ' Pass the Unit ' + i + ' quiz to unlock this unit</h3>' +
      '<p class="muted">The course is self-paced, but each unit builds on the last. Score ' + PASS + '% or higher on the previous quiz to continue.</p>' +
      '<a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
  }
  function viewCourseUnit(u) {
    if (!unitOpen(u)) return unitLocked(u);
    var i = unitIndex(u), best = course.data.quiz[u.id];
    main.innerHTML = pageHead(u.color, '<a href="#home">Home</a> / <a href="#course">Course</a> / Unit ' + (i + 1), 'Unit ' + (i + 1) + ': ' + esc(u.title), esc(u.summary),
      '<a class="btn btn-primary" href="' + (quizOpen(u) ? '#course-' + u.id + '-quiz' : '#course-' + u.id + '-' + (u.lessons.filter(function (l) { return !course.data.lessons[lkey(u, l)]; })[0] || u.lessons[0]).id) + '">' + (quizOpen(u) ? 'Take the unit quiz' : lessonsDone(u) ? 'Continue' : 'Start unit') + ' →</a>') +
      '<section class="section"><div class="wrap"><div class="lesson-list">' + u.lessons.map(function (l, k) {
        var d = course.data.lessons[lkey(u, l)];
        return '<a class="lesson-row" href="#course-' + u.id + '-' + l.id + '" style="--c:' + u.color + '"><span class="dot' + (d ? ' done' : '') + '"></span>' +
          '<span class="lr-title"><small>Lesson ' + (k + 1) + (l.practice ? ' · Practice ECGs & scenarios' : ' · Narrated lesson & activities') + '</small>' + esc(l.title) + '</span><span class="lr-min">~' + (l.min || 5) + ' min</span></a>';
      }).join('') +
      '<' + (quizOpen(u) ? 'a href="#course-' + u.id + '-quiz"' : 'div') + ' class="lesson-row quiz' + (quizOpen(u) ? '' : ' locked') + '" style="--c:' + u.color + '"><span class="dot' + (unitPassed(u) ? ' done' : '') + '"></span>' +
      '<span class="lr-title"><small>Unit quiz · pass ' + PASS + '%</small>Unit ' + (i + 1) + ' quiz' + (best != null ? ' — best ' + best + '%' : '') + '</span><span class="lr-min">' + (quizOpen(u) ? (u.module ? '10 questions' : '8 questions') : lockIcon() + ' Finish the lessons') + '</span></' + (quizOpen(u) ? 'a' : 'div') + '>' +
      '</div><div class="pager"><a class="btn btn-ghost" href="#course">← Course overview</a></div></div></section>';
  }

  /* ---------- lesson page ---------- */
  var ACT_TYPES = { match: 1, order: 1, sort: 1, classify: 1, drill: 1, measure: 1, walk: 1, case: 1 };
  function actFrame(id, tag, title, prompt) {
    return '<section class="activity" id="' + id + '"><div class="act-head"><span class="act-tag">' + tag + '</span><b>' + esc(title) + '</b><span class="act-status"></span></div>' +
      (prompt ? '<p class="act-prompt narr">' + esc(prompt) + '</p>' : '') + '<div class="act-body"></div><div class="act-fb"></div></section>';
  }
  function viewCourseLesson(u, l) {
    if (!unitOpen(u)) return unitLocked(u);
    var i = unitIndex(u), li = u.lessons.indexOf(l), key = lkey(u, l), wasDone = !!course.data.lessons[key];
    var nextL = u.lessons[li + 1], prevL = u.lessons[li - 1];
    var segs = [], after = [], tasks = [];
    var html = l.blocks.map(function (b, k) {
      var id = 'cb' + k, t = b[0], d = b[1];
      if (t === 'p') return '<p class="narr" id="' + id + '">' + d + '</p>';
      if (t === 'h') return '<h3 class="narr lesson-h" id="' + id + '">' + esc(d) + '</h3>';
      if (t === 'list') return '<ul class="lesson-list-ul">' + d.map(function (x, j) { return '<li class="narr" id="' + id + '-' + j + '">' + x + '</li>'; }).join('') + '</ul>';
      if (t === 'callout' || t === 'note') return '<div class="callout narr' + (t === 'note' ? ' blue' : '') + '" id="' + id + '">' + d + '</div>';
      if (t === 'html') return '<div class="fig' + (b[2] ? ' narr' : '') + '" id="' + id + '">' + d + '</div>';
      if (t === 'anatomy') return '<div class="strip-wrap fig" style="max-width:760px;margin-left:auto;margin-right:auto"><canvas id="' + id + '" aria-label="One labeled cardiac cycle" role="img"></canvas></div>';
      if (t === 'leadsvg') return '<div class="lead-diagram fig" style="max-width:340px;margin-left:auto;margin-right:auto">' + leadSvg() + '</div>';
      if (t === 'strip') return '<figure class="lesson-strip"><div id="' + id + '"></div>' + (b[2] && b[2].caption ? '<figcaption class="narr" id="' + id + '-cap">' + esc(b[2].caption) + '</figcaption>' : '') + '</figure>';
      if (t === 'compare' || t === 'rhythms') {
        var ids = t === 'compare' ? d.map(function (x) { return x[0]; }) : d;
        return '<div class="explorer" id="' + id + '"><div class="seg ex-tabs" role="tablist">' + ids.map(function (r, j) {
          return '<button role="tab" data-j="' + j + '" class="' + (j === 0 ? 'on' : '') + '">' + esc(t === 'compare' ? RHYTHMS[r].short || RHYTHMS[r].name : RHYTHMS[r].name) + '</button>';
        }).join('') + '</div><div class="ex-viewer"></div>' + (t === 'compare' ? '<p class="ex-cap narr"></p>' : '<div class="rx-card narr"></div>') + '</div>';
      }
      if (t === 'rate') return '<div class="practice-box" id="' + id + '"><div class="pb-head"><b>Rate practice (optional extra)</b><span class="pb-score"></span></div><div class="rv"></div>' +
        '<div class="inline-form"><label for="' + id + '-in"><b>Your rate:</b></label><input id="' + id + '-in" type="number" inputmode="numeric" min="0" max="350" placeholder="bpm"><button class="btn btn-navy" data-act="check">Check</button><button class="btn btn-ghost" data-act="new">New strip</button></div><div class="feedback"></div></div>';
      if (t === 'practice') return '<div class="practice-box" id="' + id + '"><div class="pb-head"><b>Practice ECGs</b><span class="pb-score"></span></div><div class="pv"></div><div class="options"></div><div class="pb-explain"></div></div>';
      if (t === 'kc') return '<div class="kc" id="' + id + '"><div class="kc-label">Knowledge check</div><h3>' + esc(d.q) + '</h3><div class="options"></div><div class="kc-fb"></div></div>';
      if (t === 'match') return actFrame(id, 'Matching', d.title, d.prompt);
      if (t === 'order') return actFrame(id, 'Put in order', d.title, d.prompt);
      if (t === 'sort') return actFrame(id, 'Sorting', d.title, d.prompt);
      if (t === 'classify') return actFrame(id, 'Strip activity', d.title, d.prompt);
      if (t === 'drill') return actFrame(id, 'Calculation drill', d.title, d.kind === 'boxes' ? 'Convert between boxes and time. Get three right to complete the drill — then keep going as long as you like.' : 'Calculate each heart rate. Get three right to complete the drill — then keep going as long as you like.');
      if (t === 'measure') return actFrame(id, 'Caliper activity', d.title, d.what === 'pr' ? 'Turn on Calipers, measure from the start of a P wave to the start of the QRS, and enter the PR interval in seconds. Complete two strips.' : 'Turn on Calipers, measure from one R wave to the next, and enter the R-to-R interval in seconds. Complete two strips.');
      if (t === 'walk') return actFrame(id, 'Guided worksheet', 'Five steps, one strip', 'Answer each of the five questions about the strip, then name the rhythm and check your work.');
      if (t === 'case') return '<section class="activity case" id="' + id + '"><div class="act-head"><span class="act-tag">Patient scenario</span><b>' + esc(d.title) + '</b><span class="act-status"></span></div>' +
        '<p class="narr case-text">' + esc(d.text) + '</p><div class="vitals">' + Object.keys(d.vitals || {}).map(function (v) { return '<span class="chip"><b>' + esc(v) + '</b> ' + esc(d.vitals[v]) + '</span>'; }).join(' ') + '</div>' +
        '<div class="case-strip"></div><div class="case-qs"></div></section>';
      return '';
    }).join('');

    var listHtml = u.lessons.map(function (x, k) {
      return '<a href="#course-' + u.id + '-' + x.id + '" class="' + (x === l ? 'active' : '') + '"><span class="dot' + (course.data.lessons[lkey(u, x)] ? ' done' : '') + '"></span>' + (k + 1) + '. ' + esc(x.title) + '</a>';
    }).join('') + '<a href="#course-' + u.id + '-quiz" class="quiz-link' + (quizOpen(u) ? '' : ' locked') + '"><span class="dot' + (unitPassed(u) ? ' done' : '') + '"></span>Unit quiz' + (quizOpen(u) ? '' : ' ' + lockIcon()) + '</a>';

    main.innerHTML = pageHead(u.color, '<a href="#home">Home</a> / <a href="#course">Course</a> / <a href="#course-' + u.id + '">Unit ' + (i + 1) + '</a> / Lesson ' + (li + 1), esc(l.title), 'Unit ' + (i + 1) + ' · ' + esc(u.title) + ' · about ' + (l.min || 5) + ' minutes') +
      '<div class="wrap module-layout course-layout" style="--c:' + u.color + '"><nav class="rhythm-list lesson-side" aria-label="Lessons in this unit"><h4>Unit ' + (i + 1) + '</h4>' + listHtml + '</nav>' +
      '<div><div class="narr-bar no-print" id="narr-bar"></div><article class="panel lesson-body">' + html + '</article>' +
      '<div class="lesson-foot panel"><div class="lf-need" id="lf-need"></div><div class="lf-btns">' +
      (prevL ? '<a class="btn btn-ghost" href="#course-' + u.id + '-' + prevL.id + '">← Previous</a>' : '<a class="btn btn-ghost" href="#course-' + u.id + '">← Unit overview</a>') +
      '<button class="btn btn-primary" id="lesson-done">' + (nextL ? 'Complete lesson &amp; continue →' : 'Complete lesson → Unit quiz') + '</button></div></div></div></div>';

    segs.push({ el: $('.page-head h1'), text: speechify(l.title) });
    function task(label, el) {
      var tk = { label: label, done: false, el: el };
      tasks.push(tk);
      return function () {
        if (tk.done) return;
        tk.done = true;
        var st = $('.act-status', el);
        if (st) st.innerHTML = '<span class="badge">✓ Complete</span>';
        sync();
      };
    }

    l.blocks.forEach(function (b, k) {
      var id = 'cb' + k, t = b[0], d = b[1], el = document.getElementById(id);
      if (t === 'p' || t === 'h' || t === 'callout' || t === 'note') segs.push({ el: el, text: speechify(el.textContent) });
      else if (t === 'list') d.forEach(function (x, j) { var li2 = document.getElementById(id + '-' + j); segs.push({ el: li2, text: speechify(li2.textContent) }); });
      else if (t === 'html' && b[2]) segs.push({ el: el, text: speechify(b[2]) });
      else if (t === 'anatomy') { after.push(function () { drawWaveAnatomy(el); }); onResize(function () { drawWaveAnatomy(el); }); }
      else if (t === 'strip') {
        var o = b[2] || {};
        StripViewer(el, { rhythm: d, lead: o.lead, genOpts: o.artifact ? { artifact: 'force' } : undefined });
        if (o.caption) { var cap = document.getElementById(id + '-cap'); segs.push({ el: cap, text: speechify(o.caption) }); }
      } else if (t === 'compare' || t === 'rhythms') {
        var ids = t === 'compare' ? d.map(function (x) { return x[0]; }) : d;
        var v = StripViewer($('.ex-viewer', el), { rhythm: ids[0] });
        var cur = -1;
        var select = function (j) {
          if (j === cur) return;
          cur = j;
          $all('.ex-tabs button', el).forEach(function (x, n) { x.classList.toggle('on', n === j); x.setAttribute('aria-selected', n === j); });
          if (j > 0 || v.sig().id !== ids[j]) v.set(ids[j]);
          if (t === 'compare') $('.ex-cap', el).innerHTML = esc(d[j][1]);
          else {
            var r = RHYTHMS[ids[j]];
            store.view(ids[j]);
            $('.rx-card', el).innerHTML = '<h3>' + esc(r.name) + '</h3><p class="desc">' + esc(r.desc) + '</p>' + criteriaTable(r) +
              '<div class="info-grid" style="margin-top:14px"><div><h4>Recognition tips</h4><ul>' + r.tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>' +
              '<div><h4>Prehospital considerations</h4><ul>' + r.care.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div></div>';
          }
        };
        select(0);
        $('.ex-tabs', el).addEventListener('click', function (e) { var bt = e.target.closest('[data-j]'); if (bt) select(+bt.dataset.j); });
        ids.forEach(function (r, j) {
          segs.push({ el: t === 'compare' ? $('.ex-cap', el) : $('.rx-card', el), top: el, text: t === 'compare' ? speechify(RHYTHMS[r].name + '. ' + d[j][1]) : rhythmSpeech(r), before: function () { select(j); } });
        });
      } else if (t === 'rate') ratePractice(el);
      else if (t === 'practice') { var pdone = task('Identify 3 practice strips', el), n = 0; stripPractice(el, d, function () { n++; if (n >= 3) pdone(); }); }
      else if (t === 'kc') knowledgeCheck(el, d, key + '.' + k, task('Knowledge check: ' + (d.q.length > 60 ? d.q.slice(0, 57) + '…' : d.q), el));
      else if (ACT_TYPES[t]) {
        var p = $('.act-prompt', el);
        if (p) segs.push({ el: p, text: speechify((t === 'case' ? '' : 'Activity: ' + d.title + '. ') + p.textContent) });
        if (t === 'case') segs.push({ el: $('.case-text', el), text: speechify(d.title + '. ' + d.text) });
        var fin = task(t === 'case' ? d.title.replace(/^Scenario: /, 'Scenario: ') : d.title, el);
        ({ match: matchActivity, order: orderActivity, sort: sortActivity, classify: classifyActivity, drill: drillActivity, measure: measureActivity, walk: walkActivity, case: caseActivity })[t](el, d, fin);
      }
    });
    after.forEach(function (f) { f(); });

    function sync() {
      var left = tasks.filter(function (x) { return !x.done; });
      var ok = wasDone || !left.length;
      $('#lesson-done').disabled = !ok;
      var need = $('#lf-need');
      if (ok) { need.innerHTML = '<span class="hint">' + (wasDone ? 'You have completed this lesson.' : 'Nice work — every activity is done.') + '</span>' + (wasDone && left.length ? '<span class="hint"> Activities left to try: ' + left.length + '.</span>' : ''); return; }
      need.innerHTML = '<b>Still to do (' + left.length + ' of ' + tasks.length + '):</b><ul class="todo">' + left.map(function (x, n) { return '<li><a href="#" data-todo="' + tasks.indexOf(x) + '">' + esc(x.label) + '</a></li>'; }).join('') + '</ul>';
    }
    $('#lf-need').addEventListener('click', function (e) {
      var a = e.target.closest('[data-todo]'); if (!a) return;
      e.preventDefault();
      tasks[+a.dataset.todo].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('#lesson-done').addEventListener('click', function () {
      course.done(key);
      location.hash = nextL ? '#course-' + u.id + '-' + nextL.id : '#course-' + u.id + '-quiz';
    });
    sync();
    var narr = Narrator($('#narr-bar'), segs);
    cleanup.push(narr.stop);
  }

  /* ---------- activities ---------- */
  // Shared "check, retry, reveal" flow for matching, ordering and sorting.
  function checkFlow(el, opts) {
    var tries = 0, done = false, body = $('.act-body', el), fb = $('.act-fb', el);
    body.insertAdjacentHTML('afterend', '<div class="act-btns"><button class="btn btn-navy btn-sm" data-a="check">Check answers</button><button class="btn btn-ghost btn-sm" data-a="show" hidden>Show answers</button></div>');
    $('.act-btns', el).addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]'); if (!b || done) return;
      if (b.dataset.a === 'show') { opts.reveal(); finish('Here are the correct answers. Review them, then carry on.', false); return; }
      if (!opts.complete()) { fb.innerHTML = '<p class="lf-mark bad">Answer every item first.</p>'; return; }
      var res = opts.mark(); tries++;
      if (res.right === res.total) finish('✓ All ' + res.total + ' correct!', true);
      else {
        fb.innerHTML = '<p class="lf-mark bad">' + res.right + ' of ' + res.total + ' correct. Fix the items marked ✗ and check again.</p>';
        if (tries >= 2) $('[data-a="show"]', el).hidden = false;
      }
    });
    function finish(msg, ok) {
      done = true;
      $all('.act-btns button, select, .act-body button', el).forEach(function (x) { x.disabled = true; });
      fb.innerHTML = '<p class="lf-mark ' + (ok ? 'ok' : 'na') + '">' + msg + '</p>';
      opts.done();
    }
  }
  function matchActivity(el, d, done) {
    var answers = shuffle(d.pairs.map(function (p) { return p[1]; }));
    $('.act-body', el).innerHTML = '<div class="m-grid">' + d.pairs.map(function (p, n) {
      return '<div class="m-row" data-n="' + n + '"><span class="m-term">' + esc(p[0]) + '</span><select aria-label="' + esc(p[0]) + '"><option value="">Choose…</option>' +
        answers.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select><span class="m-mark" aria-hidden="true"></span></div>';
    }).join('') + '</div>';
    var rows = $all('.m-row', el);
    function setMark(row, ok) { row.classList.toggle('ok', ok); row.classList.toggle('bad', !ok); $('.m-mark', row).textContent = ok ? '✓' : '✗'; }
    checkFlow(el, {
      complete: function () { return rows.every(function (r) { return $('select', r).value; }); },
      mark: function () {
        var right = 0;
        rows.forEach(function (r) { var ok = $('select', r).value === d.pairs[+r.dataset.n][1]; if (ok) right++; setMark(r, ok); });
        return { right: right, total: rows.length };
      },
      reveal: function () { rows.forEach(function (r) { $('select', r).value = d.pairs[+r.dataset.n][1]; setMark(r, true); }); },
      done: done
    });
  }
  function orderActivity(el, d, done) {
    var items = d.items.slice(), list;
    do { list = shuffle(items); } while (list.join('|') === items.join('|'));
    var body = $('.act-body', el);
    function render(marks) {
      body.innerHTML = '<ol class="ord-list">' + list.map(function (x, n) {
        var m = marks ? (x === items[n] ? ' ok' : ' bad') : '';
        return '<li class="ord-item' + m + '"><span class="ord-n">' + (n + 1) + '</span><span class="ord-t">' + esc(x) + '</span>' +
          '<button class="tool-btn" data-mv="-1" data-n="' + n + '" aria-label="Move ' + esc(x) + ' up"' + (n === 0 ? ' disabled' : '') + '>▲</button>' +
          '<button class="tool-btn" data-mv="1" data-n="' + n + '" aria-label="Move ' + esc(x) + ' down"' + (n === list.length - 1 ? ' disabled' : '') + '>▼</button></li>';
      }).join('') + '</ol>';
    }
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-mv]'); if (!b || b.disabled) return;
      var n = +b.dataset.n, m = n + +b.dataset.mv, t = list[n]; list[n] = list[m]; list[m] = t;
      render(); var f = $('[data-n="' + m + '"][data-mv="' + b.dataset.mv + '"]', body) || $('[data-n="' + m + '"]', body); if (f) f.focus();
    });
    render();
    checkFlow(el, {
      complete: function () { return true; },
      mark: function () { render(true); var r = list.filter(function (x, n) { return x === items[n]; }).length; return { right: r, total: items.length }; },
      reveal: function () { list = items.slice(); render(true); },
      done: done
    });
  }
  function sortActivity(el, d, done) {
    var items = shuffle(d.items.map(function (x, n) { return { t: x[0], b: x[1], n: n }; })), pick = {};
    $('.act-body', el).innerHTML = '<div class="s-grid">' + items.map(function (x) {
      return '<div class="s-row" data-n="' + x.n + '"><span class="s-text">' + esc(x.t) + '</span><div class="seg" role="group" aria-label="' + esc(x.t) + '">' +
        d.buckets.map(function (bk, k) { return '<button data-k="' + k + '">' + esc(bk) + '</button>'; }).join('') + '</div><span class="m-mark" aria-hidden="true"></span></div>';
    }).join('') + '</div>';
    var rows = $all('.s-row', el);
    $('.act-body', el).addEventListener('click', function (e) {
      var b = e.target.closest('[data-k]'); if (!b || b.disabled) return;
      var row = b.closest('.s-row'); pick[row.dataset.n] = +b.dataset.k;
      $all('[data-k]', row).forEach(function (x) { x.classList.toggle('on', x === b); });
      row.classList.remove('ok', 'bad'); $('.m-mark', row).textContent = '';
    });
    function setMark(row, ok) { row.classList.toggle('ok', ok); row.classList.toggle('bad', !ok); $('.m-mark', row).textContent = ok ? '✓' : '✗'; }
    checkFlow(el, {
      complete: function () { return rows.every(function (r) { return pick[r.dataset.n] != null; }); },
      mark: function () { var right = 0; rows.forEach(function (r) { var ok = pick[r.dataset.n] === d.items[+r.dataset.n][1]; if (ok) right++; setMark(r, ok); }); return { right: right, total: rows.length }; },
      reveal: function () { rows.forEach(function (r) { var k = d.items[+r.dataset.n][1]; pick[r.dataset.n] = k; $all('[data-k]', r).forEach(function (x) { x.classList.toggle('on', +x.dataset.k === k); }); setMark(r, true); }); },
      done: done
    });
  }
  function classifyActivity(el, d, done) {
    var keys = Object.keys(d.items), queue = [], count = 0, right = 0, viewer = null, body = $('.act-body', el), fb = $('.act-fb', el);
    body.innerHTML = '<div class="cl-count hint"></div><div class="cl-strip"></div><div class="options"></div>';
    function nextItem() {
      if (!queue.length) queue = shuffle(keys);
      var rid = queue.shift();
      if (!viewer) viewer = StripViewer($('.cl-strip', el), { rhythm: rid, hideCaption: true, hideHR: true }); else viewer.set(rid);
      $('.cl-count', el).textContent = count < d.n ? 'Strip ' + (count + 1) + ' of ' + d.n : 'Extra practice · ' + right + ' of ' + count + ' correct so far';
      fb.innerHTML = '';
      var answered = false, correct = d.items[rid];
      optionButtons($('.options', el), d.options, function (n) {
        if (answered) return;
        answered = true; count++;
        var ok = n === correct; if (ok) right++;
        markOptions($('.options', el), correct, n);
        viewer.reveal();
        var r = RHYTHMS[rid];
        fb.innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(d.options[correct]) + '</div><p style="margin:0">This strip is <b>' + esc(r.name) + '</b>. ' + esc(r.tips[0]) + '</p>' +
          '<div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px;align-items:center">' + (count === d.n ? '<span class="lf-mark ok">Activity complete — ' + right + ' of ' + count + ' correct.</span>' : '') +
          '<button class="btn btn-primary btn-sm cl-next">' + (count >= d.n ? 'More practice →' : 'Next strip →') + '</button></div></div>';
        $('.cl-next', el).addEventListener('click', nextItem);
        if (count === d.n) done();
      });
    }
    nextItem();
  }
  function drillActivity(el, d, done) {
    var body = $('.act-body', el), right = 0, tries = 0, prob;
    function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
    function gen() {
      var n;
      if (d.kind === 'boxes') {
        var k = pick([0, 1, 2, 3]);
        if (k === 0) { n = pick([2, 3, 4, 5, 6, 7, 8]); return { q: 'A measurement spans <b>' + n + ' small boxes</b>. How many seconds is that?', a: n * 0.04, unit: 's', tol: 0.005, how: n + ' × 0.04 s = ' + (n * 0.04).toFixed(2) + ' s' }; }
        if (k === 1) { n = pick([1, 2, 3, 4, 5]); return { q: 'How many seconds are in <b>' + n + ' large box' + (n > 1 ? 'es' : '') + '</b>?', a: n * 0.2, unit: 's', tol: 0.005, how: n + ' × 0.20 s = ' + (n * 0.2).toFixed(2) + ' s' }; }
        if (k === 2) { var s = pick([0.08, 0.12, 0.16, 0.20, 0.24, 0.28]); return { q: 'An interval measures <b>' + s.toFixed(2) + ' s</b>. How many small boxes is that?', a: Math.round(s / 0.04), unit: 'small boxes', tol: 0.01, how: s.toFixed(2) + ' ÷ 0.04 = ' + Math.round(s / 0.04) + ' small boxes' }; }
        n = pick([1, 2, 3, 6]); return { q: 'How many large boxes make <b>' + n + ' second' + (n > 1 ? 's' : '') + '</b>?', a: n * 5, unit: 'large boxes', tol: 0.01, how: '5 large boxes per second × ' + n + ' = ' + n * 5 };
      }
      var j = pick([0, 1, 2]);
      if (j === 0) { n = pick([4, 5, 6, 7, 8, 9, 11, 12, 14, 16]); return { q: 'A 6-second strip contains <b>' + n + ' QRS complexes</b>. What is the rate?', a: n * 10, unit: '/min', tol: 0.5, how: n + ' × 10 = ' + n * 10 + '/min (6-second method)' }; }
      if (j === 1) { n = pick([2, 3, 4, 5, 6]); return { q: 'A regular rhythm has <b>' + n + ' large boxes</b> between R waves. What is the rate?', a: Math.round(300 / n), unit: '/min', tol: 1, how: '300 ÷ ' + n + ' = ' + Math.round(300 / n) + '/min (300 method)' }; }
      n = pick([10, 12, 15, 20, 25, 30]); return { q: 'A regular rhythm has <b>' + n + ' small boxes</b> between R waves. What is the rate?', a: Math.round(1500 / n), unit: '/min', tol: 1, how: '1500 ÷ ' + n + ' = ' + Math.round(1500 / n) + '/min (1500 method)' };
    }
    function render() {
      prob = gen();
      body.innerHTML = '<p class="drill-q">' + prob.q + '</p><div class="inline-form"><input type="text" inputmode="decimal" aria-label="Your answer" placeholder="Answer"><span class="unit-tag">' + esc(prob.unit) + '</span><button class="btn btn-navy btn-sm" data-d="check">Check</button></div>';
      var inp = $('input', body); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    }
    function check() {
      var inp = $('input', body); if (inp.disabled) return;
      var v = parseFloat(inp.value.replace(/[^0-9.]/g, ''));
      if (isNaN(v)) { $('.act-fb', el).innerHTML = '<p class="lf-mark bad">Enter a number.</p>'; return; }
      inp.disabled = true; tries++;
      var ok = Math.abs(v - prob.a) <= prob.tol; if (ok) right++;
      $('.act-status', el).innerHTML = right >= 3 ? '<span class="badge">✓ Complete</span>' : '<span class="hint">' + right + ' of 3 correct</span>';
      $('.act-fb', el).innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div><p style="margin:0">' + prob.how + '</p>' +
        '<div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" data-d="next">Next problem →</button></div></div>';
      if (right >= 3) done();
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-d]'); if (!b) return;
      if (b.dataset.d === 'check') check(); else { $('.act-fb', el).innerHTML = ''; render(); $('input', body).focus(); }
    });
    render();
  }
  function measureTruth(sig, what) {
    var q = sig.qrsTimes.filter(function (t) { return t > 0.3 && t < sig.duration - 0.3; });
    if (what === 'rr') { var rr = []; for (var i = 1; i < q.length; i++) rr.push(q[i] - q[i - 1]); rr.sort(function (a, b) { return a - b; }); return rr[Math.floor(rr.length / 2)]; }
    var prs = [];
    sig.pTimes.forEach(function (p) { var n = q.filter(function (t) { return t > p && t - p < 0.5; })[0]; if (n != null) prs.push(n - p); });
    prs.sort(function (a, b) { return a - b; });
    return prs[Math.floor(prs.length / 2)];
  }
  function measureActivity(el, d, done) {
    var body = $('.act-body', el), viewer = null, count = 0, right = 0, last = null;
    body.innerHTML = '<div class="ms-strip"></div><div class="inline-form"><label><b>' + (d.what === 'pr' ? 'PR interval' : 'R-to-R interval') + ':</b></label><input type="text" inputmode="decimal" placeholder="0.00" aria-label="Your measurement in seconds"><span class="unit-tag">seconds</span><button class="btn btn-navy btn-sm" data-m="check">Check</button><button class="btn btn-ghost btn-sm" data-m="new">New strip</button></div>';
    function load() {
      var c = shuffle(d.pool), rid = c[0] === last && c.length > 1 ? c[1] : c[0]; last = rid;
      if (!viewer) viewer = StripViewer($('.ms-strip', el), { rhythm: rid, hideCaption: true, hideHR: true }); else viewer.set(rid);
      $('input', body).value = ''; $('input', body).disabled = false; $('.act-fb', el).innerHTML = '';
    }
    function check() {
      var inp = $('input', body); if (inp.disabled) return;
      var v = parseFloat(inp.value.replace(/[^0-9.]/g, ''));
      if (isNaN(v)) { $('.act-fb', el).innerHTML = '<p class="lf-mark bad">Enter your measurement in seconds, for example 0.16.</p>'; return; }
      var sig = viewer.sig(), truth = measureTruth(sig, d.what), tol = 0.04, ok = Math.abs(v - truth) <= tol;
      inp.disabled = true; count++; if (ok) right++;
      var boxes = Math.round(truth / 0.04), extra;
      if (d.what === 'pr') extra = truth > 0.205 ? 'That is longer than 0.20 s — a prolonged PR (first-degree AV block).' : truth < 0.115 ? 'That is shorter than 0.12 s.' : 'That is within the normal 0.12–0.20 s range.';
      else extra = 'Rate = 60 ÷ ' + truth.toFixed(2) + ' ≈ ' + Math.round(60 / truth) + '/min, or 1500 ÷ ' + boxes + ' small boxes ≈ ' + Math.round(1500 / boxes) + '/min.';
      $('.act-status', el).innerHTML = count >= 2 ? '<span class="badge">✓ Complete</span>' : '<span class="hint">' + count + ' of 2 strips</span>';
      $('.act-fb', el).innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Within one small box' : '✗ Off by more than one small box') + '</div>' +
        '<p style="margin:0">The ' + (d.what === 'pr' ? 'PR interval' : 'R-to-R interval') + ' is about <b>' + truth.toFixed(2) + ' s</b> (' + boxes + ' small boxes). ' + extra + ' This strip: ' + esc(RHYTHMS[sig.id].name) + '.</p>' +
        '<div style="margin-top:10px;display:flex;justify-content:flex-end"><button class="btn btn-primary btn-sm" data-m="new">Next strip →</button></div></div>';
      viewer.reveal();
      if (count >= 2) done();
    }
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-m]'); if (!b) return; if (b.dataset.m === 'check') check(); else load(); });
    $('input', body).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    load();
  }
  function walkActivity(el, pool, done) {
    var body = $('.act-body', el), viewer = null, last = null, rid, checked;
    var RATE = { slow: 'Slow (under 60)', normal: 'Normal (60–100)', fast: 'Fast (over 100)' };
    function sel(name, label, opts) {
      return '<label class="wk-row"><span class="wk-lbl">' + label + '</span><select data-w="' + name + '"><option value="">Choose…</option>' +
        Object.keys(opts).map(function (k) { return '<option value="' + k + '">' + esc(opts[k]) + '</option>'; }).join('') + '</select><span class="lf-mark" data-for="' + name + '"></span></label>';
    }
    function load() {
      var c = shuffle(pool); rid = c[0] === last && c.length > 1 ? c[1] : c[0]; last = rid; checked = false;
      if (!viewer) { body.innerHTML = '<div class="wk-strip"></div><div class="wk-form"></div>'; viewer = StripViewer($('.wk-strip', el), { rhythm: rid, hideCaption: true, hideHR: true }); } else viewer.set(rid);
      var names = {}; pool.forEach(function (r) { names[r] = RHYTHMS[r].name; });
      $('.wk-form', el).innerHTML = sel('rate', '1 · Rate', RATE) + sel('reg', '2 · Rhythm', { regular: 'Regular', irregular: 'Irregular' }) + sel('p', '3 · P waves', LAB_LABELS.p) +
        sel('pr', '4 · PR interval', { normal: 'Normal (0.12–0.20 s)', long: 'Long (over 0.20 s)', none: 'Not measurable / no P waves', short: 'Short (under 0.12 s)' }) +
        sel('qrs', '5 · QRS', { narrow: LAB_LABELS.qrs.narrow, wide: LAB_LABELS.qrs.wide }) + sel('name', 'Rhythm', names) +
        '<div class="act-btns"><button class="btn btn-navy btn-sm" data-w-act="check">Check my worksheet</button><button class="btn btn-ghost btn-sm" data-w-act="new">New strip</button></div>';
      $('.act-fb', el).innerHTML = '';
    }
    function prTruth(id) {
      if (id === 'firstDeg') return ['long'];
      if (['nsr', 'sbrady', 'stach', 'sarrhythmia', 'sarrest', 'pac'].indexOf(id) >= 0) return ['normal'];
      if (['junctEscape', 'accelJunct', 'junctTach', 'pjc'].indexOf(id) >= 0) return ['short', 'none'];
      return ['none'];
    }
    function check() {
      var sig = viewer.sig(), truth = labTruthRhythm(rid, sig), val = function (n) { return $('[data-w="' + n + '"]', el).value; };
      if (['rate', 'reg', 'p', 'pr', 'qrs', 'name'].some(function (n) { return !val(n); })) { $('.act-fb', el).innerHTML = '<p class="lf-mark bad">Answer all five steps and name the rhythm first.</p>'; return; }
      var rateCat = truth.rate == null ? null : truth.rate < 60 ? 'slow' : truth.rate > 100 ? 'fast' : 'normal';
      var rows = [
        ['rate', rateCat ? [rateCat] : null, rateCat ? RATE[rateCat] + ' — about ' + truth.rate + '/min' : 'not measurable'],
        ['reg', truth.reg, truth.reg.map(function (k) { return LAB_LABELS.reg[k]; }).join(' / ')],
        ['p', truth.p, truth.p.map(function (k) { return LAB_LABELS.p[k]; }).join(' / ')],
        ['pr', prTruth(rid), prTruth(rid).map(function (k) { return { normal: 'Normal', long: 'Long', none: 'Not measurable', short: 'Short' }[k]; }).join(' / ')],
        ['qrs', truth.qrs, truth.qrs.map(function (k) { return LAB_LABELS.qrs[k]; }).join(' / ')],
        ['name', [rid], RHYTHMS[rid].name]
      ];
      var right = 0;
      rows.forEach(function (r) {
        var v = val(r[0]), m = $('.lf-mark[data-for="' + r[0] + '"]', el), ok = r[1] ? (v && r[1].indexOf(v) >= 0) : true;
        if (ok) right++;
        m.className = 'lf-mark ' + (ok ? 'ok' : 'bad'); m.textContent = ok ? '✓' : '✗ ' + r[2];
      });
      viewer.reveal();
      $('.act-fb', el).innerHTML = '<div class="explain"><div class="verdict ' + (right === rows.length ? 'ok' : 'bad') + '">' + right + ' of ' + rows.length + ' correct — ' + esc(RHYTHMS[rid].name) + '</div>' + criteriaTable(RHYTHMS[rid]) + '</div>';
      if (!checked) { checked = true; done(); }
    }
    el.addEventListener('click', function (e) { var b = e.target.closest('[data-w-act]'); if (!b) return; if (b.dataset.wAct === 'check') check(); else load(); });
    load();
  }
  function caseActivity(el, d, done) {
    StripViewer($('.case-strip', el), { rhythm: d.rhythm, hideCaption: true });
    var answered = 0;
    $('.case-qs', el).innerHTML = d.qs.map(function (q, n) { return '<div class="case-q" data-q="' + n + '"><h4>' + (n + 1) + '. ' + esc(q.q) + '</h4><div class="options"></div><div class="kc-fb"></div></div>'; }).join('');
    d.qs.forEach(function (q, n) {
      var box = $('[data-q="' + n + '"]', el), s = shuffledQ(q), fin = false;
      optionButtons($('.options', box), s.labels, function (k) {
        if (fin) return;
        fin = true;
        var ok = k === s.correct;
        markOptions($('.options', box), s.correct, k);
        $('.kc-fb', box).innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div><p style="margin:0">' + esc(s.why) + '</p></div>';
        if (++answered === d.qs.length) done();
      });
    });
  }

  function optionButtons(host, labels, onPick) {
    host.innerHTML = labels.map(function (o, n) { return '<button class="option" data-k="' + n + '"><span class="key">' + (n + 1) + '</span>' + esc(o) + '</button>'; }).join('');
    $all('.option', host).forEach(function (bt) { bt.addEventListener('click', function () { onPick(+bt.dataset.k, bt); }); });
  }
  function markOptions(host, correct, picked) {
    $all('.option', host).forEach(function (bt) {
      var n = +bt.dataset.k; bt.disabled = true;
      if (n === correct) bt.classList.add('correct'); else if (n === picked) bt.classList.add('wrong');
    });
  }
  function seeLink(q) {
    var u = CRS.unitById(q.unit), l = u && u.lessons.filter(function (x) { return x.id === q.see; })[0];
    return l ? '<a href="#course-' + u.id + '-' + l.id + '">Unit ' + (unitIndex(u) + 1) + ', ' + esc(l.title) + '</a>' : '';
  }
  function shuffledQ(q) {
    var order = shuffle(q.o.map(function (_, n) { return n; }));
    return { q: q.q, why: q.why, labels: order.map(function (n) { return q.o[n]; }), correct: order.indexOf(q.a) };
  }
  function knowledgeCheck(el, q, id, onDone) {
    var s = shuffledQ(q), done = false;
    optionButtons($('.options', el), s.labels, function (n) {
      if (done) return;
      done = true;
      var ok = n === s.correct;
      if (course.data.kc[id] == null) { course.data.kc[id] = ok; course.save(); }
      markOptions($('.options', el), s.correct, n);
      $('.kc-fb', el).innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div><p style="margin:0">' + esc(s.why) + '</p></div>';
      onDone(ok);
    });
  }
  function ratePractice(el) {
    var pool = ['nsr', 'sbrady', 'stach', 'junctEscape', 'accelJunct', 'idio', 'aivr', 'svt', 'firstDeg', 'vpaced', 'afib'];
    var rv = StripViewer($('.rv', el), { rhythm: shuffle(pool)[0], hideCaption: true }), fb = $('.feedback', el), inp = $('input', el), hits = 0, tries = 0;
    function check() {
      var g = parseInt(inp.value, 10), s = rv.sig(), truth = s.measuredRate;
      if (!g) { fb.className = 'feedback show bad'; fb.textContent = 'Enter a rate in beats per minute first.'; return; }
      var ok = Math.abs(g - truth) <= Math.max(6, truth * 0.1);
      tries++; if (ok) hits++;
      $('.pb-score', el).textContent = hits + ' of ' + tries + ' within 10%';
      fb.className = 'feedback show ' + (ok ? 'ok' : 'bad');
      fb.innerHTML = (ok ? '<b>Nice work!</b> ' : '<b>Not quite.</b> ') + 'The average rate is <b>' + truth + '/min</b> (' + esc(RHYTHMS[s.id].name) + '). 6-second method: ' + s.sixSecondCount + ' complexes × 10 = ' + s.sixSecondCount * 10 + '/min.';
      rv.reveal();
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || !$('.inline-form', el).contains(b)) return;
      if (b.dataset.act === 'check') check(); else { rv.set(shuffle(pool)[0]); fb.className = 'feedback'; inp.value = ''; }
    });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
  }
  function stripChoices(correct, pool) {
    var cMod = RHYTHMS[correct].module;
    var same = shuffle(pool.filter(function (r) { return r !== correct; }));
    var related = shuffle(ALL_RHYTHMS.filter(function (r) { return r !== correct && RHYTHMS[r].module === cMod; }));
    var others = shuffle(ALL_RHYTHMS.filter(function (r) { return r !== correct && RHYTHMS[r].module !== cMod; }));
    var picks = [];
    same.concat(related, others).forEach(function (r) { if (picks.length < 3 && picks.indexOf(r) < 0) picks.push(r); });
    return shuffle(picks.concat([correct]));
  }
  function rhythmExplain(rid, ok) {
    var r = RHYTHMS[rid];
    return '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(r.name) + '</div>' +
      '<p class="muted" style="margin-bottom:10px">' + esc(r.desc) + '</p>' + criteriaTable(r) + '<p style="margin:12px 0 0"><b>Key tip:</b> ' + esc(r.tips[0]) + '</p>';
  }
  function stripPractice(el, pool, onAttempt) {
    var viewer = null, hits = 0, tries = 0, last = null;
    function nextStrip() {
      var cand = shuffle(pool), rid = cand[0] === last && cand.length > 1 ? cand[1] : cand[0];
      last = rid;
      if (!viewer) viewer = StripViewer($('.pv', el), { rhythm: rid, hideCaption: true, hideHR: true }); else viewer.set(rid);
      var opts = stripChoices(rid, pool), done = false;
      $('.pb-explain', el).innerHTML = '';
      optionButtons($('.options', el), opts.map(function (r) { return RHYTHMS[r].name; }), function (n) {
        if (done) return;
        done = true; tries++;
        var ok = opts[n] === rid; if (ok) hits++;
        markOptions($('.options', el), opts.indexOf(rid), n);
        viewer.reveal(); store.view(rid);
        $('.pb-score', el).textContent = hits + ' of ' + tries + ' correct';
        $('.pb-explain', el).innerHTML = rhythmExplain(rid, ok) + '<div style="margin-top:14px;display:flex;justify-content:flex-end"><button class="btn btn-primary pb-next">Next strip →</button></div></div>';
        $('.pb-next', el).addEventListener('click', nextStrip);
        onAttempt(ok);
      });
    }
    nextStrip();
  }

  /* ---------- unit quizzes and the final exam ---------- */
  function viewCourseQuiz(u) {
    var exam = !u;
    if (exam ? !examOpen() : !unitOpen(u)) {
      if (!exam) return unitLocked(u);
      main.innerHTML = pageHead('#0e1a3d', '<a href="#home">Home</a> / <a href="#course">Course</a> / Final exam', 'Final Exam', 'The final exam unlocks when you have passed every unit quiz.') +
        '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><h3>' + lockIcon() + ' Not unlocked yet</h3><p class="muted">Pass all ' + UNITS.length + ' unit quizzes with ' + PASS + '% or higher.</p><a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
      return;
    }
    if (!exam && !quizOpen(u)) {
      main.innerHTML = pageHead(u.color, '<a href="#home">Home</a> / <a href="#course">Course</a> / <a href="#course-' + u.id + '">Unit ' + (unitIndex(u) + 1) + '</a> / Quiz', 'Unit ' + (unitIndex(u) + 1) + ' quiz', 'Finish every lesson in this unit to unlock the quiz.') +
        '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><h3>' + lockIcon() + ' Finish the lessons first</h3><p class="muted">' + lessonsDone(u) + ' of ' + u.lessons.length + ' lessons complete.</p><a class="btn btn-primary" href="#course-' + u.id + '">Back to the unit</a></div></div></section>';
      return;
    }
    var color = exam ? '#0e1a3d' : u.color, qs = [], pool;
    if (exam) {
      var bank = []; UNITS.forEach(function (x) { bank = bank.concat(x.bank); });
      shuffle(bank).slice(0, CRS.EXAM.concept).forEach(function (q) { qs.push({ c: q }); });
      pool = ALL_RHYTHMS;
      var order = [];
      while (order.length < CRS.EXAM.strips) order = order.concat(shuffle(pool));
      order.slice(0, CRS.EXAM.strips).forEach(function (r) { qs.push({ r: r }); });
    } else {
      pool = u.module ? moduleById(u.module).rhythms : null;
      var nc = pool ? 4 : 8;
      shuffle(u.bank).slice(0, nc).forEach(function (q) { qs.push({ c: q }); });
      if (pool) { var o2 = []; while (o2.length < 6) o2 = o2.concat(shuffle(pool)); o2.slice(0, 6).forEach(function (r) { qs.push({ r: r }); }); }
    }
    qs = shuffle(qs);
    var N = qs.length, qi = 0, score = 0, answered = false, missed = [];
    var title = exam ? 'Final Exam' : 'Unit ' + (unitIndex(u) + 1) + ' quiz: ' + esc(u.title);
    main.innerHTML = pageHead(color, '<a href="#home">Home</a> / <a href="#course">Course</a> / ' + (exam ? 'Final exam' : '<a href="#course-' + u.id + '">Unit ' + (unitIndex(u) + 1) + '</a> / Quiz'), title,
      N + ' questions' + (pool ? ' — concept questions and rhythm strips' : '') + '. Pass mark: ' + PASS + '%. Explanations appear after each answer.') +
      '<div class="wrap quiz-shell" id="quiz"></div>';
    var root = $('#quiz');

    function renderQ() {
      answered = false;
      var Q = qs[qi];
      root.innerHTML = '<div class="quiz-top"><div class="quiz-progress"><div class="lbl"><span>Question ' + (qi + 1) + ' of ' + N + '</span><span>Score ' + score + '/' + qi + '</span></div>' +
        '<div class="progress" style="--c:' + color + '"><i style="width:' + (qi / N * 100) + '%"></i></div></div><a class="btn btn-ghost btn-sm" href="' + (exam ? '#course' : '#course-' + u.id) + '">Exit</a></div>' +
        '<div class="panel">' + (Q.r ? '<h3 style="margin-bottom:12px">What rhythm is this?</h3><div id="qviewer"></div>' : '<div class="kc-label">Concept question</div><h3>' + esc(Q.c.q) + '</h3>') +
        '<div class="options"></div><div id="explain"></div></div>';
      var viewer = Q.r ? StripViewer($('#qviewer'), { rhythm: Q.r, hideCaption: true, hideHR: true }) : null;
      var labels, correct;
      if (Q.r) { var opts = stripChoices(Q.r, exam ? ALL_RHYTHMS.filter(function (x) { return RHYTHMS[x].module === RHYTHMS[Q.r].module; }) : pool); labels = opts.map(function (r) { return RHYTHMS[r].name; }); correct = opts.indexOf(Q.r); }
      else { var s = shuffledQ(Q.c); labels = s.labels; correct = s.correct; }
      optionButtons($('.options', root), labels, function (n) {
        if (answered) return;
        answered = true;
        var ok = n === correct;
        if (ok) score++; else missed.push(Q);
        markOptions($('.options', root), correct, n);
        if (viewer) viewer.reveal();
        $('#explain').innerHTML = (Q.r ? rhythmExplain(Q.r, ok) : '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + '</div><p style="margin:0">' + esc(Q.c.why) + '</p>' + (seeLink(Q.c) ? '<p class="hint" style="margin:8px 0 0">Covered in ' + seeLink(Q.c) + '</p>' : '')) +
          '<div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" id="nextq">' + (qi === N - 1 ? 'See results' : 'Next question →') + '</button></div></div>';
        $('#nextq').addEventListener('click', next);
        $('#nextq').focus({ preventScroll: true });
        $('#explain').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
    function next() {
      cleanup.forEach(function (f) { f(); }); cleanup = [];
      qi++;
      if (qi < N) { renderQ(); window.scrollTo({ top: $('.page-head').offsetHeight, behavior: 'smooth' }); } else results();
    }
    function results() {
      var pct = Math.round(score / N * 100), pass = pct >= PASS;
      if (exam) { if (!(course.data.exam >= pct)) course.data.exam = pct; if (pass && !course.data.passedOn) course.data.passedOn = new Date().toISOString().slice(0, 10); }
      else if (!(course.data.quiz[u.id] >= pct)) course.data.quiz[u.id] = pct;
      course.save();
      var nu = exam ? null : UNITS[unitIndex(u) + 1];
      var cont = !pass ? '' : exam ? '<a class="btn btn-primary" href="#course-cert">View your certificate →</a>' : nu ? '<a class="btn btn-primary" href="#course-' + nu.id + '">Continue to Unit ' + (unitIndex(u) + 2) + ' →</a>' : '<a class="btn btn-primary" href="#course-exam">Take the final exam →</a>';
      var review = missed.map(function (Q) {
        return Q.r ? '<li>Strip: <a href="#m-' + RHYTHMS[Q.r].module + '-r-' + Q.r + '">' + esc(RHYTHMS[Q.r].name) + '</a></li>' : '<li>' + esc(Q.c.q) + ' <span class="muted">— ' + esc(Q.c.o[Q.c.a]) + '</span>' + (seeLink(Q.c) ? '<br><span class="hint">Review: ' + seeLink(Q.c) + '</span>' : '') + '</li>';
      }).join('');
      root.innerHTML = '<div class="panel result"><div class="ring" style="--p:' + pct + ';--rc:' + (pass ? 'var(--ok)' : 'var(--red)') + '"><div>' + pct + '%</div></div>' +
        '<h2>' + (pass ? (exam ? 'You passed the final exam!' : 'Unit passed — great work!') : 'Not quite — review and try again') + '</h2>' +
        '<p class="muted">' + score + ' of ' + N + ' correct. ' + (pass ? (exam ? 'You have completed the Basic ECG Interpretation course.' : 'The next unit is unlocked.') : 'You need ' + PASS + '% to pass. Each attempt uses new questions and fresh strips.') + '</p>' +
        (review ? '<div class="review-list"><h3>Review these</h3><ul>' + review + '</ul></div>' : '') +
        '<div class="hero-cta" style="justify-content:center">' + cont + '<button class="btn btn-ghost" id="retry">' + (pass ? 'Retake' : 'Try again') + '</button><a class="btn btn-ghost" href="' + (exam ? '#course' : '#course-' + u.id) + '">' + (exam ? 'Course overview' : 'Back to the unit') + '</a></div></div>';
      $('#retry').addEventListener('click', function () { route(); });
    }
    function keys(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (!answered && /^[1-4]$/.test(e.key)) { var b = $all('#quiz .option')[+e.key - 1]; if (b) b.click(); }
      else if (answered && e.key === 'Enter' && $('#nextq')) { e.preventDefault(); $('#nextq').click(); }
    }
    document.addEventListener('keydown', keys);
    quizDetach = function () { document.removeEventListener('keydown', keys); };
    renderQ();
  }

  /* ---------- certificate ---------- */
  function viewCertificate() {
    if (!examPassed()) {
      main.innerHTML = pageHead('#0e1a3d', '<a href="#home">Home</a> / <a href="#course">Course</a> / Certificate', 'Certificate of Completion', 'Pass the final exam to earn your certificate.') +
        '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><p class="muted">Your certificate appears here once you pass the final exam with ' + PASS + '% or higher.</p><a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
      return;
    }
    var date = new Date(course.data.passedOn + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    main.innerHTML = pageHead('#0e1a3d', '<a href="#home">Home</a> / <a href="#course">Course</a> / Certificate', 'Certificate of Completion', 'Enter your name as you want it to appear, then print or save it as a PDF.') +
      '<section class="section"><div class="wrap"><div class="inline-form no-print" style="margin:0 0 18px"><label for="cert-name"><b>Your name:</b></label><input id="cert-name" type="text" maxlength="60" style="width:280px" placeholder="First and last name" value="' + esc(course.data.name || '') + '"><button class="btn btn-primary" id="cert-print">Print certificate</button></div>' +
      '<div class="cert" id="cert"><div class="cert-inner">' +
      '<img src="assets/cshealthed-logo.webp" alt="CSHealthED" width="150" height="135">' +
      '<div class="cert-kicker">Certificate of Completion</div>' +
      '<p class="cert-line">This certifies that</p><div class="cert-name" id="cert-name-out">' + esc(course.data.name || 'Your Name') + '</div>' +
      '<p class="cert-line">has successfully completed the self-paced course</p><div class="cert-course">Basic ECG Interpretation</div>' +
      '<p class="cert-meta">' + UNITS.length + ' units · narrated lessons, knowledge checks, unit quizzes and practice ECGs<br>Final exam score: <b>' + course.data.exam + '%</b> · Completed ' + esc(date) + '</p>' +
      '<div class="cert-foot"><span>CSHealthED · Healthcare Education Software</span><span>Educational course record — not a clinical credential</span></div>' +
      '</div></div></div></section>';
    $('#cert-name').addEventListener('input', function () {
      course.data.name = this.value.trim(); course.save();
      $('#cert-name-out').textContent = course.data.name || 'Your Name';
    });
    $('#cert-print').addEventListener('click', function () {
      document.documentElement.classList.add('print-cert');
      var off = function () { document.documentElement.classList.remove('print-cert'); window.removeEventListener('afterprint', off); };
      window.addEventListener('afterprint', off);
      window.print();
      setTimeout(off, 1000);
    });
  }

  function viewCourseRoute(a, b) {
    if (!a) return viewCourse();
    if (a === 'exam') return viewCourseQuiz(null);
    if (a === 'cert') return viewCertificate();
    var u = CRS.unitById(a);
    if (!u) return viewNotFound();
    if (!b) return viewCourseUnit(u);
    if (b === 'quiz') return viewCourseQuiz(u);
    var l = u.lessons.filter(function (x) { return x.id === b; })[0];
    if (!l) return viewNotFound();
    viewCourseLesson(u, l);
  }

  /* ------------------------------------------------------------ 12-LEAD COURSE */
  var C12 = ECG12Content;
  var TERR_LABEL = { inferior: 'Inferior wall', anterior: 'Anterior (anteroseptal) wall', lateral: 'Lateral wall', posterior: 'Posterior wall' };

  function twelveProgress() {
    var seen = C12.CASE_ORDER.filter(function (c) { return store.data.viewed['12:' + c]; }).length;
    return (seen + (store.data.lessons.twelve ? 1 : 0) + (store.data.quiz.twelve >= 80 ? 1 : 0)) / (C12.CASE_ORDER.length + 2);
  }

  function twelveCard() {
    var p = Math.round(twelveProgress() * 100), best = store.data.quiz.twelve;
    return '<a class="course12" href="#twelve" style="--c:' + C12.COURSE.color + '">' +
      '<div class="c12-text"><div class="eyebrow12">Separate course · beyond the 3-lead</div><h3>Basic 12-Lead ECG Interpretation</h3><p>' + C12.COURSE.tagline + '</p>' +
      '<div class="c12-meta"><span>Lesson · ' + C12.CASE_ORDER.length + ' case patterns · 10-question quiz</span><span>' + (best != null ? 'Best ' + best + '%' : p + '% complete') + '</span></div>' +
      '<div class="progress"><i style="width:' + p + '%"></i></div><span class="btn btn-primary btn-sm c12-cta">Open the 12-lead course →</span></div>' +
      '<div class="c12-thumb"><canvas id="c12-thumb" aria-label="Example 12-lead ECG" role="img"></canvas></div></a>';
  }
  function drawTwelveThumb() {
    var c = $('#c12-thumb');
    if (c) ECG12.draw(c, ECG12.generate('inferior', 77), { minWidth: 280, rhythm: false, stmap: true });
  }

  function Viewer12(host, opts) {
    var st = { pattern: opts.pattern, seed: opts.seed || seed(), terr: !!opts.territories, stmap: !!opts.stmap, axis: opts.axis };
    var sig;
    var legend = Object.keys(ECG12.TERRITORIES).map(function (k) {
      var T = ECG12.TERRITORIES[k];
      return '<span class="tchip" style="--tc:' + T.color + '"><i></i>' + T.name + ' · ' + T.leads.join(', ') + '</span>';
    }).join('') + '<span class="tchip" style="--tc:#8a93a8"><i></i>aVR · right upper view</span>';
    host.innerHTML = '<div class="toolbar">' +
      '<button class="tool-btn' + (st.terr ? ' on' : '') + '" data-act="terr" aria-pressed="' + st.terr + '">Territories</button>' +
      '<button class="tool-btn' + (st.stmap ? ' on' : '') + '" data-act="st" aria-pressed="' + st.stmap + '"' + (opts.hideST ? ' hidden' : '') + '>ST map</button>' +
      '<span class="spacer"></span><button class="tool-btn" data-act="new"' + (opts.hideNew ? ' hidden' : '') + '>' + ICON.refresh + 'New tracing</button></div>' +
      '<div class="terr-legend"' + (st.terr ? '' : ' hidden') + '>' + legend + '</div>' +
      '<div class="ecg12-scroll"><canvas role="img" aria-label="12-lead ECG tracing"></canvas></div>' +
      '<p class="hint st-hint"' + (st.stmap ? '' : ' hidden') + '><b style="color:#e0262b">Red box</b>: ST elevation meeting STEMI voltage criteria (≥ 1 mm; ≥ 1.5 mm in V2–V3). <b style="color:#1e66d0">Blue dashed</b>: ST depression ≥ 0.5 mm. Measured 40 ms after the J point against the TP baseline.</p>';
    var canvas = $('canvas', host);
    function build() { var o = Object.assign({}, opts.genOpts || {}); if (st.axis != null) o.axis = st.axis; sig = ECG12.generate(st.pattern, st.seed, o); }
    function draw() { ECG12.draw(canvas, sig, { territories: st.terr, stmap: st.stmap }); }
    function sync() {
      $('[data-act="terr"]', host).classList.toggle('on', st.terr);
      $('[data-act="st"]', host).classList.toggle('on', st.stmap);
      $('.terr-legend', host).hidden = !st.terr;
      $('.st-hint', host).hidden = !st.stmap;
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !host.contains(b)) return;
      if (b.dataset.act === 'terr') st.terr = !st.terr;
      else if (b.dataset.act === 'st') st.stmap = !st.stmap;
      else if (b.dataset.act === 'new') { st.seed = seed(); build(); }
      else return;
      sync(); draw();
    });
    build(); draw();
    onResize(draw);
    return {
      set: function (pattern, axis) { st.pattern = pattern; st.axis = axis; st.seed = seed(); build(); draw(); },
      reveal: function () { st.stmap = true; $('[data-act="st"]', host).hidden = false; sync(); draw(); },
      sig: function () { return sig; }
    };
  }

  function axisClass(a) {
    if (a >= -30 && a <= 90) return 'normal';
    if (a < -30 && a > -90) return 'lad';
    if (a > 90) return 'rad';
    return 'extreme';
  }
  function axisById(id) { return C12.AXES.filter(function (x) { return x.id === id; })[0]; }

  function hexaxialSvg() {
    var leads = [['I', 0], ['II', 60], ['III', 120], ['aVF', 90], ['aVL', -30], ['aVR', -150]];
    var cx = 150, cy = 150, R = 110;
    function pt(a, r) { return [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)]; }
    function sector(a1, a2, col) {
      var p1 = pt(a1, R), p2 = pt(a2, R), large = (a2 - a1) > 180 ? 1 : 0;
      return '<path d="M' + cx + ' ' + cy + 'L' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + 'A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1) + 'Z" fill="' + col + '" opacity=".16"/>';
    }
    var s = '<svg viewBox="0 0 300 300" class="hexaxial" role="img" aria-label="Hexaxial reference system">' +
      sector(-30, 90, '#3a9b3f') + sector(90, 180, '#f08a1c') + sector(-90, -30, '#1e88e5') + sector(-180, -90, '#e0262b') +
      '<circle cx="150" cy="150" r="110" fill="none" stroke="#c9d3e6"/>';
    leads.forEach(function (l) {
      var a = pt(l[1], R), b = pt(l[1] + 180, R), lab = pt(l[1], R + 18);
      s += '<line x1="' + b[0].toFixed(1) + '" y1="' + b[1].toFixed(1) + '" x2="' + a[0].toFixed(1) + '" y2="' + a[1].toFixed(1) + '" stroke="#9aa4bb" stroke-dasharray="3 3"/>' +
        '<text x="' + lab[0].toFixed(1) + '" y="' + (lab[1] + 4).toFixed(1) + '" text-anchor="middle" font-family="Inter" font-size="12" font-weight="700" style="fill:var(--svg-text)">' + l[0] + '</text>';
    });
    s += '<g id="axis-arrow"><line x1="150" y1="150" x2="250" y2="150" stroke="#c2185b" stroke-width="4" stroke-linecap="round"/><path d="M254 150l-14-8v16z" fill="#c2185b"/></g>' +
      '<circle cx="150" cy="150" r="5" fill="#1b2a5b"/>' +
      
      '</svg>';
    return s;
  }

  function chestSvg() {
    var V = [['V1', 186, 168, '#e0262b'], ['V2', 234, 168, '#e6b800'], ['V3', 262, 188, '#3a9b3f'], ['V4', 290, 206, '#1e66d0'], ['V5', 330, 206, '#f08a1c'], ['V6', 364, 206, '#7b4bc4']];
    var s = '<svg viewBox="0 0 420 340" class="chest-svg" role="img" aria-label="Precordial electrode positions V1 to V6">' +
      '<path d="M210 20c-24 0-38 16-38 38v14c-50 6-96 18-118 44-10 70-8 140 6 210h300c14-70 16-140 6-210-22-26-68-38-118-44V58c0-22-14-38-38-38z" style="fill:var(--chip);stroke:var(--input-border)" stroke-width="2"/>' +
      '<rect x="200" y="96" width="20" height="150" rx="8" style="fill:var(--track);stroke:var(--input-border)"/>' +
      '<path d="M200 98C170 92 130 92 96 104M220 98c30-6 70-6 104 6" stroke="#c9d3e6" stroke-width="3" fill="none"/>';
    [[130, 'ICS 2'], [150, ''], [168, 'ICS 4'], [206, 'ICS 5']].forEach(function (r) {
      s += '<path d="M90 ' + r[0] + 'Q210 ' + (r[0] + 14) + ' 370 ' + r[0] + '" stroke="#d6dcea" stroke-width="1.5" fill="none"/>';
      if (r[1]) s += '<text x="58" y="' + (r[0] + 4) + '" font-family="Inter" font-size="10" fill="#8a93a8">' + r[1] + '</text>';
    });
    s += '<line x1="290" y1="110" x2="290" y2="300" stroke="#b9c2d6" stroke-dasharray="4 4"/><text x="290" y="318" text-anchor="middle" font-family="Inter" font-size="9.5" fill="#5b6684">mid-clavicular</text>' +
      '<line x1="330" y1="120" x2="330" y2="300" stroke="#b9c2d6" stroke-dasharray="4 4"/><text x="334" y="332" text-anchor="middle" font-family="Inter" font-size="9.5" fill="#5b6684">ant. axillary</text>' +
      '<line x1="364" y1="130" x2="364" y2="300" stroke="#b9c2d6" stroke-dasharray="4 4"/><text x="378" y="318" text-anchor="middle" font-family="Inter" font-size="9.5" fill="#5b6684">mid-axillary</text>' +
      '<text x="210" y="88" text-anchor="middle" font-family="Inter" font-size="9.5" fill="#5b6684">sternal angle → 2nd rib</text>' +
      '<text x="100" y="300" text-anchor="middle" font-family="Inter" font-size="10" font-weight="700" fill="#8a93a8">Patient’s RIGHT</text><text x="320" y="70" text-anchor="middle" font-family="Inter" font-size="10" font-weight="700" fill="#8a93a8">Patient’s LEFT</text>';
    V.forEach(function (v) {
      s += '<circle cx="' + v[1] + '" cy="' + v[2] + '" r="13" fill="' + v[3] + '" stroke="#fff" stroke-width="2.5"/><text x="' + v[1] + '" y="' + (v[2] + 4) + '" text-anchor="middle" font-family="Inter" font-size="10" font-weight="800" fill="#fff">' + v[0] + '</text>';
    });
    return s + '</svg>';
  }

  function viewTwelve(query) {
    var CO = C12.COURSE;
    main.innerHTML = pageHead(CO.color, '<a href="#home">Home</a> / <a href="#modules">Courses</a> / 12-Lead', 'Basic 12-Lead ECG Interpretation',
      'A separate course for after the 3-lead modules. Learn to place a 12-lead, read its twelve views, estimate the axis, measure the ST segment and recognize STEMI patterns and common mimics.',
      '<a class="btn btn-primary" href="#q-twelve">Take the 12-lead quiz</a>') +
      '<div class="wrap" style="padding-block:28px 56px">' +
      '<nav class="lesson-nav no-print">' + [['why', '1 · Why 12 leads'], ['placement', '2 · Electrode placement'], ['views', '3 · The twelve views'], ['approach', '4 · Systematic read'], ['axis', '5 · Axis'], ['st', '6 · ST segment & STEMI'], ['cases', '7 · Case library']].map(function (x) {
        return '<a href="#" data-s="' + x[0] + '">' + x[1] + '</a>';
      }).join('') + '</nav>' +

      '<section class="panel lesson-section" id="s-why"><h2><span class="n">1</span>Why acquire a 12-lead?</h2>' +
      '<div class="two-col"><div><p>Your 3-lead monitor shows the heart from <b>two or three angles</b> — enough to identify a rhythm. A 12-lead looks at the heart from <b>twelve angles at once</b>: six in the frontal plane (I, II, III, aVR, aVL, aVF) and six across the chest in the horizontal plane (V1–V6).</p>' +
      '<p>That lets you <b>localize</b> ischemia and infarction, recognize conduction blocks and spot conditions that a rhythm strip cannot show.</p></div>' +
      '<div class="callout blue"><b>Acquire a 12-lead early</b> for chest pain or anginal equivalents (dyspnoea, weakness, syncope, epigastric pain, diaphoresis), especially in older, diabetic and female patients who often present atypically. Aim to acquire it within <b>10 minutes</b> of patient contact, transmit it per protocol, and repeat it when symptoms change.</div></div></section>' +

      '<section class="panel lesson-section" id="s-placement"><h2><span class="n">2</span>Electrode placement</h2>' +
      '<div class="two-col"><div class="chest-wrap">' + chestSvg() + '</div><div>' +
      '<table class="criteria v-table"><tr><th><span class="vdot" style="background:#e0262b"></span>V1</th><td>4th intercostal space, <b>right</b> sternal border</td></tr>' +
      '<tr><th><span class="vdot" style="background:#e6b800"></span>V2</th><td>4th intercostal space, <b>left</b> sternal border</td></tr>' +
      '<tr><th><span class="vdot" style="background:#3a9b3f"></span>V3</th><td>Midway between V2 and V4</td></tr>' +
      '<tr><th><span class="vdot" style="background:#1e66d0"></span>V4</th><td>5th intercostal space, mid-clavicular line</td></tr>' +
      '<tr><th><span class="vdot" style="background:#f08a1c"></span>V5</th><td>Anterior axillary line, level with V4</td></tr>' +
      '<tr><th><span class="vdot" style="background:#7b4bc4"></span>V6</th><td>Mid-axillary line, level with V4 and V5</td></tr></table>' +
      '<ul class="tight"><li>Find the <b>sternal angle</b> (angle of Louis) → 2nd rib → the space below is ICS 2; count down to ICS 4.</li><li>The most common error is placing V1–V2 too high, which can mimic or mask an infarct.</li><li>Place V4–V6 <b>under</b> breast tissue, not on it.</li><li>Limb electrodes (RA, LA, RL, LL) go on the limbs or proximal limbs; the patient should lie still and breathe normally to reduce artifact.</li></ul>' +
      '</div></div></section>' +

      '<section class="panel lesson-section" id="s-views"><h2><span class="n">3</span>The twelve views and their territories</h2>' +
      '<p>The standard printout shows each lead for 2.5 seconds in a 3 × 4 grid, with a 10-second rhythm strip (usually Lead II) along the bottom. Leads that look at the same wall are called <b>contiguous</b> — ST changes must appear in two contiguous leads to be significant.</p>' +
      '<div id="views-viewer"></div>' +
      '<div class="table-scroll"><table class="ref-table" style="margin-top:16px"><thead><tr><th>Wall</th><th>Leads</th><th>Usual artery</th></tr></thead><tbody>' +
      Object.keys(ECG12.TERRITORIES).map(function (k) {
        var T = ECG12.TERRITORIES[k];
        return '<tr><td class="name"><span class="vdot" style="background:' + T.color + '"></span>' + T.name + '</td><td>' + T.leads.join(', ') + '</td><td>' + T.artery + '</td></tr>';
      }).join('') +
      '<tr><td class="name"><span class="vdot" style="background:#7b4bc4"></span>Posterior</td><td>No direct view — seen as reciprocal changes in V1–V3 (confirm with V7–V9)</td><td>Circumflex or RCA</td></tr>' +
      '<tr><td class="name"><span class="vdot" style="background:#8a93a8"></span>aVR</td><td>aVR</td><td>Looks into the cavity from the right shoulder. ST elevation in aVR with widespread ST depression suggests left main or multivessel ischemia.</td></tr>' +
      '</tbody></table></div></section>' +

      '<section class="panel lesson-section" id="s-approach"><h2><span class="n">4</span>A systematic 12-lead read</h2>' +
      '<ol class="five-steps">' +
      '<li><div><b>Rate and rhythm.</b> Use the rhythm strip and everything you learned in the 3-lead modules.</div></li>' +
      '<li><div><b>Intervals.</b> PR (0.12–0.20 s), QRS (≥ 0.12 s → bundle branch block, ventricular or paced rhythm), QT (roughly less than half the R–R).</div></li>' +
      '<li><div><b>Axis.</b> Look at Lead I and aVF (Section 5).</div></li>' +
      '<li><div><b>QRS morphology.</b> R-wave progression across V1–V6, pathological Q waves, very large voltages (hypertrophy), rSR′ in V1 (RBBB).</div></li>' +
      '<li><div><b>ST segments and T waves in every lead.</b> Group findings by territory. Elevation in contiguous leads plus reciprocal depression = think STEMI.</div></li>' +
      '<li><div><b>Compare and repeat.</b> Compare with prior ECGs if available, correlate with the patient and repeat serial 12-leads.</div></li>' +
      '</ol></section>' +

      '<section class="panel lesson-section" id="s-axis"><h2><span class="n">5</span>Electrical axis — the quadrant method</h2>' +
      '<p>The axis is the average direction of ventricular depolarization in the frontal plane. Look at whether the QRS is mostly <b>positive or negative</b> in Lead I and aVF:</p>' +
      '<div class="table-scroll"><table class="ref-table axis-table"><thead><tr><th>Lead I</th><th>aVF</th><th>Axis</th></tr></thead><tbody>' +
      '<tr><td>Positive ↑</td><td>Positive ↑</td><td><b style="color:#3a9b3f">Normal</b> (0° to +90°)</td></tr>' +
      '<tr><td>Positive ↑</td><td>Negative ↓</td><td>Check Lead II: positive = <b style="color:#3a9b3f">normal</b> (0° to −30°); negative = <b style="color:#1e88e5">left axis deviation</b></td></tr>' +
      '<tr><td>Negative ↓</td><td>Positive ↑</td><td><b style="color:#f08a1c">Right axis deviation</b> (+90° to +180°)</td></tr>' +
      '<tr><td>Negative ↓</td><td>Negative ↓</td><td><b style="color:#e0262b">Extreme axis</b> (“no man’s land”) — consider ventricular rhythm or lead reversal</td></tr>' +
      '</tbody></table></div>' +
      '<div class="axis-widget"><div class="axis-left">' + hexaxialSvg() + '</div><div class="axis-right">' +
      '<label for="axis-slider" class="axis-label">Drag to change the QRS axis: <b id="axis-val">+60°</b></label>' +
      '<input type="range" id="axis-slider" min="-180" max="180" step="5" value="60">' +
      '<div class="axis-verdict" id="axis-verdict"></div>' +
      '<div class="strip-wrap"><canvas id="axis-strip"></canvas></div>' +
      '<p class="hint">Leads I, aVF and II from the same simulated heart. Watch the QRS polarity change as the axis rotates.</p></div></div>' +
      '<p class="muted" style="margin-top:12px">Left axis deviation: left anterior fascicular block, inferior MI, LVH, paced rhythms. Right axis deviation: right ventricular strain (pulmonary embolism, COPD), left posterior fascicular block, lateral MI; normal in children.</p>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-st"><h2><span class="n">6</span>The ST segment and STEMI recognition</h2>' +
      '<div class="two-col"><div><div class="strip-wrap"><canvas id="st-fig"></canvas></div><p class="hint">Lead V2 from an anterior STEMI. Measure from the <b>TP baseline</b> to the ST segment at the <b>J point</b> (some systems use J + 40–80 ms).</p></div>' +
      '<div><h3>STEMI voltage criteria</h3><p>New ST elevation at the J point in <b>two or more contiguous leads</b>:</p><ul class="tight">' +
      '<li><b>≥ 1 mm</b> in all leads other than V2–V3</li><li><b>V2–V3:</b> ≥ 2 mm in men ≥ 40, ≥ 2.5 mm in men &lt; 40, ≥ 1.5 mm in women</li>' +
      '<li><b>Reciprocal ST depression</b> in the opposite wall strongly supports STEMI</li>' +
      '<li>Posterior: ST depression in V1–V3 → obtain V7–V9 (≥ 0.5 mm elevation)</li><li>Inferior: obtain V4R for right ventricular involvement (≥ 1 mm)</li></ul>' +
      '<div class="callout" style="margin-top:12px"><b>STEMI mimics</b> — ST elevation that is not acute infarction: LBBB, ventricular paced rhythm, LVH, pericarditis, benign early repolarization, hyperkalemia, Brugada pattern, ventricular aneurysm. When in doubt, transmit and consult — never delay care for a possible STEMI.</div></div></div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-cases"><h2><span class="n">7</span>Case library</h2>' +
      '<p>Explore each pattern. Turn on <b>Territories</b> to color the lead groups and <b>ST map</b> to see measured ST deviation in every lead. Press <b>New tracing</b> for another example.</p>' +
      '<div class="case-tabs" role="tablist">' + C12.CASE_ORDER.map(function (c) {
        return '<button role="tab" data-case="' + c + '"><span class="dot' + (store.data.viewed['12:' + c] ? ' done' : '') + '"></span>' + esc(C12.CASES[c].short) + '</button>';
      }).join('') + '</div>' +
      '<div class="viewer-head" style="margin-top:14px"><div><div class="kicker" id="case-group" style="color:' + CO.color + '"></div><h2 id="case-name" style="font-size:1.4rem"></h2></div></div>' +
      '<div id="case-viewer"></div>' +
      '<div class="info-grid"><div class="panel"><h3><span class="ic">' + ICON.search + '</span>Key findings</h3><ul id="case-findings"></ul><h3 style="margin-top:14px"><span class="ic">' + ICON.eye + '</span>Tips</h3><ul id="case-tips"></ul></div>' +
      '<div class="panel"><h3><span class="ic red">' + ICON.ambulance + '</span>Prehospital considerations</h3><ul id="case-care"></ul><p class="protocol-note">General educational guidance — always follow your local protocols, STEMI destination policy and medical direction.</p></div></div>' +
      '</section>' +

      '<div class="pager"><a class="btn btn-ghost" href="#modules">← All courses</a><a class="btn btn-primary" href="#q-twelve">Take the 12-lead quiz →</a></div>' +
      '</div>';

    store.lesson('twelve');
    $all('.lesson-section').forEach(function (s) { s.style.marginTop = '18px'; });
    $('.lesson-nav').addEventListener('click', function (e) {
      var a = e.target.closest('[data-s]'); if (!a) return;
      e.preventDefault();
      $('#s-' + a.dataset.s).scrollIntoView({ behavior: 'smooth' });
    });

    Viewer12($('#views-viewer'), { pattern: 'normal', territories: true, seed: 5 });

    // axis widget
    var slider = $('#axis-slider'), axisSig;
    function drawAxis() {
      var a = +slider.value;
      $('#axis-val').textContent = (a > 0 ? '+' : '') + a + '°';
      $('#axis-arrow').setAttribute('transform', 'rotate(' + a + ' 150 150)');
      var cls = axisById(axisClass(a));
      var col = { normal: '#3a9b3f', lad: '#1e88e5', rad: '#f08a1c', extreme: '#e0262b' }[cls.id];
      axisSig = ECG12.generate('normal', 9, { axis: a, duration: 4.2 });
      function pol(L) { var v = 0, s = axisSig.leads[L]; axisSig.qrsTimes.forEach(function (b) { for (var i = Math.round(b * 500); i < Math.round((b + 0.085) * 500) && i < s.length; i++) v += s[i]; }); return v >= 0 ? '+' : '−'; }
      $('#axis-verdict').innerHTML = '<span class="badge" style="background:' + col + '22;color:' + col + '">' + cls.name + '</span> <span class="muted">Lead I ' + pol('I') + ' · aVF ' + pol('aVF') + ' · Lead II ' + pol('II') + '</span>';
      ECGRender.drawStrip($('#axis-strip'), axisSig, { leads: ['I', 'aVF', 'II'], seconds: 4, bandMM: 22 });
    }
    slider.addEventListener('input', drawAxis);
    drawAxis();

    // ST figure
    var stSig = ECG12.generate('anterior', 31, { duration: 3 });
    function drawST() {
      var q = stSig.qrsTimes.filter(function (t) { return t > 0.5; })[0];
      var t0 = q - 0.4, c = $('#st-fig');
      var info = ECGRender.drawStrip(c, stSig, { leads: ['V2'], seconds: 1.4, start: t0, width: Math.min(560, c.parentElement.clientWidth), bandMM: 26 });
      var ctx = info.ctx, b = info.bands[0], s = stSig.leads.V2;
      function X(t) { return (t - t0) * info.pps; }
      function val(t) { return s[Math.round(t * 500)]; }
      var tp = q - 0.16 - 0.06, base = 0;
      for (var k = -5; k <= 5; k++) base += s[Math.round(tp * 500) + k];
      base /= 11;
      var yb = b.base - base * info.ppmv, J = q + stSig.qrsDur - 0.005, yj = b.base - val(J + 0.04) * info.ppmv;
      ctx.save();
      ctx.strokeStyle = '#1e66d0'; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(0, yb); ctx.lineTo(info.width, yb); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#1e66d0'; ctx.font = '700 12px Inter, sans-serif'; ctx.fillText('TP baseline', 8, yb + 16);
      ctx.fillStyle = '#c2185b'; ctx.beginPath(); ctx.arc(X(J), b.base - val(J) * info.ppmv, 5, 0, 6.3); ctx.fill();
      ctx.fillText('J point', X(J) - 58, b.base - val(J) * info.ppmv + 4);
      var xm = X(J + 0.04);
      ctx.strokeStyle = '#e0262b'; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(xm, yb); ctx.lineTo(xm, yj); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xm - 5, yj + 7); ctx.lineTo(xm, yj); ctx.lineTo(xm + 5, yj + 7); ctx.stroke();
      ctx.fillStyle = '#e0262b';
      ctx.fillText('ST elevation ≈ ' + ((val(J + 0.04) - base) * 10).toFixed(1) + ' mm', xm + 10, (yb + yj) / 2 + 4);
      ctx.restore();
    }
    drawST();

    // case library
    var current = query.c && C12.CASES[query.c] ? query.c : 'normal';
    var cv = Viewer12($('#case-viewer'), { pattern: current, stmap: true });
    function showCase(id, push) {
      current = id;
      var C = C12.CASES[id];
      $('#case-group').textContent = C.group + (C.territory ? ' · ' + (TERR_LABEL[C.territory] || '') : '');
      $('#case-name').textContent = C.name;
      $('#case-findings').innerHTML = C.findings.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      $('#case-tips').innerHTML = C.tips.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      $('#case-care').innerHTML = C.care.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('');
      $all('.case-tabs [data-case]').forEach(function (b) { var on = b.dataset.case === id; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
      store.view('12:' + id);
      var d = $('.case-tabs [data-case="' + id + '"] .dot'); if (d) d.classList.add('done');
      if (push) history.replaceState(null, '', '#twelve-c-' + id);
    }
    $('.case-tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-case]'); if (!b) return;
      cv.set(b.dataset.case); showCase(b.dataset.case, true);
    });
    showCase(current, false);

    onResize(function () { drawAxis(); drawST(); });
    var target = query.s || (query.c ? 'cases' : null);
    if (target) setTimeout(function () { var el = $('#s-' + target); if (el) el.scrollIntoView(); }, 60);
  }

  function viewQuiz12() {
    var CO = C12.COURSE, N = 10;
    var stemi = ['inferior', 'anterior', 'lateral', 'posterior'];
    var qs = [];
    var interp = shuffle(C12.CASE_ORDER).concat(shuffle(C12.CASE_ORDER));
    for (var i = 0; i < 6; i++) qs.push({ type: 'interp', c: interp[i] });
    shuffle(stemi).slice(0, 2).forEach(function (c) { qs.push({ type: 'terr', c: c }); });
    shuffle(C12.AXES).slice(0, 2).forEach(function (a) { qs.push({ type: 'axis', c: 'normal', ax: a.id, angle: a.angles[Math.floor(Math.random() * a.angles.length)] }); });
    qs = shuffle(qs);
    var qi = 0, score = 0, answered = false, missed = [];

    main.innerHTML = pageHead(CO.color, '<a href="#home">Home</a> / <a href="#twelve">12-Lead</a> / Quiz', 'Basic 12-Lead ECG — Quiz',
      'Ten questions: interpretation, STEMI territory and axis. Use Territories to orient yourself — the ST map is revealed after you answer. Pass mark: 80%.') +
      '<div class="wrap quiz-shell" id="quiz"></div>';
    var root = $('#quiz');

    function optionsFor(q) {
      if (q.type === 'terr') return shuffle(stemi).map(function (t) { return { v: t, label: TERR_LABEL[t] }; });
      if (q.type === 'axis') return C12.AXES.map(function (a) { return { v: a.id, label: a.name + ' (' + a.range + ')' }; });
      var C = C12.CASES[q.c];
      var same = shuffle(C12.CASE_ORDER.filter(function (x) { return x !== q.c && C12.CASES[x].group === C.group; })).slice(0, 2);
      var rest = shuffle(C12.CASE_ORDER.filter(function (x) { return x !== q.c && same.indexOf(x) < 0; }));
      var picks = same.concat(rest).slice(0, 3).concat([q.c]);
      return shuffle(picks).map(function (x) { return { v: x, label: C12.CASES[x].name }; });
    }
    function correctOf(q) { return q.type === 'terr' ? q.c : q.type === 'axis' ? q.ax : q.c; }
    function prompt(q) { return q.type === 'terr' ? 'This patient has an acute MI. Which wall is affected?' : q.type === 'axis' ? 'What is the frontal-plane QRS axis?' : 'What is the most likely interpretation?'; }

    var viewer;
    function renderQ() {
      answered = false;
      var q = qs[qi], opts = optionsFor(q);
      root.innerHTML =
        '<div class="quiz-top"><div class="quiz-progress"><div class="lbl"><span>Question ' + (qi + 1) + ' of ' + N + '</span><span>Score ' + score + '/' + qi + '</span></div>' +
        '<div class="progress" style="--c:' + CO.color + '"><i style="width:' + ((qi / N) * 100) + '%"></i></div></div>' +
        '<a class="btn btn-ghost btn-sm" href="#twelve">Exit</a></div>' +
        '<div class="panel"><h3 style="margin-bottom:12px">' + prompt(q) + '</h3><div id="qviewer"></div>' +
        '<div class="options">' + opts.map(function (o, i) {
          return '<button class="option" data-o="' + o.v + '"><span class="key">' + (i + 1) + '</span>' + esc(o.label) + '</button>';
        }).join('') + '</div><div id="explain"></div></div>';
      viewer = Viewer12($('#qviewer'), { pattern: q.c, axis: q.type === 'axis' ? q.angle : null, hideST: true });
      $all('.option', root).forEach(function (b) { b.addEventListener('click', function () { answer(b.dataset.o); }); });
    }

    function answer(choice) {
      if (answered) return;
      answered = true;
      var q = qs[qi], right = correctOf(q), ok = choice === right;
      if (ok) score++; else missed.push(q.c);
      $all('.option', root).forEach(function (b) {
        b.disabled = true;
        if (b.dataset.o === right) b.classList.add('correct'); else if (b.dataset.o === choice) b.classList.add('wrong');
      });
      viewer.reveal();
      var C = C12.CASES[q.c], body;
      if (q.type === 'axis') {
        var A = axisById(q.ax), sig = viewer.sig();
        body = '<p>The QRS axis on this tracing is about <b>' + (sig.axis > 0 ? '+' : '') + sig.axis + '°</b>: ' + esc(A.name.toLowerCase()) + ' (' + A.range + ').</p>' +
          '<p class="muted">Quadrant method: look at whether the QRS is mainly positive or negative in Lead I and aVF; if I is positive and aVF negative, Lead II decides between normal and left axis deviation.</p>';
      } else {
        body = (q.type === 'terr' ? '<p>The changes are in the <b>' + esc(TERR_LABEL[q.c].toLowerCase()) + '</b>. ' + (C.territory === 'posterior' ? 'The posterior wall has no direct lead, so look for ST depression in V1–V3.' : 'Look at leads ' + ECG12.TERRITORIES[C.territory].leads.join(', ') + '.') + '</p>' : '') +
          '<ul class="tight">' + C.findings.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
          '<p style="margin:10px 0 0"><b>Key tip:</b> ' + esc(C.tips[0]) + '</p>';
      }
      $('#explain').innerHTML = '<div class="explain"><div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(q.type === 'axis' ? axisById(q.ax).name : q.type === 'terr' ? TERR_LABEL[q.c] : C.name) + '</div>' + body +
        '<div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn btn-primary" id="nextq">' + (qi === N - 1 ? 'See results' : 'Next question →') + '</button></div></div>';
      $('#nextq').addEventListener('click', next);
      $('#nextq').focus({ preventScroll: true });
      $('#explain').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function next() {
      cleanup.forEach(function (f) { f(); });
      cleanup = [];
      qi++;
      if (qi < N) { renderQ(); window.scrollTo({ top: $('.page-head').offsetHeight, behavior: 'smooth' }); } else results();
    }
    function results() {
      var pct = Math.round((score / N) * 100), pass = pct >= 80;
      store.score('twelve', pct);
      var um = missed.filter(function (r, i) { return missed.indexOf(r) === i; });
      root.innerHTML = '<div class="panel result"><div class="ring" style="--p:' + pct + ';--rc:' + (pass ? 'var(--ok)' : 'var(--red)') + '"><div>' + pct + '%</div></div>' +
        '<h2>' + (pass ? 'Passed — great work!' : 'Keep practicing') + '</h2>' +
        '<p class="muted">You answered ' + score + ' of ' + N + ' questions correctly. ' + (pass ? 'The 12-lead course is marked complete.' : 'A score of 80% is needed to pass.') + '</p>' +
        (um.length ? '<div class="review-list"><h3>Review these patterns</h3><ul>' + um.map(function (c) {
          return '<li><a href="#twelve-c-' + c + '">' + esc(C12.CASES[c].name) + '</a></li>';
        }).join('') + '</ul><p class="muted">Missed an axis question? Revisit <a href="#twelve-s-axis">Section 5</a>.</p></div>' : '') +
        '<div class="hero-cta" style="justify-content:center"><button class="btn btn-primary" id="retry">Try again</button><a class="btn btn-ghost" href="#twelve">Back to the course</a></div></div>';
      $('#retry').addEventListener('click', function () { route(); });
    }
    function keys(e) {
      if (e.target.tagName === 'INPUT') return;
      if (!answered && /^[1-4]$/.test(e.key)) { var b = $all('.option', root)[+e.key - 1]; if (b) b.click(); }
      else if (answered && e.key === 'Enter' && $('#nextq')) { e.preventDefault(); $('#nextq').click(); }
    }
    document.addEventListener('keydown', keys);
    quizDetach = function () { document.removeEventListener('keydown', keys); };
    renderQ();
  }

  /* ------------------------------------------------------------ PRACTICE LAB */
  var LAB_P = {
    normal: ['nsr', 'sbrady', 'stach', 'sarrhythmia', 'sarrest', 'firstDeg', 'pvc', 'bigeminy', 'multifocal'],
    either: ['pac', 'pjc', 'avpaced'],
    abnormal: ['wap', 'mat'],
    junct: ['junctEscape', 'accelJunct', 'junctTach'],
    more: ['wenck', 'mobitz2', 'twoToOne', 'chb']
  };
  var LAB_LABELS = {
    reg: { regular: 'Regular', irregular: 'Irregular', none: 'No organized rhythm' },
    p: { normal: 'Upright & uniform, one before each QRS', abnormal: 'Abnormal, varying or inverted', more: 'More P waves than QRS complexes', none: 'None (absent, flutter or fibrillatory waves)' },
    qrs: { narrow: 'Narrow (< 0.12 s)', wide: 'Wide (≥ 0.12 s)', mixed: 'Narrow with wide ectopic beats', none: 'No QRS complexes' },
    axis: { normal: 'Normal axis', lad: 'Left axis deviation', rad: 'Right axis deviation', extreme: 'Extreme axis deviation' }
  };
  function labTruthRhythm(id, sig) {
    var noQ = id === 'vf' || id === 'asystole';
    var p = LAB_P.normal.indexOf(id) >= 0 ? ['normal'] : LAB_P.either.indexOf(id) >= 0 ? ['normal', 'abnormal'] : LAB_P.abnormal.indexOf(id) >= 0 ? ['abnormal'] :
      LAB_P.junct.indexOf(id) >= 0 ? ['abnormal', 'none'] : LAB_P.more.indexOf(id) >= 0 ? ['more'] : ['none'];
    var qrs = noQ ? ['none'] : ['pvc', 'bigeminy', 'multifocal'].indexOf(id) >= 0 ? ['mixed'] :
      ['idio', 'aivr', 'vt', 'torsades', 'vpaced', 'avpaced', 'failCapture'].indexOf(id) >= 0 || ((id === 'mobitz2' || id === 'chb') && sig.meta.wide) ? ['wide'] : ['narrow'];
    var reg = noQ ? ['none'] : id === 'torsades' ? ['irregular', 'none'] : [sig.regular ? 'regular' : 'irregular'];
    var rate = noQ || id === 'torsades' ? null : sig.measuredRate;
    return { reg: reg, p: p, qrs: qrs, rate: rate };
  }

  function viewLab() {
    var lab = store.data.lab || (store.data.lab = { attempted: 0, correct: 0, best: 0 });
    var mods = MODULES.filter(function (m) { return m.rhythms; });
    var st = { mode: 'mixed', artifact: true, mods: {}, attempted: 0, correct: 0, streak: 0, last: null, item: null, checked: false };
    mods.forEach(function (m) { st.mods[m.id] = true; });
    var itemFns = [];

    main.innerHTML = pageHead('#1b7a8c', '<a href="#home">Home</a> / Practice Lab', 'Practice Lab',
      'Unlimited, randomized ECGs. Every tracing is a new patient: rates, amplitudes, T waves, R-wave progression and real-world artifact all vary. Work through the worksheet, check your answer, then move to the next one.') +
      '<div class="wrap lab-shell">' +
      '<div class="lab-controls panel">' +
      '<div class="lab-row"><span class="lab-lbl">Tracing type</span><div class="seg" role="group" aria-label="Tracing type" id="lab-mode">' +
      '<button data-mode="rhythm">3-lead rhythm strips</button><button data-mode="twelve">12-lead ECGs</button><button data-mode="mixed" class="on">Mixed</button></div>' +
      '<label class="lab-check"><input type="checkbox" id="lab-artifact" checked> Real-world artifact</label></div>' +
      '<div class="lab-row" id="lab-mods-row"><span class="lab-lbl">Rhythm groups</span><div class="lab-chips" id="lab-mods">' +
      mods.map(function (m) { return '<button class="lchip on" data-mod="' + m.id + '" style="--c:' + m.color + '" aria-pressed="true">' + m.title.replace(' Rhythms', '') + '</button>'; }).join('') + '</div></div>' +
      '<div class="lab-stats"><div><b id="ls-done">0</b><span>this session</span></div><div><b id="ls-pct">–</b><span>correct</span></div><div><b id="ls-streak">0</b><span>streak</span></div><div><b id="ls-life">' + lab.attempted + '</b><span>all-time tracings</span></div></div>' +
      '</div>' +
      '<div class="panel" id="lab-card" style="margin-top:18px"><div class="viewer-head"><div><div class="kicker" id="lab-kicker" style="color:#1b7a8c"></div><h2 id="lab-title">Interpret this tracing</h2></div>' +
      '<button class="btn btn-ghost btn-sm" id="lab-skip">Skip →</button></div><div id="lab-ecg"></div></div>' +
      '<div class="lab-grid"><form class="panel lab-form" id="lab-form" autocomplete="off"></form><div class="panel lab-answer" id="lab-answer"><div class="lab-empty"><b>Your feedback appears here.</b><p>Work through the worksheet in order: rate, rhythm, P waves, QRS, then name it. Use the calipers and switch leads as you would on a monitor. Shortcuts: <kbd>Enter</kbd> checks your answer, <kbd>N</kbd> loads the next tracing.</p></div></div></div>' +
      '</div>';

    function pickItem() {
      var twelve = st.mode === 'twelve' || (st.mode === 'mixed' && Math.random() < 0.4);
      if (twelve) {
        var weights = { normal: 2, inferior: 2, anterior: 2, lateral: 1.5, posterior: 1, rbbb: 1.2, lbbb: 1.2, lvh: 1, pericarditis: 1, hyperk: 1 };
        var pat;
        do { pat = weighted(weights); } while (pat === st.last && Math.random() < 0.85);
        var rh = weighted({ sinus: 5.5, tach: 1.2, brady: 1, afib: 1.3, firstDeg: 1 });
        if (pat === 'pericarditis') rh = Math.random() < 0.5 ? 'sinus' : 'tach';
        if (pat === 'hyperk') rh = Math.random() < 0.6 ? 'sinus' : 'brady';
        return { kind: 'twelve', id: pat, rhythm: rh, seed: seed() };
      }
      var pool = [];
      mods.forEach(function (m) { if (st.mods[m.id]) pool = pool.concat(m.rhythms); });
      if (!pool.length) pool = ALL_RHYTHMS.slice();
      var id;
      do { id = pool[Math.floor(Math.random() * pool.length)]; } while (id === st.last && pool.length > 1);
      return { kind: 'rhythm', id: id, seed: seed() };
    }
    function weighted(w) {
      var keys = Object.keys(w), tot = keys.reduce(function (a, k) { return a + w[k]; }, 0), r = Math.random() * tot;
      for (var i = 0; i < keys.length; i++) { r -= w[keys[i]]; if (r <= 0) return keys[i]; }
      return keys[0];
    }
    function sel(id, label, opts, groups) {
      var inner = groups ? groups.map(function (g) {
        return '<optgroup label="' + esc(g.label) + '">' + g.items.map(function (o) { return '<option value="' + o[0] + '">' + esc(o[1]) + '</option>'; }).join('') + '</optgroup>';
      }).join('') : Object.keys(opts).map(function (k) { return '<option value="' + k + '">' + esc(opts[k]) + '</option>'; }).join('');
      return '<div class="lf"><label for="' + id + '">' + label + '</label><select id="' + id + '"><option value="">Choose…</option>' + inner + '</select><span class="lf-mark" data-for="' + id + '"></span></div>';
    }

    function next() {
      itemFns.forEach(function (f) { f(); });
      itemFns = [];
      st.item = pickItem();
      st.last = st.item.id;
      st.checked = false;
      var it = st.item, cmark = cleanup.length;
      var gen = { vary: true, artifact: st.artifact };
      if (it.kind === 'rhythm') {
        $('#lab-kicker').textContent = '3-lead rhythm strip · 6 seconds';
        it.viewer = StripViewer($('#lab-ecg'), { rhythm: it.id, seed: it.seed, hideCaption: true, hideHR: true, hideNew: true, genOpts: gen });
      } else {
        $('#lab-kicker').textContent = '12-lead ECG · 10 seconds';
        $('#lab-ecg').innerHTML = '';
        it.viewer = Viewer12($('#lab-ecg'), { pattern: it.id, seed: it.seed, hideST: true, hideNew: true, genOpts: { vary: true, artifact: st.artifact, rhythm: it.rhythm } });
      }
      itemFns = cleanup.splice(cmark);
      renderForm();
      $('#lab-answer').innerHTML = '<div class="lab-empty"><b>Your feedback appears here.</b><p>Fill in what you can, then press <b>Check answer</b>. Nothing is required except the interpretation.</p></div>';
    }

    function renderForm() {
      var it = st.item, f = $('#lab-form'), html = '<h3>Your interpretation</h3>' +
        '<div class="lf"><label for="lf-rate">Ventricular rate</label><div class="lf-inline"><input id="lf-rate" type="number" inputmode="numeric" min="0" max="400" placeholder="e.g. 72"><span>/min</span></div><span class="lf-mark" data-for="lf-rate"></span></div>';
      if (it.kind === 'rhythm') {
        html += sel('lf-reg', 'Rhythm', LAB_LABELS.reg) + sel('lf-p', 'P waves', LAB_LABELS.p) + sel('lf-qrs', 'QRS', LAB_LABELS.qrs) +
          sel('lf-name', 'Interpretation', null, mods.map(function (m) { return { label: m.title, items: m.rhythms.map(function (r) { return [r, RHYTHMS[r].name]; }) }; }));
      } else {
        html += sel('lf-reg', 'Rhythm', { regular: 'Regular', irregular: 'Irregular' }) + sel('lf-axis', 'Axis', LAB_LABELS.axis) +
          sel('lf-name', 'Main finding', null, [{ label: '12-lead findings', items: C12.CASE_ORDER.map(function (c) { return [c, C12.CASES[c].name]; }) }]);
      }
      html += '<div class="lf-actions"><button type="submit" class="btn btn-primary" id="lab-check">Check answer</button><button type="button" class="btn btn-ghost" id="lab-reveal">Just show me</button><button type="button" class="btn btn-navy" id="lab-next" hidden>Next tracing →</button></div>';
      f.innerHTML = html;
      $('#lab-reveal').addEventListener('click', function () { check(true); });
      $('#lab-next').addEventListener('click', next);
    }

    function mark(id, ok, truthText) {
      var m = $('.lf-mark[data-for="' + id + '"]');
      if (!m) return;
      m.className = 'lf-mark ' + (ok === null ? 'na' : ok ? 'ok' : 'bad');
      m.textContent = ok === null ? truthText : (ok ? '✓ ' : '✗ ') + truthText;
    }

    function check(reveal) {
      if (st.checked) return;
      var it = st.item, sig = it.viewer.sig();
      var val = function (id) { var e = $('#' + id); return e ? e.value : ''; };
      var name = val('lf-name');
      if (!reveal && !name) { var m = $('.lf-mark[data-for="lf-name"]'); m.className = 'lf-mark bad'; m.textContent = 'Choose an interpretation first (or press “Just show me”).'; return; }
      st.checked = true;
      it.viewer.reveal();
      var rows = [], ok, truth;
      var guess = parseInt(val('lf-rate'), 10);
      if (it.kind === 'rhythm') {
        truth = labTruthRhythm(it.id, sig);
        var tr = truth.rate;
        if (tr == null) mark('lf-rate', isNaN(guess) ? null : false, 'No measurable rate');
        else mark('lf-rate', isNaN(guess) ? null : Math.abs(guess - tr) <= Math.max(6, tr * 0.1), '≈ ' + tr + '/min');
        [['lf-reg', 'reg'], ['lf-p', 'p'], ['lf-qrs', 'qrs']].forEach(function (x) {
          var v = val(x[0]);
          mark(x[0], v ? truth[x[1]].indexOf(v) >= 0 : null, truth[x[1]].map(function (k) { return LAB_LABELS[x[1]][k]; }).join(' / '));
        });
        ok = name === it.id;
        mark('lf-name', reveal && !name ? null : ok, RHYTHMS[it.id].name);
        var r = RHYTHMS[it.id];
        rows.push('<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (reveal && !name ? 'Answer' : ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(r.name) + '</div>');
        if (sig.meta.note) rows.push('<p class="muted">' + esc(sig.meta.note) + '</p>');
        rows.push(criteriaTable(r));
        rows.push('<p style="margin:12px 0 0"><b>Key tip:</b> ' + esc(r.tips[0]) + '</p>');
        rows.push('<p style="margin:8px 0 0"><a href="#m-' + r.module + '-r-' + it.id + '">Review ' + esc(r.name) + ' in its module →</a></p>');
      } else {
        var C = C12.CASES[it.id];
        mark('lf-rate', isNaN(guess) ? null : Math.abs(guess - sig.rate) <= Math.max(6, sig.rate * 0.1), '≈ ' + sig.rate + '/min');
        var rv = val('lf-reg'), tReg = sig.regular ? 'regular' : 'irregular';
        mark('lf-reg', rv ? rv === tReg : null, LAB_LABELS.reg[tReg]);
        var av = val('lf-axis'), tAx = axisClass(sig.axis);
        mark('lf-axis', av ? av === tAx : null, LAB_LABELS.axis[tAx] + ' (≈ ' + (sig.axis > 0 ? '+' : '') + sig.axis + '°)');
        ok = name === it.id;
        mark('lf-name', reveal && !name ? null : ok, C.name);
        rows.push('<div class="verdict ' + (ok ? 'ok' : 'bad') + '">' + (reveal && !name ? 'Answer' : ok ? '✓ Correct' : '✗ Not quite') + ' — ' + esc(C.name) + '</div>');
        rows.push('<table class="criteria"><tr><th>Rhythm</th><td>' + esc(sig.rhythmLabel) + ', ' + sig.rate + '/min</td></tr>' +
          '<tr><th>PR</th><td>' + (sig.pr ? sig.pr.toFixed(2) + ' s' : 'No P waves') + '</td></tr><tr><th>QRS</th><td>' + sig.qrsDur.toFixed(2) + ' s</td></tr>' +
          '<tr><th>Axis</th><td>' + (sig.axis > 0 ? '+' : '') + sig.axis + '° · ' + LAB_LABELS.axis[tAx] + '</td></tr></table>');
        rows.push('<ul class="tight">' + C.findings.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>');
        rows.push('<p style="margin:8px 0 0"><a href="#twelve-c-' + it.id + '">Review ' + esc(C.name) + ' in the 12-lead course →</a></p>');
      }
      if (sig.artifact) {
        var a = sig.artifact, kinds = [];
        if (a.tremor) kinds.push('muscle tremor (somatic)');
        if (a.mains) kinds.push('60 Hz electrical interference');
        if (a.wander) kinds.push('baseline wander (breathing / movement)');
        rows.push('<p class="artifact-note"><b>Artifact on this tracing:</b> ' + kinds.join(', ') + '. Interpret through it — and on scene, fix it (dry skin, fresh electrodes, keep the patient still and warm).</p>');
      }
      $('#lab-answer').innerHTML = '<div class="explain" style="margin:0;border:0;padding:0">' + rows.join('') + '</div>';
      if (!reveal || name) {
        st.attempted++; lab.attempted++;
        if (ok) { st.correct++; lab.correct++; st.streak++; lab.best = Math.max(lab.best || 0, st.streak); } else st.streak = 0;
        store.save();
      }
      $('#ls-done').textContent = st.attempted;
      $('#ls-pct').textContent = st.attempted ? Math.round((st.correct / st.attempted) * 100) + '%' : '–';
      $('#ls-streak').textContent = st.streak;
      $('#ls-life').textContent = lab.attempted;
      $('#lab-check').hidden = true; $('#lab-reveal').hidden = true; $('#lab-next').hidden = false;
      $('#lab-next').focus({ preventScroll: true });
      if (window.innerWidth < 980) $('#lab-answer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    $('#lab-form').addEventListener('submit', function (e) { e.preventDefault(); if (st.checked) next(); else check(false); });
    $('#lab-skip').addEventListener('click', next);
    $('#lab-mode').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mode]'); if (!b) return;
      st.mode = b.dataset.mode;
      $all('#lab-mode button').forEach(function (x) { x.classList.toggle('on', x === b); });
      $('#lab-mods-row').hidden = st.mode === 'twelve';
      next();
    });
    $('#lab-mods').addEventListener('click', function (e) {
      var b = e.target.closest('[data-mod]'); if (!b) return;
      var on = !st.mods[b.dataset.mod];
      if (!on && Object.keys(st.mods).filter(function (k) { return st.mods[k]; }).length === 1) return; // keep at least one group
      st.mods[b.dataset.mod] = on;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
    $('#lab-artifact').addEventListener('change', function () { st.artifact = this.checked; });
    function keys(e) {
      var tag = e.target.tagName;
      if ((e.key === 'n' || e.key === 'N') && tag !== 'INPUT' && tag !== 'SELECT') { e.preventDefault(); next(); }
    }
    document.addEventListener('keydown', keys);
    quizDetach = function () { document.removeEventListener('keydown', keys); };
    cleanup.push(function () { itemFns.forEach(function (f) { f(); }); });
    next();
  }

  /* ------------------------------------------------------------ PRACTICE */
  function viewPractice() {
    var mods = MODULES.filter(function (m) { return m.rhythms; });
    main.innerHTML = pageHead('#e0262b', '<a href="#home">Home</a> / Practice', 'Practice &amp; Exams', 'Every question uses a freshly generated strip, so you can retake quizzes as often as you like. Score 80% or higher to pass.') +
      '<section class="section"><div class="wrap">' +
      '<div class="exam-banner lab-banner"><div><h3>Practice Lab — unlimited ECGs</h3><p>Endless randomized rhythm strips and 12-leads with a step-by-step worksheet and instant feedback.</p></div><a class="btn btn-primary" href="#lab">Open the Practice Lab</a></div>' +
      '<div class="exam-banner"><div><h3>Final Exam</h3><p>20 mixed rhythms from all modules · ' + (store.data.quiz.exam != null ? 'best score ' + store.data.quiz.exam + '%' : 'not attempted yet') + '</p></div><a class="btn btn-primary" href="#q-exam">Start final exam</a></div>' +
      '<div class="practice-grid">' + mods.map(function (m) {
        var best = store.data.quiz[m.id];
        return '<div class="practice-card" style="--c:' + m.color + '"><div class="row"><span class="icon-badge">' + ICON[m.icon] + '</span>' + (best >= 80 ? '<span class="badge">✓ Passed</span>' : '') + '</div>' +
          '<h3>' + m.title + '</h3><p class="muted">' + m.rhythms.length + ' rhythms · 10 questions</p>' +
          '<div class="row"><span class="best">Best: <b>' + (best != null ? best + '%' : '—') + '</b></span><a class="btn btn-navy btn-sm" href="#q-' + m.id + '">Start quiz</a></div></div>';
      }).join('') +
      '<div class="practice-card" style="--c:' + C12.COURSE.color + '"><div class="row"><span class="icon-badge">' + ICON.heart + '</span>' + (store.data.quiz.twelve >= 80 ? '<span class="badge">✓ Passed</span>' : '') + '</div><h3>Basic 12-Lead ECG</h3><p class="muted">Interpretation, STEMI territory and axis · 10 questions</p><div class="row"><span class="best">Best: <b>' + (store.data.quiz.twelve != null ? store.data.quiz.twelve + '%' : '—') + '</b></span><a class="btn btn-navy btn-sm" href="#q-twelve">Start quiz</a></div></div>' +
      '<div class="practice-card" style="--c:#1b2a5b"><div class="row"><span class="icon-badge">' + ICON.search + '</span></div><h3>Rate Trainer</h3><p class="muted">Practice the 6-second, 300 and 1500 methods on random strips.</p><div class="row"><span></span><a class="btn btn-navy btn-sm" href="#m-foundations-s-rate">Open</a></div></div>' +
      '</div></div></section>';
  }

  /* ------------------------------------------------------------ REFERENCE */
  function viewReference() {
    var mods = MODULES.filter(function (m) { return m.rhythms; });
    main.innerHTML = pageHead('#1b7a8c', '<a href="#home">Home</a> / Quick reference', 'Quick Reference', 'Every rhythm in the course with its five-step criteria and an example Lead II strip.') +
      '<section class="section"><div class="wrap">' + mods.map(function (m) {
        return '<div class="ref-module" style="--c:' + m.color + '"><h2>' + m.title + '</h2><table class="ref-table"><thead><tr><th>Rhythm</th><th>Rate</th><th>Regularity</th><th>P waves</th><th>PR</th><th>QRS</th></tr></thead><tbody>' +
          m.rhythms.map(function (r) {
            var c = RHYTHMS[r].criteria;
            return '<tr><td class="name"><a href="#m-' + m.id + '-r-' + r + '">' + esc(RHYTHMS[r].name) + '</a><div class="ref-thumb"><canvas data-thumb="' + r + '"></canvas></div></td>' +
              '<td data-l="Rate">' + esc(c.rate) + '</td><td data-l="Rhythm">' + esc(c.regularity) + '</td><td data-l="P waves">' + esc(c.p) + '</td><td data-l="PR">' + esc(c.pr) + '</td><td data-l="QRS">' + esc(c.qrs) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }).join('') + '</div></section>';
    function thumbs() {
      $all('[data-thumb]').forEach(function (c, i) {
        var sig = ECGEngine.generate(c.dataset.thumb, 1000 + i, 4.2);
        ECGRender.drawStrip(c, sig, { leads: ['II'], seconds: 4, compact: true, bandMM: 26 });
      });
    }
    thumbs();
    onResize(thumbs);
  }

  function viewNotFound() {
    main.innerHTML = pageHead('#1b2a5b', '<a href="#home">Home</a>', 'Page not found', 'That page doesn’t exist. Head back to the modules to keep learning.', '<a class="btn btn-primary" href="#modules">Modules</a>');
  }

  /* ------------------------------------------------------------ router */
  // Routes are plain #names so links survive any host: #home, #modules, #practice,
  // #reference, #m-<module>[-r-<rhythm>][-s-<section>], #q-<module>
  function parse() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {}, parts = [];
    var mm = /^m-([A-Za-z]+)(?:-r-([A-Za-z0-9]+))?(?:-s-([A-Za-z]+))?$/.exec(h);
    var qm = /^q-([A-Za-z]+)$/.exec(h);
    var tw = /^twelve(?:-c-([A-Za-z]+))?(?:-s-([A-Za-z]+))?$/.exec(h);
    var cm = /^course(?:-([a-z]+))?(?:-([a-z]+))?$/.exec(h);
    if (cm) parts = ['course', cm[1], cm[2]];
    else if (tw) { parts = ['twelve']; if (tw[1]) q.c = tw[1]; if (tw[2]) q.s = tw[2]; }
    else if (mm) { parts = ['module', mm[1]]; if (mm[2]) q.r = mm[2]; if (mm[3]) q.s = mm[3]; }
    else if (qm) parts = ['quiz', qm[1]];
    else if (h && h !== 'home') parts = [h];
    return { parts: parts, query: q };
  }
  function route() {
    if (location.hash === '#main') return; // skip-link target, not a page
    cleanup.forEach(function (f) { f(); });
    cleanup = [];
    if (quizDetach) { quizDetach(); quizDetach = null; }
    var r = parse(), p = r.parts, nav = 'home';
    if (!p.length) viewHome();
    else if (p[0] === 'modules') { nav = 'modules'; viewModules(); }
    else if (p[0] === 'course') { nav = 'course'; viewCourseRoute(p[1], p[2]); }
    else if (p[0] === 'module') { nav = 'modules'; viewModule(p[1], r.query); }
    else if (p[0] === 'twelve') { nav = 'twelve'; viewTwelve(r.query); }
    else if (p[0] === 'quiz' && p[1] === 'twelve') { nav = 'twelve'; viewQuiz12(); }
    else if (p[0] === 'quiz') { nav = 'practice'; viewQuiz(p[1]); }
    else if (p[0] === 'practice') { nav = 'practice'; viewPractice(); }
    else if (p[0] === 'lab') { nav = 'lab'; viewLab(); }
    else if (p[0] === 'reference') { nav = 'reference'; viewReference(); }
    else viewNotFound();
    $all('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
    $('.site-nav').classList.remove('open');
    if (!r.query.s && !r.query.c) window.scrollTo(0, 0);
    var titles = { course: 'Basic ECG Course', lab: 'Practice Lab', twelve: '12-Lead ECG', home: 'ECG Trainer', modules: 'Modules', practice: 'Practice & Exams', reference: 'Quick Reference' };
    document.title = (titles[nav] || 'ECG Trainer') + ' · CSHealthED';
  }

  window.addEventListener('hashchange', route);
  $('.nav-toggle').addEventListener('click', function () {
    var n = $('.site-nav'); n.classList.toggle('open');
    this.setAttribute('aria-expanded', n.classList.contains('open'));
  });
  $('#reset-progress').addEventListener('click', function () {
    var b = this;
    if (b.dataset.armed) { store.reset(); course.reset(); delete b.dataset.armed; b.textContent = 'Progress reset'; route(); setTimeout(function () { b.textContent = 'Reset my progress'; }, 2500); return; }
    b.dataset.armed = '1';
    b.textContent = 'Click again to erase all progress';
    setTimeout(function () { if (b.dataset.armed) { delete b.dataset.armed; b.textContent = 'Reset my progress'; } }, 4000);
  });
  /* theme: follows the device until the user picks; choice remembered */
  var THEME_KEY = 'cshealthed-theme';
  function syncThemeButton() {
    var dark = ECGRender.isDark(), b = $('#theme-toggle');
    b.classList.toggle('is-dark', dark);
    var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
    b.setAttribute('aria-label', label); b.title = label;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0d121c' : '#1b2a5b');
  }
  function redrawForTheme() { syncThemeButton(); window.dispatchEvent(new Event('resize')); }
  $('#theme-toggle').addEventListener('click', function () {
    var next = ECGRender.isDark() ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* storage unavailable */ }
    redrawForTheme();
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSys = function () { if (!document.documentElement.hasAttribute('data-theme')) redrawForTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onSys); else if (mq.addListener) mq.addListener(onSys);
  }
  // the hosting page may also set data-theme on the root; keep the button and canvases in step
  new MutationObserver(redrawForTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  syncThemeButton();
  $('#year').textContent = new Date().getFullYear();
  route();
})();
