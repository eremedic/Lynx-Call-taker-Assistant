/* CSHealthED Basic ECG Interpretation Course — standalone self-paced course
 * (hash-routed single page app). Narrated lessons, interactive strips,
 * knowledge checks, activities, unit quizzes, a final exam and a certificate.
 * Progress is kept in this browser (localStorage).
 */
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

  // The course doesn't track individual rhythms outside its own lessons.
  var store = { view: function () {} };

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

  function leadImg() {
    return '<figure class="lead-figure"><img src="assets/3-lead-placement.webp" width="1536" height="1024" loading="lazy" decoding="async" ' +
      'alt="3-lead ECG limb lead placement: RA (white) below the right clavicle, LA (black) below the left clavicle and LL (red) on the lower left abdomen, forming Einthoven’s triangle. Lead I runs from RA (negative) to LA (positive) and views the lateral wall; Lead II runs from RA to LL and Lead III from LA to LL, both inferior views."></figure>';
  }

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
  // The lesson that teaches each rhythm, for "review this" links.
  var RHYTHM_LESSON = {};
  UNITS.forEach(function (u) {
    u.lessons.forEach(function (l) {
      l.blocks.forEach(function (b) {
        if (b[0] === 'rhythms') b[1].forEach(function (r) { if (!RHYTHM_LESSON[r]) RHYTHM_LESSON[r] = '#course-' + u.id + '-' + l.id; });
      });
    });
  });
  function rhythmLesson(id) { return RHYTHM_LESSON[id] || '#course'; }
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
    main.innerHTML = pageHead('#1b2a5b', 'Course', 'Basic ECG Interpretation Course',
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
    main.innerHTML = pageHead(u.color, '<a href="#course">Course</a> / Unit ' + (i + 1), esc(u.title), 'This unit is locked.') +
      '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><h3>' + lockIcon() + ' Pass the Unit ' + i + ' quiz to unlock this unit</h3>' +
      '<p class="muted">The course is self-paced, but each unit builds on the last. Score ' + PASS + '% or higher on the previous quiz to continue.</p>' +
      '<a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
  }
  function viewCourseUnit(u) {
    if (!unitOpen(u)) return unitLocked(u);
    var i = unitIndex(u), best = course.data.quiz[u.id];
    main.innerHTML = pageHead(u.color, '<a href="#course">Course</a> / Unit ' + (i + 1), 'Unit ' + (i + 1) + ': ' + esc(u.title), esc(u.summary),
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
      if (t === 'leadsvg') return '<div class="narr" id="' + id + '">' + leadImg() + '</div>';
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

    main.innerHTML = pageHead(u.color, '<a href="#course">Course</a> / <a href="#course-' + u.id + '">Unit ' + (i + 1) + '</a> / Lesson ' + (li + 1), esc(l.title), 'Unit ' + (i + 1) + ' · ' + esc(u.title) + ' · about ' + (l.min || 5) + ' minutes') +
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
      else if (t === 'leadsvg' && d) segs.push({ el: el, text: speechify(d) });
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
      main.innerHTML = pageHead('#0e1a3d', '<a href="#course">Course</a> / Final exam', 'Final Exam', 'The final exam unlocks when you have passed every unit quiz.') +
        '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><h3>' + lockIcon() + ' Not unlocked yet</h3><p class="muted">Pass all ' + UNITS.length + ' unit quizzes with ' + PASS + '% or higher.</p><a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
      return;
    }
    if (!exam && !quizOpen(u)) {
      main.innerHTML = pageHead(u.color, '<a href="#course">Course</a> / <a href="#course-' + u.id + '">Unit ' + (unitIndex(u) + 1) + '</a> / Quiz', 'Unit ' + (unitIndex(u) + 1) + ' quiz', 'Finish every lesson in this unit to unlock the quiz.') +
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
    main.innerHTML = pageHead(color, '<a href="#course">Course</a> / ' + (exam ? 'Final exam' : '<a href="#course-' + u.id + '">Unit ' + (unitIndex(u) + 1) + '</a> / Quiz'), title,
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
        return Q.r ? '<li>Strip: <a href="' + rhythmLesson(Q.r) + '">' + esc(RHYTHMS[Q.r].name) + '</a></li>' : '<li>' + esc(Q.c.q) + ' <span class="muted">— ' + esc(Q.c.o[Q.c.a]) + '</span>' + (seeLink(Q.c) ? '<br><span class="hint">Review: ' + seeLink(Q.c) + '</span>' : '') + '</li>';
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
      main.innerHTML = pageHead('#0e1a3d', '<a href="#course">Course</a> / Certificate', 'Certificate of Completion', 'Pass the final exam to earn your certificate.') +
        '<section class="section"><div class="wrap"><div class="panel" style="text-align:center"><p class="muted">Your certificate appears here once you pass the final exam with ' + PASS + '% or higher.</p><a class="btn btn-primary" href="' + nextStep().href + '">Go to my next step →</a></div></div></section>';
      return;
    }
    var date = new Date(course.data.passedOn + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    main.innerHTML = pageHead('#0e1a3d', '<a href="#course">Course</a> / Certificate', 'Certificate of Completion', 'Enter your name as you want it to appear, then print or save it as a PDF.') +
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


  /* ------------------------------------------------------------ not found */
  function viewNotFound() {
    main.innerHTML = pageHead('#1b2a5b', '<a href="#course">Course</a>', 'Page not found', 'That page doesn’t exist. Head back to the course overview to keep learning.', '<a class="btn btn-primary" href="#course">Course overview</a>');
  }

  /* ------------------------------------------------------------ router */
  // Routes are plain #names so links survive any host:
  //   #course (home) · #course-<unit> · #course-<unit>-<lesson> · #course-<unit>-quiz
  //   #course-exam · #course-cert
  var quizDetach = null;
  function route() {
    if (location.hash === '#main') return; // skip-link target, not a page
    cleanup.forEach(function (f) { f(); });
    cleanup = [];
    if (quizDetach) { quizDetach(); quizDetach = null; }
    var h = location.hash.replace(/^#\/?/, ''), nav = 'course';
    var cm = /^course(?:-([a-z]+))?(?:-([a-z]+))?$/.exec(h);
    if (!h || h === 'home') viewCourse();
    else if (cm) {
      viewCourseRoute(cm[1], cm[2]);
      nav = cm[1] === 'exam' ? 'exam' : cm[1] === 'cert' ? 'cert' : 'course';
    } else viewNotFound();
    $all('[data-nav]').forEach(function (a) { a.classList.toggle('active', a.dataset.nav === nav); });
    $('.site-nav').classList.remove('open');
    window.scrollTo(0, 0);
    var t = $('.page-head h1');
    document.title = (t && h && h !== 'home' ? t.textContent + ' · ' : '') + 'Basic ECG Interpretation · CSHealthED';
  }

  window.addEventListener('hashchange', route);
  $('.nav-toggle').addEventListener('click', function () {
    var n = $('.site-nav'); n.classList.toggle('open');
    this.setAttribute('aria-expanded', n.classList.contains('open'));
  });
  $('#reset-progress').addEventListener('click', function () {
    var b = this;
    if (b.dataset.armed) { course.reset(); delete b.dataset.armed; b.textContent = 'Progress reset'; route(); setTimeout(function () { b.textContent = 'Reset my progress'; }, 2500); return; }
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
