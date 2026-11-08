/*
 * CSHealthED Pharmacology Trainer — interactive syringe.
 * Graduations follow common syringe markings. The volume is read at the
 * leading (needle-side) edge of the rubber stopper. Drag the plunger, or
 * focus the syringe and use the arrow keys (Shift = larger steps).
 */
(function (global) {
  'use strict';

  var SIZES = {
    1: { cap: 1, minor: 0.01, mid: 0.05, major: 0.1, label: function (v) { return v === 1 ? '1' : '.' + Math.round(v * 10); } },
    3: { cap: 3, minor: 0.1, mid: 0.5, major: 0.5, label: function (v) { return String(v); } },
    5: { cap: 5, minor: 0.2, mid: 1, major: 1, label: function (v) { return String(v); } },
    10: { cap: 10, minor: 0.2, mid: 1, major: 1, label: function (v) { return String(v); } },
    20: { cap: 20, minor: 1, mid: 5, major: 5, label: function (v) { return String(v); } }
  };
  var X0 = 112, LEN = 560, TOP = 56, BOT = 116;

  function isMultiple(v, step) { var r = v / step; return Math.abs(r - Math.round(r)) < 1e-6; }

  function Syringe(host, opts) {
    opts = opts || {};
    this.host = host;
    this.size = opts.size || 3;
    this.tint = opts.tint || '#60a5fa';
    this.value = 0;
    this.onChange = opts.onChange || null;
    this.locked = false;
    this.render();
  }

  Syringe.SIZES = SIZES;
  Syringe.tolerance = function (size) { return SIZES[size].minor / 2 + 1e-9; };
  Syringe.best = function (vol) {
    var keys = [1, 3, 5, 10, 20];
    for (var i = 0; i < keys.length; i++) if (vol <= keys[i] + 1e-9) return keys[i];
    return null;
  };

  Syringe.prototype.render = function () {
    var S = SIZES[this.size], self = this;
    var ticks = '', labels = '';
    var n = Math.round(S.cap / S.minor);
    for (var i = 0; i <= n; i++) {
      var v = Math.round(i * S.minor * 1000) / 1000;
      var x = X0 + (v / S.cap) * LEN;
      var major = isMultiple(v, S.major), mid = !major && isMultiple(v, S.mid);
      var len = major ? 24 : mid ? 17 : 10;
      ticks += '<line x1="' + x.toFixed(2) + '" y1="' + TOP + '" x2="' + x.toFixed(2) + '" y2="' + (TOP + len) + '" stroke="#1e293b" stroke-width="' + (major ? 1.6 : 1) + '"/>';
      // numbers sit just above the barrel so the plunger never covers them
      if (major) labels += '<text x="' + x.toFixed(2) + '" y="' + (TOP - 9) + '" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="' + (this.size === 1 ? 13 : 15) + '" font-weight="800" fill="#1e293b">' + (v === 0 ? '0' : S.label(v)) + '</text>';
    }
    this.host.innerHTML =
      '<div class="syr-scroll"><svg class="syringe" viewBox="0 0 900 172" tabindex="0" role="slider" aria-label="' + this.size + ' mL syringe. Drag the plunger or use the arrow keys" aria-valuemin="0" aria-valuemax="' + S.cap + '">' +
      // needle + hub
      '<line x1="8" y1="86" x2="78" y2="86" stroke="#94a3b8" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M78 76h22l8 4v12l-8 4H78z" fill="#e2e8f0" stroke="#94a3b8"/>' +
      // barrel
      '<rect x="104" y="' + (TOP - 2) + '" width="' + (LEN + 26) + '" height="' + (BOT - TOP + 4) + '" rx="6" fill="#f8fafc" stroke="#94a3b8" stroke-width="1.5"/>' +
      '<rect class="syr-liquid" x="' + X0 + '" y="' + TOP + '" width="0" height="' + (BOT - TOP) + '" fill="' + this.tint + '" opacity=".38"/>' +
      labels +
      '<text x="' + X0 + '" y="' + (BOT + 22) + '" font-family="Inter,Arial,sans-serif" font-size="12" font-weight="700" fill="#475569">' + this.size + ' mL</text>' +
      // flange
      '<rect x="' + (X0 + LEN + 16) + '" y="30" width="10" height="112" rx="3" fill="#cbd5e1" stroke="#94a3b8"/>' +
      // plunger group
      '<g class="syr-plunger">' +
      '<rect class="syr-rod" x="0" y="80" width="10" height="12" fill="#e2e8f0" stroke="#94a3b8"/>' +
      '<rect class="syr-thumb" x="0" y="44" width="12" height="84" rx="4" fill="#cbd5e1" stroke="#94a3b8"/>' +
      '<rect class="syr-stopper" x="0" y="' + (TOP + 1) + '" width="18" height="' + (BOT - TOP - 2) + '" rx="3" fill="#1f2937"/>' +
      '<line class="syr-ring" x1="0" y1="' + (TOP + 1) + '" x2="0" y2="' + (BOT - 1) + '" stroke="#ef4444" stroke-width="2"/>' +
      '</g>' +
      // graduations are printed on the barrel: drawn last, with a light halo so they show over the stopper
      '<g class="syr-ticks">' + ticks + '</g>' +
      '<g class="syr-ticks-halo" opacity=".55">' + ticks.replace(/stroke="#1e293b" stroke-width="([\d.]+)"/g, 'stroke="#ffffff" stroke-width="0.6"') + '</g>' +
      '</svg></div>';
    var svg = this.host.querySelector('svg');
    this.svg = svg;
    function toVol(evt) {
      var pt = svg.createSVGPoint();
      pt.x = evt.clientX; pt.y = evt.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      return ((p.x - X0) / LEN) * S.cap;
    }
    var dragging = false;
    svg.addEventListener('pointerdown', function (e) {
      if (self.locked) return;
      dragging = true; svg.setPointerCapture(e.pointerId); self.set(toVol(e), true); e.preventDefault();
    });
    svg.addEventListener('pointermove', function (e) { if (dragging) self.set(toVol(e), true); });
    svg.addEventListener('pointerup', function () { dragging = false; });
    svg.addEventListener('keydown', function (e) {
      if (self.locked) return;
      var step = e.shiftKey ? S.major : S.minor;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { self.set(self.value + step, true); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { self.set(self.value - step, true); e.preventDefault(); }
      else if (e.key === 'Home') { self.set(0, true); e.preventDefault(); }
    });
    this.set(this.value);
  };

  Syringe.prototype.set = function (v, user) {
    var S = SIZES[this.size];
    var snap = S.minor / 2;
    v = Math.max(0, Math.min(S.cap, Math.round(v / snap) * snap));
    v = Math.round(v * 10000) / 10000;
    this.value = v;
    var x = X0 + (v / S.cap) * LEN;
    var q = function (sel) { return this.svg.querySelector(sel); }.bind(this);
    q('.syr-liquid').setAttribute('width', Math.max(0, x - X0).toFixed(2));
    q('.syr-stopper').setAttribute('x', x.toFixed(2));
    q('.syr-ring').setAttribute('x1', x.toFixed(2)); q('.syr-ring').setAttribute('x2', x.toFixed(2));
    var rodStart = x + 18, rodEnd = X0 + LEN + 40 + (v / S.cap) * 150;
    q('.syr-rod').setAttribute('x', rodStart.toFixed(2));
    q('.syr-rod').setAttribute('width', Math.max(10, rodEnd - rodStart).toFixed(2));
    q('.syr-thumb').setAttribute('x', rodEnd.toFixed(2));
    this.svg.setAttribute('aria-valuenow', v);
    this.svg.setAttribute('aria-valuetext', v + ' mL');
    if (user && this.onChange) this.onChange(v);
  };

  Syringe.prototype.setSize = function (size) { this.size = size; this.value = 0; this.render(); };
  Syringe.prototype.lock = function (on) { this.locked = on; this.host.classList.toggle('locked', on); };

  global.Syringe = Syringe;
})(window);
