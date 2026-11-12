"""Builds trainer data: 100 practice strips + 20 megacode cases, as compact waveform data."""
import json, os, random
import numpy as np
import ecg2 as E

# --- spikes stored separately so the browser can draw them razor-sharp ---
def _spike(self, c, a=0.95):
    if 0 <= c < E.DUR:
        self.spk.append((c, a))
def _tcp(self, c):
    m = E.t > c
    self.y[m] += -0.55 * np.exp(-(E.t[m] - c) / 0.05)
    if 0 <= c < E.DUR:
        self.spk.append((c, 1.35))
E.S.spike = _spike
E.S.tcp_art = _tcp

HERE = os.path.dirname(os.path.abspath(__file__))
STRIPS = {}


def encode(st):
    y = np.clip(st.y[::2], -0.88, 1.48)  # 500 Hz
    v = np.round(y * 100).astype(int)
    out, prev = [], None
    for x in v:
        if prev is None or abs(x - prev) > 40:
            out.append(f"|{x}|")
        else:
            out.append(chr(int(x - prev) + 80))
        prev = x
    return {"d": "".join(out), "s": [[int(round(c * 1000)), int(round(a * 100))] for c, a in st.spk]}


def add_strip(key, st):
    STRIPS[key] = encode(st)
    return key


# ---------------- rhythm categories ----------------
CAT = {
 "Normal sinus rhythm": ("sinus", "Rate 60–100, regular, upright P before every QRS, PR 0.12–0.20 s, narrow QRS.", "Everything is normal, so look for the problem in the patient rather than the strip."),
 "Sinus bradycardia": ("sinus", "Sinus rhythm (normal P, normal PR, narrow QRS) but rate below 60.", "Every beat is a normal sinus beat. Only the rate is slow."),
 "Sinus tachycardia": ("sinus", "Sinus rhythm with rate 100–150; P waves still visible before each QRS.", "Visible P waves at a rate under 150 point to sinus tachycardia, which is a response to something."),
 "Sinus arrhythmia": ("sinus", "Normal sinus beats with an R–R interval that speeds up and slows down cyclically.", "The P waves are identical; only the spacing changes, in a smooth cycle."),
 "Sinus arrest (pause)": ("sinus", "Sinus rhythm interrupted by a pause with no P wave and no QRS.", "Look for a gap where nothing at all happens, not a dropped QRS after a P."),
 "Junctional rhythm": ("escape", "Rate 40–60, regular, narrow QRS; P waves absent or inverted with a short PR.", "Narrow and slow with no normal upright P waves points to the AV junction."),
 "Accelerated junctional rhythm": ("escape", "Junctional rhythm at 60–100: narrow QRS, no normal P waves.", "Narrow, regular and no visible P, at a normal rate."),
 "Idioventricular rhythm": ("escape", "Rate 20–40, regular, wide QRS, no P waves.", "Wide and very slow with no P waves means the ventricles are pacing themselves."),
 "Accelerated idioventricular rhythm (AIVR)": ("escape", "Wide-QRS ventricular rhythm at 40–100 with no P waves.", "It looks like idioventricular rhythm but faster, which is common after reperfusion."),
 "Agonal rhythm": ("arrest", "Very slow (< 20), irregular, very wide, low-amplitude complexes.", "Broad, shapeless and very slow complexes are the signature of a dying heart."),
 "Sinus rhythm with unifocal PVC": ("ectopy", "Sinus rhythm with an early, wide, bizarre beat with no P wave (one shape).", "There is one early wide beat. Count the PVCs and check their shapes."),
 "Ventricular bigeminy": ("ectopy", "Every other beat is a PVC: sinus, PVC, sinus, PVC.", "The pattern alternates normal and wide."),
 "Ventricular trigeminy": ("ectopy", "Every third beat is a PVC: sinus, sinus, PVC.", "There are two normal beats, then a wide one, repeating."),
 "PVC couplet": ("ectopy", "Two PVCs in a row within a sinus rhythm.", "Look for two consecutive wide beats. Three or more in a row is a run of VT."),
 "Multifocal PVCs": ("ectopy", "PVCs with two or more different shapes.", "Compare the wide beats: if they look different, they come from different foci."),
 "Ventricular fibrillation (coarse)": ("arrest", "Chaotic, irregular waves of varying size; no identifiable P, QRS or T.", "No organized complexes at all, with large waves."),
 "Ventricular fibrillation (fine)": ("arrest", "Low-amplitude chaotic undulation; no organized complexes.", "Small chaotic waves are still VF and still shockable. Asystole would be nearly flat."),
 "Monomorphic ventricular tachycardia": ("arrest", "Regular, wide, identical complexes at > 100 (often 150–250); no P waves.", "Wide, fast and every complex the same."),
 "Polymorphic VT (torsades de pointes)": ("arrest", "Wide, rapid complexes that twist, growing and shrinking around the baseline.", "The amplitude waxes and wanes, so the complexes seem to twist."),
 "VT degenerating into VF": ("arrest", "Organized wide tachycardia that breaks down into chaotic fibrillation.", "Compare the start and end of the strip: organized becomes chaotic."),
 "Asystole": ("arrest", "No electrical activity: a nearly flat line.", "There are no complexes and no P waves. Always confirm with leads, gain and a second lead."),
 "P-wave asystole": ("arrest", "P waves continue but no QRS complexes follow.", "There are P waves but no ventricular activity at all."),
 "Pulseless electrical activity (PEA)": ("arrest", "Any organized rhythm with no palpable pulse.", "The strip looks organized, but the patient has no pulse."),
 "CPR artifact": ("arrest", "Regular broad waves at the compression rate (~100–120) produced by chest compressions.", "The rate matches compressions. Pause briefly to see the real rhythm."),
 "1st-degree AV block": ("block", "Every P conducts, but the PR is > 0.20 s and constant.", "The PR is long but never changes, and there are no dropped beats."),
 "2nd-degree AV block type I (Wenckebach)": ("block", "PR lengthens progressively until a P is not conducted; grouped beating.", "The PR gets longer, longer, longer, then a beat drops."),
 "2nd-degree AV block type II (Mobitz II)": ("block", "Constant PR on conducted beats, then a P suddenly isn't conducted; QRS often wide.", "The PR never changes before the dropped beat."),
 "2nd-degree AV block, 2:1": ("block", "Every other P is conducted; constant PR on conducted beats.", "Two P waves for every QRS, and the type can't be determined from 2:1 alone."),
 "Advanced (high-grade) AV block": ("block", "Two or more consecutive P waves not conducted (3:1 or more); conducted beats have a constant PR.", "Several P waves in a row are blocked, but there is still a constant PR before each QRS."),
 "3rd-degree (complete) AV block": ("block", "P waves and QRS complexes regular but completely independent (AV dissociation).", "The P waves march through at their own rate and the PR is never the same."),
 "Atrial paced rhythm": ("paced", "Pacer spike before each P wave, then normal conduction with narrow QRS.", "The spike comes before the P wave, not before the QRS."),
 "Ventricular paced rhythm": ("paced", "Pacer spike before each wide QRS; no relationship to P waves.", "One spike per beat, followed by a wide QRS."),
 "AV sequential (dual-chamber) paced rhythm": ("paced", "Two spikes per beat: atrial spike → P, then ventricular spike → wide QRS.", "Count the spikes: two per beat."),
 "Atrial-sensed, ventricular paced rhythm": ("paced", "Native sinus P waves, each followed by a ventricular spike and wide QRS.", "The P waves are the patient's own and only the ventricle is paced."),
 "Demand (VVI) pacing with native beats": ("paced", "Native beats, then paced beats appear only when the native rate drops.", "The pacer stays quiet until it's needed."),
 "Pacemaker failure to capture": ("paced", "Pacer spikes appear but some are not followed by a P or QRS.", "Look for a spike with nothing after it."),
 "Pacemaker failure to sense (undersensing)": ("paced", "Spikes fire at a fixed rate regardless of native beats, landing on QRS or T waves.", "The spikes ignore the patient's own beats."),
 "Pacemaker failure to pace (oversensing)": ("paced", "A pause longer than the pacing interval with no spike.", "There is a gap where a spike should be."),
 "Transcutaneous pacing with capture": ("paced", "Large pacing artifacts, each followed by a wide QRS and broad T wave.", "Every artifact has a QRS and T after it, which is electrical capture."),
 "Transcutaneous pacing without capture": ("paced", "Large pacing artifacts with no QRS after them; underlying rhythm continues independently.", "The artifacts appear but the ventricles don't respond, so increase the mA."),
 "Pacer spikes without capture (asystole)": ("paced", "Regular pacer spikes on an otherwise flat line, with no capture.", "There are spikes but no P waves or QRS complexes, so this is an arrest."),
}
GROUP_EXTRA = {"sinus": ["1st-degree AV block", "Junctional rhythm"], "escape": ["3rd-degree (complete) AV block", "Sinus bradycardia"],
               "ectopy": ["Monomorphic ventricular tachycardia", "Normal sinus rhythm"], "arrest": ["Idioventricular rhythm"],
               "block": ["Sinus bradycardia", "Junctional rhythm"], "paced": ["Idioventricular rhythm", "3rd-degree (complete) AV block"]}

NARROW, WIDE = "Narrow (≈ 0.08 s)", "Wide (≥ 0.12 s)"
ITEMS = []


def T(cat, st, stem, rhythm, p, pr, qrs, action, rate=None, spikes=None, name=None):
    assert cat in CAT, cat
    rows = [["Rate", rate or E.vr(st)], ["Rhythm", rhythm], ["P waves", p], ["PR interval", pr], ["QRS", qrs]]
    if spikes:
        rows.append(["Pacer spikes", spikes])
    ITEMS.append({"cat": cat, "name": name or cat, "st": st, "stem": stem, "rows": rows, "action": action})


def build_items():
    # --- sinus family ---
    for r, sd, stem in ((75, 1, "58-year-old, dizzy after standing; now feels well."), (88, 2, "Routine monitoring before an interfacility transfer.")):
        T("Normal sinus rhythm", E.sinus(r, seed=sd), stem, "Regular", "Upright, one before each QRS", "0.16 s", NARROW, ["Normal rhythm: assess the patient for a non-cardiac cause", "Vitals, glucose, history"])
    for r, sd, stem in ((48, 3, "Fit 30-year-old runner, asymptomatic."), (42, 4, "Hypothermic 70-year-old, BP 98/60, sleepy.")):
        T("Sinus bradycardia", E.sinus(r, seed=sd), stem, "Regular", "Upright, one before each QRS", "0.16 s", NARROW, ["Asymptomatic: no treatment", "Symptomatic: atropine 1 mg IV, then pacing or infusion"])
    for r, pr, sd, stem in ((125, 0.14, 5, "Febrile 70-year-old, BP 96/60."), (140, 0.12, 6, "Trauma patient, pale, BP 88/60.")):
        T("Sinus tachycardia", E.sinus(r, pr=pr, kind="nq", seed=sd), stem, "Regular", "Upright, one before each QRS", f"{pr:.2f} s", NARROW, ["A response: treat the cause (fever, sepsis, bleeding, pain, hypoxia)", "Don't try to slow it down"])
    for sd, stem in ((7, "Healthy 19-year-old; rate varies with breathing."), (8, "Anxious 24-year-old, normal vitals.")):
        st = E.sinus_arrhythmia(seed=sd)
        T("Sinus arrhythmia", st, stem, "Irregular, cyclic with respiration", "Upright, identical", "0.16 s, constant", NARROW, ["Normal variant, common in the young", "No treatment"])
    for sd, stem in ((9, "80-year-old with a near-syncope episode."), (10, "Elderly patient on a beta-blocker, 'fainted at church'.")):
        T("Sinus arrest (pause)", E.sinus_pause(seed=sd), stem, "Regular, interrupted by a ~2.5 s pause", "Upright; none during the pause", "0.16 s", NARROW, ["Symptomatic pauses suggest sick sinus syndrome", "Pads on; atropine or pacing if symptomatic"])
    # --- escape rhythms ---
    for r, sd, stem in ((48, 11, "67-year-old on a beta-blocker, BP 100/64."), (42, 12, "Digoxin patient, nauseated, BP 94/60.")):
        T("Junctional rhythm", E.junctional(r, seed=sd), stem, "Regular", "Inverted, just before the QRS", "Short (< 0.12 s)", NARROW, ["Junctional escape (40–60/min)", "Treat as bradycardia if symptomatic; review medications"])
    for r, sd, stem in ((82, 13, "Patient taking digoxin, seeing yellow halos."), (74, 14, "Post-cardiac surgery patient, stable.")):
        T("Accelerated junctional rhythm", E.junctional(r, inv_p=False, seed=sd), stem, "Regular", "Not visible", "Not measurable", NARROW, ["Rate 60–100 from the junction", "Consider digoxin toxicity or ischemia; monitor"])
    for r, sd, stem in ((35, 15, "Unresponsive 82-year-old; weak pulse, BP 70/40."), (28, 16, "Found collapsed; faint femoral pulse.")):
        T("Idioventricular rhythm", E.idio(r, seed=sd), stem, "Regular", "None", "None", WIDE, ["Ventricular escape: never suppress with antiarrhythmics", "Pacing and perfusion support; if pulseless, treat as PEA"])
    for r, sd, stem in ((68, 17, "10 min after reperfusion of a STEMI."), (58, 18, "Post-ROSC, BP 108/66.")):
        T("Accelerated idioventricular rhythm (AIVR)", E.idio(r, seed=sd), stem, "Regular", "None", "None", WIDE, ["Classic reperfusion rhythm, usually transient", "Do not treat with antiarrhythmics if the patient is perfusing"])
    for sd, stem in ((19, "Arrest, 25 min of resuscitation, no ROSC."), (20, "Pulseless; prolonged down-time.")):
        T("Agonal rhythm", E.idio(17, sd, kind="agonal"), stem, "Irregular / very slow", "None", "None", "Very wide, low amplitude", ["Treat as PEA if pulseless", "Often terminal; consider TOR with medical direction"], rate="< 20/min")
    # --- ectopy ---
    for pat, sd, stem in (("NNNVNNN", 21, "62-year-old with palpitations."), ("NNVNNNN", 22, "Smoker, anxious, otherwise well.")):
        T("Sinus rhythm with unifocal PVC", E.with_pvcs(pat, seed=sd), stem, "Regular except one early beat", "Absent before the early wide beat", "0.16 s on sinus beats", "Narrow; the PVC is wide and bizarre", ["Isolated PVCs: treat the patient, not the ectopy", "Check for hypoxia, ischemia, electrolytes"])
    for rr, sd, stem in ((0.82, 23, "74-year-old with chest tightness."), (0.9, 24, "On digoxin and diuretics.")):
        T("Ventricular bigeminy", E.with_pvcs("NV", rr=rr, couple=0.46, seed=sd), stem, "Regularly irregular, every other beat early", "Before sinus beats only", "0.16 s on sinus beats", "Alternating narrow and wide", ["Consider ischemia, electrolytes, digoxin", "12-lead; watch for runs of VT"])
    for rr, sd, stem in ((0.85, 25, "COPD patient with hypokalemia."), (0.78, 26, "Post-MI patient, stable vitals.")):
        T("Ventricular trigeminy", E.with_pvcs("NNV", rr=rr, couple=0.48, seed=sd), stem, "Regularly irregular, every 3rd beat early", "Before sinus beats only", "0.16 s on sinus beats", "Two narrow, then one wide", ["Correct the cause: K⁺, hypoxia, ischemia", "Monitor"])
    for pat, sd, stem in (("NNNVVNN", 27, "55-year-old post-MI, 'skipped beats'."), ("NNVVNNNN", 28, "Cocaine use, chest pain.")):
        T("PVC couplet", E.with_pvcs(pat, seed=sd), stem, "Irregular at the couplet", "Before sinus beats only", "0.16 s on sinus beats", "Two consecutive wide PVCs", ["Irritable ventricle: monitor closely", "12-lead; treat ischemia; pads ready"])
    for pat, sd, stem in (("NNVNNNWN", 29, "Septic patient, SpO₂ 86%."), ("NWNNNVNN", 30, "Hypoxic COPD exacerbation.")):
        T("Multifocal PVCs", E.with_pvcs(pat, rr=0.78, couple=0.46, seed=sd), stem, "Irregular", "Before sinus beats only", "0.16 s on sinus beats", "Narrow; PVCs of different shapes", ["Multifocal means an irritable myocardium", "Fix hypoxia, check electrolytes, 12-lead"])
    # --- arrest rhythms ---
    for amp, sd, stem in ((0.45, 31, "Witnessed collapse at a mall; pulseless."), (0.5, 32, "Marathon runner collapses at the finish.")):
        T("Ventricular fibrillation (coarse)", E.vf(amp, sd), stem, "Chaotic", "None", "None", "No identifiable QRS", ["Shock immediately, resume CPR for 2 min", "Epinephrine after initial shocks fail; then amiodarone or lidocaine"], rate="Not measurable")
    for amp, sd, stem in ((0.14, 33, "Unwitnessed arrest, ~10 min down-time; CPR in progress."), (0.11, 34, "Prolonged arrest, rhythm check at 12 min.")):
        T("Ventricular fibrillation (fine)", E.vf(amp, sd), stem, "Chaotic, low amplitude", "None", "None", "No identifiable QRS", ["Still shockable: defibrillate", "Confirm it isn't asystole by checking leads and gain"], rate="Not measurable")
    for r, sd, stem in ((170, 35, "Pulseless 59-year-old, bystander CPR."), (200, 36, "Pale, diaphoretic, BP 70 systolic, has a pulse."), (150, 37, "Palpitations, BP 124/80, alert, has a pulse.")):
        act = ["Pulseless: defibrillate"] if "Pulseless" in stem else (["Unstable with pulse: synchronized cardioversion 100 J", "Sedate if time allows"] if "70" in stem else ["Stable: 12-lead, amiodarone or procainamide per protocol", "Pads on, expert consult"])
        T("Monomorphic ventricular tachycardia", E.vt(r, sd), stem, "Regular", "Not seen", "None", "Wide, uniform", act)
    for sd, stem in ((38, "On methadone, long QT; collapses."), (39, "Hypomagnesemic alcoholic patient; seizure-like collapse.")):
        T("Polymorphic VT (torsades de pointes)", E.torsades(sd), stem, "Irregular", "None", "None", "Wide, twisting around the baseline", ["Pulseless: defibrillate (unsynchronized)", "Magnesium sulfate 1–2 g IV/IO"], rate="≈ 240/min")
    for sd, stem in ((40, "Patient with a pulse loses consciousness during the strip."), (41, "VT on monitor; patient suddenly unresponsive.")):
        T("VT degenerating into VF", E.vt_to_vf(sd), stem, "Regular, then chaotic", "None", "None", "Wide, then no identifiable QRS", ["Now pulseless and shockable: defibrillate", "Begin the VF/pVT algorithm"], rate="VT ≈ 180/min → VF")
    for sd, stem in ((42, "Found unresponsive, cool to touch; CPR started."), (43, "Rhythm check after 20 min of resuscitation.")):
        T("Asystole", E.asystole(sd), stem, "None", "None", "None", "None", ["Confirm in 2 leads; check leads and gain", "CPR + epinephrine ASAP; consider TOR criteria"], rate="0, no electrical activity")
    for sd, stem in ((44, "Pulseless; monitor shows only small bumps."), (45, "Pulseless after a long down-time.")):
        st = E.p_asystole(sd)
        T("P-wave asystole", st, stem, "P–P regular; no QRS", "Present, no QRS follows", "None", "None", ["Treat as asystole: CPR, epinephrine", "Pacing is not recommended in arrest"], rate=f"Atrial {E.ar(st)}; ventricular 0")
    for r, sd, kind, stem in ((92, 46, "n", "Monitor shows this, but there is NO carotid or femoral pulse."), (130, 47, "nq", "Hard to ventilate, absent breath sounds right; no pulse.")):
        T("Pulseless electrical activity (PEA)", E.sinus(r, pr=0.14, kind=kind, seed=sd), stem, "Regular", "Upright, one before each QRS", "0.14 s", NARROW, ["Organized rhythm + no pulse = PEA", "CPR, epinephrine ASAP, hunt the H's and T's"])
    for sd, stem in ((48, "Recorded while compressions are ongoing."), (49, "Monitor during mechanical-CPR transport.")):
        T("CPR artifact", E.cpr_artifact(sd), stem, "Regular, matches compression rate", "None", "None", "Not cardiac", ["You can't interpret a rhythm during compressions", "Analyze during the planned pause (< 10 s)"], rate="≈ 110/min (compressions)")
    # --- blocks ---
    for r, pr, sd, stem in ((65, 0.28, 50, "72-year-old on diltiazem, routine transport."), (50, 0.30, 51, "Inferior STEMI, alert, BP 118/70."), (78, 0.26, 52, "Athlete, asymptomatic.")):
        T("1st-degree AV block", E.avb1(r, pr, seed=sd), stem, "Regular", "Upright, one before each QRS", f"{pr:.2f} s, constant", NARROW, ["Benign conduction delay: monitor", "Note AV-nodal blocking drugs; watch for progression in MI"])
    for n, pp, sd, stem in ((3, 0.92, 53, "Inferior MI, mildly lightheaded."), (4, 0.84, 54, "Athlete at rest, asymptomatic."), (5, 0.76, 55, "Elderly patient on digoxin."), (4, 0.9, 56, "Inferior STEMI, BP 92/60.")):
        st = E.wenck(n, pp, seed=sd)
        T("2nd-degree AV block type I (Wenckebach)", st, stem, "Regularly irregular, grouped beats", f"Atrial {E.ar(st)}; one per group not conducted", "Lengthens progressively, then a dropped beat", NARROW, ["Usually nodal and often transient", "Atropine if symptomatic"], name=f"2nd-degree AV block type I (Wenckebach), {n}:{n-1}")
    for n, pp, sd, stem in ((3, 0.68, 57, "Anterior MI, BP 84/50, confused."), (4, 0.7, 58, "Syncope at home; now alert."), (3, 0.74, 59, "Exertional dizziness, BP 96/58.")):
        st = E.mobitz2(n, pp, seed=sd)
        T("2nd-degree AV block type II (Mobitz II)", st, stem, "Irregular", f"Atrial {E.ar(st)}; some not conducted", "0.18 s, constant", WIDE, ["High risk of complete block: pads on, prepare to pace", "Atropine unlikely to help; don't delay pacing"], name=f"2nd-degree AV block type II (Mobitz II), {n}:{n-1}")
    for pp, kind, sd, stem in ((0.7, "n", 60, "Weak and dizzy, BP 98/60."), (0.72, "w", 61, "Fatigue and dyspnea, BP 88/52."), (0.66, "n", 62, "Inferior MI, alert.")):
        st = E.block_ratio(2, pp, kind, sd)
        T("2nd-degree AV block, 2:1", st, stem, "Regular", f"Atrial {E.ar(st)}; 2 P waves per QRS", "0.20 s, constant on conducted beats", NARROW if kind == "n" else WIDE, ["The type can't be determined from 2:1 alone", "Narrow QRS points to a nodal block (atropine may help); wide QRS behaves like Mobitz II (pace)"])
    for ratio, pp, sd, stem in ((3, 0.6, 63, "Syncope, HR in the 30s, BP 76/40."), (3, 0.64, 64, "Lightheaded, BP 90/54.")):
        st = E.block_ratio(ratio, pp, "w", sd)
        T("Advanced (high-grade) AV block", st, stem, "Regular", f"Atrial {E.ar(st)}; 3 P waves per QRS", "0.20 s, constant on conducted beats", WIDE, ["Treat like complete heart block", "Transcutaneous pacing; epinephrine or dopamine bridge"], name="Advanced (high-grade) AV block, 3:1")
    for pr_, vr_, kind, sd, q0, stem in ((85, 34, "w", 65, 0.55, "Grey, diaphoretic 78-year-old, BP 70/40."), (80, 45, "n", 66, 0.35, "Inferior MI, alert, BP 104/66."), (100, 30, "w", 67, 0.8, "Found on the floor, GCS 11."), (75, 38, "w", 68, 0.5, "Dyspneic, BP 82/46.")):
        st = E.chb(pr_, vr_, kind, sd, q0=q0)
        T("3rd-degree (complete) AV block", st, stem, "R–R regular; P–P regular; unrelated", f"Atrial {E.ar(st)}; unrelated to QRS", "None, varies (AV dissociation)", NARROW if kind == "n" else WIDE, ["Unstable: transcutaneous pacing", "Infusion bridge: epinephrine 2–10 mcg/min or dopamine 5–20 mcg/kg/min"], name="3rd-degree (complete) AV block, " + ("junctional escape" if kind == "n" else "ventricular escape"))
    # --- paced ---
    for r, sd, stem in ((70, 69, "Pacemaker for sick sinus syndrome."), (80, 70, "Pacemaker patient, routine transfer.")):
        T("Atrial paced rhythm", E.a_paced(r, sd), stem, "Regular", "Each P follows a pacer spike", "0.18 s", NARROW, ["Normal atrial pacing", "Ask for the device card"], spikes="Atrial, before each P")
    for r, sd, stem in ((70, 71, "History of complete heart block; feels well."), (60, 72, "Pacemaker patient with chest pain.")):
        T("Ventricular paced rhythm", E.v_paced(r, sd), stem, "Regular", "Not seen", "None", "Wide, after each spike", ["Normal ventricular pacing", "A paced QRS hides STEMI: rely on symptoms and Sgarbossa"], spikes="Ventricular, before each QRS")
    for r, sd, stem in ((72, 73, "Dual-chamber pacemaker, routine transport."), (64, 74, "Pacemaker patient after a fall.")):
        T("AV sequential (dual-chamber) paced rhythm", E.ddd(r, sd), stem, "Regular", "Paced P after each atrial spike", "AV delay ≈ 0.18 s", "Wide, after the ventricular spike", ["Both chambers paced and captured", "Normal function"], spikes="Two per beat")
    for r, sd, stem in ((88, 75, "Pacemaker patient walking briskly."), (96, 76, "Anxious pacemaker patient.")):
        T("Atrial-sensed, ventricular paced rhythm", E.vdd(r, sd), stem, "Regular", "Native sinus P waves", "≈ 0.16 s (P to V spike)", "Wide, after each ventricular spike", ["The device tracks the sinus rate", "Normal function"], spikes="Ventricular only, after each P")
    for sd, stem in ((77, "Sinus rate slows; the pacemaker takes over."), (78, "Pacemaker patient resting in bed.")):
        T("Demand (VVI) pacing with native beats", E.vvi_demand(sd), stem, "Irregular at the transition", "Present on native beats only", "0.16 s on native beats", "Narrow native, then wide paced", ["Demand pacing fires only when needed", "Normal sensing and capture"], spikes="Only after the pause")
    for pat, sd, stem in (((1, 1, 0, 1, 0, 0, 1, 1), 79, "Pacemaker patient, presyncope, BP 86/50."), ((1, 0, 1, 1, 0, 1, 0, 1), 80, "Pacemaker patient, recent fall onto the chest.")):
        T("Pacemaker failure to capture", E.fail_capture(72, pat, sd), stem, "Irregular (ventricular)", "Not seen", "None", "Wide when captured", ["Malfunction: lead, battery, threshold, hyperkalemia", "TCP if unstable; transport"], spikes="Regular, not all followed by QRS")
    for sd, stem in ((81, "Pacemaker patient with palpitations."), (82, "Pacemaker patient after an MRI scan elsewhere.")):
        T("Pacemaker failure to sense (undersensing)", E.undersense(sd), stem, "Irregular", "Native P waves present", "0.16 s on native beats", "Mostly narrow native; some paced", ["Spikes ignore native beats: risk of R-on-T", "Monitor, transport, pads ready"], spikes="Fixed rate, some on QRS/T")
    for sd, stem in ((83, "Pacemaker patient with a syncopal episode."), (84, "Pacemaker patient using power tools when he fainted.")):
        T("Pacemaker failure to pace (oversensing)", E.oversense(sd), stem, "Irregular, long pause", "None", "None", "Wide paced beats", ["The device sensed noise and withheld pacing", "Pads on; TCP if pauses recur"], spikes="Absent during the pause")
    for r, sd, stem in ((70, 85, "You are pacing a patient in complete heart block."), (80, 86, "Pacing at 80/min, 90 mA.")):
        T("Transcutaneous pacing with capture", E.tcp_capture(r, sd), stem, "Regular", "Obscured by artifact", "None", "Wide, large T after each spike", ["Electrical capture: now check a FEMORAL pulse", "Give analgesia or sedation"], spikes="Large artifacts at the set rate")
    for sd, stem in ((87, "Pacing at 70/min, 40 mA; still hypotensive."), (88, "Pacing just started at 30 mA.")):
        st = E.tcp_nocapture(sd)
        T("Transcutaneous pacing without capture", st, stem, "Pacer spikes regular; escape beats unrelated", f"Atrial {E.ar(st)}", "None", "Wide escape beats only", ["Increase mA until each spike captures", "Check pad position"], rate=f"Ventricular {E.vr(st)}; pacer 70/min", spikes="Large artifacts without QRS")
    for sd, stem in ((89, "Pacemaker patient, unresponsive and pulseless."), (90, "Pacemaker patient found pulseless in bed.")):
        T("Pacer spikes without capture (asystole)", E.fail_capture_asystole(70, sd), stem, "Spikes regular; no QRS", "None", "None", "None", ["This is cardiac arrest: start CPR", "Treat as asystole; pads ≥ 8 cm from the device"], rate="0, spikes only", spikes="Regular, no capture")


def build_extras():
    T("Normal sinus rhythm", E.sinus(64, seed=91), "Post-op check, comfortable.", "Regular", "Upright, one before each QRS", "0.16 s", NARROW, ["Normal rhythm", "Treat the patient's complaint"])
    T("Sinus bradycardia", E.sinus(54, seed=92), "Sleeping 40-year-old, BP 118/72.", "Regular", "Upright, one before each QRS", "0.16 s", NARROW, ["Asymptomatic: no treatment", "Symptomatic: atropine 1 mg IV"])
    T("Sinus tachycardia", E.sinus(110, pr=0.14, kind="nq", seed=93), "Anxious patient with pain from a fracture.", "Regular", "Upright, one before each QRS", "0.14 s", NARROW, ["Treat the cause: pain, anxiety, hypovolemia", "Analgesia, reassess"])
    T("Idioventricular rhythm", E.idio(32, seed=94), "Post-arrest, weak pulse, BP 64/30.", "Regular", "None", "None", WIDE, ["Never suppress a ventricular escape", "Pacing and vasopressor support"])
    T("Sinus rhythm with unifocal PVC", E.with_pvcs("NNNNNVN", seed=95), "Caffeine-heavy shift worker.", "Regular except one early beat", "Absent before the early wide beat", "0.16 s on sinus beats", "Narrow; the PVC is wide and bizarre", ["Treat the patient, not the ectopy", "Reduce stimulants; check electrolytes"])
    T("Ventricular fibrillation (coarse)", E.vf(0.42, 96), "Electrocution at a construction site; pulseless.", "Chaotic", "None", "None", "No identifiable QRS", ["Shock immediately, resume CPR", "Epinephrine after initial shocks; antiarrhythmic"], rate="Not measurable")
    T("Asystole", E.asystole(97), "Elderly patient found at home; rigor absent.", "None", "None", "None", "None", ["Confirm in 2 leads", "CPR + epinephrine ASAP"], rate="0, no electrical activity")
    T("Pulseless electrical activity (PEA)", E.sinus(76, seed=98), "Dialysis patient, no palpable pulse.", "Regular", "Upright, one before each QRS", "0.16 s", NARROW, ["CPR, epinephrine ASAP", "Suspect hyperkalemia: calcium chloride and bicarbonate"])
    T("Ventricular paced rhythm", E.v_paced(80, 99), "Pacemaker patient short of breath.", "Regular", "Not seen", "None", "Wide, after each spike", ["Normal ventricular pacing", "Assess for heart failure"], spikes="Ventricular, before each QRS")
    st = E.chb(70, 40, "n", 100, q0=0.4)
    T("3rd-degree (complete) AV block", st, "Lyme disease patient, fatigue.", "R–R regular; P–P regular; unrelated", f"Atrial {E.ar(st)}; unrelated to QRS", "None, varies (AV dissociation)", NARROW, ["Junctional escape is more stable", "Pads on; pace if unstable"], name="3rd-degree (complete) AV block, junctional escape")


def options_for(cat, rng):
    grp = CAT[cat][0]
    pool = [c for c, v in CAT.items() if v[0] == grp and c != cat] + [c for c in GROUP_EXTRA[grp] if c != cat]
    pool = list(dict.fromkeys(pool))
    opts = rng.sample(pool, 3) + [cat]
    rng.shuffle(opts)
    return opts


# ---------------- megacode ----------------
M = {
 "vf": lambda s: E.vf(0.45, s), "vf_fine": lambda s: E.vf(0.13, s), "vt": lambda s: E.vt(170, s), "vt_fast": lambda s: E.vt(200, s),
 "torsades": lambda s: E.torsades(s), "asystole": lambda s: E.asystole(s), "nsr": lambda s: E.sinus(84, seed=s),
 "stach": lambda s: E.sinus(118, pr=0.14, kind="nq", seed=s), "pea_fast": lambda s: E.sinus(128, pr=0.13, kind="nq", seed=s),
 "brady": lambda s: E.sinus(44, seed=s), "idio": lambda s: E.idio(34, s), "agonal": lambda s: E.idio(16, s, kind="agonal"),
 "chb": lambda s: E.chb(85, 34, "w", s), "chb_n": lambda s: E.chb(80, 44, "n", s, q0=0.35), "mobitz2": lambda s: E.mobitz2(3, 0.68, seed=s),
 "wenck": lambda s: E.wenck(4, 0.86, seed=s), "avb1": lambda s: E.avb1(72, 0.26, seed=s), "tcp_no": lambda s: E.tcp_nocapture(s),
 "tcp_cap": lambda s: E.tcp_capture(80, s), "ftc": lambda s: E.fail_capture(72, (1, 0, 0, 1, 0, 1, 0, 0), s), "ftc_asys": lambda s: E.fail_capture_asystole(70, s),
 "vpaced": lambda s: E.v_paced(70, s), "aivr": lambda s: E.idio(66, s), "cpr": lambda s: E.cpr_artifact(s), "vt_vf": lambda s: E.vt_to_vf(s),
 "pvcs": lambda s: E.with_pvcs("NNNVNNN", seed=s),
}
LABEL = {"vf": "Coarse VF", "vf_fine": "Fine VF", "vt": "Monomorphic VT", "vt_fast": "Monomorphic VT", "torsades": "Torsades de pointes", "asystole": "Asystole",
 "nsr": "Sinus rhythm", "stach": "Sinus tachycardia", "pea_fast": "Sinus tachycardia (organized rhythm)", "brady": "Sinus bradycardia", "idio": "Idioventricular rhythm",
 "agonal": "Agonal rhythm", "chb": "3rd-degree AV block, wide escape", "chb_n": "3rd-degree AV block, junctional escape", "mobitz2": "2nd-degree AV block type II",
 "wenck": "2nd-degree AV block type I (Wenckebach)", "avb1": "Sinus rhythm with 1st-degree AV block", "tcp_no": "TCP without capture", "tcp_cap": "TCP with electrical capture",
 "ftc": "Pacemaker failure to capture", "ftc_asys": "Pacer spikes, no capture (asystole)", "vpaced": "Ventricular paced rhythm", "aivr": "AIVR", "cpr": "CPR artifact",
 "vt_vf": "VT degenerating into VF", "pvcs": "Sinus rhythm with a PVC"}

from megacode_cases import CASES  # noqa: E402


def build():
    build_items()
    build_extras()
    assert len(ITEMS) == 100, len(ITEMS)
    rng = random.Random(2026)
    order = list(range(100)); rng.shuffle(order)
    practice = []
    for n, i in enumerate(order, 1):
        it = ITEMS[i]
        key = add_strip(f"p{n}", it["st"])
        practice.append({"n": n, "strip": key, "cat": it["cat"], "name": it["name"], "stem": it["stem"], "rows": it["rows"], "action": it["action"], "options": options_for(it["cat"], rng)})
    cases = []
    seed = 500
    for ci, c in enumerate(CASES, 1):
        stages = []
        for st in c["stages"]:
            seed += 1
            sobj = M[st["strip"]](seed)
            key = add_strip(f"m{ci}_{len(stages)}", sobj)
            r, reg = E.rate(sobj.q)
            hr = None if (r is None or st["strip"] in ("cpr", "vf", "vf_fine", "asystole", "ftc_asys", "agonal")) else r
            stages.append({"strip": key, "rhythm": LABEL[st["strip"]], "vitals": st["vitals"], "hr": hr, "prompt": st["prompt"],
                           "options": [{"t": o[0], "ok": o[1], "why": o[2]} for o in st["options"]]})
        cases.append({"n": ci, "title": c["title"], "scenario": c["scenario"], "focus": c["focus"], "stages": stages})
    cats = {k: {"group": v[0], "key": v[1], "clue": v[2]} for k, v in CAT.items()}
    data = {"practice": practice, "cases": cases, "cats": cats, "strips": STRIPS}
    s = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    open(os.path.join(HERE, "trainer_data.js"), "w").write("window.TRAINER=" + s + ";")
    print("practice", len(practice), "cases", len(cases), "questions", sum(len(c["stages"]) for c in cases), "bytes", len(s))


if __name__ == "__main__":
    build()
