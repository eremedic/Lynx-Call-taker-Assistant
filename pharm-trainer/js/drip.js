/*
 * CSHealthED Pharmacology Trainer — gravity IV set with a visible drip.
 * IV bag (simulated label + medication port) → drip chamber where drops form
 * and fall at the real gtt/min → tubing → roller clamp. Like a real clamp it
 * shows no numbers: students count drops (a 15-second counting timer helps).
 * A digital stopwatch beside the drip chamber lets students time the drops
 * themselves, as they would with a watch.
 */
(function (global) {
  'use strict';

  var MAX_RATE = 250; // gtt/min with the clamp fully open
  var CURVE = 1.7;    // roller clamps open non-linearly

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---------- digital stopwatch (seven-segment LCD) ---------- */
  // segments a–g of a seven-segment digit, as polygons in a w×h box
  function segs(x, y, w, h, t) {
    var m = y + h / 2, q = t / 2;
    return [
      [[x + q, y], [x + w - q, y], [x + w - t, y + t], [x + t, y + t]],                         // a
      [[x + w, y + q], [x + w, m - q], [x + w - t, m - q / 2 - q], [x + w - t, y + t]],          // b
      [[x + w, m + q], [x + w, y + h - q], [x + w - t, y + h - t], [x + w - t, m + q / 2 + q]],  // c
      [[x + q, y + h], [x + w - q, y + h], [x + w - t, y + h - t], [x + t, y + h - t]],          // d
      [[x, m + q], [x, y + h - q], [x + t, y + h - t], [x + t, m + q / 2 + q]],                  // e
      [[x, y + q], [x, m - q], [x + t, m - q / 2 - q], [x + t, y + t]],                          // f
      [[x + t * .6, m], [x + t, m - q], [x + w - t, m - q], [x + w - t * .6, m], [x + w - t, m + q], [x + t, m + q]] // g
    ];
  }
  var DIGITS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];
  function digitSvg(id, x, y, w, h, t) {
    return '<g class="dw-dg" data-dg="' + id + '">' + segs(x, y, w, h, t).map(function (pts, i) {
      return '<polygon data-s="' + 'abcdefg'[i] + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
    }).join('') + '</g>';
  }
  function watchHtml() {
    return '<div class="dw" role="group" aria-label="Stopwatch for timing drops">' +
      '<div class="dw-bezel"><div class="dw-top"><span>STOPWATCH</span><span class="dw-run-dot" aria-hidden="true"></span></div>' +
      '<svg class="dw-lcd" viewBox="0 0 150 60" aria-hidden="true">' +
      digitSvg('m1', 6, 7, 22, 40, 4.2) + digitSvg('m2', 33, 7, 22, 40, 4.2) +
      '<circle class="dw-colon" cx="62" cy="19" r="2.6"/><circle class="dw-colon" cx="62" cy="35" r="2.6"/>' +
      digitSvg('s1', 69, 7, 22, 40, 4.2) + digitSvg('s2', 96, 7, 22, 40, 4.2) +
      '<circle cx="124" cy="45" r="1.8" class="dw-on"/>' + digitSvg('t', 129, 23, 13, 24, 2.6) +
      '<text x="31" y="57" class="dw-cap">MIN</text><text x="94" y="57" class="dw-cap">SEC</text></svg>' +
      '<div class="dw-q" aria-hidden="true"><span>15</span><span>30</span><span>45</span><span>60</span></div></div>' +
      '<div class="dw-btns"><button type="button" class="dw-start">Start</button><button type="button" class="dw-reset">Reset</button></div>' +
      '<span class="dw-sr" aria-live="polite"></span></div>';
  }
  function Stopwatch(root) {
    this.root = root; this.ms = 0; this.t0 = 0; this.on = false; this.raf = null;
    var self = this;
    root.querySelector('.dw-start').addEventListener('click', function () { self.on ? self.stop() : self.start(); });
    root.querySelector('.dw-reset').addEventListener('click', function () { self.reset(); });
    this.draw();
  }
  Stopwatch.prototype.elapsed = function () { return this.on ? this.ms + (performance.now() - this.t0) : this.ms; };
  Stopwatch.prototype.start = function () {
    var self = this;
    this.on = true; this.t0 = performance.now();
    this.root.classList.add('running');
    this.root.querySelector('.dw-start').textContent = 'Stop';
    (function tick() { if (!self.on) return; self.draw(); self.raf = requestAnimationFrame(tick); })();
  };
  Stopwatch.prototype.stop = function () {
    if (!this.on) return;
    this.ms = this.elapsed(); this.on = false;
    cancelAnimationFrame(this.raf);
    this.root.classList.remove('running');
    this.root.querySelector('.dw-start').textContent = 'Start';
    this.draw();
    var s = Math.floor(this.ms / 1000);
    this.root.querySelector('.dw-sr').textContent = 'Stopped at ' + Math.floor(s / 60) + ' minutes ' + (s % 60) + ' seconds';
  };
  Stopwatch.prototype.reset = function () {
    this.stop(); this.ms = 0; this.draw();
    this.root.querySelector('.dw-sr').textContent = 'Reset';
  };
  Stopwatch.prototype.draw = function () {
    var e = this.elapsed(), total = Math.floor(e / 1000) % 6000, min = Math.floor(total / 60), sec = total % 60, tenth = Math.floor(e / 100) % 10;
    var vals = { m1: Math.floor(min / 10), m2: min % 10, s1: Math.floor(sec / 10), s2: sec % 10, t: tenth };
    var root = this.root;
    Object.keys(vals).forEach(function (k) {
      var on = DIGITS[vals[k]];
      Array.prototype.forEach.call(root.querySelectorAll('[data-dg="' + k + '"] polygon'), function (pg) { pg.classList.toggle('dw-on', on.indexOf(pg.dataset.s) >= 0); });
    });
    // quarter-minute marks: light up as each 15 s of the current minute passes
    var q = Math.floor((sec + (e > 0 && sec === 0 && total > 0 ? 60 : 0)) / 15);
    Array.prototype.forEach.call(root.querySelectorAll('.dw-q span'), function (sp, i) { sp.classList.toggle('lit', i < q); });
    root.querySelector('.dw-bezel').setAttribute('aria-label', min + ' minutes ' + sec + ' seconds');
  };
  Stopwatch.prototype.destroy = function () { this.on = false; cancelAnimationFrame(this.raf); };

  function DripSet(host, opts) {
    opts = opts || {};
    this.host = host;
    this.set = opts.set || 10;
    this.bag = opts.bag || { fluid: '0.9% Sodium Chloride', vol: 100 };
    this.p = 0;               // clamp position 0 (closed) … 1 (wide open)
    this.locked = !!opts.locked;
    this.onChange = opts.onChange || null;
    this.drops = [];
    this.running = true;
    this.render();
    this.loop();
  }

  DripSet.prototype.rate = function () { return Math.round(MAX_RATE * Math.pow(this.p, CURVE)); };
  DripSet.prototype.setRate = function (r) {
    r = Math.max(0, Math.min(MAX_RATE, r));
    this.p = Math.pow(r / MAX_RATE, 1 / CURVE);
    this.update(true);
  };

  // Label for a premixed medication bag (or glass bottle): drug, diluent, concentration.
  function premixLabel(b, fluidShort) {
    var m = b.premix, f = 'font-family="Inter,Arial,sans-serif" text-anchor="middle"';
    return '<rect x="88" y="44" width="110" height="11" rx="2" fill="' + (m.color || '#b91c1c') + '"/>' +
      '<text x="143" y="52" ' + f + ' font-size="6.2" font-weight="900" fill="#ffffff">PREMIXED' + (m.glass ? ' · GLASS BOTTLE' : '') + '</text>' +
      '<text x="143" y="67" ' + f + ' font-size="10" font-weight="900" fill="#0f172a">' + esc(m.label) + '</text>' +
      '<text x="143" y="78" ' + f + ' font-size="7.2" font-weight="700" fill="#334155">in ' + b.vol + ' mL ' + esc(fluidShort.replace('5% Dextrose', 'D5W')) + '</text>' +
      '<text x="143" y="91" ' + f + ' font-size="10" font-weight="900" fill="#1d4ed8">' + esc(m.conc) + '</text>' +
      '<text x="143" y="103" ' + f + ' font-size="5.6" font-weight="700" fill="#92400e">SIMULATED · TRAINING ONLY</text>';
  }

  DripSet.prototype.render = function () {
    var b = this.bag, self = this;
    var fluidShort = b.fluid.replace('0.9% Sodium Chloride', '0.9% NaCl');
    this.host.innerHTML =
      '<div class="drip-wrap"><div class="drip-stage"><svg class="drip-svg" viewBox="0 0 300 600" role="img" aria-label="IV bag, drip chamber and tubing with roller clamp">' +
      '<defs><linearGradient id="dr-bag" x1="0" x2="1"><stop offset="0" stop-color="#e2e8f0"/><stop offset=".5" stop-color="#f8fafc"/><stop offset="1" stop-color="#e2e8f0"/></linearGradient>' +
      '<linearGradient id="dr-ch" x1="0" x2="1"><stop offset="0" stop-color="#cbd5e1" stop-opacity=".7"/><stop offset=".45" stop-color="#ffffff" stop-opacity=".35"/><stop offset="1" stop-color="#cbd5e1" stop-opacity=".7"/></linearGradient></defs>' +
      // pole hook
      '<path d="M150 4v10" stroke="#94a3b8" stroke-width="3"/><circle cx="150" cy="20" r="6" fill="none" stroke="#94a3b8" stroke-width="2.5"/>' +
      // bag
      '<path d="M78 28h144a10 10 0 0 1 10 10v150c0 18-20 28-34 32h-96c-14-4-34-14-34-32V38a10 10 0 0 1 10-10z" fill="url(#dr-bag)" stroke="#94a3b8" stroke-width="1.5"/>' +
      '<path class="dr-fluid" d="M70 92h160v96c0 16-18 25-32 29h-96c-14-4-32-13-32-29z" fill="#bfdbfe" opacity=".55"/>' +
      '<g class="dr-grad" font-family="Inter,Arial,sans-serif" font-size="7" fill="#64748b">' +
      [0, 1, 2, 3, 4].map(function (i) { var y = 70 + i * 28; return '<line x1="214" y1="' + y + '" x2="224" y2="' + y + '" stroke="#94a3b8"/><text x="212" y="' + (y + 2.5) + '" text-anchor="end">' + Math.round(b.vol * (i + 1) / 5) + '</text>'; }).reverse().join('') + '</g>' +
      // fluid label
      '<rect x="88" y="44" width="110" height="64" rx="4" fill="#ffffff" stroke="#cbd5e1"/>' +
      (b.premix ? premixLabel(b, fluidShort) :
      '<rect x="88" y="44" width="110" height="9" rx="2" fill="#1d4ed8"/>' +
      '<text x="143" y="69" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="10.5" font-weight="900" fill="#0f172a">' + esc(fluidShort) + '</text>' +
      '<text x="143" y="84" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="900" fill="#1d4ed8">' + b.vol + ' mL</text>' +
      '<text x="143" y="98" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="5.6" font-weight="700" fill="#92400e">SIMULATED · TRAINING ONLY</text>') +
      // additive label (hidden until a drug is added)
      '<g class="dr-additive" opacity="0" transform="rotate(-4 143 150)"><rect x="92" y="118" width="104" height="58" rx="3" fill="#fef08a" stroke="#ca8a04"/>' +
      '<text x="144" y="131" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="7.5" font-weight="900" fill="#713f12">MEDICATION ADDED</text>' +
      '<text class="dr-add-drug" x="144" y="146" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="8.5" font-weight="900" fill="#0f172a"></text>' +
      '<text class="dr-add-conc" x="144" y="159" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="7" font-weight="700" fill="#334155"></text>' +
      '<text x="144" y="170" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="6" fill="#713f12">Time ____  Initials ____</text></g>' +
      // ports
      '<rect x="112" y="218" width="12" height="22" rx="2" fill="#e2e8f0" stroke="#94a3b8"/><circle class="dr-medport" cx="118" cy="244" r="7" fill="#f87171" stroke="#b91c1c"/>' +
      '<text x="100" y="262" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="8" font-weight="700" fill="#b91c1c">med port</text>' +
      '<rect x="145" y="218" width="10" height="18" fill="#e2e8f0" stroke="#94a3b8"/>' +
      // spike + drip chamber
      '<rect x="140" y="234" width="20" height="10" rx="2" fill="#cbd5e1" stroke="#94a3b8"/>' +
      '<rect x="130" y="244" width="40" height="104" rx="9" fill="url(#dr-ch)" stroke="#94a3b8" stroke-width="1.5"/>' +
      '<rect x="147" y="244" width="6" height="10" fill="#94a3b8"/>' +
      '<rect class="dr-pool" x="132" y="322" width="36" height="24" rx="7" fill="#93c5fd" opacity=".75"/>' +
      '<g class="dr-drops"></g>' +
      '<text x="178" y="282" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="800" fill="#0f172a">' + this.set + ' gtt/mL</text>' +
      '<text x="178" y="294" font-family="Inter,Arial,sans-serif" font-size="7.5" fill="#64748b">' + (this.set === 60 ? 'microdrip set' : 'macrodrip set') + '</text>' +
      // tubing
      '<path d="M150 348V560" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" fill="none"/>' +
      '<path d="M150 348V560" stroke="#e0f2fe" stroke-width="4" stroke-linecap="round" fill="none"/>' +
      // roller clamp
      '<g class="dr-clamp"><rect x="128" y="398" width="44" height="104" rx="8" fill="#2563eb" stroke="#1e40af"/>' +
      '<rect x="134" y="404" width="32" height="92" rx="5" fill="#1d4ed8"/>' +
      '<text x="176" y="410" font-family="Inter,Arial,sans-serif" font-size="8" font-weight="800" fill="#16a34a">▲ open</text>' +
      '<text x="176" y="496" font-family="Inter,Arial,sans-serif" font-size="8" font-weight="800" fill="#dc2626">▼ closed</text>' +
      '<g class="dr-wheel"><circle cx="150" cy="0" r="14" fill="#f8fafc" stroke="#475569" stroke-width="2"/>' +
      '<g stroke="#94a3b8" stroke-width="1.5"><line x1="139" y1="-5" x2="161" y2="-5"/><line x1="138" y1="0" x2="162" y2="0"/><line x1="139" y1="5" x2="161" y2="5"/></g></g></g>' +
      '<text x="64" y="452" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" fill="#475569">roller</text><text x="64" y="463" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" fill="#475569">clamp</text>' +
      '<path d="M66 455h56" stroke="#94a3b8" stroke-dasharray="3 3"/>' +
      '<text x="150" y="590" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="9" fill="#64748b">to patient</text>' +
      '</svg>' + watchHtml() + '</div>' +
      '<div class="drip-controls">' +
      '<div class="drip-btns" role="group" aria-label="Roller clamp">' +
      '<button type="button" data-d="-10" title="Roll down (big step)">▼▼</button><button type="button" data-d="-1" title="Roll down (fine)">▼</button>' +
      '<span class="drip-clamp-lbl">Roller clamp</span>' +
      '<button type="button" data-d="1" title="Roll up (fine)">▲</button><button type="button" data-d="10" title="Roll up (big step)">▲▲</button></div>' +
      '<div class="drip-count"><button type="button" class="btn btn-ghost btn-sm dr-count-btn">⏱ Count drops for 15 s</button><span class="dr-count-out" aria-live="polite"></span></div>' +
      '</div></div>';
    this.svg = this.host.querySelector('.drip-svg');
    if (this.watch) this.watch.destroy();
    this.watch = new Stopwatch(this.host.querySelector('.dw'));
    this.dropsG = this.svg.querySelector('.dr-drops');
    this.wheel = this.svg.querySelector('.dr-wheel');
    // wheel drag (vertical)
    var clamp = this.svg.querySelector('.dr-clamp'), dragging = false;
    function toP(e) {
      var pt = self.svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      var y = pt.matrixTransform(self.svg.getScreenCTM().inverse()).y;
      return Math.max(0, Math.min(1, (488 - y) / 76));
    }
    clamp.addEventListener('pointerdown', function (e) { if (self.locked) return; dragging = true; clamp.setPointerCapture(e.pointerId); self.p = toP(e); self.update(true); e.preventDefault(); });
    clamp.addEventListener('pointermove', function (e) { if (dragging) { self.p = toP(e); self.update(true); } });
    clamp.addEventListener('pointerup', function () { dragging = false; });
    this.host.querySelector('.drip-btns').addEventListener('click', function (e) {
      var bt = e.target.closest('button'); if (!bt || self.locked) return;
      self.setRate(self.rate() + (+bt.dataset.d));
    });
    this.host.querySelector('.dr-count-btn').addEventListener('click', function () { self.startCount(); });
    this.lock(this.locked);
    this.update(false);
  };

  DripSet.prototype.update = function (user) {
    this.wheel.setAttribute('transform', 'translate(0 ' + (488 - this.p * 76).toFixed(1) + ')');
    var r = this.rate();
    this.interval = r > 0 ? 60 / r : Infinity;
    if (this.count && this.count.rate !== r) this.cancelCount('Rate changed — count again.');
    if (user && this.onChange) this.onChange(r);
  };

  DripSet.prototype.loop = function () {
    var self = this, last = performance.now(), acc = 0;
    function frame(now) {
      if (!self.running) return;
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (self.interval !== Infinity) {
        acc += dt;
        if (acc >= self.interval) { acc = acc % self.interval; self.spawn(); }
      } else acc = 0;
      // forming drop at the orifice grows during each interval
      var form = self.interval === Infinity ? 0 : Math.min(1, acc / Math.min(self.interval, 1.2));
      self.drawDrops(dt, form);
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };

  DripSet.prototype.spawn = function () {
    this.drops.push({ y: 258, v: 0 });
    if (this.count && this.count.on) this.count.n++;
  };

  DripSet.prototype.drawDrops = function (dt, form) {
    var html = '';
    for (var i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i];
      d.v += 1400 * dt; d.y += d.v * dt;
      if (d.y >= 322) { this.drops.splice(i, 1); this.ripple = 0.25; continue; }
      html += '<ellipse cx="150" cy="' + d.y.toFixed(1) + '" rx="3.6" ry="4.6" fill="#3b82f6"/>';
    }
    if (form > 0) html += '<ellipse cx="150" cy="' + (256 + form * 2).toFixed(1) + '" rx="' + (1.5 + form * 2.1).toFixed(2) + '" ry="' + (1.5 + form * 3).toFixed(2) + '" fill="#3b82f6" opacity=".9"/>';
    if (this.ripple > 0) { this.ripple -= dt; html += '<ellipse cx="150" cy="323" rx="' + (12 - this.ripple * 30).toFixed(1) + '" ry="2" fill="none" stroke="#2563eb" stroke-width="1" opacity="' + Math.max(0, this.ripple * 4).toFixed(2) + '"/>'; }
    this.dropsG.innerHTML = html;
  };

  DripSet.prototype.startCount = function () {
    var self = this, out = this.host.querySelector('.dr-count-out');
    if (this.rate() === 0) { out.textContent = 'The clamp is closed — no drops are falling.'; return; }
    this.cancelCount();
    var c = this.count = { on: true, n: 0, left: 15, rate: this.rate() };
    out.textContent = 'Counting… 15 s';
    c.timer = setInterval(function () {
      c.left--;
      if (c.left > 0) { out.textContent = 'Counting… ' + c.left + ' s (' + c.n + ' drops so far)'; return; }
      clearInterval(c.timer); c.on = false; self.count = null;
      out.innerHTML = '<b>' + c.n + ' drops</b> in 15 s × 4 = <b>' + c.n * 4 + ' gtt/min</b>';
    }, 1000);
  };
  DripSet.prototype.cancelCount = function (msg) {
    if (!this.count) return;
    clearInterval(this.count.timer); this.count = null;
    this.host.querySelector('.dr-count-out').textContent = msg || '';
  };

  DripSet.prototype.addMedication = function (drug, concText, tint) {
    var g = this.svg.querySelector('.dr-additive');
    this.svg.querySelector('.dr-add-drug').textContent = drug;
    this.svg.querySelector('.dr-add-conc').textContent = concText;
    g.style.transition = 'opacity .6s'; g.setAttribute('opacity', '1');
    var f = this.svg.querySelector('.dr-fluid');
    f.style.transition = 'fill 1.2s'; f.setAttribute('fill', tint || '#c4b5fd');
    var port = this.svg.querySelector('.dr-medport');
    port.setAttribute('fill', '#facc15');
    setTimeout(function () { port.setAttribute('fill', '#f87171'); }, 900);
  };

  DripSet.prototype.lock = function (on) {
    this.locked = on;
    this.host.classList.toggle('drip-locked', on);
    Array.prototype.forEach.call(this.host.querySelectorAll('.drip-btns button'), function (b) { b.disabled = on; });
  };

  DripSet.prototype.destroy = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.watch) this.watch.destroy();
    this.cancelCount();
  };

  global.DripSet = DripSet;
  global.DripStopwatch = Stopwatch;
})(window);
