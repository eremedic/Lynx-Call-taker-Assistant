/*
 * CSHealthED ECG Trainer — waveform engine
 *
 * Every wave (P, Q, R, S, T, flutter/fibrillation activity) is modeled as a
 * cardiac vector: an amplitude, a direction in the frontal plane (axis, in
 * degrees) and a shape in time. A limb lead "sees" the projection of that
 * vector onto its own axis (Lead I = 0°, Lead II = 60°, Lead III = 120°), so
 * the three leads are always physiologically consistent (Einthoven: II = I + III).
 */
(function (global) {
  'use strict';

  var FS = 500; // samples per second
  var LEADS = { I: 0, II: 60, III: 120 };
  var DEG = Math.PI / 180;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function proj(axis, lead) {
    return Math.cos((axis - LEADS[lead]) * DEG);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  /* ------------------------------------------------------------------ */
  /* Strip: a collection of waves that renders to sampled lead signals    */
  /* ------------------------------------------------------------------ */
  function Strip(duration, rng) {
    this.duration = duration;
    this.rng = rng;
    this.waves = [];
    this.baselines = [];
    this.spikes = [];
    this.qrsTimes = [];
    this.pTimes = [];
    this.meta = {};
    // per-patient variation and artifact (only when generate() is asked for it)
    var v = CUR.vary;
    this.qScale = v ? 0.72 + rng() * 0.55 : 1;
    this.tScale = v ? 0.6 + rng() * 0.75 : 1;
    this.pScale = v ? 0.75 + rng() * 0.5 : 1;
    this.art = CUR.artifact ? {
      tremor: rng() < 0.28 ? 0.012 + rng() * 0.03 : 0,
      mains: rng() < 0.12 ? 0.008 + rng() * 0.012 : 0,
      wander: rng() < 0.4 ? 0.04 + rng() * 0.07 : 0
    } : null;
    // 'force' guarantees visible artifact (used by the course's artifact lesson)
    if (this.art && CUR.artifact === 'force' && !this.art.tremor && !this.art.mains) this.art[rng() < 0.6 ? 'tremor' : 'mains'] = 0.02 + rng() * 0.015;
  }
  var CUR = {};

  // Asymmetric Gaussian wave: center (s), left/right widths (s), amplitude (mV), axis (deg)
  Strip.prototype.wave = function (c, sL, sR, amp, axis) {
    this.waves.push({ c: c, sL: sL, sR: sR || sL, a: amp, ax: axis });
  };

  Strip.prototype.baseline = function (fn, axis) {
    this.baselines.push({ fn: fn, ax: axis });
  };

  // P wave beginning at `start`
  Strip.prototype.addP = function (start, o) {
    o = o || {};
    var amp = (o.amp != null ? o.amp : 0.17) * this.pScale;
    var axis = o.axis != null ? o.axis : 55;
    var w = o.width || 0.1;
    var c = start + w / 2;
    if (o.biphasic) {
      this.wave(c - w * 0.18, w * 0.2, w * 0.2, amp * 0.8, axis);
      this.wave(c + w * 0.22, w * 0.18, w * 0.2, amp * 0.6, axis + 180);
    } else {
      this.wave(c, w * 0.26, w * 0.22, amp, axis);
    }
    this.pTimes.push(start);
  };

  // QRS complex beginning at `onset`, followed by its T wave.
  // o.type: narrow | bbb | wide | paced ; o.rr = preceding cycle length (for QT)
  Strip.prototype.addQRS = function (onset, o) {
    o = o || {};
    var type = o.type || 'narrow';
    var ax = o.axis != null ? o.axis : 60;
    var rr = o.rr || 0.85;
    var g = (o.gain || 1) * this.qScale;
    var tAmp = (o.tAmp != null ? o.tAmp : 1) * this.tScale;
    var qt;
    if (type === 'narrow') {
      qt = clamp(0.4 * Math.sqrt(rr), 0.24, 0.46);
      this.wave(onset + 0.012, 0.006, 0.006, 0.1 * g, ax + 180);
      this.wave(onset + 0.04, 0.0105, 0.011, 1.25 * g, ax);
      this.wave(onset + 0.067, 0.009, 0.01, 0.3 * g, ax + 165);
      this.wave(onset + qt - 0.075, 0.058, 0.042, 0.3 * tAmp, ax - 15);
    } else if (type === 'bbb') {
      qt = clamp(0.42 * Math.sqrt(rr), 0.28, 0.48);
      this.wave(onset + 0.04, 0.013, 0.015, 1.0 * g, ax);
      this.wave(onset + 0.088, 0.014, 0.018, 0.5 * g, ax + 25);
      this.wave(onset + 0.118, 0.012, 0.012, 0.15 * g, ax + 180);
      this.wave(onset + qt - 0.06, 0.06, 0.045, 0.22 * tAmp, ax + 180);
    } else {
      // wide (ventricular origin) or paced
      qt = clamp(0.44 * Math.sqrt(rr), 0.27, 0.5);
      var big = type === 'paced' ? 1.15 : 1.3;
      this.wave(onset + 0.065, 0.034, 0.03, big * g, ax);
      this.wave(onset + 0.138, 0.026, 0.03, 0.5 * g, ax + 180);
      this.wave(onset + qt - 0.04, 0.075, 0.06, 0.5 * tAmp * g, ax + 180);
    }
    this.qrsTimes.push(onset);
  };

  Strip.prototype.addSpike = function (t, axis, amp) {
    this.spikes.push({ t: t, ax: axis != null ? axis : -30, a: amp || 1.3 });
  };

  Strip.prototype.render = function () {
    var n = Math.ceil(this.duration * FS) + 1;
    var out = {};
    var rng = this.rng;
    var self = this;
    Object.keys(LEADS).forEach(function (lead) {
      var s = new Float32Array(n);
      // waves
      self.waves.forEach(function (w) {
        var k = w.a * proj(w.ax, lead);
        if (Math.abs(k) < 1e-4) return;
        var i0 = Math.max(0, Math.floor((w.c - 4 * w.sL) * FS));
        var i1 = Math.min(n - 1, Math.ceil((w.c + 4 * w.sR) * FS));
        for (var i = i0; i <= i1; i++) {
          var d = i / FS - w.c;
          var sg = d < 0 ? w.sL : w.sR;
          s[i] += k * Math.exp(-(d * d) / (2 * sg * sg));
        }
      });
      // continuous activity (fibrillation, flutter, torsades ...)
      self.baselines.forEach(function (b) {
        var k = b.ax == null ? 1 : proj(b.ax, lead);
        for (var i = 0; i < n; i++) s[i] += k * b.fn(i / FS, lead);
      });
      // baseline wander + low-level noise (realism)
      var wf = 0.12 + rng() * 0.15, wp = rng() * 6.28, wa = 0.015 + rng() * 0.02;
      var nf = 0.006;
      for (var j = 0; j < n; j++) {
        var t = j / FS;
        s[j] += wa * Math.sin(2 * Math.PI * wf * t + wp) + nf * (rng() + rng() - 1);
      }
      var A = self.art;
      if (A) {
        if (A.wander) { var rf = 0.18 + rng() * 0.15, rp = rng() * 6.28, ra = A.wander * (lead === 'I' ? 0.5 : 1); for (var w = 0; w < n; w++) s[w] += ra * Math.sin(2 * Math.PI * rf * w / FS + rp); }
        if (A.tremor) {
          var tc = [];
          for (var c = 0; c < 6; c++) tc.push({ f: 18 + rng() * 30, p: rng() * 6.28 });
          var bf = 0.3 + rng() * 0.5, bp = rng() * 6.28, ta = A.tremor * (0.6 + rng() * 0.8);
          for (var u = 0; u < n; u++) {
            var tt = u / FS, env = Math.max(0, Math.sin(2 * Math.PI * bf * tt + bp)) * 0.8 + 0.2, sum = 0;
            for (var c2 = 0; c2 < tc.length; c2++) sum += Math.sin(2 * Math.PI * tc[c2].f * tt + tc[c2].p);
            s[u] += ta * env * sum / 2.4 + ta * 0.4 * (rng() - 0.5);
          }
        }
        if (A.mains) for (var m = 0; m < n; m++) s[m] += A.mains * Math.sin(2 * Math.PI * 60 * m / FS);
      }
      out[lead] = s;
    });
    // pacer spikes: projected per lead
    var spikes = this.spikes.map(function (sp) {
      var r = { t: sp.t };
      Object.keys(LEADS).forEach(function (l) {
        var v = sp.a * proj(sp.ax, l);
        r[l] = Math.abs(v) < 0.35 ? (v < 0 ? -0.35 : 0.35) : v; // spikes stay visible
      });
      return r;
    });
    return { fs: FS, duration: this.duration, leads: out, spikes: spikes, qrsTimes: this.qrsTimes.slice().sort(function (a, b) { return a - b; }), meta: this.meta };
  };

  /* ------------------------------------------------------------------ */
  /* Generator helpers                                                    */
  /* ------------------------------------------------------------------ */
  function H(rng) {
    return {
      r: function (a, b) { return a + rng() * (b - a); },
      i: function (a, b) { return Math.floor(a + rng() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(rng() * arr.length)]; },
      chance: function (p) { return rng() < p; }
    };
  }

  function sinusBeat(st, onset, o) {
    o = o || {};
    if (!o.noP) st.addP(onset - (o.pr || 0.16), o.p);
    st.addQRS(onset, { type: o.qrs || 'narrow', axis: o.qrsAxis, rr: o.rr });
  }

  // Fibrillatory baseline (AF): several incoherent oscillations
  function fWaves(rng, amp) {
    var comps = [];
    for (var k = 0; k < 5; k++) {
      comps.push({ f: 4.5 + rng() * 4, p: rng() * 6.28, m: 0.15 + rng() * 0.5, mp: rng() * 6.28, a: 0.5 + rng() * 0.5 });
    }
    return function (t) {
      var v = 0;
      for (var k = 0; k < comps.length; k++) {
        var c = comps[k];
        v += c.a * (0.6 + 0.4 * Math.sin(2 * Math.PI * c.m * t + c.mp)) * Math.sin(2 * Math.PI * c.f * t + c.p + 0.6 * Math.sin(t * 1.3 + k));
      }
      return (v / comps.length) * amp * 2;
    };
  }

  // Ventricular fibrillation: chaotic, amplitude-modulated, lead-dependent
  function vfWave(rng, amp) {
    var per = {};
    ['I', 'II', 'III'].forEach(function (l) {
      var comps = [];
      for (var k = 0; k < 4; k++) comps.push({ f: 3 + rng() * 4.5, p: rng() * 6.28, m: 0.1 + rng() * 0.35, mp: rng() * 6.28 });
      per[l] = { comps: comps, g: l === 'I' ? 0.6 + rng() * 0.3 : 0.8 + rng() * 0.4 };
    });
    return function (t, lead) {
      var P = per[lead], v = 0;
      for (var k = 0; k < P.comps.length; k++) {
        var c = P.comps[k];
        v += (0.55 + 0.45 * Math.sin(2 * Math.PI * c.m * t + c.mp)) * Math.sin(2 * Math.PI * c.f * t + c.p + 0.8 * Math.sin(0.7 * t + k));
      }
      return (v / 2.2) * amp * P.g;
    };
  }

  /* ------------------------------------------------------------------ */
  /* Rhythm generators  (rng, duration) -> Strip                          */
  /* ------------------------------------------------------------------ */
  var G = {};

  function regular(rateRange, o) {
    o = o || {};
    return function (rng, dur) {
      var h = H(rng), st = new Strip(dur, rng);
      var rate = h.r(rateRange[0], rateRange[1]);
      var RR = 60 / rate;
      var pr = o.pr ? h.r(o.pr[0], o.pr[1]) : h.r(0.13, 0.18);
      var qrsAxis = o.qrsAxis != null ? o.qrsAxis : h.r(40, 75);
      var t = -h.r(0, RR) + 0.25;
      if (o.firstAt) t = o.firstAt;
      while (t < dur + 0.6) {
        var rr = RR * (1 + (rng() - 0.5) * (o.var || 0.03));
        sinusBeat(st, t, { pr: pr, rr: rr, qrsAxis: qrsAxis, qrs: o.qrs, noP: o.noP });
        t += rr;
      }
      st.meta.rate = rate;
      st.meta.pr = pr;
      return st;
    };
  }

  G.nsr = regular([62, 96]);
  G.sbrady = regular([38, 56]);
  G.stach = regular([108, 150], { pr: [0.12, 0.15] });
  G.firstDeg = regular([58, 92], { pr: [0.24, 0.36] });
  // fixed, predictable beat used by the annotated 'anatomy of a beat' figure
  G.demo = regular([60, 60], { pr: [0.16, 0.16], firstAt: 0.35, qrsAxis: 60, var: 0.0001 });

  G.sarrhythmia = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.r(58, 84), RR0 = 60 / rate, per = h.r(3.2, 4.8), ph = rng() * 6.28, pr = h.r(0.13, 0.18);
    var t = h.r(0.15, 0.5) - RR0;
    while (t < dur + 0.6) {
      var rr = RR0 * (1 + 0.24 * Math.sin((2 * Math.PI * t) / per + ph));
      sinusBeat(st, t, { pr: pr, rr: rr });
      t += rr;
    }
    st.meta.rate = rate;
    return st;
  };

  G.sarrest = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.r(62, 84), RR = 60 / rate, pr = h.r(0.13, 0.18);
    var t = h.r(0.2, 0.6), nextPause = h.r(1.4, 2.4);
    while (t < dur + 0.6) {
      sinusBeat(st, t, { pr: pr, rr: RR });
      if (t > nextPause) {
        t += h.r(2.1, 3.1); // pause that is NOT a multiple of the P-P interval
        nextPause = t + h.r(5, 9);
      } else t += RR * (1 + (rng() - 0.5) * 0.03);
    }
    st.meta.rate = rate;
    return st;
  };

  // Generic "underlying rhythm + premature ectopic beats"
  function ectopy(o) {
    return function (rng, dur) {
      var h = H(rng), st = new Strip(dur, rng);
      var rate = h.r(o.rate[0], o.rate[1]), RR = 60 / rate, pr = h.r(0.13, 0.18);
      var qrsAxis = h.r(45, 70);
      var t = h.r(0.15, 0.5);
      var normalsLeft = o.firstAfter ? o.firstAfter(h) : h.i(1, 3);
      var ctx = { h: h, st: st, RR: RR, pr: pr, qrsAxis: qrsAxis, n: 0, rng: rng };
      while (t < dur + 0.6) {
        sinusBeat(st, t, { pr: pr, rr: RR, qrsAxis: qrsAxis });
        if (normalsLeft <= 1) {
          t = o.ectopic(ctx, t);
          ctx.n++;
          normalsLeft = o.every(h, ctx);
        } else {
          normalsLeft--;
          t += RR * (1 + (rng() - 0.5) * 0.03);
        }
      }
      st.meta.rate = rate;
      return st;
    };
  }

  function addPVC(ctx, at, axis, gainVar) {
    ctx.st.addQRS(at, { type: 'wide', axis: axis, rr: ctx.RR * 0.6, gain: gainVar || 1 });
  }

  G.pac = ectopy({
    rate: [64, 90],
    every: function (h) { return h.i(3, 6); },
    ectopic: function (c, t) {
      var at = t + c.RR * c.h.r(0.58, 0.7);
      c.st.addP(at - 0.14, { axis: c.h.pick([5, 100, -20, 110]), amp: 0.14, width: 0.085 });
      c.st.addQRS(at, { type: 'narrow', axis: c.qrsAxis, rr: c.RR * 0.65 });
      return at + c.RR * 1.02; // non-compensatory pause (SA node reset)
    }
  });

  G.pjc = ectopy({
    rate: [64, 88],
    every: function (h) { return h.i(3, 6); },
    ectopic: function (c, t) {
      var at = t + c.RR * c.h.r(0.62, 0.72);
      var style = c.h.pick(['before', 'none', 'after']);
      if (style === 'before') c.st.addP(at - 0.085, { axis: -90, amp: 0.15, width: 0.07 });
      if (style === 'after') c.st.addP(at + 0.12, { axis: -90, amp: 0.13, width: 0.07 });
      c.st.addQRS(at, { type: 'narrow', axis: c.qrsAxis, rr: c.RR * 0.7 });
      return at + c.RR;
    }
  });

  G.pvc = function (rng, dur) {
    var axis = H(rng).pick([-90, 100, -110, 200, 20]);
    return ectopy({
      rate: [64, 90],
      every: function (h) { return h.i(3, 5); },
      ectopic: function (c, t) {
        var at = t + c.RR * c.h.r(0.52, 0.62);
        addPVC(c, at, axis);
        return t + 2 * c.RR; // full compensatory pause
      }
    })(rng, dur);
  };

  G.bigeminy = function (rng, dur) {
    var h0 = H(rng);
    var axis = h0.pick([-90, 100, -110, 200]);
    var trig = h0.chance(0.35);
    var st = ectopy({
      rate: [64, 88],
      firstAfter: function () { return trig ? 2 : 1; },
      every: function () { return trig ? 2 : 1; },
      ectopic: function (c, t) {
        var at = t + c.RR * c.h.r(0.55, 0.6);
        addPVC(c, at, axis);
        return t + 2 * c.RR;
      }
    })(rng, dur);
    st.meta.note = trig ? 'Pattern shown: ventricular trigeminy (every 3rd beat is a PVC)' : 'Pattern shown: ventricular bigeminy (every other beat is a PVC)';
    return st;
  };

  G.multifocal = ectopy({
    rate: [66, 90],
    every: function (h) { return h.i(2, 3); },
    ectopic: function (c, t) {
      var axes = [-90, 100, 200, -110, 20];
      var at = t + c.RR * c.h.r(0.5, 0.64);
      addPVC(c, at, axes[c.n % axes.length], c.h.r(0.7, 1.15));
      if (c.h.chance(0.25)) {
        // couplet
        var at2 = at + c.RR * 0.5;
        addPVC(c, at2, axes[(c.n + 2) % axes.length], c.h.r(0.7, 1.1));
        return t + 3 * c.RR;
      }
      return t + 2 * c.RR;
    }
  });

  function wanderingP(rateRange) {
    return function (rng, dur) {
      var h = H(rng), st = new Strip(dur, rng);
      var rate = h.r(rateRange[0], rateRange[1]), RR = 60 / rate;
      var foci = [
        { axis: 55, amp: 0.17, width: 0.1, pr: 0.16 },
        { axis: 15, amp: 0.13, width: 0.08, pr: 0.14 },
        { axis: -70, amp: 0.13, width: 0.07, pr: 0.11 },
        { axis: 85, amp: 0.22, width: 0.07, pr: 0.15, biphasic: false },
        { axis: 40, amp: 0.15, width: 0.09, pr: 0.19, biphasic: true }
      ];
      var t = h.r(0.2, 0.5), qa = h.r(45, 70);
      while (t < dur + 0.6) {
        var f = h.pick(foci);
        var rr = RR * h.r(0.78, 1.25);
        st.addP(t - f.pr, f);
        st.addQRS(t, { type: 'narrow', axis: qa, rr: rr });
        t += rr;
      }
      st.meta.rate = rate;
      return st;
    };
  }
  G.wap = wanderingP([60, 95]);
  G.mat = wanderingP([110, 140]);

  G.flutter = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var fRate = h.r(275, 320), T = 60 / fRate, f0 = rng() * T;
    var mode = h.pick(['2:1', '3:1', '4:1', '4:1', 'variable']);
    var amp = h.r(0.24, 0.34);
    st.baseline(function (t) {
      var ph = (((t - f0) / T) % 1 + 1) % 1;
      var v = ph < 0.68 ? 0.5 - ph / 0.68 : -0.5 + (ph - 0.68) / 0.32;
      return v * amp;
    }, 90);
    var qa = h.r(45, 70), delay = h.r(0.16, 0.22) * T / 0.2;
    var k = -4, last = null;
    while (true) {
      var ratio = mode === 'variable' ? h.pick([2, 3, 4, 4]) : parseInt(mode, 10);
      var at = f0 + k * T + delay;
      if (at > dur + 0.6) break;
      st.addQRS(at, { type: 'narrow', axis: qa, rr: last ? at - last : ratio * T, tAmp: 0.6 });
      last = at;
      k += ratio;
    }
    st.meta.rate = mode === 'variable' ? null : fRate / parseInt(mode, 10);
    st.meta.note = 'Flutter wave rate ≈ ' + Math.round(fRate) + '/min · ' + (mode === 'variable' ? 'variable' : mode) + ' AV conduction';
    return st;
  };

  G.afib = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rvr = h.chance(0.45);
    var rate = rvr ? h.r(115, 165) : h.r(70, 105), RR = 60 / rate;
    var coarse = h.chance(0.5);
    st.baseline(fWaves(rng, coarse ? 0.08 : 0.045), 85);
    var t = h.r(0.1, 0.4), qa = h.r(45, 75), prev = RR;
    while (t < dur + 0.6) {
      st.addQRS(t, { type: 'narrow', axis: qa, rr: prev, tAmp: 0.75 });
      prev = Math.max(0.3, RR * h.r(0.55, 1.5));
      t += prev;
    }
    st.meta.rate = rate;
    st.meta.note = (rvr ? 'Rapid ventricular response (RVR)' : 'Controlled ventricular response') + ' · ' + (coarse ? 'coarse' : 'fine') + ' fibrillatory waves';
    return st;
  };

  G.svt = regular([165, 220], { noP: true, var: 0.008 });

  function junctional(rateRange) {
    return function (rng, dur) {
      var h = H(rng), st = new Strip(dur, rng);
      var rate = h.r(rateRange[0], rateRange[1]), RR = 60 / rate;
      var style = h.pick(['before', 'none', 'after']);
      var t = h.r(0.25, 0.7), qa = h.r(45, 75);
      while (t < dur + 0.6) {
        if (style === 'before') st.addP(t - 0.085, { axis: -90, amp: 0.15, width: 0.07 });
        if (style === 'after') st.addP(t + 0.12, { axis: -90, amp: 0.13, width: 0.07 });
        var rr = RR * (1 + (rng() - 0.5) * 0.02);
        st.addQRS(t, { type: 'narrow', axis: qa, rr: rr });
        t += rr;
      }
      st.meta.rate = rate;
      st.meta.note = { before: 'Inverted P wave before each QRS (PR < 0.12 s)', none: 'P waves hidden within the QRS', after: 'Retrograde (inverted) P wave after each QRS' }[style];
      return st;
    };
  }
  G.junctEscape = junctional([40, 58]);
  G.accelJunct = junctional([62, 98]);
  G.junctTach = junctional([105, 140]);

  function ventricular(rateRange, o) {
    o = o || {};
    return function (rng, dur) {
      var h = H(rng), st = new Strip(dur, rng);
      var rate = h.r(rateRange[0], rateRange[1]), RR = 60 / rate;
      var axis = h.pick([-90, 100, -110, 200, 20]);
      var t = h.r(0.1, Math.min(RR, 1.2));
      while (t < dur + 0.6) {
        var rr = RR * (1 + (rng() - 0.5) * (o.var || 0.03));
        st.addQRS(t, { type: 'wide', axis: axis, rr: rr });
        t += rr;
      }
      st.meta.rate = rate;
      return st;
    };
  }
  G.idio = ventricular([22, 39], { var: 0.06 });
  G.aivr = ventricular([45, 95]);
  G.vt = ventricular([150, 220], { var: 0.01 });

  G.torsades = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var f = h.r(3.4, 4.2), P = h.r(1.8, 2.6), ph = rng() * 6.28;
    st.baseline(function (t) {
      var env = Math.cos(Math.PI * t / P + ph);
      var w = Math.sin(2 * Math.PI * f * t) + 0.28 * Math.sin(4 * Math.PI * f * t + 0.6);
      return (0.18 + 1.25 * Math.abs(env)) * (env >= 0 ? 1 : -1) * w * 0.9;
    }, 70);
    st.meta.rate = f * 60;
    return st;
  };

  G.vf = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var coarse = h.chance(0.55);
    st.baseline(vfWave(rng, coarse ? h.r(0.55, 0.85) : h.r(0.14, 0.24)), null);
    st.meta.note = coarse ? 'Coarse VF' : 'Fine VF — confirm it is not asystole in a second lead';
    return st;
  };

  G.asystole = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var p = rng() * 6;
    st.baseline(function (t) { return 0.025 * Math.sin(0.9 * t + p) + 0.012 * Math.sin(2.3 * t + 2 * p); }, 60);
    st.meta.rate = 0;
    return st;
  };

  G.wenck = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.r(68, 95), PP = 60 / rate, n = h.pick([3, 4, 4, 5]);
    var base = h.r(0.16, 0.2), inc = [0, h.r(0.09, 0.12), h.r(0.05, 0.07), 0.035, 0.025];
    var t = h.r(0.05, 0.3), idx = h.i(0, n - 1), lastQ = null, qa = h.r(45, 70);
    while (t < dur + 0.8) {
      st.addP(t);
      if (idx < n - 1) {
        var pr = base;
        for (var k = 1; k <= idx; k++) pr += inc[k];
        var q = t + pr;
        st.addQRS(q, { type: 'narrow', axis: qa, rr: lastQ ? q - lastQ : PP });
        lastQ = q;
      }
      idx = (idx + 1) % n;
      t += PP * (1 + (rng() - 0.5) * 0.02);
    }
    st.meta.rate = (rate * (n - 1)) / n;
    st.meta.note = n + ':' + (n - 1) + ' conduction (atrial rate ≈ ' + Math.round(rate) + '/min)';
    return st;
  };

  G.mobitz2 = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.r(70, 95), PP = 60 / rate, pr = h.r(0.16, 0.2);
    var wide = h.chance(0.6), n = h.pick([3, 4, 4]);
    var t = h.r(0.05, 0.3), idx = h.i(0, n - 1), lastQ = null, qa = h.r(40, 70);
    while (t < dur + 0.8) {
      st.addP(t);
      if (idx !== n - 1) {
        var q = t + pr;
        st.addQRS(q, { type: wide ? 'bbb' : 'narrow', axis: qa, rr: lastQ ? q - lastQ : PP });
        lastQ = q;
      }
      idx = (idx + 1) % n;
      t += PP * (1 + (rng() - 0.5) * 0.02);
    }
    st.meta.rate = (rate * (n - 1)) / n;
    st.meta.wide = wide;
    st.meta.note = 'Constant PR ≈ ' + pr.toFixed(2) + ' s · ' + n + ':' + (n - 1) + ' conduction' + (wide ? ' · wide QRS (common with type II)' : '');
    return st;
  };

  G.twoToOne = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.r(72, 100), PP = 60 / rate, pr = h.r(0.16, 0.22), qa = h.r(45, 70);
    var t = h.r(0.05, 0.4), i = h.i(0, 1), lastQ = null;
    while (t < dur + 0.8) {
      st.addP(t);
      if (i % 2 === 0) {
        var q = t + pr;
        st.addQRS(q, { type: 'narrow', axis: qa, rr: lastQ ? q - lastQ : 2 * PP });
        lastQ = q;
      }
      i++;
      t += PP;
    }
    st.meta.rate = rate / 2;
    st.meta.note = 'Atrial rate ≈ ' + Math.round(rate) + '/min, ventricular rate ≈ ' + Math.round(rate / 2) + '/min';
    return st;
  };

  G.chb = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var aRate = h.r(66, 100), PP = 60 / aRate;
    var ventEscape = h.chance(0.5);
    var vRate = ventEscape ? h.r(26, 40) : h.r(40, 55), RR = 60 / vRate;
    var t = h.r(0, PP);
    while (t < dur + 0.8) {
      st.addP(t);
      t += PP * (1 + (rng() - 0.5) * 0.04);
    }
    var q = h.r(0.3, Math.min(RR, 1.6)), axis = ventEscape ? h.pick([-90, 100, -110]) : h.r(45, 70);
    while (q < dur + 0.8) {
      st.addQRS(q, { type: ventEscape ? 'wide' : 'narrow', axis: axis, rr: RR });
      q += RR * (1 + (rng() - 0.5) * 0.02);
    }
    st.meta.rate = vRate;
    st.meta.wide = ventEscape;
    st.meta.note = 'Atrial rate ≈ ' + Math.round(aRate) + '/min · ' + (ventEscape ? 'ventricular' : 'junctional') + ' escape ≈ ' + Math.round(vRate) + '/min';
    return st;
  };

  G.vpaced = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.pick([60, 60, 70, 72]), RR = 60 / rate;
    var t = h.r(0.2, 0.8);
    while (t < dur + 0.6) {
      st.addSpike(t, -40);
      st.addQRS(t + 0.006, { type: 'paced', axis: -65, rr: RR });
      t += RR;
    }
    st.meta.rate = rate;
    return st;
  };

  G.avpaced = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.pick([60, 70, 72, 80]), RR = 60 / rate, av = h.r(0.15, 0.18);
    var t = h.r(0.35, 0.9);
    while (t < dur + 0.6) {
      st.addSpike(t - av, 30, 1.1);
      st.addP(t - av + 0.01, { amp: 0.12, width: 0.09 });
      st.addSpike(t, -40);
      st.addQRS(t + 0.006, { type: 'paced', axis: -65, rr: RR });
      t += RR;
    }
    st.meta.rate = rate;
    return st;
  };

  G.failCapture = function (rng, dur) {
    var h = H(rng), st = new Strip(dur, rng);
    var rate = h.pick([60, 70, 72]), RR = 60 / rate;
    var t = h.r(0.2, 0.6), i = 0, miss = h.i(1, 3), lastQ = null;
    while (t < dur + 0.6) {
      st.addSpike(t, -40);
      if (i === miss) {
        miss = i + h.i(2, 4);
      } else {
        st.addQRS(t + 0.006, { type: 'paced', axis: -65, rr: lastQ ? t - lastQ : RR });
        lastQ = t;
      }
      i++;
      t += RR;
    }
    st.meta.rate = null;
    st.meta.note = 'Pacer spikes continue at ' + rate + '/min, but not every spike is followed by a QRS';
    return st;
  };

  /* ------------------------------------------------------------------ */
  // opts.vary: per-patient amplitude/T-wave variation; opts.artifact: random real-world artifact
  function generate(rhythmId, seed, duration, opts) {
    var gen = G[rhythmId];
    if (!gen) throw new Error('Unknown rhythm generator: ' + rhythmId);
    var rng = mulberry32(seed);
    CUR = opts || {};
    var st;
    try { st = gen(rng, duration || 6.2); } finally { CUR = {}; }
    var sig = st.render();
    sig.artifact = st.art && (st.art.tremor || st.art.mains || st.art.wander) ? st.art : null;
    // measured rate from the first 6 seconds (the classic 6-second method) and overall
    var q = sig.qrsTimes.filter(function (t) { return t >= 0 && t < sig.duration; });
    var rrs = [];
    for (var i = 1; i < q.length; i++) rrs.push(q[i] - q[i - 1]);
    var mean = rrs.length ? rrs.reduce(function (a, b) { return a + b; }, 0) / rrs.length : 0;
    sig.measuredRate = mean ? Math.round(60 / mean) : 0;
    var sd = rrs.length > 1 ? Math.sqrt(rrs.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / rrs.length) : 0;
    sig.regular = rrs.length >= 2 && sd / mean < 0.07;
    sig.sixSecondCount = sig.qrsTimes.filter(function (t) { return t >= 0 && t < 6; }).length;
    sig.id = rhythmId;
    sig.seed = seed;
    return sig;
  }

  global.ECGEngine = { generate: generate, FS: FS, LEADS: LEADS, mulberry32: mulberry32, generators: G };
})(window);
