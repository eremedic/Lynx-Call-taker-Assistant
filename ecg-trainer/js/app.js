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
    var data = { viewed: {}, quiz: {}, lessons: {} };
    try { var raw = localStorage.getItem(KEY); if (raw) data = Object.assign(data, JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
    return {
      data: data,
      view: function (id) { if (!data.viewed[id]) { data.viewed[id] = true; save(); } },
      lesson: function (id) { if (!data.lessons[id]) { data.lessons[id] = true; save(); } },
      score: function (mod, pct) { if (!(data.quiz[mod] >= pct)) { data.quiz[mod] = pct; save(); } },
      reset: function () { data.viewed = {}; data.quiz = {}; data.lessons = {}; save(); }
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
      '<button class="tool-btn" data-act="new" title="Generate a new strip of this rhythm">' + ICON.refresh + 'New strip</button>' +
      '</div>' +
      '<div class="strip-wrap"><canvas aria-label="ECG rhythm strip" role="img"></canvas><div class="monitor-hr" hidden></div></div>' +
      '<div class="strip-caption"></div>';
    var wrap = $('.strip-wrap', host), canvas = $('canvas', host), cap = $('.strip-caption', host), hrEl = $('.monitor-hr', host);

    calipers = ECGRender.attachCalipers(wrap, canvas, function () { return st.mode === 'paper' ? info : null; });

    function leads() { return st.lead === 'All' ? ['I', 'II', 'III'] : [st.lead]; }
    function build() {
      paperSig = ECGEngine.generate(st.id, st.seed, 6.2);
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
        if (!monSig) monSig = ECGEngine.generate(st.id, st.seed, 60);
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
    var href = m.exam ? '#/quiz/exam' : '#/module/' + m.id;
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
      '<div class="hero-cta"><a class="btn btn-primary" href="#/module/foundations">Start with Foundations</a><a class="btn btn-light" href="#/modules">Browse modules</a></div>' +
      '<div class="hero-stats"><div><b>' + MODULES.length + '</b><span>learning modules</span></div><div><b>' + ALL_RHYTHMS.length + '</b><span>rhythms</span></div><div><b>∞</b><span>unique practice strips</span></div></div>' +
      '</div><div><div class="monitor-frame"><div class="monitor-top"><div><div class="mlabel">II · ECG · 25 mm/s</div><div class="seg" style="margin-top:8px;background:rgba(255,255,255,.06)" id="teaser">' +
      teaser.map(function (t, i) { return '<button data-r="' + t[0] + '" class="' + (i === 0 ? 'on' : '') + '" style="color:#9fe9c0">' + t[1] + '</button>'; }).join('') +
      '</div></div><div style="text-align:right"><div class="mlabel">HR <span class="heart">♥</span></div><div class="hr"><span id="hr">--</span><small>bpm</small></div></div></div>' +
      '<div class="monitor-canvas-wrap"><canvas id="hero-mon"></canvas></div>' +
      '<div class="monitor-foot"><span id="hero-name">Normal Sinus Rhythm</span><span>Simulated · for education</span></div></div></div></div></section>' +

      '<section class="section"><div class="wrap"><div class="section-head"><div><h2>Learning modules</h2><p>Work through the modules in order — each one builds on the last. Your progress is saved in this browser.</p></div>' +
      '<a class="btn btn-ghost" href="#/practice">Practice &amp; exams →</a></div>' +
      '<div class="module-grid">' + MODULES.map(moduleCard).join('') + '</div></div></section>' +

      '<section class="section" style="padding-top:0"><div class="wrap"><div class="section-head"><div><h2>How it works</h2><p>Built around how paramedics actually read rhythms on a 3-lead monitor.</p></div></div>' +
      '<div class="steps">' +
      '<div class="step"><div class="n">1</div><h3>Learn the pattern</h3><p>Each rhythm has the five-step criteria, recognition tips and prehospital considerations beside a realistic strip.</p></div>' +
      '<div class="step"><div class="n">2</div><h3>Measure it yourself</h3><p>Switch between Leads I, II and III, watch it live on a monitor, and drag calipers to measure PR, QRS and R–R intervals.</p></div>' +
      '<div class="step"><div class="n">3</div><h3>Prove it</h3><p>Every strip is generated fresh, so you can’t memorise answers. Pass each module quiz with 80% and finish with the final exam.</p></div>' +
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
    cleanup.push(function () { if (mon) mon.stop(); clearInterval(t); });
  }

  /* ------------------------------------------------------------ MODULES LIST */
  function viewModules() {
    main.innerHTML = pageHead('#1b7a8c', '<a href="#/">Home</a> / Modules', 'Learning Modules', 'A structured path from the basics of the ECG to complex blocks and paced rhythms. Complete each module’s rhythms and pass its quiz (80%) to finish it.') +
      '<section class="section"><div class="wrap"><div class="module-grid">' + MODULES.map(moduleCard).join('') + '</div></div></section>';
  }

  /* ------------------------------------------------------------ MODULE */
  function viewModule(id, query) {
    var m = moduleById(id);
    if (!m) return viewNotFound();
    if (m.lesson) return viewFoundations(m, query);
    if (m.exam) { location.hash = '#/quiz/exam'; return; }
    var current = query.r && m.rhythms.indexOf(query.r) >= 0 ? query.r : m.rhythms[0];
    var idx = MODULES.indexOf(m);
    var next = MODULES[idx + 1];

    main.innerHTML = pageHead(m.color, '<a href="#/">Home</a> / <a href="#/modules">Modules</a> / Module ' + m.num, m.title, m.tagline,
      '<a class="btn btn-primary" href="#/quiz/' + m.id + '">Take module quiz</a>') +
      '<div class="wrap module-layout" style="--c:' + m.color + '">' +
      '<aside class="rhythm-list" aria-label="Rhythms in this module"><h4>Rhythms</h4>' +
      m.rhythms.map(function (r) {
        return '<button data-r="' + r + '"><span class="dot' + (store.data.viewed[r] ? ' done' : '') + '"></span>' + esc(RHYTHMS[r].name) + '</button>';
      }).join('') +
      '<div class="quiz-link"><a class="btn btn-navy btn-sm" style="width:100%" href="#/quiz/' + m.id + '">' + ICON.trophy.replace('<svg', '<svg width="16" height="16"') + ' Module quiz' + (store.data.quiz[m.id] != null ? ' · best ' + store.data.quiz[m.id] + '%' : '') + '</a></div>' +
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
      history.replaceState(null, '', '#/module/' + m.id + '?r=' + rid);
      if (scroll) $('#viewer-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    $('.rhythm-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]'); if (!b) return;
      viewer.set(b.dataset.r); show(b.dataset.r, window.innerWidth < 980);
    });
    $('#prev').addEventListener('click', function () { var i = m.rhythms.indexOf(current); if (i > 0) { viewer.set(m.rhythms[i - 1]); show(m.rhythms[i - 1], true); } });
    $('#next').addEventListener('click', function () {
      var i = m.rhythms.indexOf(current);
      if (i < m.rhythms.length - 1) { viewer.set(m.rhythms[i + 1]); show(m.rhythms[i + 1], true); } else location.hash = '#/quiz/' + m.id;
    });
    show(current, false);
  }

  /* ------------------------------------------------------------ FOUNDATIONS */
  function viewFoundations(m, query) {
    main.innerHTML = pageHead(m.color, '<a href="#/">Home</a> / <a href="#/modules">Modules</a> / Module 1', 'Foundations of ECG Interpretation', 'Everything you need before you read your first rhythm: how the heart conducts, what each wave means, how to read the paper, where the three leads go and a systematic way to analyse every strip.',
      '<a class="btn btn-primary" href="#/module/sinus">Next: Sinus Rhythms →</a>') +
      '<div class="wrap" style="padding:28px 20px 56px">' +
      '<nav class="lesson-nav no-print"><a href="#" data-s="conduction">1 · Conduction system</a><a href="#" data-s="waves">2 · Waves &amp; intervals</a><a href="#" data-s="paper">3 · ECG paper</a><a href="#" data-s="leads">4 · 3-lead placement</a><a href="#" data-s="approach">5 · Systematic approach</a><a href="#" data-s="rate">6 · Rate trainer</a></nav>' +

      '<section class="panel lesson-section" id="s-conduction"><h2><span class="n">1</span>The cardiac conduction system</h2>' +
      '<p>Each heartbeat starts with an electrical impulse. On the ECG, you are watching that impulse travel through the heart. It follows a set pathway:</p>' +
      '<div class="pathway">' +
      '<div class="node"><b>SA node</b><span>Primary pacemaker in the right atrium</span></div>' +
      '<div class="node"><b>Atria</b><span>Internodal pathways → atrial depolarisation (P wave)</span></div>' +
      '<div class="node"><b>AV node</b><span>Brief delay so the ventricles can fill (PR segment)</span></div>' +
      '<div class="node"><b>Bundle of His</b><span>Into the septum</span></div>' +
      '<div class="node"><b>Bundle branches</b><span>Right and left</span></div>' +
      '<div class="node"><b>Purkinje fibres</b><span>Rapid ventricular depolarisation (QRS)</span></div></div>' +
      '<p style="margin-top:14px">If a higher pacemaker fails, a lower one takes over at its own slower <b>intrinsic rate</b>. Knowing these rates tells you where a rhythm is coming from:</p>' +
      '<div class="pacers"><div class="pacer" style="background:#3a9b3f"><b>60–100</b><span>SA node · sinus rhythms</span></div><div class="pacer" style="background:#f08a1c"><b>40–60</b><span>AV junction · junctional rhythms</span></div><div class="pacer" style="background:#e53935"><b>20–40</b><span>Ventricles · idioventricular rhythms</span></div></div>' +
      '</section>' +

      '<section class="panel lesson-section" id="s-waves"><h2><span class="n">2</span>Waves, segments and intervals</h2>' +
      '<p>Below is one cardiac cycle in Lead II, magnified. Each part reflects a specific electrical event.</p>' +
      '<div class="strip-wrap" style="max-width:760px;margin:0 auto"><canvas id="anatomy"></canvas></div>' +
      '<div class="normal-values">' +
      '<div class="nv"><b>P wave</b><span>Atrial depolarisation · upright in II · ≤ 0.11 s</span></div>' +
      '<div class="nv"><b>PR interval 0.12–0.20 s</b><span>Start of P to start of QRS (3–5 small boxes)</span></div>' +
      '<div class="nv"><b>QRS &lt; 0.12 s</b><span>Ventricular depolarisation (narrow = under 3 small boxes)</span></div>' +
      '<div class="nv"><b>T wave</b><span>Ventricular repolarisation · the “vulnerable period”</span></div>' +
      '<div class="nv"><b>ST segment</b><span>End of QRS to start of T — should sit on the baseline</span></div>' +
      '<div class="nv"><b>QT interval</b><span>Start of QRS to end of T · roughly &lt; ½ the R–R</span></div>' +
      '<div class="nv"><b>J point</b><span>Where the QRS ends and the ST segment begins</span></div>' +
      '<div class="nv"><b>Atrial repolarisation</b><span>Hidden inside the QRS — not seen</span></div>' +
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
      '<div class="el"><span class="sw" style="background:#222;border-color:#222"></span><span><b>LA — black</b> (IEC: yellow) · left arm or below left clavicle</span></div>' +
      '<div class="el"><span class="sw" style="background:#e0262b;border-color:#e0262b"></span><span><b>LL — red</b> (IEC: green) · left lower torso or left leg</span></div></div>' +
      '<p class="callout" style="margin-top:14px"><b>Memory aid (AHA colours):</b> “White on the right, smoke (black) over fire (red).”</p>' +
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

      '<div class="pager"><a class="btn btn-ghost" href="#/modules">← All modules</a><a class="btn btn-primary" href="#/module/sinus">Continue to Module 2: Sinus Rhythms →</a></div>' +
      '</div>';

    store.lesson('foundations');
    $all('.lesson-section').forEach(function (s) { s.style.marginTop = '18px'; });
    $('.lesson-nav').addEventListener('click', function (e) {
      var a = e.target.closest('[data-s]'); if (!a) return;
      e.preventDefault();
      $('#s-' + a.dataset.s).scrollIntoView({ behavior: 'smooth' });
    });

    // anatomy figure
    var demo = ECGEngine.generate('demo', 7, 1.4);
    function drawAnatomy() {
      var c = $('#anatomy');
      var w = Math.min(760, c.parentElement.clientWidth);
      var info = ECGRender.drawStrip(c, demo, { leads: ['II'], seconds: 1.4, width: w, bandMM: 24, start: 0.05 });
      var ctx = info.ctx, b = info.bands[0], pps = info.pps, ppmv = info.ppmv, t0 = 0.05;
      function X(t) { return (t - t0) * pps; }
      var q = 0.35, pOn = q - 0.16, pEnd = pOn + 0.1, qEnd = q + 0.085, tEnd = q + 0.4 + 0.02, tPeak = q + 0.4 - 0.075;
      ctx.font = '800 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      function lbl(t, mv, text, col) { ctx.fillStyle = col || '#1b2a5b'; ctx.fillText(text, X(t), b.base - mv * ppmv); }
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

  function leadSvg() {
    return '<svg viewBox="0 0 400 380" role="img" aria-label="Einthoven triangle showing 3-lead electrode placement">' +
      '<defs><marker id="ar" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1b2a5b"/></marker></defs>' +
      '<path d="M200 28c-30 0-46 22-46 48 0 18 8 32 20 40-46 6-92 20-108 56l-8 190h284l-8-190c-16-36-62-50-108-56 12-8 20-22 20-40 0-26-16-48-46-48z" fill="#eef2f9" stroke="#c9d3e6" stroke-width="2"/>' +
      '<path d="M200 182c-24 0-40 18-40 40 0 30 40 52 40 52s40-22 40-52c0-22-16-40-40-40z" fill="#ffd9d9" stroke="#e8a3a3" opacity=".8"/>' +
      '<line x1="96" y1="150" x2="304" y2="150" stroke="#1b2a5b" stroke-width="3" marker-end="url(#ar)"/>' +
      '<line x1="96" y1="150" x2="296" y2="322" stroke="#1b7a8c" stroke-width="3" marker-end="url(#ar)"/>' +
      '<line x1="304" y1="150" x2="304" y2="320" stroke="#7b4bc4" stroke-width="3" marker-end="url(#ar)"/>' +
      '<text x="200" y="140" text-anchor="middle" font-family="Inter" font-weight="700" font-size="15" fill="#1b2a5b">Lead I</text>' +
      '<text x="180" y="262" text-anchor="middle" font-family="Inter" font-weight="700" font-size="15" fill="#1b7a8c" transform="rotate(40 180 262)">Lead II</text>' +
      '<text x="318" y="240" font-family="Inter" font-weight="700" font-size="15" fill="#7b4bc4">Lead III</text>' +
      '<circle cx="96" cy="150" r="17" fill="#fff" stroke="#55607a" stroke-width="3"/><text x="96" y="155" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12" fill="#1b2a5b">RA</text>' +
      '<circle cx="304" cy="150" r="17" fill="#222" stroke="#222" stroke-width="3"/><text x="304" y="155" text-anchor="middle" font-family="Inter" font-weight="800" font-size="12" fill="#fff">LA</text>' +
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

    main.innerHTML = pageHead(m.color, '<a href="#/">Home</a> / <a href="#/practice">Practice</a> / ' + (exam ? 'Final exam' : 'Module ' + m.num + ' quiz'),
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
        '<a class="btn btn-ghost btn-sm" href="' + (exam ? '#/practice' : '#/module/' + m.id) + '">Exit</a></div>' +
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
        '<h2>' + (pass ? 'Passed — great work!' : 'Keep practising') + '</h2>' +
        '<p class="muted">You identified ' + score + ' of ' + N + ' rhythms correctly' + (rateTries ? ' and estimated ' + rateHits + ' of ' + rateTries + ' rates within 10%' : '') + '. ' + (pass ? 'This ' + (exam ? 'exam' : 'module') + ' is marked complete.' : 'A score of 80% is needed to pass.') + '</p>' +
        (uniqMissed.length ? '<div class="review-list"><h3>Review these rhythms</h3><ul>' + uniqMissed.map(function (r) {
          return '<li><a href="#/module/' + RHYTHMS[r].module + '?r=' + r + '">' + esc(RHYTHMS[r].name) + '</a></li>';
        }).join('') + '</ul></div>' : '') +
        '<div class="hero-cta" style="justify-content:center"><button class="btn btn-primary" id="retry">Try again</button>' +
        (exam ? '<a class="btn btn-ghost" href="#/practice">Back to practice</a>' : '<a class="btn btn-ghost" href="#/module/' + m.id + '">Back to module</a>') + '</div></div>';
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

  /* ------------------------------------------------------------ PRACTICE */
  function viewPractice() {
    var mods = MODULES.filter(function (m) { return m.rhythms; });
    main.innerHTML = pageHead('#e0262b', '<a href="#/">Home</a> / Practice', 'Practice &amp; Exams', 'Every question uses a freshly generated strip, so you can retake quizzes as often as you like. Score 80% or higher to pass.') +
      '<section class="section"><div class="wrap">' +
      '<div class="exam-banner"><div><h3>Final Exam</h3><p>20 mixed rhythms from all modules · ' + (store.data.quiz.exam != null ? 'best score ' + store.data.quiz.exam + '%' : 'not attempted yet') + '</p></div><a class="btn btn-primary" href="#/quiz/exam">Start final exam</a></div>' +
      '<div class="practice-grid">' + mods.map(function (m) {
        var best = store.data.quiz[m.id];
        return '<div class="practice-card" style="--c:' + m.color + '"><div class="row"><span class="icon-badge">' + ICON[m.icon] + '</span>' + (best >= 80 ? '<span class="badge">✓ Passed</span>' : '') + '</div>' +
          '<h3>' + m.title + '</h3><p class="muted">' + m.rhythms.length + ' rhythms · 10 questions</p>' +
          '<div class="row"><span class="best">Best: <b>' + (best != null ? best + '%' : '—') + '</b></span><a class="btn btn-navy btn-sm" href="#/quiz/' + m.id + '">Start quiz</a></div></div>';
      }).join('') +
      '<div class="practice-card" style="--c:#1b2a5b"><div class="row"><span class="icon-badge">' + ICON.search + '</span></div><h3>Rate Trainer</h3><p class="muted">Practise the 6-second, 300 and 1500 methods on random strips.</p><div class="row"><span></span><a class="btn btn-navy btn-sm" href="#/module/foundations?s=rate">Open</a></div></div>' +
      '</div></div></section>';
  }

  /* ------------------------------------------------------------ REFERENCE */
  function viewReference() {
    var mods = MODULES.filter(function (m) { return m.rhythms; });
    main.innerHTML = pageHead('#1b7a8c', '<a href="#/">Home</a> / Quick reference', 'Quick Reference', 'Every rhythm in the course with its five-step criteria and an example Lead II strip.', '<button class="btn btn-light no-print" onclick="window.print()">Print</button>') +
      '<section class="section"><div class="wrap">' + mods.map(function (m) {
        return '<div class="ref-module" style="--c:' + m.color + '"><h2>' + m.title + '</h2><table class="ref-table"><thead><tr><th>Rhythm</th><th>Rate</th><th>Regularity</th><th>P waves</th><th>PR</th><th>QRS</th></tr></thead><tbody>' +
          m.rhythms.map(function (r) {
            var c = RHYTHMS[r].criteria;
            return '<tr><td class="name"><a href="#/module/' + m.id + '?r=' + r + '">' + esc(RHYTHMS[r].name) + '</a><div class="ref-thumb"><canvas data-thumb="' + r + '"></canvas></div></td>' +
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
    main.innerHTML = pageHead('#1b2a5b', '<a href="#/">Home</a>', 'Page not found', 'That page doesn’t exist. Head back to the modules to keep learning.', '<a class="btn btn-primary" href="#/modules">Modules</a>');
  }

  /* ------------------------------------------------------------ router */
  function parse() {
    var h = location.hash.replace(/^#\/?/, '');
    var q = {}, qs = h.split('?')[1];
    if (qs) qs.split('&').forEach(function (kv) { var p = kv.split('='); q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    return { parts: h.split('?')[0].split('/').filter(Boolean), query: q };
  }
  function route() {
    cleanup.forEach(function (f) { f(); });
    cleanup = [];
    if (quizDetach) { quizDetach(); quizDetach = null; }
    var r = parse(), p = r.parts, nav = 'home';
    if (!p.length) viewHome();
    else if (p[0] === 'modules') { nav = 'modules'; viewModules(); }
    else if (p[0] === 'module') { nav = 'modules'; viewModule(p[1], r.query); }
    else if (p[0] === 'quiz') { nav = 'practice'; viewQuiz(p[1]); }
    else if (p[0] === 'practice') { nav = 'practice'; viewPractice(); }
    else if (p[0] === 'reference') { nav = 'reference'; viewReference(); }
    else viewNotFound();
    $all('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
    $('.site-nav').classList.remove('open');
    if (!r.query.s) window.scrollTo(0, 0);
    var titles = { home: 'ECG Trainer', modules: 'Modules', practice: 'Practice & Exams', reference: 'Quick Reference' };
    document.title = (titles[nav] || 'ECG Trainer') + ' · CSHealthED';
  }

  window.addEventListener('hashchange', route);
  $('.nav-toggle').addEventListener('click', function () {
    var n = $('.site-nav'); n.classList.toggle('open');
    this.setAttribute('aria-expanded', n.classList.contains('open'));
  });
  $('#reset-progress').addEventListener('click', function () {
    if (confirm('Reset all saved progress and quiz scores in this browser?')) { store.reset(); route(); }
  });
  $('#year').textContent = new Date().getFullYear();
  route();
})();
