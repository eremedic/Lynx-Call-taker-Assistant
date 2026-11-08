/*
 * CSHealthED Pharmacology Trainer — calculation problem generators.
 * Each generator returns { topic, prompt, drug?, answer, unit, tol, round, steps[] }.
 */
(function (global) {
  'use strict';

  var D = global.PharmData;
  function r(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(r(a, b + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function rd(n, d) { var f = Math.pow(10, d); return Math.round(n * f) / f; }
  function n(v) { // pretty number with thousands separators
    var x = rd(v, 4), parts = String(x).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }
  function lname(d) { return d.name.replace(/ \d.*$/, '').toLowerCase(); }
  function f(top, bottom) { return '<span class="frac"><span>' + top + '</span><span>' + bottom + '</span></span>'; }

  var TOPICS = {
    conv: { name: 'Unit conversions', desc: 'mg ↔ mcg ↔ g, lb ↔ kg, L ↔ mL, °F ↔ °C' },
    percent: { name: 'Percent & ratio solutions', desc: '% and 1:1,000-style strengths to mg/mL' },
    weight: { name: 'Weight-based dosing', desc: 'mg/kg and mcg/kg doses, including maximums' },
    volume: { name: 'Volume to administer', desc: 'Desired ÷ on hand × volume, from a real label' },
    combo: { name: 'Weight-based → volume', desc: 'Two-step: dose by weight, then mL to draw up' },
    gtt: { name: 'Drip rates (gtt/min)', desc: 'Gravity infusions with 10, 15, 20 and 60 gtt/mL sets' },
    pump: { name: 'Pump rates (mL/hr)', desc: 'Volume over time on an infusion pump' },
    infusion: { name: 'Infusions & push-dose', desc: 'mcg/min, mcg/kg/min and push-dose epinephrine' }
  };

  /* ---------- conversions ---------- */
  function conv() {
    var kind = pick(['mg-mcg', 'mcg-mg', 'g-mg', 'mg-g', 'lb-kg', 'kg-lb', 'L-mL', 'F-C', 'C-F']);
    var v, ans, unit, steps, prompt, tol, round;
    if (kind === 'mg-mcg') { v = pick([0.4, 0.5, 0.05, 0.075, 0.1, 0.15, 1.2, 0.025]); ans = v * 1000; unit = 'mcg'; prompt = 'Convert <b>' + n(v) + ' mg</b> to micrograms.'; steps = ['1 mg = 1,000 mcg, so multiply by 1,000 (move the decimal 3 places right).', n(v) + ' mg × 1,000 = <b>' + n(ans) + ' mcg</b>']; }
    else if (kind === 'mcg-mg') { v = pick([50, 75, 100, 125, 250, 400, 25, 500]); ans = v / 1000; unit = 'mg'; prompt = 'Convert <b>' + n(v) + ' mcg</b> to milligrams.'; steps = ['1,000 mcg = 1 mg, so divide by 1,000 (move the decimal 3 places left).', n(v) + ' mcg ÷ 1,000 = <b>' + n(ans) + ' mg</b>']; }
    else if (kind === 'g-mg') { v = pick([1, 2, 0.5, 1.5, 4, 25, 0.25]); ans = v * 1000; unit = 'mg'; prompt = 'Convert <b>' + n(v) + ' g</b> to milligrams.'; steps = ['1 g = 1,000 mg.', n(v) + ' g × 1,000 = <b>' + n(ans) + ' mg</b>']; }
    else if (kind === 'mg-g') { v = pick([500, 250, 2000, 1500, 125, 4000]); ans = v / 1000; unit = 'g'; prompt = 'Convert <b>' + n(v) + ' mg</b> to grams.'; steps = ['1,000 mg = 1 g.', n(v) + ' mg ÷ 1,000 = <b>' + n(ans) + ' g</b>']; }
    else if (kind === 'lb-kg') { v = ri(18, 260); ans = rd(v / 2.2, 1); unit = 'kg'; tol = 0.15; prompt = 'A patient weighs <b>' + v + ' lb</b>. What is the weight in kilograms? <span class="hint">Round to the nearest tenth.</span>'; steps = ['1 kg = 2.2 lb, so divide pounds by 2.2.', v + ' lb ÷ 2.2 = <b>' + n(ans) + ' kg</b>']; }
    else if (kind === 'kg-lb') { v = ri(4, 120); ans = rd(v * 2.2, 1); unit = 'lb'; tol = 0.15; prompt = 'Convert <b>' + v + ' kg</b> to pounds. <span class="hint">Round to the nearest tenth.</span>'; steps = ['Multiply kilograms by 2.2.', v + ' kg × 2.2 = <b>' + n(ans) + ' lb</b>']; }
    else if (kind === 'L-mL') { v = pick([0.25, 0.5, 1, 1.5, 0.1, 2]); ans = v * 1000; unit = 'mL'; prompt = 'Convert <b>' + n(v) + ' L</b> to milliliters.'; steps = ['1 L = 1,000 mL.', n(v) + ' L × 1,000 = <b>' + n(ans) + ' mL</b>']; }
    else if (kind === 'F-C') { v = pick([95, 96.8, 98.6, 100.4, 101.5, 102.2, 104, 106.7, 89.6]); ans = rd((v - 32) * 5 / 9, 1); unit = '°C'; tol = 0.15; prompt = 'Convert a temperature of <b>' + v + ' °F</b> to Celsius. <span class="hint">Round to the nearest tenth.</span>'; steps = ['°C = (°F − 32) × 5/9', '(' + v + ' − 32) × 5/9 = ' + rd(v - 32, 1) + ' × 0.5556 = <b>' + n(ans) + ' °C</b>']; }
    else { v = pick([35, 36, 37, 38.5, 39, 40, 41.2, 32]); ans = rd(v * 9 / 5 + 32, 1); unit = '°F'; tol = 0.15; prompt = 'Convert <b>' + v + ' °C</b> to Fahrenheit. <span class="hint">Round to the nearest tenth.</span>'; steps = ['°F = (°C × 9/5) + 32', '(' + v + ' × 1.8) + 32 = <b>' + n(ans) + ' °F</b>']; }
    return { topic: 'conv', prompt: prompt, answer: ans, unit: unit, tol: tol, steps: steps };
  }

  /* ---------- percent & ratio ---------- */
  function percent() {
    var items = [
      { d: 'lidocaine', pct: 2, ans: 20, txt: 'lidocaine 2%' },
      { d: 'magnesium', pct: 50, ans: 500, txt: 'magnesium sulfate 50%' },
      { d: 'd50', pct: 50, ans: 500, txt: 'dextrose 50%' },
      { d: 'd10', pct: 10, ans: 100, txt: 'dextrose 10%' },
      { d: 'cacl', pct: 10, ans: 100, txt: 'calcium chloride 10%' }
    ];
    var kind = pick(['pct', 'pct', 'ratio', 'grams']);
    if (kind === 'ratio') {
      var rr = pick([{ r: '1:1,000', v: 1000, ans: 1 }, { r: '1:10,000', v: 10000, ans: 0.1 }, { r: '1:100,000', v: 100000, ans: 0.01 }]);
      return { topic: 'percent', drug: null, prompt: 'Epinephrine is sometimes still described by ratio. What is the concentration of a <b>' + rr.r + '</b> solution in <b>mg/mL</b>?', answer: rr.ans, unit: 'mg/mL',
        steps: ['A ratio strength means 1 g of drug in ' + n(rr.v) + ' mL of solution.', '1 g = 1,000 mg, so ' + f('1,000 mg', n(rr.v) + ' mL') + ' = <b>' + n(rr.ans) + ' mg/mL</b>', 'Labels now state mg/mL (1:1,000 = 1 mg/mL; 1:10,000 = 0.1 mg/mL) to prevent errors.'] };
    }
    var it = pick(items);
    if (kind === 'grams' && (it.d === 'd50' || it.d === 'd10')) {
      var vol = it.d === 'd10' ? pick([100, 150, 200, 250]) : pick([20, 25, 30, 50]);
      var g = vol * it.pct / 100;
      return { topic: 'percent', drug: it.d, prompt: 'How many <b>grams</b> of dextrose are in <b>' + vol + ' mL</b> of ' + it.txt + '?', answer: g, unit: 'g',
        steps: [it.pct + '% means ' + it.pct + ' g per 100 mL = ' + n(it.pct / 100) + ' g/mL.', vol + ' mL × ' + n(it.pct / 100) + ' g/mL = <b>' + n(g) + ' g</b>'] };
    }
    return { topic: 'percent', drug: null, prompt: 'What is the concentration of <b>' + it.txt + '</b> in <b>mg/mL</b>?', answer: it.ans, unit: 'mg/mL',
      steps: ['Percent (w/v) = grams per 100 mL. ' + it.pct + '% = ' + it.pct + ' g / 100 mL.', 'Convert to mg: ' + it.pct + ' g = ' + n(it.pct * 1000) + ' mg.', f(n(it.pct * 1000) + ' mg', '100 mL') + ' = <b>' + n(it.ans) + ' mg/mL</b>', 'Shortcut: % × 10 = mg/mL.'] };
  }

  /* ---------- weight-based ---------- */
  var WB = [
    { d: 'fentanyl', per: 1, unit: 'mcg', who: 'adult', ctx: 'for pain', max: 100 },
    { d: 'ketamine', per: 0.3, unit: 'mg', who: 'adult', ctx: 'for analgesia' },
    { d: 'etomidate', per: 0.3, unit: 'mg', who: 'adult', ctx: 'for RSI induction' },
    { d: 'rocuronium', per: 1, unit: 'mg', who: 'adult', ctx: 'for RSI' },
    { d: 'succinylcholine', per: 1.5, unit: 'mg', who: 'adult', ctx: 'for RSI' },
    { d: 'diltiazem', per: 0.25, unit: 'mg', who: 'adult', ctx: 'for A-fib with RVR' },
    { d: 'lidocaine', per: 1.5, unit: 'mg', who: 'adult', ctx: 'in VF arrest' },
    { d: 'bicarb', per: 1, unit: 'mEq', who: 'adult', ctx: 'for a TCA overdose with wide QRS' },
    { d: 'epi-arrest', per: 0.01, unit: 'mg', who: 'child', ctx: 'in pediatric cardiac arrest', max: 1 },
    { d: 'atropine', per: 0.02, unit: 'mg', who: 'child', ctx: 'for symptomatic bradycardia', min: 0.1, max: 0.5 },
    { d: 'adenosine', per: 0.1, unit: 'mg', who: 'child', ctx: 'for SVT (first dose)', max: 6 },
    { d: 'amiodarone', per: 5, unit: 'mg', who: 'child', ctx: 'in pediatric VF', max: 300 },
    { d: 'diphenhydramine', per: 1, unit: 'mg', who: 'child', ctx: 'for an allergic reaction', max: 50 },
    { d: 'ondansetron', per: 0.1, unit: 'mg', who: 'child', ctx: 'for vomiting', max: 4 },
    { d: 'midazolam', per: 0.2, unit: 'mg', who: 'child', ctx: 'intranasally for a seizure', max: 10 },
    { d: 'naloxone', per: 0.1, unit: 'mg', who: 'child', ctx: 'for an opioid ingestion', max: 2 },
    { d: 'methylpred', per: 2, unit: 'mg', who: 'child', ctx: 'for asthma', max: 125 },
    { d: 'fentanyl', per: 1, unit: 'mcg', who: 'child', ctx: 'IV for a fractured femur', max: 100 },
    { d: 'cacl', per: 20, unit: 'mg', who: 'child', ctx: 'for hyperkalemia', max: 1000 },
    { d: 'txa', per: 15, unit: 'mg', who: 'child', ctx: 'for hemorrhage', max: 1000 }
  ];
  function weightCase(w) {
    var kg = w.who === 'child' ? ri(6, 45) : ri(55, 115);
    var inLb = Math.random() < 0.45;
    var lb = inLb ? Math.round(kg * 2.2) : null;
    var kgUsed = inLb ? rd(lb / 2.2, 1) : kg;
    var raw = w.per * kgUsed, dose = raw, capped = '';
    if (w.max && raw > w.max) { dose = w.max; capped = 'This exceeds the maximum of ' + n(w.max) + ' ' + w.unit + ', so give <b>' + n(w.max) + ' ' + w.unit + '</b>.'; }
    if (w.min && raw < w.min) { dose = w.min; capped = 'This is below the minimum of ' + n(w.min) + ' ' + w.unit + ', so give <b>' + n(w.min) + ' ' + w.unit + '</b>.'; }
    dose = rd(dose, w.unit === 'mcg' || w.unit === 'mEq' ? 0 : dose < 10 ? 2 : 1);
    var steps = [];
    if (inLb) steps.push('Convert weight: ' + lb + ' lb ÷ 2.2 = ' + n(kgUsed) + ' kg');
    steps.push('Dose = ' + n(w.per) + ' ' + w.unit + '/kg × ' + n(kgUsed) + ' kg = ' + n(rd(raw, 3)) + ' ' + w.unit);
    if (capped) steps.push(capped);
    return { kg: kgUsed, lb: lb, wtText: inLb ? lb + ' lb' : kg + ' kg', dose: dose, raw: raw, steps: steps, capped: !!capped };
  }
  function weight() {
    var w = pick(WB), dr = D.byId(w.d), c = weightCase(w);
    return { topic: 'weight', drug: w.d,
      prompt: 'Your protocol calls for <b>' + lname(dr) + ' ' + n(w.per) + ' ' + w.unit + '/kg</b> ' + w.ctx + (w.max ? ' (maximum ' + n(w.max) + ' ' + w.unit + (w.min ? ', minimum ' + n(w.min) + ' ' + w.unit : '') + ')' : '') + '. The ' + (w.who === 'child' ? 'child' : 'patient') + ' weighs <b>' + c.wtText + '</b>. What dose do you give?',
      answer: c.dose, unit: w.unit, tol: Math.max(0.02 * c.dose, w.unit === 'mcg' || w.unit === 'mEq' ? 1 : 0.01), steps: c.steps.concat(['Answer: <b>' + n(c.dose) + ' ' + w.unit + '</b>']) };
  }

  /* ---------- volume to administer ---------- */
  var ORDERS = [
    { d: 'fentanyl', doses: [25, 50, 75, 100], unit: 'mcg' },
    { d: 'fentanyl', doses: [0.05, 0.075, 0.1], unit: 'mg', note: 'mcg' },
    { d: 'midazolam', doses: [2.5, 5, 10, 2, 4], unit: 'mg' },
    { d: 'ondansetron', doses: [4, 2], unit: 'mg' },
    { d: 'diphenhydramine', doses: [25, 50, 12.5], unit: 'mg' },
    { d: 'naloxone', doses: [0.4, 0.2, 0.1], unit: 'mg' },
    { d: 'adenosine', doses: [6, 12], unit: 'mg' },
    { d: 'amiodarone', doses: [150, 300], unit: 'mg' },
    { d: 'ketamine', doses: [25, 20, 100, 150, 30], unit: 'mg' },
    { d: 'morphine', doses: [2, 4, 3], unit: 'mg' },
    { d: 'diltiazem', doses: [10, 15, 20, 25], unit: 'mg' },
    { d: 'epi-im', doses: [0.3, 0.5, 0.15], unit: 'mg' },
    { d: 'magnesium', doses: [1, 2], unit: 'g', note: 'mg' },
    { d: 'txa', doses: [1], unit: 'g', note: 'mg' },
    { d: 'etomidate', doses: [20, 24, 30], unit: 'mg' },
    { d: 'rocuronium', doses: [70, 80, 100], unit: 'mg' },
    { d: 'succinylcholine', doses: [100, 120, 150], unit: 'mg' },
    { d: 'methylpred', doses: [125, 60], unit: 'mg' },
    { d: 'atropine', doses: [0.5, 1], unit: 'mg' },
    { d: 'cacl', doses: [500, 1000], unit: 'mg' },
    { d: 'glucagon', doses: [1, 0.5], unit: 'mg' }
  ];
  function volumeFor(dr, dose, unit) {
    var L = dr.label, labelUnit = L.concUnit.split('/')[0];
    var steps = [], doseInLabelUnit = dose;
    if (unit !== labelUnit) {
      var toMg = { mcg: 0.001, mg: 1, g: 1000 };
      doseInLabelUnit = dose * toMg[unit] / toMg[labelUnit];
      steps.push('Match the units first: ' + n(dose) + ' ' + unit + ' = ' + n(doseInLabelUnit) + ' ' + labelUnit + '.');
    }
    var vol = doseInLabelUnit / L.conc;
    steps.push('Concentration on the label: ' + n(L.conc) + ' ' + L.concUnit + (L.vol ? ' (' + n(L.amt) + ' ' + L.amtUnit + ' in ' + n(L.vol) + ' mL)' : '') + '.');
    steps.push('Volume = ' + f('desired dose', 'concentration') + ' = ' + f(n(doseInLabelUnit) + ' ' + labelUnit, n(L.conc) + ' ' + L.concUnit) + ' = <b>' + n(rd(vol, 3)) + ' mL</b>');
    return { vol: rd(vol, 3), steps: steps };
  }
  function volume() {
    var o = pick(ORDERS), dr = D.byId(o.d), dose = pick(o.doses), v = volumeFor(dr, dose, o.unit);
    return { topic: 'volume', drug: o.d, prompt: 'Order: <b>' + dr.name.replace(/ \d.*$/, '') + ' ' + n(dose) + ' ' + o.unit + '</b>. Using the medication shown, how many <b>mL</b> will you draw up?',
      answer: v.vol, unit: 'mL', tol: Math.max(0.01, v.vol * 0.01), steps: v.steps, order: { dose: dose, unit: o.unit } };
  }

  /* ---------- weight-based → volume ---------- */
  function combo() {
    var choices = WB.filter(function (w) { return ['fentanyl', 'ketamine', 'etomidate', 'rocuronium', 'succinylcholine', 'diltiazem', 'epi-arrest', 'atropine', 'adenosine', 'amiodarone', 'diphenhydramine', 'ondansetron', 'midazolam', 'naloxone', 'methylpred', 'cacl', 'lidocaine'].indexOf(w.d) >= 0; });
    var w = pick(choices), dr = D.byId(w.d), c = weightCase(w), v = volumeFor(dr, c.dose, w.unit);
    return { topic: 'combo', drug: w.d,
      prompt: 'Give <b>' + lname(dr) + ' ' + n(w.per) + ' ' + w.unit + '/kg</b> ' + w.ctx + (w.max ? ' (max ' + n(w.max) + ' ' + w.unit + ')' : '') + ' to a <b>' + c.wtText + '</b> ' + (w.who === 'child' ? 'child' : 'patient') + '. Using the medication shown, how many <b>mL</b> will you give?',
      answer: v.vol, unit: 'mL', tol: Math.max(0.01, v.vol * 0.015), steps: c.steps.concat(v.steps), order: { dose: c.dose, unit: w.unit } };
  }

  /* ---------- drip rates ---------- */
  function gtt() {
    var kind = pick(['fluid', 'fluid', 'med', 'med']), sets = [10, 15, 20, 60];
    var vol, min, set, prompt, drug = null, pre = [];
    if (kind === 'fluid') {
      vol = pick([100, 250, 500, 1000]); set = pick(sets);
      min = pick(vol >= 500 ? [60, 120, 240, 30] : [15, 20, 30, 60]);
      if (set === 60 && vol >= 500) set = 10;
      prompt = 'Infuse <b>' + n(vol) + ' mL</b> of normal saline over <b>' + (min >= 60 && min % 60 === 0 ? (min / 60) + ' hour' + (min > 60 ? 's' : '') : min + ' minutes') + '</b> using a <b>' + set + ' gtt/mL</b> administration set. What is the drip rate?';
    } else {
      var m = pick([
        { d: 'amiodarone', txt: 'amiodarone 150 mg in 100 mL', vol: 100, min: 10 },
        { d: 'txa', txt: 'tranexamic acid 1 g in 100 mL', vol: 100, min: 10 },
        { d: 'magnesium', txt: 'magnesium sulfate 2 g in 100 mL', vol: 100, min: 20 },
        { d: 'magnesium', txt: 'magnesium sulfate 2 g in 50 mL', vol: 50, min: 15 },
        { d: 'magnesium', txt: 'magnesium sulfate 4 g in 100 mL', vol: 100, min: 20 },
        { d: 'methylpred', txt: 'methylprednisolone 125 mg in 50 mL', vol: 50, min: 15 }
      ]);
      vol = m.vol; min = m.min; set = pick([10, 15, 20]); drug = m.d;
      prompt = 'Infuse <b>' + m.txt + '</b> over <b>' + min + ' minutes</b> with a <b>' + set + ' gtt/mL</b> set. What is the drip rate?';
    }
    var exact = vol * set / min, ans = Math.round(exact);
    var timeTxt = min + ' min';
    var steps = (min >= 60 ? ['Convert time to minutes: ' + (min / 60) + ' h × 60 = ' + min + ' min.'] : []).concat([
      'gtt/min = ' + f('volume (mL) × drop factor (gtt/mL)', 'time (min)'),
      '= ' + f(n(vol) + ' mL × ' + set + ' gtt/mL', timeTxt) + ' = ' + n(rd(exact, 2)) + ' → <b>' + ans + ' gtt/min</b> (you can’t count part of a drop)'
    ]);
    if (set === 60) steps.push('With a 60 gtt/mL (microdrip) set, gtt/min always equals mL/hr.');
    return { topic: 'gtt', drug: drug, prompt: prompt + ' <span class="hint">Round to the nearest whole drop.</span>', answer: ans, unit: 'gtt/min', tol: 1, steps: steps };
  }

  /* ---------- pump rates ---------- */
  function pump() {
    var kind = pick(['fluid', 'fluid', 'med']), vol, min, prompt, drug = null;
    if (kind === 'fluid') {
      vol = pick([500, 1000, 250, 100]); var hrs = pick(vol === 100 ? [0.5, 1] : [2, 4, 6, 8, 12]); min = hrs * 60;
      prompt = 'Infuse <b>' + n(vol) + ' mL</b> over <b>' + (hrs < 1 ? (hrs * 60) + ' minutes' : hrs + ' hours') + '</b> on an infusion pump. What rate do you program?';
    } else {
      var m = pick([
        { d: 'amiodarone', txt: 'amiodarone 150 mg in 100 mL over 10 minutes', vol: 100, min: 10 },
        { d: 'txa', txt: 'tranexamic acid 1 g in 100 mL over 10 minutes', vol: 100, min: 10 },
        { d: 'magnesium', txt: 'magnesium sulfate 2 g in 50 mL over 15 minutes', vol: 50, min: 15 },
        { d: 'magnesium', txt: 'magnesium sulfate 2 g in 100 mL over 20 minutes', vol: 100, min: 20 },
        { d: 'magnesium', txt: 'magnesium sulfate 4 g in 100 mL over 20 minutes', vol: 100, min: 20 }
      ]);
      vol = m.vol; min = m.min; drug = m.d; prompt = 'Run <b>' + m.txt + '</b> on an infusion pump. What rate do you program?';
    }
    var ans = rd(vol * 60 / min, 1);
    return { topic: 'pump', drug: drug, prompt: prompt + ' <span class="hint">Answer in mL/hr.</span>', answer: ans, unit: 'mL/hr', tol: Math.max(1, ans * 0.01),
      steps: ['mL/hr = ' + f('volume (mL)', 'time (hr)') + ' — or ' + f('volume (mL) × 60', 'time (min)'), '= ' + f(n(vol) + ' mL × 60', min + ' min') + ' = <b>' + n(ans) + ' mL/hr</b>'] };
  }

  /* ---------- infusions ---------- */
  function infusion() {
    var kind = pick(['dopa', 'norepi-min', 'norepi-kg', 'pushdose', 'pushdose-vol']);
    var kg, ans, steps, prompt, unit = 'mL/hr', drug, tol;
    if (kind === 'dopa') {
      kg = ri(50, 110); var rate = pick([5, 10, 15, 20]); drug = 'dopamine';
      var mcgmin = rate * kg; ans = rd(mcgmin * 60 / 1600, 1);
      prompt = 'Start <b>dopamine ' + rate + ' mcg/kg/min</b> for a <b>' + kg + ' kg</b> patient using the premixed bag shown (400 mg in 250 mL). What rate (mL/hr) do you program?';
      steps = ['Concentration: 400 mg ÷ 250 mL = 1.6 mg/mL = <b>1,600 mcg/mL</b>.', 'Dose per minute: ' + rate + ' mcg/kg/min × ' + kg + ' kg = ' + n(mcgmin) + ' mcg/min.', 'Per hour: ' + n(mcgmin) + ' × 60 = ' + n(mcgmin * 60) + ' mcg/hr.', 'mL/hr = ' + f(n(mcgmin * 60) + ' mcg/hr', '1,600 mcg/mL') + ' = <b>' + n(ans) + ' mL/hr</b>', 'On a 60 gtt/mL set this is also ' + Math.round(ans) + ' gtt/min.'];
      tol = Math.max(0.5, ans * 0.02);
    } else if (kind === 'norepi-min') {
      var mcg = pick([2, 4, 6, 8, 10, 12]); drug = 'norepinephrine';
      ans = rd(mcg * 60 / 16, 1);
      prompt = 'You mix <b>norepinephrine 4 mg in 250 mL</b> of NS. Medical direction orders <b>' + mcg + ' mcg/min</b>. What rate (mL/hr) do you program?';
      steps = ['Concentration: 4 mg = 4,000 mcg; 4,000 mcg ÷ 250 mL = <b>16 mcg/mL</b>.', 'Per hour: ' + mcg + ' mcg/min × 60 = ' + n(mcg * 60) + ' mcg/hr.', 'mL/hr = ' + f(n(mcg * 60) + ' mcg/hr', '16 mcg/mL') + ' = <b>' + n(ans) + ' mL/hr</b>'];
      tol = Math.max(0.5, ans * 0.02);
    } else if (kind === 'norepi-kg') {
      kg = ri(55, 110); var dose = pick([0.05, 0.1, 0.2]); drug = 'norepinephrine';
      var perMin = dose * kg; ans = rd(perMin * 60 / 16, 1);
      prompt = 'Norepinephrine is mixed <b>4 mg in 250 mL</b>. Start <b>' + dose + ' mcg/kg/min</b> for a <b>' + kg + ' kg</b> patient. What rate (mL/hr) do you program?';
      steps = ['Concentration: 4,000 mcg ÷ 250 mL = <b>16 mcg/mL</b>.', 'Dose per minute: ' + dose + ' × ' + kg + ' = ' + n(rd(perMin, 2)) + ' mcg/min.', 'mL/hr = ' + f(n(rd(perMin, 2)) + ' mcg/min × 60', '16 mcg/mL') + ' = <b>' + n(ans) + ' mL/hr</b>'];
      tol = Math.max(0.5, ans * 0.02);
    } else if (kind === 'pushdose') {
      drug = 'epi-arrest'; unit = 'mcg/mL'; ans = 10;
      prompt = 'To make push-dose epinephrine, you waste 1 mL from a 10 mL saline flush and add <b>1 mL of epinephrine 0.1 mg/mL</b>. What is the final concentration in <b>mcg/mL</b>?';
      steps = ['1 mL of 0.1 mg/mL contains 0.1 mg = 100 mcg.', 'Total volume is still 10 mL (9 mL saline + 1 mL epinephrine).', f('100 mcg', '10 mL') + ' = <b>10 mcg/mL</b>'];
      tol = 0.01;
    } else {
      drug = 'epi-arrest'; var want = pick([10, 20, 15, 5]); unit = 'mL'; ans = want / 10;
      prompt = 'Your push-dose epinephrine syringe contains <b>10 mcg/mL</b>. How many mL do you give for a <b>' + want + ' mcg</b> dose?';
      steps = ['Volume = ' + f(want + ' mcg', '10 mcg/mL') + ' = <b>' + n(ans) + ' mL</b>'];
      tol = 0.01;
    }
    return { topic: 'infusion', drug: drug, prompt: prompt + (unit === 'mL/hr' ? ' <span class="hint">Round to the nearest tenth.</span>' : ''), answer: ans, unit: unit, tol: tol, steps: steps };
  }

  var GEN = { conv: conv, percent: percent, weight: weight, volume: volume, combo: combo, gtt: gtt, pump: pump, infusion: infusion };

  function generate(topics) {
    var t = topics && topics.length ? pick(topics) : pick(Object.keys(GEN));
    var p = GEN[t]();
    if (p.tol == null) p.tol = Math.max(Math.abs(p.answer) * 0.01, 0.001);
    return p;
  }
  function check(p, value) {
    var v = parseFloat(String(value).replace(/,/g, ''));
    if (isNaN(v)) return null;
    return Math.abs(v - p.answer) <= p.tol + 1e-9;
  }

  global.PharmCalc = { TOPICS: TOPICS, generate: generate, check: check, volumeFor: volumeFor, weightCase: weightCase, n: n, frac: f, WB: WB, ORDERS: ORDERS };
})(window);
