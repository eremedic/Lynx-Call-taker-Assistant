/*
 * CSHealthED ECG Trainer — strip renderer
 * Draws signals on standard ECG paper (25 mm/s, 10 mm/mV) or as an animated
 * cardiac-monitor sweep, with an on-strip caliper tool.
 */
(function (global) {
  'use strict';

  var MM_PER_S = 25;
  var MM_PER_MV = 10;
  var BAND_MM = 30; // height of each lead band

  var THEMES = {
    paper: { bg: '#fff7f6', minor: 'rgba(232, 120, 120, 0.22)', major: 'rgba(214, 72, 72, 0.5)', trace: '#16161d', label: '#7a2b2b', tick: '#7a2b2b', spike: '#16161d' },
    monitor: { bg: '#04100b', minor: 'rgba(40, 200, 120, 0.06)', major: 'rgba(40, 200, 120, 0.16)', trace: '#3dff8f', label: '#7dffb8', tick: 'rgba(125,255,184,.6)', spike: '#ffffff' }
  };

  var PAPER_DARK = { bg: '#161a22', minor: 'rgba(255, 128, 128, 0.10)', major: 'rgba(255, 120, 120, 0.30)', trace: '#eef1f7', label: '#ffb8b8', tick: '#ffb8b8', spike: '#ffffff', ink: '#e6ecff' };
  THEMES.paper.ink = '#1b2a5b';
  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function paper() { return isDark() ? PAPER_DARK : THEMES.paper; }

  function sampleAt(sig, lead, t) {
    var s = sig.leads[lead];
    var x = t * sig.fs;
    if (x < 0 || x >= s.length - 1) return null;
    var i = Math.floor(x), f = x - i;
    return s[i] * (1 - f) + s[i + 1] * f;
  }

  function setup(canvas, cssW, cssH) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function geometry(cssW, seconds, nLeads, compact, bandMM) {
    var pxmm = cssW / (seconds * MM_PER_S);
    var band = (bandMM || (compact ? 22 : BAND_MM)) * pxmm;
    var top = Math.min(6 * pxmm, 34); // header for the time marks
    if (compact) top = 2 * pxmm;
    return { pxmm: pxmm, band: band, top: top, h: Math.round(top + band * nLeads + (compact ? 1 : 3) * pxmm) };
  }

  function drawGrid(ctx, w, h, pxmm, th, mode) {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, w, h);
    if (mode === 'paper' && pxmm >= 2.2) {
      ctx.beginPath();
      ctx.strokeStyle = th.minor;
      ctx.lineWidth = 0.6;
      for (var x = 0; x <= w; x += pxmm) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, h); }
      for (var y = 0; y <= h; y += pxmm) { ctx.moveTo(0, Math.round(y) + 0.5); ctx.lineTo(w, Math.round(y) + 0.5); }
      ctx.stroke();
    } else if (mode === 'monitor') {
      ctx.beginPath();
      ctx.strokeStyle = th.minor;
      ctx.lineWidth = 0.5;
      for (var x1 = 0; x1 <= w; x1 += pxmm) { ctx.moveTo(Math.round(x1) + 0.5, 0); ctx.lineTo(Math.round(x1) + 0.5, h); }
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.strokeStyle = th.major;
    ctx.lineWidth = mode === 'paper' ? 1 : 0.7;
    for (var X = 0; X <= w + 1; X += pxmm * 5) { ctx.moveTo(Math.round(X) + 0.5, 0); ctx.lineTo(Math.round(X) + 0.5, h); }
    for (var Y = 0; Y <= h + 1; Y += pxmm * 5) { ctx.moveTo(0, Math.round(Y) + 0.5); ctx.lineTo(w, Math.round(Y) + 0.5); }
    ctx.stroke();
  }

  function drawTimeMarks(ctx, g, seconds, th, w) {
    ctx.strokeStyle = th.tick;
    ctx.fillStyle = th.tick;
    ctx.lineWidth = 1.5;
    ctx.font = '600 ' + Math.min(13, Math.max(9, Math.round(g.pxmm * 2.6))) + 'px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    for (var s = 0; s <= seconds + 1e-6; s++) {
      var x = Math.min(w - 1, s * MM_PER_S * g.pxmm);
      var big = s % 3 === 0;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, big ? g.top * 0.62 : g.top * 0.3);
      ctx.stroke();
      if (big && s > 0 && s < seconds) ctx.fillText(s + ' s', x + 4, 1);
    }
  }

  function traceBand(ctx, sig, lead, t0, seconds, g, bandTop, th, x0, x1) {
    var base = bandTop + g.band * 0.56;
    var ppmv = MM_PER_MV * g.pxmm;
    var pps = MM_PER_S * g.pxmm;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, bandTop, 99999, g.band);
    ctx.clip();
    ctx.beginPath();
    var started = false;
    var step = 0.5; // px
    for (var x = x0; x <= x1; x += step) {
      var v = sampleAt(sig, lead, t0 + x / pps);
      if (v === null) { started = false; continue; }
      var y = base - v * ppmv;
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // pacemaker spikes
    sig.spikes.forEach(function (sp) {
      var x = (sp.t - t0) * pps;
      if (x < x0 || x > x1) return;
      var v = sampleAt(sig, lead, sp.t) || 0;
      ctx.save();
      ctx.strokeStyle = th.spike;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x, base - v * ppmv);
      ctx.lineTo(x, base - (v + sp[lead]) * ppmv);
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();
  }

  function labelBand(ctx, lead, g, bandTop, th) {
    ctx.fillStyle = th.label;
    ctx.font = '700 ' + Math.min(17, Math.max(11, Math.round(g.pxmm * 3.4))) + 'px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(lead, 6, bandTop + 4);
  }

  /* Static strip -------------------------------------------------------- */
  function drawStrip(canvas, sig, opts) {
    opts = opts || {};
    var mode = opts.mode || 'paper';
    var th = mode === 'paper' ? paper() : THEMES.monitor;
    var leads = opts.leads || ['II'];
    var seconds = opts.seconds || 6;
    var t0 = opts.start || 0;
    var cssW = opts.width || canvas.parentElement.clientWidth || 800;
    var g = geometry(cssW, seconds, leads.length, opts.compact, opts.bandMM);
    var ctx = setup(canvas, cssW, g.h);
    drawGrid(ctx, cssW, g.h, g.pxmm, th, mode);
    if (!opts.compact) drawTimeMarks(ctx, g, seconds, th, cssW);
    ctx.strokeStyle = th.trace;
    ctx.lineWidth = opts.compact ? 1.1 : Math.min(2.4, Math.max(1.2, g.pxmm * 0.32));
    ctx.lineJoin = 'round';
    leads.forEach(function (lead, i) {
      var top = g.top + i * g.band;
      ctx.strokeStyle = th.trace;
      ctx.lineWidth = opts.compact ? 1.1 : Math.min(2.4, Math.max(1.2, g.pxmm * 0.32));
      traceBand(ctx, sig, lead, t0, seconds, g, top, th, 0, cssW);
      if (!opts.compact || leads.length > 1) labelBand(ctx, lead, g, top, th);
    });
    if (!opts.compact) {
      ctx.fillStyle = th.label;
      ctx.globalAlpha = 0.7;
      ctx.font = '500 ' + Math.min(12, Math.max(9, Math.round(g.pxmm * 2.3))) + 'px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('25 mm/s · 10 mm/mV', cssW - 6, g.h - 3);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
    var bands = leads.map(function (lead, i) { var top = g.top + i * g.band; return { lead: lead, top: top, base: top + g.band * 0.56 }; });
    return { pxmm: g.pxmm, pps: MM_PER_S * g.pxmm, ppmv: MM_PER_MV * g.pxmm, height: g.h, width: cssW, seconds: seconds, bands: bands, ctx: ctx };
  }

  /* Animated monitor ---------------------------------------------------- */
  function Monitor(canvas, sig, opts) {
    this.canvas = canvas;
    this.sig = sig;
    this.opts = opts || {};
    this.running = false;
    this.t = 0;
    this.lastBeep = -1;
    this.onBeat = this.opts.onBeat || null;
  }
  Monitor.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.prev = performance.now();
    var self = this;
    function frame(now) {
      if (!self.running) return;
      var dt = Math.min(0.1, (now - self.prev) / 1000);
      self.prev = now;
      var before = self.t;
      self.t += dt;
      self.checkBeats(before, self.t);
      self.draw();
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };
  Monitor.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
  };
  Monitor.prototype.checkBeats = function (a, b) {
    if (!this.onBeat) return;
    var D = this.sig.duration - 0.6;
    var qa = a % D, qb = b % D;
    var self = this;
    this.sig.qrsTimes.forEach(function (q) {
      var hit = qa <= qb ? q + 0.04 > qa && q + 0.04 <= qb : q + 0.04 > qa || q + 0.04 <= qb;
      if (hit) self.onBeat(q);
    });
  };
  Monitor.prototype.draw = function () {
    var o = this.opts, sig = this.sig;
    var th = THEMES.monitor;
    var leads = o.leads || ['II'];
    var seconds = o.seconds || 6;
    var cssW = this.canvas.parentElement.clientWidth || 800;
    var g = geometry(cssW, seconds, leads.length, false);
    if (!this.ctx || this.cssW !== cssW || this.nLeads !== leads.length) {
      this.ctx = setup(this.canvas, cssW, g.h);
      this.cssW = cssW;
      this.nLeads = leads.length;
    }
    var ctx = this.ctx;
    drawGrid(ctx, cssW, g.h, g.pxmm, th, 'monitor');
    var D = sig.duration - 0.6; // usable loop length
    var now = this.t % D;
    var pps = MM_PER_S * g.pxmm;
    var cyc = now - (now % seconds);
    var sweepX = (now % seconds) * pps;
    var gap = 14;
    ctx.lineJoin = 'round';
    leads.forEach(function (lead, i) {
      var top = g.top + i * g.band;
      ctx.strokeStyle = th.trace;
      ctx.lineWidth = Math.min(2.6, Math.max(1.6, g.pxmm * 0.4));
      ctx.shadowColor = 'rgba(61,255,143,0.55)';
      ctx.shadowBlur = 6;
      traceBand(ctx, sig, lead, cyc, seconds, g, top, th, 0, sweepX);
      if (cyc - seconds >= 0) traceBand(ctx, sig, lead, cyc - seconds, seconds, g, top, th, sweepX + gap, cssW);
      ctx.shadowBlur = 0;
      labelBand(ctx, lead, g, top, th);
    });
    // sweep head
    ctx.fillStyle = 'rgba(61,255,143,0.9)';
    ctx.fillRect(sweepX - 1, g.top, 2, g.h - g.top);
  };

  /* Calipers ------------------------------------------------------------ */
  function attachCalipers(wrap, canvas, getInfo) {
    var overlay = document.createElement('div');
    overlay.className = 'caliper-layer';
    wrap.appendChild(overlay);
    var a = null, b = null, dragging = false;

    function px(e) {
      var r = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(r.width, e.clientX - r.left));
    }
    function render() {
      overlay.innerHTML = '';
      if (a === null || b === null || Math.abs(b - a) < 3) return;
      var info = getInfo();
      if (!info) return;
      var l = Math.min(a, b), r = Math.max(a, b);
      var sec = (r - l) / info.pps;
      var boxes = sec / 0.04;
      var html = '<div class="cal-line" style="left:' + l + 'px"></div><div class="cal-line" style="left:' + r + 'px"></div>' +
        '<div class="cal-bar" style="left:' + l + 'px;width:' + (r - l) + 'px"></div>' +
        '<div class="cal-label" style="left:' + ((l + r) / 2) + 'px">' + sec.toFixed(2) + ' s · ' + boxes.toFixed(1) + ' small boxes' + (sec > 0.25 ? ' · ≈ ' + Math.round(60 / sec) + ' /min' : '') + '</div>';
      overlay.innerHTML = html;
    }
    canvas.addEventListener('pointerdown', function (e) {
      if (!wrap.classList.contains('calipers-on')) return;
      dragging = true;
      a = b = px(e);
      canvas.setPointerCapture(e.pointerId);
      render();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      b = px(e);
      render();
    });
    canvas.addEventListener('pointerup', function () { dragging = false; });
    return { clear: function () { a = b = null; render(); } };
  }

  global.ECGRender = { isDark: isDark, paper: paper, drawStrip: drawStrip, Monitor: Monitor, attachCalipers: attachCalipers, MM_PER_S: MM_PER_S };
})(window);
