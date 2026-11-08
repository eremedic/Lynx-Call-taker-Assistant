/*
 * CSHealthED ECG Trainer — 12-lead engine and renderer
 *
 * Each wave is a 3-D cardiac vector (x = patient's left, y = inferior,
 * z = anterior). Limb leads lie in the frontal plane (hexaxial system);
 * precordial leads V1–V6 lie roughly in the horizontal plane. Every lead
 * shows the projection of the same vectors, so all twelve leads stay
 * physiologically consistent, including reciprocal ST changes.
 */
(function (global) {
  'use strict';

  var FS = 500;
  var ORDER = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];
  var DEG = Math.PI / 180;

  function norm(v) { var m = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / m, v[1] / m, v[2] / m]; }
  function fr(d) { return [Math.cos(d * DEG), Math.sin(d * DEG), 0]; }
  function hz(d, y) { return norm([Math.cos(d * DEG), y, Math.sin(d * DEG)]); }
  var LV = {
    I: fr(0), II: fr(60), III: fr(120), aVR: fr(-150), aVL: fr(-30), aVF: fr(90),
    V1: hz(118, 0.1), V2: hz(96, 0.1), V3: hz(76, 0.15), V4: hz(58, 0.2), V5: hz(32, 0.2), V6: hz(5, 0.2)
  };
  var GAIN = { V1: 1.5, V2: 1.6, V3: 1.6, V4: 1.6, V5: 1.45, V6: 1.3 };
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function axisDir(theta, z) { return norm([Math.cos(theta * DEG), Math.sin(theta * DEG), z]); }

  // Territories and the leads that look at them
  var TERRITORIES = {
    inferior: { name: 'Inferior', leads: ['II', 'III', 'aVF'], color: '#3a9b3f', artery: 'Right coronary artery (most often) or circumflex' },
    lateral: { name: 'Lateral', leads: ['I', 'aVL', 'V5', 'V6'], color: '#1e88e5', artery: 'Circumflex or diagonal branches of the LAD' },
    septal: { name: 'Septal', leads: ['V1', 'V2'], color: '#f08a1c', artery: 'Left anterior descending (septal branches)' },
    anterior: { name: 'Anterior', leads: ['V3', 'V4'], color: '#e0262b', artery: 'Left anterior descending' }
  };

  /* ---------------- pattern definitions ---------------- */
  function base(axis) {
    return {
      rate: [60, 92], pr: 0.16,
      p: { d: [0.5, 0.8, 0.15], a: 0.17, w: 0.1 },
      ta: null,
      waves: [
        { t: 0.012, sL: 0.007, sR: 0.007, a: 0.22, d: [-0.5, 0.15, 0.8] },              // septal (q / r in V1)
        { t: 0.043, sL: 0.012, sR: 0.012, a: 1.35, d: axisDir(axis == null ? 55 : axis, -0.42) }, // main ventricular
        { t: 0.072, sL: 0.011, sR: 0.011, a: 0.33, d: [-0.55, -0.55, -0.5] }             // terminal (S)
      ],
      qrs: 0.09,
      st: null,
      t: { d: [0.55, 0.55, 0.45], a: 0.36, sL: 0.058, sR: 0.042 },
      tExtra: null
    };
  }

  var PATTERNS = {
    normal: function (h) { return base(h.r(30, 75)); },
    inferior: function (h) {
      var P = base(h.r(45, 70));
      P.st = { d: [-0.25, 1, 0], a: h.r(0.18, 0.28) };
      P.tExtra = { d: [-0.25, 1, 0], a: 0.22 };
      return P;
    },
    anterior: function (h) {
      var P = base(h.r(35, 65));
      P.st = { d: [0.12, -0.2, 1], a: h.r(0.2, 0.3) };
      P.tExtra = { d: [0.12, -0.1, 1], a: 0.28 };
      P.waves[0].a = 0.12; // loss of septal r wave
      return P;
    },
    lateral: function (h) {
      var P = base(h.r(20, 50));
      P.st = { d: [1, -0.45, -0.12], a: h.r(0.16, 0.24) };
      P.tExtra = { d: [1, -0.45, -0.12], a: 0.2 };
      return P;
    },
    posterior: function (h) {
      var P = base(h.r(40, 70));
      P.waves[1].d = axisDir(55, 0.45); // loss of posterior forces → tall R in V1–V2
      P.waves[2].d = [-0.55, -0.55, 0.1];
      P.st = { d: [0.1, 0.15, -1], a: h.r(0.17, 0.24) };
      P.t = { d: [0.4, 0.45, 0.85], a: 0.4, sL: 0.058, sR: 0.042 };
      return P;
    },
    rbbb: function (h) {
      var P = base(h.r(30, 70));
      P.qrs = 0.13;
      P.waves[1].d = axisDir(50, -0.75);
      P.waves[1].a = 1.45;
      P.waves[2].t = 0.068; P.waves[2].a = 0.2;
      P.waves.push({ t: 0.112, sL: 0.016, sR: 0.02, a: 0.8, d: [-0.55, 0.05, 0.85] }); // late rightward/anterior → R′ in V1, slurred S in I, V6
      P.t = { d: [0.65, 0.55, -0.12], a: 0.3, sL: 0.06, sR: 0.045 };
      return P;
    },
    lbbb: function (h) {
      var P = base(h.r(-15, 30));
      P.qrs = 0.15;
      P.waves = [
        { t: 0.025, sL: 0.016, sR: 0.016, a: 0.35, d: [0.75, 0.05, -0.55] },
        { t: 0.065, sL: 0.024, sR: 0.026, a: 1.25, d: [0.75, 0.25, -0.62] },
        { t: 0.118, sL: 0.022, sR: 0.024, a: 1.05, d: [0.85, 0.05, -0.5] }
      ];
      P.st = { d: [-0.7, -0.15, 0.65], a: 0.16 };
      P.t = { d: [-0.7, -0.15, 0.65], a: 0.4, sL: 0.07, sR: 0.05 };
      return P;
    },
    lvh: function (h) {
      var P = base(h.r(15, 50));
      P.qrs = 0.1;
      P.waves[1].a = 2.95;
      P.waves[2].a = 0.55;
      P.st = { d: [-0.65, -0.25, 0.35], a: 0.08 };
      P.t = { d: [-0.6, -0.1, 0.5], a: 0.32, sL: 0.06, sR: 0.045 };
      return P;
    },
    pericarditis: function (h) {
      var P = base(h.r(40, 70));
      P.rate = [96, 112];
      P.st = { d: [0.55, 0.6, 0.5], a: h.r(0.13, 0.17) };
      P.ta = { d: [-0.5, -0.8, -0.2], a: 0.06 }; // PR depression (PR elevation in aVR)
      return P;
    },
    hyperk: function (h) {
      var P = base(h.r(40, 70));
      P.rate = [58, 80];
      P.p.a = 0.07; P.p.w = 0.12;
      P.qrs = 0.12;
      P.waves.forEach(function (w) { w.sL *= 1.35; w.sR *= 1.35; w.t *= 1.25; });
      P.t = { d: [0.5, 0.55, 0.6], a: 0.95, sL: 0.03, sR: 0.026, early: 0.04 };
      return P;
    }
  };

  /* ---------------- synthesis ---------------- */
  function H(rng) {
    return { r: function (a, b) { return a + rng() * (b - a); }, pick: function (a) { return a[Math.floor(rng() * a.length)]; } };
  }

  function generate(pattern, seed, opts) {
    opts = opts || {};
    var rng = ECGEngine.mulberry32(seed);
    var h = H(rng);
    var P = PATTERNS[pattern](h);
    if (opts.axis != null) P.waves[1].d = axisDir(opts.axis, -0.42);
    var dur = opts.duration || 10;
    var rate = h.r(P.rate[0], P.rate[1]), RR = 60 / rate;
    var n = Math.ceil(dur * FS) + 1;
    var waves = [], plats = [], beats = [];
    var t = h.r(0.25, 0.6);
    while (t < dur + 0.6) {
      var rr = RR * (1 + (rng() - 0.5) * 0.04);
      beats.push(t);
      var pOn = t - P.pr;
      waves.push({ c: pOn + P.p.w / 2, sL: P.p.w * 0.26, sR: P.p.w * 0.22, a: P.p.a, d: norm(P.p.d) });
      if (P.ta) plats.push({ t1: pOn + P.p.w, t2: t - 0.005, up: 0.02, down: 0.01, a: P.ta.a, d: norm(P.ta.d) });
      P.waves.forEach(function (w) { waves.push({ c: t + w.t, sL: w.sL, sR: w.sR, a: w.a, d: norm(w.d) }); });
      var qt = Math.max(0.3, Math.min(0.44, 0.4 * Math.sqrt(rr)));
      var tPeak = t + qt - 0.075 - (P.t.early || 0);
      waves.push({ c: tPeak, sL: P.t.sL, sR: P.t.sR, a: P.t.a, d: norm(P.t.d) });
      if (P.tExtra) waves.push({ c: tPeak - 0.01, sL: 0.06, sR: 0.045, a: P.tExtra.a, d: norm(P.tExtra.d) });
      if (P.st) plats.push({ t1: t + P.qrs - 0.012, t2: tPeak - 0.03, up: 0.012, down: 0.09, a: P.st.a, d: norm(P.st.d) });
      t += rr;
    }

    var leads = {};
    ORDER.forEach(function (L) {
      var v = LV[L], g = GAIN[L] || 1;
      var s = new Float32Array(n);
      waves.forEach(function (w) {
        var k = w.a * dot(w.d, v) * g;
        if (Math.abs(k) < 1e-4) return;
        var i0 = Math.max(0, Math.floor((w.c - 4 * w.sL) * FS)), i1 = Math.min(n - 1, Math.ceil((w.c + 4 * w.sR) * FS));
        for (var i = i0; i <= i1; i++) {
          var d = i / FS - w.c, sg = d < 0 ? w.sL : w.sR;
          s[i] += k * Math.exp(-(d * d) / (2 * sg * sg));
        }
      });
      plats.forEach(function (p) {
        var k = p.a * dot(p.d, v) * g;
        var i0 = Math.max(0, Math.floor((p.t1 - p.up) * FS)), i1 = Math.min(n - 1, Math.ceil((p.t2 + p.down) * FS));
        for (var i = i0; i <= i1; i++) {
          var tt = i / FS, f;
          if (tt < p.t1) f = 0.5 - 0.5 * Math.cos(Math.PI * (tt - p.t1 + p.up) / p.up);
          else if (tt <= p.t2) f = 1;
          else f = 0.5 + 0.5 * Math.cos(Math.PI * (tt - p.t2) / p.down);
          s[i] += k * f;
        }
      });
      var wf = 0.1 + rng() * 0.15, wp = rng() * 6.28, wa = 0.008 + rng() * 0.012;
      for (var j = 0; j < n; j++) s[j] += wa * Math.sin(2 * Math.PI * wf * j / FS + wp) + 0.004 * (rng() + rng() - 1);
      leads[L] = s;
    });

    // ST deviation in mm at J + 40 ms, referenced to the TP segment, averaged over beats
    var st = {};
    ORDER.forEach(function (L) {
      var s = leads[L], sum = 0, cnt = 0;
      beats.forEach(function (b) {
        var tp = b - P.pr - 0.06, j = b + P.qrs + 0.04;
        if (tp < 0.02 || j * FS >= n - 2) return;
        var i0 = Math.round(tp * FS), base = 0;
        for (var k = -5; k <= 5; k++) base += s[i0 + k];
        base /= 11;
        sum += s[Math.round(j * FS)] - base; cnt++;
      });
      st[L] = cnt ? Math.round((sum / cnt) * 100) / 10 : 0;
    });

    // frontal axis from net QRS area in I and aVF
    function net(L) {
      var s = leads[L], tot = 0;
      beats.forEach(function (b) { for (var t2 = b - 0.01; t2 < b + Math.min(P.qrs, 0.085); t2 += 1 / FS) { var i = Math.round(t2 * FS); if (i > 0 && i < n) tot += s[i]; } });
      return tot;
    }
    var axis = Math.round(Math.atan2(net('aVF'), net('I')) / DEG);

    return { fs: FS, duration: dur, leads: leads, spikes: [], qrsTimes: beats, rate: Math.round(rate), st: st, axis: axis, pattern: pattern, seed: seed, qrsDur: P.qrs };
  }

  /* ---------------- renderer: standard 3 × 4 + rhythm strip ---------------- */
  var LAYOUT = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']];

  function territoryOf(L) {
    for (var k in TERRITORIES) if (TERRITORIES[k].leads.indexOf(L) >= 0) return TERRITORIES[k];
    return null;
  }

  function draw12(canvas, sig, opts) {
    opts = opts || {};
    var cssW = Math.max(opts.minWidth || 720, canvas.parentElement.clientWidth || 900);
    var CAL_MM = 6, TOTAL_MM = 250 + CAL_MM;
    var pxmm = cssW / TOTAL_MM;
    var ROW = 27 * pxmm, TOP = 3 * pxmm;
    var rows = opts.rhythm === false ? 3 : 4;
    var H = Math.round(TOP + ROW * rows + 2 * pxmm);
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    canvas.style.width = cssW + 'px'; canvas.style.height = H + 'px';
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(H * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var x0 = CAL_MM * pxmm, pps = 25 * pxmm, ppmv = 10 * pxmm, colW = 2.5 * pps;

    ctx.fillStyle = '#fff7f6'; ctx.fillRect(0, 0, cssW, H);

    // territory tint
    if (opts.territories) {
      LAYOUT.forEach(function (row, r) {
        row.forEach(function (L, c) {
          var T = territoryOf(L);
          ctx.fillStyle = T ? T.color : '#8a93a8';
          ctx.globalAlpha = T ? 0.13 : 0.08;
          ctx.fillRect(x0 + c * colW, TOP + r * ROW, colW, ROW);
          ctx.globalAlpha = 1;
        });
      });
    }

    // grid
    ctx.beginPath(); ctx.strokeStyle = 'rgba(232,120,120,0.2)'; ctx.lineWidth = 0.5;
    if (pxmm >= 2.4) {
      for (var gx = 0; gx <= cssW; gx += pxmm) { ctx.moveTo(Math.round(gx) + 0.5, 0); ctx.lineTo(Math.round(gx) + 0.5, H); }
      for (var gy = 0; gy <= H; gy += pxmm) { ctx.moveTo(0, Math.round(gy) + 0.5); ctx.lineTo(cssW, Math.round(gy) + 0.5); }
    }
    ctx.stroke();
    ctx.beginPath(); ctx.strokeStyle = 'rgba(214,72,72,0.45)'; ctx.lineWidth = 0.9;
    for (var Gx = 0; Gx <= cssW + 1; Gx += pxmm * 5) { ctx.moveTo(Math.round(Gx) + 0.5, 0); ctx.lineTo(Math.round(Gx) + 0.5, H); }
    for (var Gy = 0; Gy <= H + 1; Gy += pxmm * 5) { ctx.moveTo(0, Math.round(Gy) + 0.5); ctx.lineTo(cssW, Math.round(Gy) + 0.5); }
    ctx.stroke();

    function trace(L, t0, t1, xs, base) {
      var s = sig.leads[L];
      ctx.beginPath();
      var first = true;
      for (var x = 0; x <= (t1 - t0) * pps; x += 0.5) {
        var tt = t0 + x / pps, fi = tt * sig.fs, i = Math.floor(fi);
        if (i < 0 || i >= s.length - 1) continue;
        var v = s[i] + (s[i + 1] - s[i]) * (fi - i);
        var y = base - v * ppmv;
        if (first) { ctx.moveTo(xs + x, y); first = false; } else ctx.lineTo(xs + x, y);
      }
      ctx.stroke();
    }
    function cal(base) {
      ctx.beginPath();
      ctx.moveTo(pxmm * 0.8, base); ctx.lineTo(pxmm * 1.6, base); ctx.lineTo(pxmm * 1.6, base - ppmv);
      ctx.lineTo(pxmm * 4.4, base - ppmv); ctx.lineTo(pxmm * 4.4, base); ctx.lineTo(pxmm * 5.4, base);
      ctx.stroke();
    }

    var fs = Math.max(10, Math.min(15, Math.round(pxmm * 3)));
    ctx.lineJoin = 'round';
    for (var r = 0; r < rows; r++) {
      var base = TOP + r * ROW + ROW * 0.55;
      ctx.strokeStyle = '#16161d'; ctx.lineWidth = Math.min(1.7, Math.max(1.1, pxmm * 0.3));
      cal(base);
      ctx.save(); ctx.beginPath(); ctx.rect(0, TOP + r * ROW, cssW, ROW); ctx.clip();
      if (r < 3) {
        LAYOUT[r].forEach(function (L, c) { trace(L, c * 2.5, (c + 1) * 2.5, x0 + c * colW, base); });
      } else {
        trace(opts.rhythmLead || 'II', 0, 10, x0, base);
      }
      ctx.restore();
      // lead labels + separators
      ctx.font = '700 ' + fs + 'px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      var labels = r < 3 ? LAYOUT[r] : [opts.rhythmLead || 'II'];
      labels.forEach(function (L, c) {
        var x = x0 + c * colW;
        if (c > 0) { ctx.strokeStyle = '#16161d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, base - 3 * pxmm); ctx.lineTo(x, base + 3 * pxmm); ctx.stroke(); }
        ctx.fillStyle = '#5a1f1f';
        ctx.fillText(L, x + 5, TOP + r * ROW + 4);
        if (opts.stmap && r < 3) {
          var v = sig.st[L], lim = (L === 'V2' || L === 'V3') ? 1.5 : 1;
          if (Math.abs(v) >= 0.5) {
            var elev = v >= lim, dep = v <= -0.5;
            if (elev || dep) {
              ctx.strokeStyle = elev ? '#e0262b' : '#1e66d0';
              ctx.lineWidth = 2.2;
              ctx.setLineDash(elev ? [] : [6, 4]);
              ctx.strokeRect(x + 2, TOP + r * ROW + 2, colW - 4, ROW - 4);
              ctx.setLineDash([]);
              ctx.font = '700 ' + (fs - 1) + 'px Inter, system-ui, sans-serif';
              var txt = (v > 0 ? '↑ ' : '↓ ') + Math.abs(v).toFixed(1) + ' mm';
              var tw = ctx.measureText(txt).width;
              ctx.fillStyle = elev ? '#e0262b' : '#1e66d0';
              ctx.fillRect(x + colW - tw - 14, TOP + r * ROW + 5, tw + 8, fs + 6);
              ctx.fillStyle = '#fff';
              ctx.fillText(txt, x + colW - tw - 10, TOP + r * ROW + 8);
              ctx.font = '700 ' + fs + 'px Inter, system-ui, sans-serif';
            }
          }
        }
      });
    }
    ctx.fillStyle = 'rgba(122,43,43,.75)';
    ctx.font = '500 ' + Math.max(9, Math.min(12, Math.round(pxmm * 2.3))) + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
    ctx.fillText('25 mm/s · 10 mm/mV · ' + sig.rate + ' bpm', cssW - 6, H - 3);
    ctx.textAlign = 'left';
    return { pxmm: pxmm, pps: pps, x0: x0 };
  }

  global.ECG12 = { generate: generate, draw: draw12, TERRITORIES: TERRITORIES, ORDER: ORDER, LAYOUT: LAYOUT, patterns: Object.keys(PATTERNS) };
})(window);
