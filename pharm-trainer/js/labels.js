/*
 * CSHealthED Pharmacology Trainer — simulated medication labels.
 * Realistic layout (concentration, total amount/volume, route, container,
 * schedule, Rx only, lot/exp) but generic: no manufacturer names or logos,
 * placeholder NDC, and a "simulated — training only" banner on every label.
 */
(function (global) {
  'use strict';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(n) { return (Math.round(n * 1000) / 1000).toString(); }
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  var CONTAINER = { vial: 'Single-dose vial', ampule: 'Ampule', prefilled: 'Prefilled syringe', bag: 'IV bag', neb: 'Unit-dose nebulizer vial', tablets: 'Bottle', tube: 'Tube' };

  function concText(L) {
    if (L.concLabel) return L.concLabel;
    if (!L.conc) return '';
    return fmt(L.conc) + ' ' + L.concUnit;
  }

  // Large, readable "unrolled" label
  function labelSvg(d, opts) {
    opts = opts || {};
    var L = d.label, h = hash(d.id);
    var W = 380, H = 214;
    var band = L.color, warn = L.paralytic;
    var name = d.name.replace(/ \d.*$/, '').replace(/ (sulfate|citrate|bromide)$/i, ' $1').toUpperCase();
    if (d.id === 'epi-arrest' || d.id === 'epi-im') name = 'EPINEPHRINE';
    var concBig = L.conc ? (L.pct ? L.pct + ' · ' : '') + concText(L) : (fmt(L.amt) + ' ' + L.amtUnit + (L.type === 'tablets' ? ' per tablet' : ''));
    var total = L.vol ? fmt(L.amt) + ' ' + L.amtUnit + ' per ' + fmt(L.vol) + ' mL' : L.count ? L.count + ' tablets' : 'Net wt ' + fmt(L.amt) + ' ' + L.amtUnit;
    var cont = (L.vol ? fmt(L.vol) + ' mL ' : '') + CONTAINER[L.type];
    if (L.type === 'vial' && /Multi-dose/.test(L.route)) cont = fmt(L.vol) + ' mL Multiple-dose vial';
    var exp = ((h % 12) + 1) + '/' + (2027 + (h % 3));
    var lot = 'SIM' + (1000 + (h % 9000));
    var ndc = 'NDC 0000-' + ('000' + (h % 1000)).slice(-3) + '-00';
    var s = '<svg class="med-label" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Simulated label: ' + esc(d.name) + ' ' + esc(concBig) + ', ' + esc(total) + '">' +
      '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="8" fill="#ffffff" stroke="#cbd5e1"/>' +
      '<rect x="1" y="1" width="18" height="' + (H - 2) + '" rx="8" fill="' + band + '"/><rect x="10" y="1" width="9" height="' + (H - 2) + '" fill="' + band + '"/>';
    if (warn) s += '<rect x="19" y="1" width="' + (W - 20) + '" height="26" fill="#dc2626"/><text x="' + (W / 2 + 9) + '" y="19" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="12.5" font-weight="900" fill="#fff" letter-spacing=".04em">WARNING: PARALYZING AGENT</text>';
    var y0 = warn ? 52 : 36;
    s += '<text x="32" y="' + y0 + '" font-family="Inter,Arial,sans-serif" font-size="' + (name.length > 16 ? 19 : 22) + '" font-weight="900" fill="#0f172a">' + esc(name) + '</text>';
    if (d.schedule) s += '<rect x="' + (W - 58) + '" y="' + (y0 - 22) + '" width="44" height="28" rx="4" fill="none" stroke="#0f172a" stroke-width="2"/><text x="' + (W - 36) + '" y="' + (y0 - 2) + '" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="#0f172a">' + d.schedule.replace('C', 'C-') + '</text>';
    s += '<text x="32" y="' + (y0 + 17) + '" font-family="Inter,Arial,sans-serif" font-size="11" fill="#475569">' + esc(L.route) + '</text>';
    // concentration box
    var by = y0 + 28;
    s += '<rect x="32" y="' + by + '" width="' + (W - 50) + '" height="44" rx="6" fill="' + band + '" opacity=".1"/>' +
      '<rect x="32" y="' + by + '" width="5" height="44" fill="' + band + '"/>' +
      '<text x="46" y="' + (by + 29) + '" font-family="Inter,Arial,sans-serif" font-size="23" font-weight="900" fill="' + band + '">' + esc(concBig) + '</text>';
    s += '<text x="32" y="' + (by + 66) + '" font-family="Inter,Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a">' + esc(total) + '</text>' +
      '<text x="' + (W - 14) + '" y="' + (by + 66) + '" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="11.5" font-weight="600" fill="#334155">' + esc(cont) + '</text>';
    var fy = by + 86;
    s += '<text x="32" y="' + fy + '" font-family="Inter,Arial,sans-serif" font-size="9.5" fill="#64748b">' + ndc + '   Lot ' + lot + '   Exp ' + exp + '</text>' +
      '<text x="' + (W - 14) + '" y="' + fy + '" text-anchor="end" font-family="Inter,Arial,sans-serif" font-size="10.5" font-weight="800" fill="#0f172a">Rx only</text>';
    s += '<rect x="19" y="' + (H - 21) + '" width="' + (W - 20) + '" height="20" fill="#fef3c7"/><text x="' + (W / 2 + 9) + '" y="' + (H - 7) + '" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="9.5" font-weight="800" fill="#92400e" letter-spacing=".05em">SIMULATED LABEL · FOR TRAINING ONLY · NOT FOR CLINICAL USE</text>';
    return s + '</svg>';
  }

  // Small container illustration
  function containerSvg(d) {
    var L = d.label, c = L.color, cap = L.cap || c;
    var nm = d.name.replace(/ \d.*$/, '').split(' ')[0].toUpperCase();
    var t = function (x, y, size, txt, col, wt) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="' + size + '" font-weight="' + (wt || 800) + '" fill="' + (col || '#0f172a') + '">' + esc(txt) + '</text>'; };
    var conc = L.conc ? concText(L) : fmt(L.amt) + ' ' + L.amtUnit;
    var g = '<defs><linearGradient id="gl-' + d.id + '" x1="0" x2="1"><stop offset="0" stop-color="#e2e8f0" stop-opacity=".9"/><stop offset=".35" stop-color="#ffffff" stop-opacity=".6"/><stop offset="1" stop-color="#cbd5e1" stop-opacity=".9"/></linearGradient>' +
      '<linearGradient id="mt-' + d.id + '" x1="0" x2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset=".5" stop-color="#f1f5f9"/><stop offset="1" stop-color="#94a3b8"/></linearGradient></defs>';
    var s;
    if (L.type === 'vial') {
      s = g + '<rect x="46" y="8" width="48" height="16" rx="4" fill="' + cap + '"/><rect x="42" y="22" width="56" height="12" rx="2" fill="url(#mt-' + d.id + ')"/>' +
        '<path d="M50 34h40v10c0 6 16 8 16 20v96a10 10 0 0 1-10 10H44a10 10 0 0 1-10-10V64c0-12 16-14 16-20z" fill="url(#gl-' + d.id + ')" stroke="#94a3b8"/>' +
        '<rect x="35" y="132" width="70" height="36" rx="8" fill="' + c + '" opacity=".14"/>' +
        '<rect x="34" y="78" width="72" height="66" fill="#fff" stroke="#e2e8f0"/><rect x="34" y="78" width="72" height="10" fill="' + (L.paralytic ? '#dc2626' : c) + '"/>' +
        t(70, 104, 10, nm.slice(0, 11)) + t(70, 120, 9.5, conc, c) + t(70, 136, 8, fmt(L.vol) + ' mL', '#475569', 600);
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    if (L.type === 'ampule') {
      s = g + '<path d="M62 10c-6 0-8 10-8 18 0 6 8 10 8 16v4c0 4-14 10-14 22v86a10 10 0 0 0 10 10h24a10 10 0 0 0 10-10V70c0-12-14-18-14-22v-4c0-6 8-10 8-16 0-8-2-18-8-18z" fill="url(#gl-' + d.id + ')" stroke="#94a3b8"/>' +
        '<rect x="56" y="44" width="28" height="4" fill="' + c + '"/><circle cx="70" cy="50" r="2" fill="' + c + '"/>' +
        '<rect x="48" y="84" width="44" height="64" fill="#fff" stroke="#e2e8f0"/><rect x="48" y="84" width="44" height="8" fill="' + c + '"/>' +
        t(70, 108, 8.5, nm.slice(0, 8)) + t(70, 124, 9, conc, c) + t(70, 140, 7.5, fmt(L.vol) + ' mL', '#475569', 600);
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    if (L.type === 'prefilled') {
      s = g + '<rect x="58" y="4" width="24" height="16" rx="3" fill="' + cap + '"/><rect x="62" y="20" width="16" height="10" fill="#e2e8f0" stroke="#94a3b8"/>' +
        '<rect x="50" y="30" width="40" height="126" rx="6" fill="url(#gl-' + d.id + ')" stroke="#94a3b8"/>' +
        '<rect x="51" y="40" width="38" height="110" fill="' + c + '" opacity=".12"/>' +
        '<rect x="50" y="56" width="40" height="78" fill="#fff" stroke="#e2e8f0"/><rect x="50" y="56" width="40" height="8" fill="' + c + '"/>' +
        '<g transform="rotate(-90 70 98)">' + t(70, 94, 9, nm.slice(0, 11)) + t(70, 106, 8.5, conc, c) + '</g>' +
        '<rect x="62" y="156" width="16" height="18" fill="#cbd5e1" stroke="#94a3b8"/><rect x="46" y="172" width="48" height="6" rx="3" fill="#94a3b8"/>';
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    if (L.type === 'bag') {
      s = '<path d="M30 14h80a6 6 0 0 1 6 6v118c0 14-14 22-24 26H48c-10-4-24-12-24-26V20a6 6 0 0 1 6-6z" fill="#f1f5f9" stroke="#94a3b8"/>' +
        '<circle cx="70" cy="22" r="5" fill="none" stroke="#94a3b8"/><rect x="40" y="36" width="60" height="70" fill="#fff" stroke="#e2e8f0"/><rect x="40" y="36" width="60" height="9" fill="' + c + '"/>' +
        t(70, 62, 9, nm.slice(0, 10)) + t(70, 78, 8.5, (L.pct || conc), c) + t(70, 94, 8, fmt(L.vol) + ' mL', '#475569', 600) +
        '<rect x="58" y="164" width="9" height="14" fill="#cbd5e1"/><rect x="73" y="164" width="9" height="14" fill="#cbd5e1"/>';
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    if (L.type === 'neb') {
      s = '<path d="M60 8h20v14l6 8v12H54V30l6-8z" fill="' + cap + '" opacity=".85"/><rect x="44" y="42" width="52" height="118" rx="12" fill="#f8fafc" stroke="#94a3b8"/>' +
        '<rect x="45" y="90" width="50" height="68" rx="10" fill="' + c + '" opacity=".1"/>' + t(70, 74, 8.5, nm.slice(0, 9)) + t(70, 92, 9, L.pct || conc, c) + t(70, 108, 8, fmt(L.amt) + ' ' + L.amtUnit + '/' + fmt(L.vol) + ' mL', '#475569', 600);
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    if (L.type === 'tablets') {
      s = '<rect x="38" y="14" width="64" height="24" rx="5" fill="' + cap + '" stroke="#94a3b8"/><rect x="34" y="38" width="72" height="128" rx="12" fill="#fafaf9" stroke="#94a3b8"/>' +
        '<rect x="34" y="62" width="72" height="76" fill="#fff" stroke="#e2e8f0"/><rect x="34" y="62" width="72" height="10" fill="' + c + '"/>' + t(70, 92, 9.5, nm.slice(0, 11)) + t(70, 110, 10, fmt(L.amt) + ' mg', c) + t(70, 126, 7.5, L.count + ' tablets', '#475569', 600);
      return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
    }
    s = '<rect x="58" y="10" width="24" height="18" rx="3" fill="' + cap + '"/><path d="M52 28h36l10 136H42z" fill="#fff7ed" stroke="#94a3b8"/>' +
      '<rect x="48" y="60" width="44" height="64" fill="#fff" stroke="#e2e8f0"/><rect x="48" y="60" width="44" height="8" fill="' + c + '"/>' + t(70, 86, 8.5, nm.slice(0, 8)) + t(70, 104, 10, fmt(L.amt) + ' g', c);
    return '<svg class="med-container" viewBox="0 0 140 180" aria-hidden="true">' + s + '</svg>';
  }

  function medCard(d, opts) {
    opts = opts || {};
    return '<div class="med-card' + (opts.compact ? ' compact' : '') + '"><div class="med-cont">' + containerSvg(d) + '</div><div class="med-lbl">' + labelSvg(d) + '</div></div>';
  }

  global.PharmLabels = { labelSvg: labelSvg, containerSvg: containerSvg, medCard: medCard, concText: concText };
})(window);
