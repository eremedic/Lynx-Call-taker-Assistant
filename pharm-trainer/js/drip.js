/*
 * CSHealthED Pharmacology Trainer — gravity IV set with a visible drip.
 * IV bag (simulated label + medication port) → drip chamber where drops form
 * and fall at the real gtt/min → tubing → roller clamp. Like a real clamp it
 * shows no numbers: students count drops (a 15-second counting timer helps).
 */
(function (global) {
  'use strict';

  var MAX_RATE = 250; // gtt/min with the clamp fully open
  var CURVE = 1.7;    // roller clamps open non-linearly

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

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

  DripSet.prototype.render = function () {
    var b = this.bag, self = this;
    var fluidShort = b.fluid.replace('0.9% Sodium Chloride', '0.9% NaCl');
    this.host.innerHTML =
      '<div class="drip-wrap"><svg class="drip-svg" viewBox="0 0 300 600" role="img" aria-label="IV bag, drip chamber and tubing with roller clamp">' +
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
      '<rect x="88" y="44" width="110" height="9" rx="2" fill="#1d4ed8"/>' +
      '<text x="143" y="69" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="10.5" font-weight="900" fill="#0f172a">' + esc(fluidShort) + '</text>' +
      '<text x="143" y="84" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="900" fill="#1d4ed8">' + b.vol + ' mL</text>' +
      '<text x="143" y="98" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="5.6" font-weight="700" fill="#92400e">SIMULATED · TRAINING ONLY</text>' +
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
      '</svg>' +
      '<div class="drip-controls">' +
      '<div class="drip-btns" role="group" aria-label="Roller clamp">' +
      '<button type="button" data-d="-10" title="Roll down (big step)">▼▼</button><button type="button" data-d="-1" title="Roll down (fine)">▼</button>' +
      '<span class="drip-clamp-lbl">Roller clamp</span>' +
      '<button type="button" data-d="1" title="Roll up (fine)">▲</button><button type="button" data-d="10" title="Roll up (big step)">▲▲</button></div>' +
      '<div class="drip-count"><button type="button" class="btn btn-ghost btn-sm dr-count-btn">⏱ Count drops for 15 s</button><span class="dr-count-out" aria-live="polite"></span></div>' +
      '</div></div>';
    this.svg = this.host.querySelector('svg');
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
    this.cancelCount();
  };

  global.DripSet = DripSet;
})(window);
