const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");
const path = require("path");
const { applyTheme } = require("/root/.claude/skills/synced/3cc5111f-ecbf-4bfd-ad9a-7868a36d18c3_6487a98e-3213-4231-87be-83fde6c1be84/pptx/scripts/apply_theme.js");

const OUTFILE = process.argv[2] || "deck.pptx";
const STRIPS = path.join(__dirname, "strips");

const THEME = {
  name: "Code Red",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "1B1F2A", lt1: "FFFFFF", dk2: "6E0B1E", lt2: "F5F1F2",
    accent1: "C8102E", accent2: "1A7F64", accent3: "D98A1A", accent4: "2B4C7E",
    accent5: "5E6472", accent6: "E8606C", hlink: "2B4C7E", folHlink: "6E0B1E",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
pres.title = "Cardiac Arrest Management & Rhythm Interpretation";
pres.subject = "ACLS for paramedics - 2025 AHA Guidelines";
pres.author = "Paramedic Education";
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor;
const W = 13.333;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "TITLE_DARK",
  background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 1.2, w: 11.9, h: 1.9, fontSize: 44, bold: true,  align: "left", color: C.background1, valign: "bottom", fontFace: THEME.headFontFace }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.2, w: 11.9, h: 0.9, fontSize: 20, color: C.accent6, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "SECTION",
  background: { color: C.text2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.7, y: 2.6, w: 11.9, h: 1.2, fontSize: 44, bold: true, align: "left", color: C.background1, valign: "middle" }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: 0.7, y: 3.8, w: 11.9, h: 0.8, fontSize: 20, color: C.background2, valign: "top" }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: C.background1 },
  margin: [0.5, 0.6, 0.6, 0.6],
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: 0.6, y: 0.35, w: 12.13, h: 0.8, fontSize: 32, bold: true, align: "left", color: C.text1, valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "Cardiac Arrest & Rhythm Interpretation  ·  2025 AHA ACLS  ·  Follow local protocols", options: { x: 0.6, y: 7.0, w: 9, h: 0.3, fontSize: 10, color: C.accent5, margin: 0 } } },
  ],
  slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: "right" },
});

// ---------- helpers ----------
async function icon(Comp, hex = "FFFFFF") {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color: "#" + hex, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}
const ICONS = {};
async function loadIcons() {
  const names = ["FaHeartbeat", "FaBolt", "FaSyringe", "FaLungs", "FaSearch", "FaUsers", "FaHospital", "FaBaby", "FaLink",
    "FaWaveSquare", "FaStopwatch", "FaClipboardCheck", "FaUserMd", "FaAmbulance", "FaHandPaper", "FaBrain", "FaTint",
    "FaThermometerHalf", "FaExclamationTriangle", "FaLightbulb", "FaRulerHorizontal", "FaRedo", "FaCompressArrowsAlt", "FaSlidersH", "FaPills"];
  for (const n of names) ICONS[n] = await icon(fa[n]);
}

function iconCircle(s, name, x, y, d, color = C.accent1) {
  s.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color }, line: { color }, objectName: `icon-bg-${name}` });
  const p = d * 0.24;
  s.addImage({ data: ICONS[name], x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p, objectName: `icon-${name}` });
}
function card(s, x, y, w, h, opts = {}) {
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.1, fill: { color: opts.fill || C.background2 },
    line: { color: opts.line || opts.fill || C.background2, width: opts.lineW || 0.75 },
    shadow: opts.shadow ? { type: "outer", color: "000000", opacity: 0.18, blur: 6, offset: 2, angle: 90 } : undefined,
    objectName: opts.name || "card",
  });
}
function text(s, t, o) { s.addText(t, Object.assign({ isTextBox: true, fontSize: 14, color: C.text1, valign: "top", margin: 0 }, o)); }
function bullets(items, o = {}) {
  return items.map((it, i) => ({ text: it, options: Object.assign({ bullet: { indent: 16 }, breakLine: i < items.length - 1, paraSpaceAfter: 5 }, o) }));
}
const RATIO = 1200 / 192; // strip image aspect (w/h)
function strip(s, name, x, y, w, caption) {
  const h = w / RATIO;
  s.addShape(pres.shapes.RECTANGLE, { x, y, w, h, fill: { color: "FFF7F8" }, line: { color: HEX.accent6, width: 1 },
    shadow: { type: "outer", color: "000000", opacity: 0.2, blur: 8, offset: 3, angle: 90 }, objectName: `strip-frame-${name}` });
  s.addImage({ path: path.join(STRIPS, name + ".png"), x, y, w, h, altText: caption || `ECG strip: ${name}`, objectName: `strip-${name}` });
  return h;
}
function content(title, section) {
  const s = pres.addSlide({ masterName: "CONTENT", sectionTitle: section });
  s.addText(title, { placeholder: "title" });
  return s;
}
function table(s, rows, o) {
  s.addTable(rows, Object.assign({ fontSize: 13, fontFace: THEME.bodyFontFace, color: C.text1, border: { type: "solid", pt: 0.75, color: "E2DADC" }, valign: "middle", margin: [4, 6, 4, 6] }, o));
}
function hdr(cells, fill = C.text1) { return cells.map((c) => ({ text: c, options: { bold: true, color: C.background1, fill: { color: fill } } })); }

// Standard rhythm teaching slide
function rhythmSlide(sec, o) {
  const s = content(o.title, sec);
  strip(s, o.strip, 0.6, 1.3, 12.13, o.title);
  text(s, o.caption || "Lead II  ·  25 mm/s  ·  1 small box = 0.04 s  ·  synthetic teaching strip", { x: 0.6, y: 3.3, w: 12.13, h: 0.3, fontSize: 11, color: C.accent5, italic: true });
  const rows = o.criteria.map(([k, v]) => [
    { text: k, options: { bold: true, color: C.accent1, fill: { color: C.background2 } } },
    { text: v },
  ]);
  table(s, rows, { x: 0.6, y: 3.75, w: 6.3, colW: [1.5, 4.8], rowH: 0.5, fontSize: 14 });
  card(s, 7.2, 3.75, 5.53, 2.95, { name: "management-card" });
  iconCircle(s, o.icon || "FaAmbulance", 7.45, 3.95, 0.55, o.iconColor || C.accent1);
  text(s, o.clueTitle || "Field priorities", { x: 8.15, y: 4.0, w: 4.4, h: 0.45, fontSize: 18, bold: true, valign: "middle", fontFace: THEME.headFontFace });
  text(s, bullets(o.points), { x: 7.45, y: 4.65, w: 5.1, h: 1.95, fontSize: 14 });
  s.addNotes(o.notes);
  return s;
}

(async () => {
  await loadIcons();

  // ===================== 1. TITLE =====================
  pres.addSection({ title: "Introduction" });
  let s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Introduction" });
  s.addText("Cardiac Arrest Management & Rhythm Interpretation", { placeholder: "title" });
  s.addText("Heart blocks and atrial rhythms for paramedics  ·  Aligned to the 2025 AHA Guidelines for CPR & ECC", { placeholder: "body" });
  strip(s, "nsr", 0.7, 4.6, 11.93);
  s.addNotes("Welcome. This module is built on the 2025 American Heart Association Guidelines for CPR and Emergency Cardiovascular Care and the paramedic-level National EMS Education Standards. Three parts: cardiac arrest management, heart block interpretation, and atrial rhythm interpretation. Remind learners that local medical direction and protocols take precedence over anything on these slides.");

  // ===================== 2. ROADMAP =====================
  s = content("What you will be able to do", "Introduction");
  const road = [
    ["FaHeartbeat", C.accent1, "1  Cardiac arrest", ["Deliver high-quality CPR with minimal pauses", "Run the VF/pVT and asystole/PEA pathways", "Find and treat reversible causes", "Manage the post-ROSC patient"]],
    ["FaWaveSquare", C.accent4, "2  Heart blocks", ["Apply a 5-step rhythm approach", "Differentiate 1st, 2nd (I & II) and 3rd degree", "Recognize which blocks are unstable", "Apply the bradycardia algorithm"]],
    ["FaBolt", C.accent2, "3  Atrial rhythms", ["Identify PACs, MAT, SVT, flutter and AF", "Separate regular from irregular narrow tachycardia", "Choose vagal, adenosine, rate control or cardioversion", "Select synchronized energy correctly"]],
  ];
  road.forEach(([ic, col, h, items], i) => {
    const x = 0.6 + i * 4.18;
    card(s, x, 1.5, 3.85, 5.1, { shadow: true, fill: C.background1, line: "E7E0E2", name: `roadmap-card-${i + 1}` });
    iconCircle(s, ic, x + 0.35, 1.8, 0.8, col);
    text(s, h, { x: x + 0.35, y: 2.8, w: 3.2, h: 0.5, fontSize: 22, bold: true, fontFace: THEME.headFontFace });
    text(s, bullets(items), { x: x + 0.35, y: 3.45, w: 3.2, h: 3.0, fontSize: 15 });
  });
  s.addNotes("Learning objectives. Part 1 covers the adult cardiac arrest algorithm. Parts 2 and 3 cover interpretation and field management of AV blocks and atrial rhythms, tied to the bradycardia and tachycardia algorithms.");

  // ===================== SECTION 1 =====================
  const S1 = "Cardiac Arrest";
  pres.addSection({ title: S1 });
  s = pres.addSlide({ masterName: "SECTION", sectionTitle: S1 });
  s.addText("Part 1 · Cardiac Arrest Management", { placeholder: "title" });
  s.addText("High-quality CPR, early defibrillation, and a team that never stops pushing", { placeholder: "body" });
  iconCircle(s, "FaHeartbeat", 0.7, 1.3, 1.1, C.accent1);
  s.addNotes("Section 1: adult cardiac arrest management.");

  // ---- 2025 updates
  s = content("2025 guideline points that shape our practice", S1);
  const upd = [
    ["FaLink", "One Chain of Survival", "A single chain now covers adults and children, in and out of hospital; recognition and early CPR stay the first links."],
    ["FaSyringe", "Epinephrine timing", "Nonshockable: give epinephrine as soon as feasible. Shockable: give it after initial defibrillation attempts fail."],
    ["FaLungs", "Airway choice", "BVM, supraglottic airway or ETT are all acceptable; choose by provider skill and success rate, without pausing CPR."],
    ["FaChart", "Physiologic monitoring", "Use waveform capnography to confirm airway placement, gauge CPR quality and spot ROSC early."],
    ["FaBolt", "Refractory VF", "After repeated failed shocks, a vector change (anterior–posterior) or DSED may be considered per medical direction."],
    ["FaHospital", "Post-arrest care", "Avoid hypotension and hypoxia, prevent fever, get a 12-lead, and transport to a capable cardiac arrest centre."],
  ];
  upd.forEach(([ic, h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 4.18, y = 1.45 + row * 2.75;
    card(s, x, y, 3.85, 2.45, { name: `update-${i + 1}` });
    iconCircle(s, ic === "FaChart" ? "FaWaveSquare" : ic, x + 0.3, y + 0.3, 0.6, C.accent1);
    text(s, h, { x: x + 1.05, y: y + 0.3, w: 2.6, h: 0.6, fontSize: 18, bold: true, valign: "middle", fontFace: THEME.headFontFace });
    text(s, b, { x: x + 0.3, y: y + 1.05, w: 3.3, h: 1.3, fontSize: 14 });
  });
  s.addNotes("These are the practice-relevant themes of the 2025 AHA update. Emphasize: epinephrine ASAP in nonshockable rhythms; in shockable rhythms epinephrine follows the first failed shocks (commonly after the second shock). Airway: no single device is mandated - the best airway is the one your agency places with a high first-pass success rate without interrupting compressions. Refractory VF: vector change and double sequential external defibrillation are options some systems use; check your protocol. Instructors should verify current wording against the published 2025 guidelines and local protocol before teaching.");

  // ---- High-quality CPR
  s = content("High-quality CPR is the intervention", S1);
  const stats = [["100–120", "compressions per minute"], ["5–6 cm", "depth (2–2.4 in), full recoil"], ["≥ 80%", "chest compression fraction goal"], ["< 10 s", "for any pause, incl. pre-shock"]];
  stats.forEach(([n, l], i) => {
    const x = 0.6 + i * 3.08;
    card(s, x, 1.45, 2.8, 2.3, { fill: C.text1, name: `cpr-stat-${i + 1}` });
    text(s, n, { x: x + 0.2, y: 1.65, w: 2.4, h: 1.0, fontSize: 44, bold: true, color: C.accent6, align: "center", valign: "middle", fontFace: THEME.headFontFace });
    text(s, l, { x: x + 0.2, y: 2.7, w: 2.4, h: 0.8, fontSize: 15, color: C.background1, align: "center" });
  });
  const cprRows = [
    ["FaRedo", "Rotate compressors every 2 minutes", "Switch at rhythm checks; fatigue degrades depth before rate."],
    ["FaLungs", "Ventilate, don't hyperventilate", "30:2 without an advanced airway; 1 breath every 6 s (10/min) with one."],
    ["FaWaveSquare", "Let ETCO₂ coach you", "Below 10 mmHg means improve compressions; aim for ≥ 20 mmHg."],
  ];
  cprRows.forEach(([ic, h, b], i) => {
    const y = 4.1 + i * 0.9;
    iconCircle(s, ic, 0.6, y, 0.6, C.accent1);
    text(s, h, { x: 1.4, y: y - 0.02, w: 11.3, h: 0.35, fontSize: 17, bold: true });
    text(s, b, { x: 1.4, y: y + 0.33, w: 11.3, h: 0.35, fontSize: 14, color: C.accent5 });
  });
  s.addNotes("Compressions are the foundation everything else rests on. Rate 100-120, depth at least 5 cm but not more than 6 cm, allow full chest recoil, minimise interruptions so that compression fraction is as high as possible - at least 60% is the floor, 80% is the goal for a well-run team. Charge the defibrillator during compressions, and keep the pre- and post-shock pause under 10 seconds. Avoid excessive ventilation; it raises intrathoracic pressure and lowers coronary perfusion.");

  // ---- Shockable
  s = content("Shockable rhythms: VF and pulseless VT", S1);
  text(s, "Ventricular fibrillation", { x: 0.6, y: 1.35, w: 6, h: 0.35, fontSize: 16, bold: true, color: C.accent1 });
  strip(s, "vf", 0.6, 1.75, 6.0);
  text(s, "Pulseless ventricular tachycardia", { x: 0.6, y: 2.95 + 0.25, w: 6, h: 0.35, fontSize: 16, bold: true, color: C.accent1 });
  strip(s, "vt", 0.6, 3.6, 6.0);
  text(s, [{ text: "Energy: ", options: { bold: true } }, { text: "biphasic per manufacturer (typically 120–200 J); if unknown, use the maximum. Resume CPR immediately after every shock." }],
    { x: 0.6, y: 4.85, w: 6.0, h: 1.6, fontSize: 14 });
  const vfSteps = [
    ["Shock 1", "CPR 2 min · IV/IO access · pads on, monitor"],
    ["Shock 2", "CPR 2 min · Epinephrine 1 mg q3–5 min · consider advanced airway + capnography"],
    ["Shock 3", "CPR 2 min · Amiodarone 300 mg (then 150 mg) or Lidocaine 1–1.5 mg/kg"],
    ["Continue", "Rhythm check every 2 min · treat H's & T's · consider vector change if refractory"],
  ];
  vfSteps.forEach(([h, b], i) => {
    const y = 1.35 + i * 1.33;
    card(s, 7.0, y, 5.73, 1.13, { name: `vf-step-${i + 1}`, fill: i === 0 ? C.accent1 : C.background2 });
    s.addShape(pres.shapes.OVAL, { x: 7.2, y: y + 0.24, w: 0.65, h: 0.65, fill: { color: i === 0 ? C.background1 : C.accent1 }, line: { color: i === 0 ? C.background1 : C.accent1 }, objectName: `vf-step-num-${i + 1}` });
    text(s, String(i + 1), { x: 7.2, y: y + 0.24, w: 0.65, h: 0.65, fontSize: 20, bold: true, align: "center", valign: "middle", color: i === 0 ? C.accent1 : C.background1 });
    text(s, h, { x: 8.05, y: y + 0.12, w: 4.5, h: 0.35, fontSize: 16, bold: true, color: i === 0 ? C.background1 : C.text1 });
    text(s, b, { x: 8.05, y: y + 0.48, w: 4.5, h: 0.6, fontSize: 13, color: i === 0 ? C.background1 : C.text1 });
  });
  s.addNotes("VF and pulseless VT are the only shockable arrest rhythms. Shock, then immediately resume CPR for 2 minutes without a pulse check. Epinephrine 1 mg IV/IO every 3-5 minutes after initial shocks have failed. Antiarrhythmic for shock-refractory VF/pVT: amiodarone 300 mg then 150 mg, or lidocaine 1-1.5 mg/kg then 0.5-0.75 mg/kg (max 3 mg/kg). Teaching point: the strips are synthetic but representative - coarse VF shows chaotic, irregular deflections with no identifiable QRS; monomorphic VT is wide, regular and rapid.");

  // ---- Nonshockable
  s = content("Nonshockable rhythms: asystole and PEA", S1);
  text(s, "Asystole — confirm in a second lead; check leads and gain", { x: 0.6, y: 1.35, w: 6.2, h: 0.35, fontSize: 16, bold: true, color: C.accent4 });
  strip(s, "asystole", 0.6, 1.75, 6.0);
  text(s, "PEA — any organized rhythm without a pulse", { x: 0.6, y: 3.2, w: 6.2, h: 0.35, fontSize: 16, bold: true, color: C.accent4 });
  strip(s, "nsr", 0.6, 3.6, 6.0);
  text(s, [{ text: "Key point: ", options: { bold: true } }, { text: "outcome hinges on finding the cause. A narrow, fast PEA often points to hypovolemia, tamponade or tension pneumothorax; wide and slow suggests hyperkalemia, toxins or massive MI." }],
    { x: 0.6, y: 4.85, w: 6.0, h: 1.6, fontSize: 14 });
  const peaSteps = [
    ["Start CPR", "Pads on · rhythm check confirms nonshockable"],
    ["Epinephrine ASAP", "1 mg IV/IO as soon as access is obtained, then every 3–5 min"],
    ["Airway & capnography", "BVM → SGA or ETT · 1 breath q6s · waveform ETCO₂"],
    ["Rhythm check q2 min", "Shockable? Switch pathways · search H's & T's continuously"],
  ];
  peaSteps.forEach(([h, b], i) => {
    const y = 1.35 + i * 1.33;
    card(s, 7.0, y, 5.73, 1.13, { name: `pea-step-${i + 1}`, fill: i === 1 ? C.accent4 : C.background2 });
    s.addShape(pres.shapes.OVAL, { x: 7.2, y: y + 0.24, w: 0.65, h: 0.65, fill: { color: i === 1 ? C.background1 : C.accent4 }, line: { color: i === 1 ? C.background1 : C.accent4 }, objectName: `pea-step-num-${i + 1}` });
    text(s, String(i + 1), { x: 7.2, y: y + 0.24, w: 0.65, h: 0.65, fontSize: 20, bold: true, align: "center", valign: "middle", color: i === 1 ? C.accent4 : C.background1 });
    text(s, h, { x: 8.05, y: y + 0.12, w: 4.5, h: 0.35, fontSize: 16, bold: true, color: i === 1 ? C.background1 : C.text1 });
    text(s, b, { x: 8.05, y: y + 0.48, w: 4.5, h: 0.6, fontSize: 13, color: i === 1 ? C.background1 : C.text1 });
  });
  s.addNotes("Asystole and PEA are not shockable. Give epinephrine as early as possible - earlier epinephrine in nonshockable rhythms is associated with better ROSC and survival. Confirm asystole: check lead connections, increase gain, look in another lead (fine VF can masquerade). The lower strip shows an organized sinus rhythm - if there is no pulse, it is PEA. Treat the patient, not the monitor.");

  // ---- Drugs
  s = content("Arrest pharmacology at a glance", S1);
  table(s, [
    hdr(["Drug", "Indication", "Adult dose (IV/IO)", "Repeat / notes"]),
    ["Epinephrine", "All arrest rhythms", "1 mg (0.1 mg/mL)", "Every 3–5 min · ASAP in nonshockable; after initial shocks in VF/pVT"],
    ["Amiodarone", "Shock-refractory VF/pVT", "300 mg bolus", "Second dose 150 mg"],
    ["Lidocaine", "Shock-refractory VF/pVT (alternative)", "1–1.5 mg/kg", "Then 0.5–0.75 mg/kg · max 3 mg/kg"],
    ["Magnesium sulfate", "Torsades de pointes", "1–2 g", "Not for routine use in other VF/pVT"],
    ["Calcium chloride", "Suspected hyperkalemia, Ca-channel blocker toxicity", "1 g (10 mL of 10%)", "Not routine in arrest"],
    ["Sodium bicarbonate", "Hyperkalemia, TCA overdose", "1 mEq/kg", "Not routine in arrest"],
  ].map((r, i) => i === 0 ? r : r.map((c, j) => ({ text: c, options: j === 0 ? { bold: true, color: C.accent1 } : {} }))),
  { x: 0.6, y: 1.4, w: 12.13, colW: [2.2, 3.4, 2.4, 4.13], rowH: 0.58, fontSize: 14 });
  iconCircle(s, "FaExclamationTriangle", 0.6, 5.85, 0.55, C.accent3);
  text(s, "Vasopressin, routine calcium and routine bicarbonate are not recommended. Flush every IO/IV push with 20 mL and keep compressions going during drug delivery.",
    { x: 1.35, y: 5.83, w: 11.3, h: 0.7, fontSize: 14, valign: "middle" });
  s.addNotes("Drug doses per AHA adult cardiac arrest algorithm. Lidocaine and amiodarone are both acceptable for shock-refractory VF/pVT. Magnesium is for torsades only. Calcium and bicarbonate are for specific circumstances such as hyperkalemia or tricyclic overdose - not routine. Confirm agency formulary and concentrations.");

  // ---- Airway & capnography
  s = content("Airway and capnography during resuscitation", S1);
  const air = [
    ["FaHandPaper", "Start simple", "BVM with OPA/NPA and 2-person seal; good oxygenation beats an early tube."],
    ["FaLungs", "Advance when ready", "SGA or ETT — whichever your crew places quickly and reliably. Never stop compressions to intubate."],
    ["FaStopwatch", "Ventilate gently", "1 breath every 6 s, about 1 second each, just enough for visible chest rise."],
  ];
  air.forEach(([ic, h, b], i) => {
    const y = 1.45 + i * 1.7;
    card(s, 0.6, y, 5.6, 1.45, { name: `airway-card-${i + 1}` });
    iconCircle(s, ic, 0.85, y + 0.38, 0.7, C.accent4);
    text(s, h, { x: 1.8, y: y + 0.18, w: 4.2, h: 0.4, fontSize: 18, bold: true, fontFace: THEME.headFontFace });
    text(s, b, { x: 1.8, y: y + 0.6, w: 4.2, h: 0.8, fontSize: 14 });
  });
  text(s, "Reading the ETCO₂ waveform", { x: 6.7, y: 1.45, w: 6.0, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace });
  const bands = [
    ["< 10 mmHg", "Poor compressions or poor perfusion — push harder, swap compressor", C.accent1],
    ["10–20 mmHg", "Acceptable; keep optimizing toward ≥ 20", C.accent3],
    ["≥ 20 mmHg", "Effective CPR", C.accent2],
    ["Abrupt rise to 35–45", "Likely ROSC — check pulse at next rhythm check", C.accent4],
  ];
  bands.forEach(([v, d, col], i) => {
    const y = 2.1 + i * 1.0;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 6.7, y, w: 2.3, h: 0.8, rectRadius: 0.1, fill: { color: col }, line: { color: col }, objectName: `etco2-band-${i + 1}` });
    text(s, v, { x: 6.75, y, w: 2.2, h: 0.8, fontSize: 15, bold: true, color: C.background1, align: "center", valign: "middle" });
    text(s, d, { x: 9.2, y, w: 3.5, h: 0.8, fontSize: 14, valign: "middle" });
  });
  text(s, "A flat trace after intubation means the tube is not in the trachea until proven otherwise.", { x: 6.7, y: 6.1, w: 6.0, h: 0.6, fontSize: 14, italic: true, color: C.accent1 });
  s.addNotes("2025 guidance accepts BVM, supraglottic airway or endotracheal intubation in the out-of-hospital setting; the choice depends on provider skill and system success rates. Use continuous waveform capnography to confirm and monitor placement, and as a CPR quality gauge. A persistently low ETCO2 (<10 mmHg) after about 20 minutes of ALS is associated with very low likelihood of ROSC, but it should not be used in isolation to stop resuscitation.");

  // ---- H's and T's
  s = content("Reversible causes: the H's and T's", S1);
  const hs = [["Hypovolemia", "Fluid bolus, control bleeding"], ["Hypoxia", "Airway, O₂, effective ventilation"], ["Hydrogen ion (acidosis)", "Ventilation; bicarbonate if indicated"], ["Hypo-/Hyperkalemia", "Calcium + bicarbonate for high K⁺"], ["Hypothermia", "Rewarm; handle gently"]];
  const ts = [["Tension pneumothorax", "Needle / finger decompression"], ["Tamponade, cardiac", "Fluids, rapid transport; ultrasound if available"], ["Toxins", "Specific antidote, e.g. naloxone, Ca²⁺, bicarbonate"], ["Thrombosis, pulmonary", "Consider fibrinolysis per protocol; transport"], ["Thrombosis, coronary", "12-lead after ROSC, PCI-capable centre"]];
  [[hs, "H", C.accent1, 0.6], [ts, "T", C.accent4, 6.83]].forEach(([list, L, col, x]) => {
    list.forEach(([h, b], i) => {
      const y = 1.4 + i * 1.07;
      card(s, x, y, 5.9, 0.92, { name: `${L}-cause-${i + 1}` });
      s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: y + 0.14, w: 0.64, h: 0.64, fill: { color: col }, line: { color: col }, objectName: `${L}-badge-${i + 1}` });
      text(s, L, { x: x + 0.2, y: y + 0.14, w: 0.64, h: 0.64, fontSize: 22, bold: true, color: C.background1, align: "center", valign: "middle" });
      text(s, h, { x: x + 1.05, y: y + 0.1, w: 4.7, h: 0.36, fontSize: 16, bold: true });
      text(s, b, { x: x + 1.05, y: y + 0.47, w: 4.7, h: 0.36, fontSize: 14, color: C.accent5 });
    });
  });
  s.addNotes("Run through the H's and T's out loud as a team at every rhythm check. Scene and history clues are your best tools: dialysis patient (hyperkalemia), drug paraphernalia (toxins), trauma or GI bleed (hypovolemia), recent surgery or immobility (PE), chest pain before collapse (coronary thrombosis). Point-of-care ultrasound, where used, can help identify tamponade and pneumothorax.");

  // ---- Refractory VF & team
  s = content("Refractory VF and the pit-crew team", S1);
  card(s, 0.6, 1.4, 5.9, 5.3, { name: "refractory-card" });
  iconCircle(s, "FaBolt", 0.85, 1.65, 0.7, C.accent1);
  text(s, "VF persisting after ≥ 3 shocks", { x: 1.75, y: 1.7, w: 4.6, h: 0.6, fontSize: 18, bold: true, valign: "middle", fontFace: THEME.headFontFace });
  text(s, bullets([
    "Verify pad placement and skin contact; replace pads if needed",
    "Consider a vector change to anterior–posterior pads",
    "Consider double sequential defibrillation if your protocol includes it",
    "Ensure the antiarrhythmic has been given",
    "Think coronary occlusion: early transport to an ECPR / PCI centre if available",
  ]), { x: 0.85, y: 2.55, w: 5.4, h: 4.0, fontSize: 17 });
  // team diagram
  const cx = 9.73, cy = 4.05;
  s.addShape(pres.shapes.OVAL, { x: cx - 0.85, y: cy - 0.85, w: 1.7, h: 1.7, fill: { color: C.text1 }, line: { color: C.text1 }, objectName: "team-patient" });
  text(s, "Patient", { x: cx - 0.85, y: cy - 0.85, w: 1.7, h: 1.7, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
  const roles = [["Compressor", C.accent1], ["Airway", C.accent4], ["Monitor / defib", C.accent1], ["IV / IO & meds", C.accent2], ["Team leader", C.text2], ["Recorder / timer", C.accent5]];
  roles.forEach(([r, col], i) => {
    const a = (-90 + i * 60) * Math.PI / 180;
    const rx = cx + 2.1 * Math.cos(a), ry = cy + 1.95 * Math.sin(a);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: rx - 0.95, y: ry - 0.32, w: 1.9, h: 0.64, rectRadius: 0.1, fill: { color: col }, line: { color: col }, objectName: `team-role-${i + 1}` });
    text(s, r, { x: rx - 0.95, y: ry - 0.32, w: 1.9, h: 0.64, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  s.addNotes("Refractory VF: confirm pads are well placed, consider a vector change to anterior-posterior positioning, and - where your medical director has approved it - double sequential external defibrillation (DSED). The DOSE-VF trial suggested improved survival with both vector change and DSED compared with standard defibrillation. Pit-crew CPR: pre-assigned roles reduce chaos and pauses; the team leader stays hands-off, watches CPR quality and timing, and leads the H's and T's discussion. Closed-loop communication throughout.");

  // ---- Post-ROSC
  s = content("After ROSC: protect the brain and the heart", S1);
  const rosc = [
    ["FaLungs", "SpO₂ 92–98%", "Titrate O₂ down; avoid hypoxia and hyperoxia"],
    ["FaWaveSquare", "ETCO₂ 35–45", "Normal ventilation, about 10 breaths/min"],
    ["FaTint", "SBP ≥ 90 · MAP ≥ 65", "Fluids, then norepinephrine or epinephrine infusion"],
    ["FaHeartbeat", "12-lead ECG", "STEMI or suspected occlusion → PCI centre"],
    ["FaBrain", "Neuro & glucose", "GCS, pupils, glucose; treat seizures"],
    ["FaThermometerHalf", "Prevent fever", "Temperature control continues in hospital"],
  ];
  rosc.forEach(([ic, h, b], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    const x = 0.6 + col * 4.18, y = 1.45 + row * 2.6;
    card(s, x, y, 3.85, 2.3, { shadow: true, fill: C.background1, line: "E7E0E2", name: `rosc-${i + 1}` });
    iconCircle(s, ic, x + 0.3, y + 0.3, 0.65, C.accent2);
    text(s, h, { x: x + 0.3, y: y + 1.1, w: 3.3, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace });
    text(s, b, { x: x + 0.3, y: y + 1.55, w: 3.3, h: 0.65, fontSize: 14, color: C.accent5 });
  });
  s.addNotes("Post-cardiac arrest care begins the moment ROSC is achieved. Re-arrest is common in the first minutes, so keep pads on and anticipate. Targets: SpO2 92-98%, normocapnia (ETCO2 35-45 mmHg as a surrogate), SBP at least 90 and MAP at least 65 mmHg. Obtain a 12-lead ECG as soon as feasible; STEMI warrants emergent PCI. Check glucose. Temperature control and fever prevention continue in hospital. Transport to a cardiac arrest centre where available.");

  // ---- Special circumstances & TOR
  s = content("Special situations and termination of resuscitation", S1);
  const spec = [
    ["FaPills", C.accent4, "Opioid-associated", ["Pulse present, poor breathing: ventilate + naloxone", "No pulse: standard ACLS first; naloxone must not delay CPR", "Observe for re-sedation after ROSC"]],
    ["FaBaby", C.accent1, "Pregnancy", ["Manual left uterine displacement during CPR", "Early advanced airway; avoid hyperventilation", "If ≥ 20 weeks: alert obstetrics for resuscitative delivery; rapid transport"]],
    ["FaClipboardCheck", C.text2, "Termination (TOR)", ["Apply your validated BLS/ALS TOR rule", "Typical: arrest not EMS-witnessed, no shock, no ROSC", "Low ETCO₂ supports but never decides alone; contact medical direction"]],
  ];
  spec.forEach(([ic, col, h, items], i) => {
    const x = 0.6 + i * 4.18;
    card(s, x, 1.45, 3.85, 5.2, { name: `special-${i + 1}` });
    iconCircle(s, ic, x + 0.3, 1.7, 0.75, col);
    text(s, h, { x: x + 0.3, y: 2.6, w: 3.3, h: 0.5, fontSize: 20, bold: true, fontFace: THEME.headFontFace });
    text(s, bullets(items), { x: x + 0.3, y: 3.2, w: 3.3, h: 3.3, fontSize: 15 });
  });
  s.addNotes("Opioid-associated emergencies: naloxone is for the patient with a pulse and respiratory depression; in cardiac arrest, high-quality CPR and ventilation come first. Pregnancy: manual left uterine displacement to relieve aortocaval compression; if the uterus is at or above the umbilicus (about 20 weeks) and no ROSC, early notification for resuscitative hysterotomy - in the field this means rapid transport decisions. Termination of resuscitation: use your system's validated rule and consult medical direction; consider family and scene safety.");

  // ===================== SECTION 2 =====================
  const S2 = "Heart Blocks";
  pres.addSection({ title: S2 });
  s = pres.addSlide({ masterName: "SECTION", sectionTitle: S2 });
  s.addText("Part 2 · Heart Blocks", { placeholder: "title" });
  s.addText("Atrioventricular conduction delays: from benign to life-threatening", { placeholder: "body" });
  iconCircle(s, "FaWaveSquare", 0.7, 1.3, 1.1, C.accent4);
  s.addNotes("Section 2: AV blocks. We start with a systematic approach, then work through each block.");

  // ---- 5-step approach
  s = content("A 5-step approach to every strip", S2);
  strip(s, "nsr", 0.6, 1.3, 12.13);
  text(s, "Normal sinus rhythm for reference: rate 75 · regular · upright P before every QRS · PR 0.16 s · QRS 0.08 s", { x: 0.6, y: 3.3, w: 12.13, h: 0.3, fontSize: 11, color: C.accent5, italic: true });
  const steps = [["Rate", "6-second count × 10, or 300 ÷ large boxes"], ["Rhythm", "Regular, regularly irregular or irregularly irregular?"], ["P waves", "Present? Upright? One for every QRS?"], ["PR interval", "Normal 0.12–0.20 s; constant or changing?"], ["QRS width", "Narrow < 0.12 s; wide ≥ 0.12 s"]];
  steps.forEach(([h, b], i) => {
    const x = 0.6 + i * 2.48;
    card(s, x, 3.8, 2.25, 2.85, { name: `approach-step-${i + 1}` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.2, y: 4.0, w: 0.7, h: 0.7, fill: { color: C.accent4 }, line: { color: C.accent4 }, objectName: `approach-num-${i + 1}` });
    text(s, String(i + 1), { x: x + 0.2, y: 4.0, w: 0.7, h: 0.7, fontSize: 22, bold: true, color: C.background1, align: "center", valign: "middle" });
    text(s, h, { x: x + 0.2, y: 4.85, w: 1.9, h: 0.4, fontSize: 18, bold: true, fontFace: THEME.headFontFace });
    text(s, b, { x: x + 0.2, y: 5.3, w: 1.9, h: 1.3, fontSize: 14 });
  });
  s.addNotes("Use the same five steps every time. Paper: 25 mm/s, one small box 0.04 s, one large box 0.20 s. In AV blocks the PR interval and the P:QRS relationship are the key: ask 'Is there a P for every QRS, and a QRS for every P?' Then 'Is the PR constant?' Always treat the patient - correlate with perfusion.");

  rhythmSlide(S2, {
    title: "First-degree AV block", strip: "avb1", icon: "FaLightbulb", iconColor: C.accent2, clueTitle: "Clue: long but constant PR",
    criteria: [["Rate", "Usually normal (here ~70)"], ["Rhythm", "Regular"], ["P waves", "Normal; one P for every QRS"], ["PR interval", "> 0.20 s and constant (here 0.32 s)"], ["QRS", "Usually narrow"]],
    points: ["A conduction delay, not a true block — every impulse gets through", "Often benign: athletes, vagal tone, beta-blockers, CCBs, digoxin", "New onset with an MI: monitor for progression", "No specific treatment; treat the patient"],
    notes: "First-degree AV block: every P conducts, but slowly. PR is prolonged beyond 0.20 s (one large box) and stays the same beat to beat. Look for causes - medications, inferior MI, increased vagal tone. Usually asymptomatic and needs no treatment, but document and monitor.",
  });
  rhythmSlide(S2, {
    title: "Second-degree AV block type I (Wenckebach)", strip: "avb2i", icon: "FaLightbulb", iconColor: C.accent3, clueTitle: "Clue: longer, longer, drop",
    criteria: [["Rate", "Atrial normal; ventricular slightly slower"], ["Rhythm", "Regularly irregular — grouped beating"], ["P waves", "Normal; occasional P not followed by QRS"], ["PR interval", "Progressively lengthens until a beat drops"], ["QRS", "Usually narrow (block at AV node)"]],
    points: ["Block usually at the AV node; often transient", "Causes: inferior MI, vagal tone, AV-nodal drugs", "Usually stable; if symptomatic, atropine is often effective", "Monitor; pacing rarely needed"],
    notes: "Mobitz I / Wenckebach: the PR interval gets progressively longer until a P wave is not conducted, then the cycle restarts. Produces grouped beating. Here: PR 0.18, 0.28, 0.35, then a dropped QRS - a 4:3 pattern. The PR after the dropped beat is the shortest. Usually nodal, usually benign, atropine-responsive.",
  });
  rhythmSlide(S2, {
    title: "Second-degree AV block type II (Mobitz II)", strip: "avb2ii", icon: "FaExclamationTriangle", iconColor: C.accent1, clueTitle: "Clue: constant PR, sudden drop",
    criteria: [["Rate", "Atrial normal; ventricular slower"], ["Rhythm", "Irregular when beats drop (here 3:2)"], ["P waves", "Normal; some P waves not conducted"], ["PR interval", "Constant on conducted beats"], ["QRS", "Often wide (infranodal block)"]],
    points: ["Block below the AV node — can progress suddenly to complete block", "Treat as unstable: pads on, prepare for TCP", "Atropine often ineffective; do not delay pacing", "Common with anterior MI"],
    notes: "Mobitz II: PR interval is fixed on conducted beats, then a P wave suddenly fails to conduct, without warning lengthening. Block is in the His-Purkinje system, so the QRS is often wide and escape rhythms are unreliable. High risk of progression to third-degree block or asystole. Apply pads early. Note: a 2:1 AV block cannot be classified as type I or II from a single strip - judge by QRS width and clinical picture and treat cautiously.",
  });
  rhythmSlide(S2, {
    title: "Third-degree (complete) AV block", strip: "avb3", icon: "FaExclamationTriangle", iconColor: C.accent1, clueTitle: "Clue: P waves march through",
    criteria: [["Rate", "Atrial 60–100; ventricular 20–40 (wide)"], ["Rhythm", "P–P regular; R–R regular; independent"], ["P waves", "Normal, but unrelated to QRS"], ["PR interval", "None — varies randomly (AV dissociation)"], ["QRS", "Narrow if junctional escape; wide if ventricular"]],
    points: ["No atrial impulses reach the ventricles", "Usually symptomatic: hypotension, syncope, AMS", "Transcutaneous pacing is first-line when unstable with wide QRS", "Atropine may be tried but must not delay pacing"],
    notes: "Complete heart block: atria and ventricles beat independently. Map the P waves with calipers or paper - they march through at a regular rate (here about 90), sometimes hidden in QRS complexes or T waves. Ventricular escape here is about 38/min with wide complexes. Prepare to pace; consider epinephrine or dopamine infusion as a bridge.",
  });

  // ---- Heart block comparison
  s = content("Heart blocks side by side", S2);
  table(s, [
    hdr(["Block", "PR interval", "P : QRS relationship", "QRS", "Risk", "Field priority"], C.accent4),
    ["1st degree", "> 0.20 s, constant", "1 : 1", "Narrow", "Low", "Monitor; find cause"],
    ["2nd type I", "Lengthens, then drop", "Some P not conducted", "Narrow", "Low–moderate", "Atropine if symptomatic"],
    ["2nd type II", "Constant, then drop", "Some P not conducted", "Often wide", "High", "Pads on; prepare TCP"],
    ["2 : 1 block", "Constant on conducted", "2 P per QRS", "Narrow or wide", "Unclear", "Treat by QRS & symptoms"],
    ["3rd degree", "Variable — no relation", "AV dissociation", "Wide or narrow", "High", "TCP; infusion bridge"],
  ].map((r, i) => i === 0 ? r : r.map((c, j) => ({ text: c, options: j === 0 ? { bold: true, color: C.accent4 } : (j === 4 && c === "High" ? { bold: true, color: C.accent1 } : {}) }))),
  { x: 0.6, y: 1.4, w: 12.13, colW: [1.75, 2.3, 2.35, 1.6, 1.6, 2.53], rowH: 0.62, fontSize: 14 });
  iconCircle(s, "FaLightbulb", 0.6, 5.55, 0.6, C.accent3);
  text(s, "Memory hook: “If some P's don't get through, then you have a Mobitz; if the PR goes long, long, long, then drop — it's Wenckebach; if P's and Q's don't agree, then you have a third degree.”",
    { x: 1.4, y: 5.45, w: 11.3, h: 0.95, fontSize: 15, italic: true, valign: "middle" });
  s.addNotes("Use this table as a review. Key discriminators are PR behaviour and the P:QRS relationship. Wide QRS and infranodal blocks (Mobitz II, complete heart block) are the dangerous ones - they respond poorly to atropine and need pacing.");

  // ---- Bradycardia algorithm
  s = content("Managing symptomatic bradycardia", S2);
  const brady = [
    ["Assess", "HR typically < 50 and causing symptoms? Airway, O₂ if SpO₂ < 90%, IV, 12-lead, monitor", C.accent4],
    ["Poor perfusion?", "Hypotension · altered mental status · shock · ischemic chest pain · acute heart failure", C.accent3],
    ["Atropine", "1 mg IV every 3–5 min · max 3 mg", C.accent1],
    ["If atropine fails", "Transcutaneous pacing and/or dopamine 5–20 mcg/kg/min or epinephrine 2–10 mcg/min", C.accent1],
    ["Consult & transport", "Expert consultation; transvenous pacing in hospital", C.text2],
  ];
  brady.forEach(([h, b, col], i) => {
    const y = 1.35 + i * 1.08;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 0.6, y, w: 2.6, h: 0.88, rectRadius: 0.1, fill: { color: col }, line: { color: col }, objectName: `brady-step-${i + 1}` });
    text(s, h, { x: 0.7, y, w: 2.4, h: 0.88, fontSize: 16, bold: true, color: C.background1, align: "center", valign: "middle" });
    card(s, 3.35, y, 4.6, 0.88, { name: `brady-detail-${i + 1}` });
    text(s, b, { x: 3.55, y, w: 4.25, h: 0.88, fontSize: 13, valign: "middle" });
  });
  card(s, 8.35, 1.35, 4.38, 5.2, { fill: C.text1, name: "brady-pearls" });
  iconCircle(s, "FaExclamationTriangle", 8.6, 1.6, 0.65, C.accent1);
  text(s, "Go straight to pacing", { x: 9.4, y: 1.65, w: 3.2, h: 0.55, fontSize: 18, bold: true, color: C.background1, valign: "middle", fontFace: THEME.headFontFace });
  text(s, bullets(["Mobitz II or third-degree block with wide QRS — atropine rarely works", "Heart transplant patients (denervated heart)", "Severe instability: don't wait for atropine doses", "Pacing: set rate ~60–70, increase mA to electrical capture, confirm mechanical capture by pulse; sedate/analgesia"], { color: C.background1 }),
    { x: 8.6, y: 2.5, w: 3.9, h: 3.9, fontSize: 14 });
  s.addNotes("Adult bradycardia algorithm. First decide whether the bradycardia is causing the symptoms. Atropine 1 mg IV every 3-5 minutes up to 3 mg. If ineffective: transcutaneous pacing, or a chronotropic infusion - dopamine 5-20 mcg/kg/min or epinephrine 2-10 mcg/min. For high-degree blocks with wide QRS, move to pacing early. Confirm mechanical capture with a femoral pulse, not the carotid (muscle twitch artifact). Consider and treat causes: hypoxia, hyperkalemia, drug toxicity (beta-blocker, calcium channel blocker, digoxin), inferior MI.");

  // ===================== SECTION 3 =====================
  const S3 = "Atrial Rhythms";
  pres.addSection({ title: S3 });
  s = pres.addSlide({ masterName: "SECTION", sectionTitle: S3 });
  s.addText("Part 3 · Atrial Rhythms", { placeholder: "title" });
  s.addText("When the atria take over: ectopy, re-entry, flutter and fibrillation", { placeholder: "body" });
  iconCircle(s, "FaBolt", 0.7, 1.3, 1.1, C.accent2);
  s.addNotes("Section 3: atrial and supraventricular rhythms, linked to the adult tachycardia algorithm.");

  rhythmSlide(S3, {
    title: "Premature atrial contractions (PACs)", strip: "pac", icon: "FaLightbulb", iconColor: C.accent2, clueTitle: "Clue: early beat, odd P wave",
    criteria: [["Rate", "Underlying rhythm rate"], ["Rhythm", "Irregular where the PAC occurs"], ["P waves", "Early P with different shape (4th beat)"], ["PR interval", "Normal or slightly different"], ["QRS", "Narrow; usually followed by a non-compensatory pause"]],
    points: ["Ectopic atrial focus fires before the SA node", "Triggers: caffeine, nicotine, stress, hypoxia, electrolytes", "Usually no treatment; correct the cause", "Frequent PACs can herald AF or SVT"],
    notes: "PACs: an early beat with an abnormal P wave that comes from somewhere other than the SA node. The QRS is usually narrow. The pause after the PAC is typically non-compensatory because the SA node is reset. Look at the 4th complex on this strip - early, peaked P wave, normal QRS.",
  });
  rhythmSlide(S3, {
    title: "Multifocal atrial tachycardia (MAT)", strip: "mat", icon: "FaLungs", iconColor: C.accent4, clueTitle: "Clue: 3+ P-wave shapes",
    criteria: [["Rate", "> 100 (wandering atrial pacemaker if < 100)"], ["Rhythm", "Irregularly irregular"], ["P waves", "At least 3 different morphologies"], ["PR interval", "Varies with each P"], ["QRS", "Narrow"]],
    points: ["Classic in COPD, hypoxia, pneumonia, sepsis", "Treat the underlying cause — oxygen, bronchodilators", "Cardioversion is not effective", "Often mistaken for AF — look for distinct P waves"],
    notes: "MAT: multiple ectopic atrial foci, so P waves change shape and PR intervals vary. It is irregularly irregular like AF, but has discernible P waves before each QRS. Strongly associated with COPD and hypoxia. Synchronized cardioversion does not work; treatment is of the underlying respiratory or metabolic problem.",
  });
  rhythmSlide(S3, {
    title: "Supraventricular tachycardia (SVT)", strip: "svt", icon: "FaHeartbeat", iconColor: C.accent1, clueTitle: "Stable? Vagal, then adenosine",
    criteria: [["Rate", "150–250 (here ~180)"], ["Rhythm", "Regular"], ["P waves", "Usually hidden in QRS or T waves"], ["PR interval", "Not measurable"], ["QRS", "Narrow (< 0.12 s)"]],
    points: ["Usually AV-nodal re-entry: sudden onset and offset", "Modified Valsalva (strain, then lie flat, legs raised)", "Adenosine 6 mg rapid IV push + flush; then 12 mg", "Unstable: synchronized cardioversion 50–100 J"],
    notes: "SVT usually refers to re-entrant tachycardia (AVNRT or AVRT). Regular, narrow, rapid, P waves not visible. Stable: vagal manoeuvres first - the modified Valsalva is more effective than standard. Then adenosine 6 mg rapid IV push in a proximal (antecubital) vein with a 20 mL flush; if no conversion, 12 mg. Warn the patient about transient chest discomfort and a sense of doom. Record a strip during adenosine - it may unmask flutter waves. Unstable: synchronized cardioversion.",
  });
  rhythmSlide(S3, {
    title: "Atrial flutter", strip: "flutter", icon: "FaWaveSquare", iconColor: C.accent3, clueTitle: "Clue: sawtooth F waves",
    criteria: [["Rate", "Atrial ~300; ventricular depends on ratio"], ["Rhythm", "Usually regular (here 4:1 ≈ 75)"], ["P waves", "Flutter waves — sawtooth, best in II, III, aVF"], ["PR interval", "Not measured"], ["QRS", "Narrow"]],
    points: ["Regular narrow tachycardia at ~150? Suspect 2:1 flutter", "Stable: rate control (diltiazem or beta-blocker per protocol)", "Unstable: synchronized cardioversion 50–100 J", "Adenosine won't convert it but may reveal F waves"],
    notes: "Atrial flutter: a macro re-entry circuit in the right atrium producing flutter waves at about 300/min. Conduction is often 2:1 (ventricular rate ~150) or 4:1 (~75). A regular narrow tachycardia at exactly 150 should make you hunt for hidden flutter waves. Flutter responds well to low-energy synchronized cardioversion when unstable.",
  });
  rhythmSlide(S3, {
    title: "Atrial fibrillation", strip: "afib", icon: "FaWaveSquare", iconColor: C.accent1, clueTitle: "Clue: irregularly irregular, no P",
    criteria: [["Rate", "Atrial 350–600; ventricular variable"], ["Rhythm", "Irregularly irregular"], ["P waves", "Absent — fibrillatory baseline"], ["PR interval", "None"], ["QRS", "Narrow (wide if aberrancy or pre-excitation)"]],
    points: ["Rapid ventricular response > 100–110 often causes symptoms", "Stable: rate control — diltiazem 0.25 mg/kg over 2 min or beta-blocker", "Unstable: synchronized cardioversion 120–200 J biphasic", "Irregular, wide, very fast? Think WPW — avoid AV-nodal blockers"],
    notes: "Atrial fibrillation: chaotic atrial activity, no P waves, irregularly irregular ventricular response. Ask about onset (stroke risk if > 48 hours), anticoagulants, and symptoms. Stable with RVR: rate control per protocol. Unstable: synchronized cardioversion 120-200 J biphasic. Pre-excited AF (WPW): irregular, very fast, wide and bizarre QRS - adenosine, diltiazem, beta-blockers, digoxin and amiodarone can be dangerous; cardioversion or procainamide per protocol.",
  });

  // ---- Atrial comparison
  s = content("Atrial rhythms side by side", S3);
  table(s, [
    hdr(["Rhythm", "Rate", "Regularity", "P waves", "First-line (stable)"], C.accent2),
    ["PACs", "Underlying", "Irregular at the PAC", "Early, abnormal", "Treat cause"],
    ["MAT", "> 100", "Irregularly irregular", "≥ 3 morphologies", "Treat hypoxia / COPD"],
    ["SVT", "150–250", "Regular", "Hidden", "Vagal → adenosine"],
    ["Atrial flutter", "~150 (2:1) or ~75 (4:1)", "Usually regular", "Sawtooth F waves", "Rate control"],
    ["Atrial fibrillation", "Variable", "Irregularly irregular", "None; fibrillatory", "Rate control"],
  ].map((r, i) => i === 0 ? r : r.map((c, j) => ({ text: c, options: j === 0 ? { bold: true, color: C.accent2 } : {} }))),
  { x: 0.6, y: 1.4, w: 12.13, colW: [2.3, 2.4, 2.5, 2.4, 2.53], rowH: 0.62, fontSize: 14 });
  iconCircle(s, "FaSearch", 0.6, 5.55, 0.6, C.accent2);
  text(s, "Narrow and irregular? Look for P waves: distinct and varied → MAT; none → AF. Narrow, regular and exactly ~150 → suspect 2:1 flutter.",
    { x: 1.4, y: 5.45, w: 11.3, h: 0.95, fontSize: 15, valign: "middle" });
  s.addNotes("Summary table. The two big discriminators for narrow-complex rhythms are regularity and P wave appearance.");

  // ---- Tachycardia algorithm
  s = content("Tachycardia with a pulse: stable or unstable?", S3);
  card(s, 0.6, 1.4, 5.9, 5.25, { fill: C.text1, name: "unstable-card" });
  iconCircle(s, "FaBolt", 0.85, 1.65, 0.65, C.accent1);
  text(s, "Unstable → synchronized cardioversion", { x: 1.65, y: 1.65, w: 4.7, h: 0.65, fontSize: 18, bold: true, color: C.background1, valign: "middle", fontFace: THEME.headFontFace });
  text(s, "Hypotension · acutely altered mental status · signs of shock · ischemic chest discomfort · acute heart failure", { x: 0.85, y: 2.45, w: 5.4, h: 0.75, fontSize: 14, color: C.accent6 });
  const energy = [["Narrow, regular", "50–100 J"], ["Narrow, irregular (AF)", "120–200 J biphasic"], ["Wide, regular", "100 J"], ["Wide, irregular", "Defibrillation dose (unsynchronized)"]];
  energy.forEach(([k, v], i) => {
    const y = 3.35 + i * 0.78;
    text(s, k, { x: 0.85, y, w: 2.6, h: 0.62, fontSize: 15, bold: true, color: C.background1, valign: "middle" });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 3.5, y, w: 2.75, h: 0.62, rectRadius: 0.08, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `energy-${i + 1}` });
    text(s, v, { x: 3.55, y, w: 2.65, h: 0.62, fontSize: 14, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  card(s, 6.83, 1.4, 5.9, 5.25, { name: "stable-card" });
  iconCircle(s, "FaHeartbeat", 7.08, 1.65, 0.65, C.accent2);
  text(s, "Stable → identify and treat", { x: 7.88, y: 1.65, w: 4.7, h: 0.65, fontSize: 18, bold: true, valign: "middle", fontFace: THEME.headFontFace });
  text(s, [
    { text: "Narrow, regular (SVT)", options: { bold: true, color: C.accent2, breakLine: true } },
    { text: "Vagal manoeuvres → adenosine 6 mg rapid push, then 12 mg", options: { breakLine: true, paraSpaceAfter: 10 } },
    { text: "Narrow, irregular (AF / flutter)", options: { bold: true, color: C.accent2, breakLine: true } },
    { text: "Rate control: diltiazem or beta-blocker per protocol", options: { breakLine: true, paraSpaceAfter: 10 } },
    { text: "Wide QRS (≥ 0.12 s)", options: { bold: true, color: C.accent2, breakLine: true } },
    { text: "Treat as VT until proven otherwise; adenosine only if regular and monomorphic; consider amiodarone or procainamide; expert consult" },
  ], { x: 7.08, y: 2.5, w: 5.4, h: 4.0, fontSize: 15 });
  s.addNotes("Adult tachycardia with a pulse algorithm. First question: is the tachycardia causing instability? If yes, synchronized cardioversion - sedate if time allows. Energy guide: narrow regular 50-100 J; narrow irregular (AF) 120-200 J biphasic; wide regular 100 J; wide irregular (polymorphic VT) - defibrillate, do not synchronize. If stable: obtain a 12-lead, classify by QRS width and regularity. Re-sync after every cardioversion - many monitors default back to unsynchronized mode.");

  // ---- Practice strips
  s = content("Practice: name these rhythms", S3);
  const quiz = [["A", "afib_rvr"], ["B", "brady"], ["C", "avb2i"]];
  quiz.forEach(([L, n], i) => {
    const y = 1.35 + i * 1.8;
    s.addShape(pres.shapes.OVAL, { x: 0.6, y: y + 0.32, w: 0.75, h: 0.75, fill: { color: C.accent1 }, line: { color: C.accent1 }, objectName: `quiz-badge-${L}` });
    text(s, L, { x: 0.6, y: y + 0.32, w: 0.75, h: 0.75, fontSize: 24, bold: true, color: C.background1, align: "center", valign: "middle" });
    strip(s, n, 1.6, y, 8.75, `Practice strip ${L}`);
  });
  card(s, 10.65, 1.35, 2.08, 5.0, { name: "quiz-steps" });
  text(s, [{ text: "Use the 5 steps", options: { bold: true, breakLine: true, paraSpaceAfter: 8 } }, ...bullets(["Rate", "Rhythm", "P waves", "PR", "QRS"])],
    { x: 10.85, y: 1.6, w: 1.75, h: 4.6, fontSize: 15 });
  s.addNotes("Give learners 2-3 minutes per strip. Answers on the next slide. A: atrial fibrillation with rapid ventricular response. B: sinus bradycardia. C: second-degree AV block type I (Wenckebach).");

  s = content("Practice answers", S3);
  const ans = [
    ["A", "Atrial fibrillation with RVR", "Irregularly irregular, ~140/min, no P waves, narrow QRS. Stable → rate control; unstable → sync 120–200 J."],
    ["B", "Sinus bradycardia", "Regular ~45/min, upright P before every QRS, normal PR. Treat only if symptomatic: atropine 1 mg."],
    ["C", "2nd-degree AV block type I", "PR lengthens beat by beat until a P is not conducted; grouped beating, narrow QRS."],
  ];
  ans.forEach(([L, h, b], i) => {
    const y = 1.45 + i * 1.75;
    card(s, 0.6, y, 12.13, 1.5, { name: `answer-${L}` });
    s.addShape(pres.shapes.OVAL, { x: 0.85, y: y + 0.35, w: 0.8, h: 0.8, fill: { color: C.accent2 }, line: { color: C.accent2 }, objectName: `answer-badge-${L}` });
    text(s, L, { x: 0.85, y: y + 0.35, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: C.background1, align: "center", valign: "middle" });
    text(s, h, { x: 1.95, y: y + 0.2, w: 10.5, h: 0.45, fontSize: 20, bold: true, fontFace: THEME.headFontFace });
    text(s, b, { x: 1.95, y: y + 0.7, w: 10.5, h: 0.65, fontSize: 15 });
  });
  s.addNotes("Discuss how each was identified using the five steps. Ask: which of these would you expect to respond to atropine? (B and C, if symptomatic.)");

  // ===================== CLOSE =====================
  pres.addSection({ title: "Summary" });
  s = pres.addSlide({ masterName: "TITLE_DARK", sectionTitle: "Summary" });
  s.addText("Key takeaways", { placeholder: "title" });
  const take = [
    ["FaCompressArrowsAlt", "Compressions first", "100–120/min, 5–6 cm, minimal pauses, ETCO₂-guided"],
    ["FaSyringe", "Right drug, right time", "Epi ASAP in nonshockable; after failed shocks in VF/pVT"],
    ["FaWaveSquare", "PR and P:QRS tell the block", "Mobitz II and complete block → pace early"],
    ["FaBolt", "Stable vs unstable decides", "Unstable tachycardia → synchronized cardioversion"],
  ];
  take.forEach(([ic, h, b], i) => {
    const x = 0.7 + i * 3.03;
    iconCircle(s, ic, x, 4.35, 0.7, C.accent1);
    text(s, h, { x, y: 5.2, w: 2.8, h: 0.75, fontSize: 17, bold: true, color: C.background1 });
    text(s, b, { x, y: 5.95, w: 2.8, h: 0.9, fontSize: 14, color: C.accent6 });
  });
  s.addText("Built on the 2025 AHA Guidelines for CPR & ECC and the National EMS Education Standards. Always follow local protocols and medical direction.", { placeholder: "body" });
  s.addNotes("References: American Heart Association. 2025 American Heart Association Guidelines for Cardiopulmonary Resuscitation and Emergency Cardiovascular Care. Circulation. 2025. National Highway Traffic Safety Administration. National EMS Education Standards (paramedic). Cheskes S, et al. Defibrillation strategies for refractory ventricular fibrillation (DOSE-VF). N Engl J Med. 2022. ECG strips in this deck are synthetic teaching illustrations, not patient recordings.");

  await pres.writeFile({ fileName: OUTFILE });
  await applyTheme(OUTFILE, THEME);
  console.log("wrote", OUTFILE);
})().catch((e) => { console.error(e); process.exit(1); });
