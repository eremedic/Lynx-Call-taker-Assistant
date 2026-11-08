/*
 * CSHealthED Pharmacology Trainer — paramedic drug database.
 * Typical adult/pediatric doses reflect AHA guidelines and common EMS
 * formularies. Protocols vary: learners must follow local protocols and
 * medical direction. Labels are simulated (generic, no manufacturer).
 *
 * label: type (vial | ampule | prefilled | bag | neb | tablets | tube | nasal),
 *        amt/amtUnit + vol (mL) = contents, conc text, route, color, cap color
 */
(function (global) {
  'use strict';

  var CATS = {
    arrest: { name: 'Cardiac arrest & dysrhythmias', color: '#e0262b' },
    acs: { name: 'Acute coronary syndrome', color: '#c2185b' },
    resp: { name: 'Respiratory', color: '#1e88e5' },
    allergy: { name: 'Allergy & anaphylaxis', color: '#f08a1c' },
    pain: { name: 'Analgesia & sedation', color: '#7b4bc4' },
    endo: { name: 'Endocrine & metabolic', color: '#3a9b3f' },
    tox: { name: 'Toxicology & antidotes', color: '#16838f' },
    neuro: { name: 'Seizures & neuro', color: '#5e35b1' },
    lytes: { name: 'Electrolytes & acid–base', color: '#00897b' },
    pressor: { name: 'Vasopressors & shock', color: '#d84315' },
    rsi: { name: 'Airway / RSI', color: '#455a64' },
    trauma: { name: 'Trauma & hemorrhage', color: '#8d6e63' },
    gi: { name: 'Antiemetics', color: '#558b2f' }
  };

  var DRUGS = [
    {
      id: 'adenosine', name: 'Adenosine', trade: 'Adenocard', cat: ['arrest'],
      cls: 'Antiarrhythmic (endogenous purine nucleoside)',
      action: 'Briefly slows conduction through the AV node, interrupting AV-nodal re-entry circuits.',
      ind: ['Stable, regular, narrow-complex tachycardia (SVT) after vagal maneuvers fail', 'Regular, monomorphic wide-complex tachycardia (diagnostic/therapeutic, per protocol)'],
      contra: ['2nd- or 3rd-degree AV block or sick sinus syndrome without a pacemaker', 'Poison- or drug-induced tachycardia', 'Irregular wide-complex tachycardia (e.g., A-fib with WPW)', 'Caution: asthma / reactive airway disease'],
      se: ['Transient asystole or pause (seconds)', 'Flushing, chest pressure, dyspnea', 'Sense of impending doom', 'Bronchospasm'],
      adult: '6 mg rapid IV push followed by a 20 mL saline flush; if no conversion in 1–2 min, 12 mg rapid IV push',
      peds: '0.1 mg/kg rapid IV/IO (max 6 mg); second dose 0.2 mg/kg (max 12 mg)',
      supplied: '3 mg/mL — 6 mg/2 mL and 12 mg/4 mL vials',
      pearls: ['Use the most proximal (antecubital) IV and a two-syringe or stopcock rapid-flush technique — half-life is under 10 seconds.', 'Warn the patient about the brief “impending doom” sensation. Record a strip during the push.'],
      label: { type: 'vial', amt: 6, amtUnit: 'mg', vol: 2, conc: 3, concUnit: 'mg/mL', route: 'For rapid IV bolus only', color: '#0e7490', cap: '#9ca3af' }
    },
    {
      id: 'amiodarone', name: 'Amiodarone', trade: 'Nexterone', cat: ['arrest'],
      cls: 'Antiarrhythmic (class III, potassium-channel blocker)',
      action: 'Prolongs the action potential and refractory period; also has sodium-, calcium-channel and beta-blocking effects.',
      ind: ['Shock-refractory VF / pulseless VT', 'Stable monomorphic VT', 'Rate/rhythm control of some atrial dysrhythmias (per protocol)'],
      contra: ['Cardiogenic shock', 'Marked sinus bradycardia or 2nd/3rd-degree AV block without pacemaker', 'Known hypersensitivity (including iodine)'],
      se: ['Hypotension', 'Bradycardia', 'QT prolongation', 'Phlebitis'],
      adult: 'Cardiac arrest: 300 mg IV/IO push, second dose 150 mg. Stable VT: 150 mg IV over 10 min, may repeat',
      peds: 'Cardiac arrest: 5 mg/kg IV/IO (max 300 mg), may repeat up to 3 total doses',
      supplied: '50 mg/mL — 150 mg/3 mL vials',
      pearls: ['For the stable-VT infusion, mix 150 mg in 100 mL and run over 10 minutes.', 'Hypotension is more common with rapid administration.'],
      label: { type: 'vial', amt: 150, amtUnit: 'mg', vol: 3, conc: 50, concUnit: 'mg/mL', route: 'For IV use. Dilute for infusion', color: '#1d4ed8', cap: '#2563eb' }
    },
    {
      id: 'lidocaine', name: 'Lidocaine', trade: 'Xylocaine', cat: ['arrest'],
      cls: 'Antiarrhythmic (class IB, sodium-channel blocker)',
      action: 'Blocks fast sodium channels, decreasing ventricular automaticity and raising the fibrillation threshold.',
      ind: ['VF / pulseless VT (alternative to amiodarone)', 'Stable monomorphic VT'],
      contra: ['High-grade AV block without pacemaker', 'Idioventricular / ventricular escape rhythms', 'Known hypersensitivity to amide anesthetics'],
      se: ['CNS toxicity: drowsiness, tinnitus, paresthesias, seizures', 'Bradycardia, hypotension'],
      adult: 'Cardiac arrest: 1–1.5 mg/kg IV/IO, then 0.5–0.75 mg/kg every 5–10 min (max 3 mg/kg)',
      peds: 'Cardiac arrest: 1 mg/kg IV/IO',
      supplied: '2% (20 mg/mL) — 100 mg/5 mL prefilled syringe',
      pearls: ['2% means 2 g per 100 mL = 20 mg/mL.', 'Reduce maintenance dosing in the elderly and in hepatic failure.'],
      label: { type: 'prefilled', amt: 100, amtUnit: 'mg', vol: 5, conc: 20, concUnit: 'mg/mL', pct: '2%', route: 'For IV use', color: '#6d28d9', cap: '#7c3aed' }
    },
    {
      id: 'atropine', name: 'Atropine sulfate', trade: '—', cat: ['arrest', 'tox'],
      cls: 'Anticholinergic (parasympatholytic / muscarinic antagonist)',
      action: 'Blocks acetylcholine at muscarinic receptors, increasing SA-node firing and AV conduction and drying secretions.',
      ind: ['Symptomatic bradycardia', 'Organophosphate / nerve-agent (cholinergic) poisoning', 'Vagally mediated bradycardia during airway procedures (peds)'],
      contra: ['None in emergencies; caution in acute MI', 'Likely ineffective in Mobitz II, 3rd-degree block with wide QRS, and heart transplant patients'],
      se: ['Tachycardia, palpitations', 'Dry mouth, flushed hot skin, blurred vision, dilated pupils', 'Urinary retention, confusion'],
      adult: 'Bradycardia: 1 mg IV every 3–5 min (max 3 mg). Organophosphates: 2–4 mg IV/IM, doubled every 5 min until secretions dry',
      peds: '0.02 mg/kg IV/IO (minimum 0.1 mg, maximum single dose 0.5 mg)',
      supplied: '0.1 mg/mL — 1 mg/10 mL prefilled syringe; 0.4 mg/mL vials',
      pearls: ['Doses under 0.5 mg were historically linked to paradoxical bradycardia — follow current protocol minimums.', 'For organophosphates the endpoint is drying of bronchial secretions, not heart rate or pupil size.'],
      label: { type: 'prefilled', amt: 1, amtUnit: 'mg', vol: 10, conc: 0.1, concUnit: 'mg/mL', route: 'For IV use', color: '#047857', cap: '#10b981' }
    },
    {
      id: 'epi-arrest', name: 'Epinephrine 0.1 mg/mL', trade: '(formerly 1:10,000)', cat: ['arrest', 'pressor'],
      cls: 'Sympathomimetic (alpha- and beta-adrenergic agonist)',
      action: 'Alpha-1 vasoconstriction raises aortic diastolic and coronary perfusion pressure; beta-1 increases rate and contractility.',
      ind: ['Cardiac arrest (all rhythms)', 'Push-dose pressor for hypotension (diluted, per protocol)', 'Symptomatic bradycardia unresponsive to atropine (infusion)'],
      contra: ['None in cardiac arrest'],
      se: ['Tachycardia, dysrhythmias', 'Hypertension', 'Increased myocardial oxygen demand'],
      adult: 'Cardiac arrest: 1 mg IV/IO every 3–5 min. Push-dose: 10–20 mcg IV every 2–5 min',
      peds: 'Cardiac arrest: 0.01 mg/kg (0.1 mL/kg) IV/IO every 3–5 min (max 1 mg)',
      supplied: '0.1 mg/mL — 1 mg/10 mL prefilled syringe',
      pearls: ['To make push-dose epi (10 mcg/mL): waste 1 mL from a 10 mL saline flush and add 1 mL of 0.1 mg/mL epinephrine.', 'Never give the 1 mg/mL concentration IV push.'],
      label: { type: 'prefilled', amt: 1, amtUnit: 'mg', vol: 10, conc: 0.1, concUnit: 'mg/mL', route: 'For IV / IO use', color: '#b91c1c', cap: '#ef4444' }
    },
    {
      id: 'epi-im', name: 'Epinephrine 1 mg/mL', trade: '(formerly 1:1,000)', cat: ['allergy', 'resp'],
      cls: 'Sympathomimetic (alpha- and beta-adrenergic agonist)',
      action: 'Alpha effects reverse vasodilation and edema; beta-2 effects bronchodilate and stabilize mast cells.',
      ind: ['Anaphylaxis', 'Severe asthma / bronchospasm unresponsive to nebulized therapy (per protocol)'],
      contra: ['None in anaphylaxis', 'Not for IV push in this concentration'],
      se: ['Tachycardia, palpitations', 'Anxiety, tremor', 'Hypertension, chest pain'],
      adult: 'Anaphylaxis: 0.3–0.5 mg IM (anterolateral thigh), repeat every 5–15 min as needed',
      peds: '0.01 mg/kg IM (max 0.3 mg in children; 0.5 mg adolescents)',
      supplied: '1 mg/mL — 1 mL ampule/vial; 30 mL multi-dose vial; auto-injectors 0.15 / 0.3 mg',
      pearls: ['IM into the anterolateral thigh gives faster, higher peak levels than subcutaneous or deltoid.', 'Check the concentration twice — 1 mg/mL is 10× stronger than the arrest syringe.'],
      label: { type: 'ampule', amt: 1, amtUnit: 'mg', vol: 1, conc: 1, concUnit: 'mg/mL', route: 'For IM or SC use', color: '#b45309', cap: '#f59e0b' }
    },
    {
      id: 'naloxone', name: 'Naloxone', trade: 'Narcan', cat: ['tox'],
      cls: 'Opioid antagonist',
      action: 'Competitively displaces opioids from mu receptors, reversing respiratory and CNS depression.',
      ind: ['Opioid overdose with respiratory depression'],
      contra: ['Known hypersensitivity', 'Caution: opioid dependence (acute withdrawal), neonates of opioid-dependent mothers'],
      se: ['Acute opioid withdrawal: agitation, vomiting, diaphoresis, tachycardia', 'Pulmonary edema (rare)', 'Re-sedation when naloxone wears off (30–90 min)'],
      adult: '0.4–2 mg IV/IM/IO, titrated to adequate breathing; intranasal 2–4 mg; repeat every 2–3 min as needed',
      peds: '0.1 mg/kg IV/IM/IO/IN (max 2 mg)',
      supplied: '0.4 mg/mL vials; 2 mg/2 mL prefilled syringe; 4 mg nasal spray',
      pearls: ['Ventilate first — the goal is adequate respirations, not full alertness.', 'Duration may be shorter than the opioid: monitor for re-sedation.'],
      label: { type: 'vial', amt: 0.4, amtUnit: 'mg', vol: 1, conc: 0.4, concUnit: 'mg/mL', route: 'For IV, IM or SC use', color: '#0369a1', cap: '#38bdf8' }
    },
    {
      id: 'd50', name: 'Dextrose 50%', trade: 'D50W', cat: ['endo'],
      cls: 'Carbohydrate (hypertonic glucose solution)',
      action: 'Directly raises blood glucose.',
      ind: ['Hypoglycemia with altered mental status when the patient cannot safely take oral glucose'],
      contra: ['Hyperglycemia', 'Caution: hypertonic — extravasation causes tissue necrosis; use a patent, large vein'],
      se: ['Tissue necrosis with extravasation', 'Phlebitis', 'Hyperglycemia'],
      adult: '25 g (50 mL) IV; recheck glucose and repeat as needed',
      peds: 'Use D10 (D25 in some protocols): 0.5 g/kg',
      supplied: '50% = 0.5 g/mL — 25 g/50 mL prefilled syringe',
      pearls: ['50% = 50 g per 100 mL = 0.5 g/mL.', 'Many systems now prefer D10 for adults (fewer complications, easier titration).'],
      label: { type: 'prefilled', amt: 25, amtUnit: 'g', vol: 50, conc: 0.5, concUnit: 'g/mL', pct: '50%', route: 'For slow IV use', color: '#1e3a8a', cap: '#93c5fd' }
    },
    {
      id: 'd10', name: 'Dextrose 10%', trade: 'D10W', cat: ['endo'],
      cls: 'Carbohydrate (glucose solution)',
      action: 'Directly raises blood glucose.',
      ind: ['Hypoglycemia (adult and pediatric)'],
      contra: ['Hyperglycemia'],
      se: ['Hyperglycemia', 'Fluid overload (large volumes)'],
      adult: '10–25 g (100–250 mL) IV, titrated to mental status and glucose',
      peds: '0.5 g/kg = 5 mL/kg of D10 IV/IO',
      supplied: '10% = 0.1 g/mL — 25 g/250 mL bag',
      pearls: ['10% = 10 g per 100 mL = 0.1 g/mL.', 'Run wide open or by small boluses (e.g., 100 mL) and recheck glucose.'],
      label: { type: 'bag', amt: 25, amtUnit: 'g', vol: 250, conc: 0.1, concUnit: 'g/mL', pct: '10%', route: 'For IV infusion', color: '#1d4ed8', cap: '#1d4ed8' }
    },
    {
      id: 'glucagon', name: 'Glucagon', trade: 'GlucaGen', cat: ['endo', 'tox'],
      cls: 'Pancreatic hormone (antihypoglycemic)',
      action: 'Stimulates hepatic glycogenolysis and gluconeogenesis; positive inotrope/chronotrope independent of beta receptors.',
      ind: ['Hypoglycemia when IV access is not available', 'Beta-blocker overdose (higher doses, per protocol)'],
      contra: ['Pheochromocytoma', 'Insulinoma'],
      se: ['Nausea and vomiting', 'Hyperglycemia', 'Tachycardia'],
      adult: '1 mg IM/IV/SC (intranasal powder 3 mg)',
      peds: 'Under 25 kg (or under 6 years): 0.5 mg IM; 25 kg and over: 1 mg',
      supplied: 'Kit: 1 mg powder + 1 mL diluent — reconstitutes to 1 mg/mL',
      pearls: ['Needs liver glycogen — less effective in malnourished or alcoholic patients.', 'Place in recovery position: vomiting is common.'],
      label: { type: 'vial', amt: 1, amtUnit: 'mg', vol: 1, conc: 1, concUnit: 'mg/mL', route: 'Reconstitute with 1 mL diluent', color: '#ea580c', cap: '#fb923c', recon: true }
    },
    {
      id: 'ntg', name: 'Nitroglycerin', trade: 'Nitrostat', cat: ['acs'],
      cls: 'Vasodilator (nitrate)',
      action: 'Relaxes vascular smooth muscle (venous more than arterial), decreasing preload and myocardial oxygen demand; dilates coronary arteries.',
      ind: ['Ischemic chest pain / ACS', 'Acute pulmonary edema with hypertension (per protocol)'],
      contra: ['SBP below 90 mmHg (or more than 30 mmHg below baseline)', 'PDE-5 inhibitor use: sildenafil/vardenafil within 24 h, tadalafil within 48 h', 'Suspected right-ventricular infarction', 'HR under 50 or over 100 (AHA)'],
      se: ['Headache', 'Hypotension, reflex tachycardia', 'Flushing, dizziness'],
      adult: '0.4 mg SL (tablet or spray) every 5 min, maximum 3 doses, if BP allows',
      peds: 'Not routinely used in pediatric EMS',
      supplied: '0.4 mg SL tablets (25-count bottle); 0.4 mg/metered-dose spray',
      pearls: ['Get a 12-lead first: inferior STEMI → check right-sided leads before nitrates.', 'Have the patient sit or lie down; recheck BP before each dose.'],
      label: { type: 'tablets', amt: 0.4, amtUnit: 'mg', count: 25, route: 'Sublingual tablets', color: '#7c2d12', cap: '#fbbf24' }
    },
    {
      id: 'aspirin', name: 'Aspirin', trade: 'ASA', cat: ['acs'],
      cls: 'Antiplatelet (NSAID / salicylate)',
      action: 'Irreversibly inhibits cyclooxygenase, blocking thromboxane A2 and platelet aggregation.',
      ind: ['Suspected acute coronary syndrome'],
      contra: ['Allergy to aspirin or NSAIDs', 'Active GI bleeding', 'Pediatric viral illness (Reye syndrome)'],
      se: ['GI upset, heartburn', 'Bleeding', 'Bronchospasm in sensitive asthmatics'],
      adult: '162–325 mg chewed (commonly 4 × 81 mg = 324 mg)',
      peds: 'Not indicated in pediatric EMS',
      supplied: '81 mg chewable tablets',
      pearls: ['Chewing speeds absorption; use non–enteric-coated tablets.'],
      label: { type: 'tablets', amt: 81, amtUnit: 'mg', count: 36, route: 'Chewable tablets', color: '#be123c', cap: '#f9fafb' }
    },
    {
      id: 'albuterol', name: 'Albuterol', trade: 'Ventolin / Proventil', cat: ['resp', 'allergy', 'lytes'],
      cls: 'Bronchodilator (selective beta-2 agonist)',
      action: 'Relaxes bronchial smooth muscle; also shifts potassium into cells.',
      ind: ['Bronchospasm (asthma, COPD, anaphylaxis)', 'Hyperkalemia (adjunct, per protocol)'],
      contra: ['Known hypersensitivity', 'Caution: tachydysrhythmias, cardiac disease'],
      se: ['Tachycardia, palpitations', 'Tremor, anxiety', 'Hypokalemia'],
      adult: '2.5 mg nebulized (with oxygen 6–8 L/min); repeat or run continuously per protocol',
      peds: '2.5 mg nebulized (1.25 mg in some protocols for small children)',
      supplied: '2.5 mg/3 mL (0.083%) unit-dose nebulizer vials',
      pearls: ['Often combined with ipratropium for the first doses.'],
      label: { type: 'neb', amt: 2.5, amtUnit: 'mg', vol: 3, conc: 0.83, concUnit: 'mg/mL', pct: '0.083%', route: 'For oral inhalation only', color: '#2563eb', cap: '#2563eb' }
    },
    {
      id: 'ipratropium', name: 'Ipratropium bromide', trade: 'Atrovent', cat: ['resp'],
      cls: 'Bronchodilator (anticholinergic)',
      action: 'Blocks muscarinic receptors in bronchial smooth muscle, reducing bronchoconstriction and secretions.',
      ind: ['Bronchospasm in asthma and COPD (with albuterol)'],
      contra: ['Allergy to atropine-like drugs, soy or peanut (some formulations)'],
      se: ['Dry mouth', 'Palpitations', 'Blurred vision (if mist reaches the eyes)'],
      adult: '0.5 mg nebulized (usually with albuterol), may repeat per protocol',
      peds: '0.25–0.5 mg nebulized',
      supplied: '0.5 mg/2.5 mL (0.02%) unit-dose nebulizer vials',
      pearls: ['Combined albuterol 3 mg + ipratropium 0.5 mg in 3 mL is a common premix.'],
      label: { type: 'neb', amt: 0.5, amtUnit: 'mg', vol: 2.5, conc: 0.2, concUnit: 'mg/mL', pct: '0.02%', route: 'For oral inhalation only', color: '#059669', cap: '#059669' }
    },
    {
      id: 'diphenhydramine', name: 'Diphenhydramine', trade: 'Benadryl', cat: ['allergy'],
      cls: 'Antihistamine (H1 receptor blocker)',
      action: 'Blocks histamine at H1 receptors, reducing itching, urticaria and vascular permeability.',
      ind: ['Allergic reactions and anaphylaxis (adjunct to epinephrine)', 'Dystonic reactions'],
      contra: ['Known hypersensitivity', 'Caution: asthma attack, narrow-angle glaucoma, neonates'],
      se: ['Sedation', 'Dry mouth, urinary retention', 'Paradoxical excitation in children', 'Hypotension'],
      adult: '25–50 mg IV/IM',
      peds: '1 mg/kg IV/IM (max 50 mg)',
      supplied: '50 mg/mL — 1 mL vial',
      pearls: ['Never a substitute for epinephrine in anaphylaxis.'],
      label: { type: 'vial', amt: 50, amtUnit: 'mg', vol: 1, conc: 50, concUnit: 'mg/mL', route: 'For IV or IM use', color: '#be185d', cap: '#ec4899' }
    },
    {
      id: 'ondansetron', name: 'Ondansetron', trade: 'Zofran', cat: ['gi'],
      cls: 'Antiemetic (serotonin 5-HT3 receptor antagonist)',
      action: 'Blocks serotonin receptors in the chemoreceptor trigger zone and vagal afferents.',
      ind: ['Nausea and vomiting'],
      contra: ['Known hypersensitivity', 'Congenital long QT syndrome', 'Use with apomorphine'],
      se: ['Headache', 'QT prolongation', 'Constipation, dizziness'],
      adult: '4 mg IV/IM/ODT, may repeat once per protocol',
      peds: '0.1–0.15 mg/kg IV (max 4 mg)',
      supplied: '2 mg/mL — 4 mg/2 mL vials; 4 mg orally disintegrating tablets',
      pearls: ['Give IV doses slowly over at least 30 seconds.'],
      label: { type: 'vial', amt: 4, amtUnit: 'mg', vol: 2, conc: 2, concUnit: 'mg/mL', route: 'For IV or IM use', color: '#4d7c0f', cap: '#84cc16' }
    },
    {
      id: 'midazolam', name: 'Midazolam', trade: 'Versed', cat: ['neuro', 'pain', 'rsi'], schedule: 'CIV',
      cls: 'Benzodiazepine (sedative-hypnotic, anticonvulsant)',
      action: 'Enhances GABA-A receptor activity, producing sedation, amnesia, anxiolysis and seizure control.',
      ind: ['Status epilepticus / active seizures', 'Sedation (agitation, post-intubation, cardioversion, pacing)'],
      contra: ['Known hypersensitivity', 'Caution: hypotension, respiratory depression, alcohol/CNS depressant use'],
      se: ['Respiratory depression / apnea', 'Hypotension', 'Paradoxical agitation'],
      adult: 'Seizures: 10 mg IM (over 40 kg) or 5 mg IM (13–40 kg); IV 2.5–5 mg titrated. Sedation: 1–2.5 mg IV titrated',
      peds: 'Seizures: 0.2 mg/kg IN/IM (max 10 mg) or 0.1 mg/kg IV (max 5 mg)',
      supplied: '5 mg/mL — 10 mg/2 mL vials; 1 mg/mL vials',
      pearls: ['Two common concentrations (1 mg/mL and 5 mg/mL) — read the label every time.', 'Have BVM and suction ready; reversal agent flumazenil is rarely used prehospital.'],
      label: { type: 'vial', amt: 10, amtUnit: 'mg', vol: 2, conc: 5, concUnit: 'mg/mL', route: 'For IV or IM use', color: '#7e22ce', cap: '#a855f7' }
    },
    {
      id: 'fentanyl', name: 'Fentanyl citrate', trade: 'Sublimaze', cat: ['pain', 'rsi'], schedule: 'CII',
      cls: 'Opioid analgesic (synthetic mu agonist)',
      action: 'Binds mu-opioid receptors, decreasing pain perception; ~100× the potency of morphine with less histamine release.',
      ind: ['Moderate to severe pain', 'Post-intubation analgesia'],
      contra: ['Known hypersensitivity', 'Caution: hypotension, respiratory depression, head injury with altered mental status'],
      se: ['Respiratory depression', 'Hypotension (less than morphine)', 'Chest-wall rigidity with rapid large doses', 'Nausea'],
      adult: '1 mcg/kg IV/IM/IN (commonly 25–100 mcg), repeat every 5–10 min per protocol',
      peds: '1 mcg/kg IV (max 50–100 mcg); 1.5 mcg/kg intranasal',
      supplied: '50 mcg/mL — 100 mcg/2 mL vials',
      pearls: ['Dose is in micrograms (mcg), not milligrams.', 'Intranasal use: maximum about 1 mL per nostril.'],
      label: { type: 'vial', amt: 100, amtUnit: 'mcg', vol: 2, conc: 50, concUnit: 'mcg/mL', route: 'For IV or IM use', color: '#9f1239', cap: '#e11d48' }
    },
    {
      id: 'morphine', name: 'Morphine sulfate', trade: '—', cat: ['pain'], schedule: 'CII',
      cls: 'Opioid analgesic (mu agonist)',
      action: 'Binds mu-opioid receptors, decreasing pain perception; venodilation reduces preload.',
      ind: ['Moderate to severe pain'],
      contra: ['Hypotension', 'Respiratory depression', 'Known hypersensitivity', 'Caution: head injury, acute abdomen (per protocol)'],
      se: ['Respiratory depression', 'Hypotension (histamine release)', 'Nausea and vomiting', 'Pruritus'],
      adult: '0.1 mg/kg IV (commonly 2–4 mg increments) titrated to pain, per protocol maximum',
      peds: '0.1 mg/kg IV/IM (max 5 mg per dose)',
      supplied: '4 mg/mL or 10 mg/mL — 1 mL vials/cartridges',
      pearls: ['Histamine release can cause hypotension and itching.'],
      label: { type: 'vial', amt: 4, amtUnit: 'mg', vol: 1, conc: 4, concUnit: 'mg/mL', route: 'For IV or IM use', color: '#991b1b', cap: '#dc2626' }
    },
    {
      id: 'ketamine', name: 'Ketamine', trade: 'Ketalar', cat: ['pain', 'rsi'], schedule: 'CIII',
      cls: 'Dissociative anesthetic (NMDA receptor antagonist)',
      action: 'Blocks NMDA receptors, producing dissociation, analgesia and amnesia while preserving airway reflexes and respiratory drive.',
      ind: ['Analgesia (low dose)', 'Severe agitation requiring chemical sedation (per protocol)', 'Induction for RSI'],
      contra: ['Age under 3 months', 'Known or suspected schizophrenia (relative)', 'Caution: uncontrolled hypertension, ACS'],
      se: ['Emergence reactions (hallucinations)', 'Hypertension, tachycardia', 'Hypersalivation', 'Laryngospasm (rare)'],
      adult: 'Analgesia: 0.1–0.3 mg/kg slow IV. Agitation: 2–4 mg/kg IM per protocol. RSI induction: 1–2 mg/kg IV',
      peds: 'Analgesia: 0.1–0.3 mg/kg IV or 1 mg/kg IN. Induction: 1–2 mg/kg IV',
      supplied: '50 mg/mL (500 mg/10 mL) and 100 mg/mL vials',
      pearls: ['Several concentrations exist (10, 50, 100 mg/mL) — dosing errors are common.', 'Give analgesic doses slowly over 1–2 min (or dilute in 100 mL) to limit dysphoria.'],
      label: { type: 'vial', amt: 500, amtUnit: 'mg', vol: 10, conc: 50, concUnit: 'mg/mL', route: 'For IV or IM use. Multi-dose vial', color: '#1f2937', cap: '#6b7280' }
    },
    {
      id: 'diltiazem', name: 'Diltiazem', trade: 'Cardizem', cat: ['arrest'],
      cls: 'Calcium-channel blocker (class IV antiarrhythmic)',
      action: 'Slows AV-node conduction and relaxes vascular smooth muscle, controlling ventricular rate.',
      ind: ['Rate control in atrial fibrillation / flutter with RVR', 'SVT not converted by adenosine'],
      contra: ['Hypotension or cardiogenic shock', 'Heart failure with reduced EF', 'A-fib/flutter with WPW', 'Wide-complex tachycardia of unknown origin', '2nd/3rd-degree AV block, sick sinus'],
      se: ['Hypotension', 'Bradycardia, AV block', 'Flushing, headache'],
      adult: '0.25 mg/kg IV over 2 min (commonly 15–20 mg); after 15 min may give 0.35 mg/kg',
      peds: 'Not routinely used in pediatric EMS',
      supplied: '5 mg/mL — 25 mg/5 mL vials (refrigerate)',
      pearls: ['Calcium chloride can reverse diltiazem-induced hypotension.'],
      label: { type: 'vial', amt: 25, amtUnit: 'mg', vol: 5, conc: 5, concUnit: 'mg/mL', route: 'For IV use. Refrigerate', color: '#0f766e', cap: '#14b8a6' }
    },
    {
      id: 'magnesium', name: 'Magnesium sulfate 50%', trade: '—', cat: ['arrest', 'resp', 'neuro', 'lytes'],
      cls: 'Electrolyte / anticonvulsant',
      action: 'Calcium antagonist that stabilizes cell membranes, relaxes smooth muscle and suppresses early afterdepolarizations.',
      ind: ['Torsades de pointes', 'Eclampsia (seizures in pregnancy)', 'Severe asthma unresponsive to first-line therapy', 'Hypomagnesemia'],
      contra: ['Heart block', 'Renal failure (caution)', 'Hypermagnesemia'],
      se: ['Hypotension, flushing', 'Respiratory depression and loss of reflexes (toxicity)', 'Bradycardia'],
      adult: 'Torsades: 1–2 g IV (push if pulseless; over 15 min with a pulse). Eclampsia: 4–6 g IV over 15–20 min. Asthma: 2 g IV over 20 min',
      peds: 'Asthma: 25–50 mg/kg IV over 15–20 min (max 2 g). Torsades: 25–50 mg/kg (max 2 g)',
      supplied: '50% (500 mg/mL) — 1 g/2 mL and 5 g/10 mL vials',
      pearls: ['50% = 50 g per 100 mL = 500 mg/mL.', 'Antidote for magnesium toxicity: calcium chloride or gluconate.'],
      label: { type: 'vial', amt: 1, amtUnit: 'g', vol: 2, conc: 0.5, concUnit: 'g/mL', concLabel: '500 mg/mL', pct: '50%', route: 'For IV or IM use. Dilute for IV', color: '#0891b2', cap: '#67e8f9' }
    },
    {
      id: 'bicarb', name: 'Sodium bicarbonate 8.4%', trade: '—', cat: ['tox', 'lytes'],
      cls: 'Alkalinizing agent (buffer)',
      action: 'Buffers hydrogen ions, raising pH; the sodium load narrows QRS in sodium-channel blocker toxicity.',
      ind: ['Tricyclic antidepressant (sodium-channel blocker) overdose with wide QRS', 'Hyperkalemia', 'Prolonged arrest with known metabolic acidosis'],
      contra: ['Metabolic or respiratory alkalosis', 'Hypocalcemia, hypokalemia (caution)'],
      se: ['Metabolic alkalosis', 'Hypernatremia, fluid overload', 'Tissue necrosis with extravasation'],
      adult: '1 mEq/kg IV/IO (commonly 50 mEq), repeat per protocol',
      peds: '1 mEq/kg IV/IO; use 4.2% (0.5 mEq/mL) in neonates and infants',
      supplied: '8.4% = 1 mEq/mL — 50 mEq/50 mL prefilled syringe',
      pearls: ['Flush the line before and after: it precipitates with calcium and inactivates catecholamines.'],
      label: { type: 'prefilled', amt: 50, amtUnit: 'mEq', vol: 50, conc: 1, concUnit: 'mEq/mL', pct: '8.4%', route: 'For IV use', color: '#475569', cap: '#cbd5e1' }
    },
    {
      id: 'cacl', name: 'Calcium chloride 10%', trade: '—', cat: ['lytes', 'tox'],
      cls: 'Electrolyte',
      action: 'Restores ionized calcium; stabilizes the cardiac membrane against hyperkalemia; increases contractility.',
      ind: ['Hyperkalemia with ECG changes', 'Calcium-channel blocker overdose', 'Hypocalcemia', 'Magnesium toxicity'],
      contra: ['Digoxin toxicity (caution)', 'Hypercalcemia', 'VF not related to hyperkalemia or hypocalcemia'],
      se: ['Bradycardia, hypotension if pushed fast', 'Tissue necrosis with extravasation', 'Burning at IV site'],
      adult: '1 g (10 mL) slow IV over 5–10 min (IV push in cardiac arrest)',
      peds: '20 mg/kg (0.2 mL/kg) slow IV/IO',
      supplied: '10% (100 mg/mL) — 1 g/10 mL prefilled syringe',
      pearls: ['Calcium chloride has 3× the elemental calcium of calcium gluconate.', 'Never mix with sodium bicarbonate in the same line.'],
      label: { type: 'prefilled', amt: 1, amtUnit: 'g', vol: 10, conc: 100, concUnit: 'mg/mL', pct: '10%', route: 'For slow IV use', color: '#334155', cap: '#94a3b8' }
    },
    {
      id: 'norepinephrine', name: 'Norepinephrine', trade: 'Levophed', cat: ['pressor'],
      cls: 'Vasopressor (alpha-1 > beta-1 agonist)',
      action: 'Potent vasoconstriction raises systemic vascular resistance and blood pressure, with modest inotropy.',
      ind: ['Cardiogenic, septic or neurogenic shock', 'Post-ROSC hypotension after fluids'],
      contra: ['Hypovolemia not yet corrected (relative)', 'Mesenteric or peripheral vascular thrombosis'],
      se: ['Hypertension, reflex bradycardia', 'Dysrhythmias', 'Tissue necrosis with extravasation'],
      adult: '0.1–0.5 mcg/kg/min IV infusion (or 2–12 mcg/min), titrated to MAP ≥ 65 mmHg',
      peds: '0.05–2 mcg/kg/min IV infusion',
      supplied: '1 mg/mL — 4 mg/4 mL vial; common mix 4 mg in 250 mL = 16 mcg/mL',
      pearls: ['Always run on an infusion pump through a secure, large IV.'],
      label: { type: 'vial', amt: 4, amtUnit: 'mg', vol: 4, conc: 1, concUnit: 'mg/mL', route: 'Must be diluted for IV infusion', color: '#a16207', cap: '#eab308' }
    },
    {
      id: 'dopamine', name: 'Dopamine', trade: 'Intropin', cat: ['pressor'],
      cls: 'Vasopressor / inotrope (dose-dependent dopaminergic, beta-1, alpha-1 agonist)',
      action: 'Moderate doses raise contractility and heart rate (beta-1); higher doses cause vasoconstriction (alpha-1).',
      ind: ['Cardiogenic shock', 'Symptomatic bradycardia unresponsive to atropine (alternative to pacing)'],
      contra: ['Hypovolemia not yet corrected', 'Pheochromocytoma', 'Tachydysrhythmias, VF'],
      se: ['Tachycardia, dysrhythmias', 'Hypertension', 'Tissue necrosis with extravasation'],
      adult: '5–20 mcg/kg/min IV infusion, titrated to effect',
      peds: '2–20 mcg/kg/min IV infusion',
      supplied: 'Premixed 400 mg in 250 mL D5W (1,600 mcg/mL)',
      pearls: ['Many systems now favor norepinephrine for shock.'],
      label: { type: 'bag', amt: 400, amtUnit: 'mg', vol: 250, conc: 1.6, concUnit: 'mg/mL', concLabel: '1,600 mcg/mL', route: 'In 5% dextrose. For IV infusion', color: '#b45309', cap: '#b45309' }
    },
    {
      id: 'txa', name: 'Tranexamic acid', trade: 'Cyklokapron', cat: ['trauma'],
      cls: 'Antifibrinolytic',
      action: 'Blocks plasminogen activation, preventing clot breakdown.',
      ind: ['Significant hemorrhage in trauma within 3 hours of injury', 'Postpartum hemorrhage (per protocol)'],
      contra: ['More than 3 hours since injury', 'Active thromboembolic disease', 'Isolated head injury (per protocol)'],
      se: ['Hypotension if pushed rapidly', 'Nausea, visual changes', 'Thromboembolism'],
      adult: '1 g IV over 10 min (mixed in 100 mL NS), within 3 hours of injury',
      peds: '15 mg/kg IV over 10 min (max 1 g)',
      supplied: '100 mg/mL — 1 g/10 mL vials',
      pearls: ['Do not give as an IV push — infuse over 10 minutes.'],
      label: { type: 'vial', amt: 1000, amtUnit: 'mg', vol: 10, conc: 100, concUnit: 'mg/mL', route: 'For IV infusion only', color: '#57534e', cap: '#a8a29e' }
    },
    {
      id: 'methylpred', name: 'Methylprednisolone', trade: 'Solu-Medrol', cat: ['resp', 'allergy'],
      cls: 'Corticosteroid',
      action: 'Suppresses inflammation and the immune response; restores beta-receptor responsiveness (onset in hours).',
      ind: ['Asthma and COPD exacerbations', 'Anaphylaxis / severe allergic reactions (adjunct)', 'Adrenal insufficiency (per protocol)'],
      contra: ['Known hypersensitivity', 'Caution: systemic fungal infection, GI bleeding'],
      se: ['Hyperglycemia', 'Fluid retention', 'Mood changes'],
      adult: '125 mg IV/IM',
      peds: '2 mg/kg IV/IM (max 125 mg)',
      supplied: '125 mg/2 mL two-chamber vial (62.5 mg/mL after mixing)',
      pearls: ['Press the plunger-stopper to mix the two chambers before drawing up.'],
      label: { type: 'vial', amt: 125, amtUnit: 'mg', vol: 2, conc: 62.5, concUnit: 'mg/mL', route: 'For IV or IM use. Mix before use', color: '#4338ca', cap: '#818cf8', recon: true }
    },
    {
      id: 'etomidate', name: 'Etomidate', trade: 'Amidate', cat: ['rsi'],
      cls: 'Sedative-hypnotic (induction agent)',
      action: 'Enhances GABA-A activity, producing rapid hypnosis with minimal cardiovascular depression.',
      ind: ['Induction for rapid sequence intubation'],
      contra: ['Known hypersensitivity', 'Caution: septic shock (adrenal suppression)'],
      se: ['Myoclonus', 'Transient adrenal suppression', 'Nausea, vomiting', 'Pain on injection'],
      adult: '0.3 mg/kg IV',
      peds: '0.3 mg/kg IV (children over 10 years per labeling)',
      supplied: '2 mg/mL — 40 mg/20 mL vials',
      pearls: ['No analgesic properties — plan post-intubation analgesia and sedation.'],
      label: { type: 'vial', amt: 40, amtUnit: 'mg', vol: 20, conc: 2, concUnit: 'mg/mL', route: 'For IV use only', color: '#0f172a', cap: '#64748b' }
    },
    {
      id: 'rocuronium', name: 'Rocuronium', trade: 'Zemuron', cat: ['rsi'],
      cls: 'Neuromuscular blocker (non-depolarizing)',
      action: 'Competitively blocks acetylcholine at the neuromuscular junction, causing paralysis (no sedation or analgesia).',
      ind: ['Paralysis for rapid sequence intubation'],
      contra: ['Known hypersensitivity', 'Inability to secure the airway / no backup airway plan'],
      se: ['Prolonged paralysis (30–60+ min)', 'Anaphylaxis (rare)'],
      adult: '1–1.2 mg/kg IV for RSI',
      peds: '1 mg/kg IV',
      supplied: '10 mg/mL — 50 mg/5 mL vials (refrigerate)',
      pearls: ['Paralytics carry a red cap and a "Warning: paralyzing agent" label.', 'Always sedate before (and continue after) paralysis.'],
      label: { type: 'vial', amt: 50, amtUnit: 'mg', vol: 5, conc: 10, concUnit: 'mg/mL', route: 'For IV use. Refrigerate', color: '#dc2626', cap: '#dc2626', paralytic: true }
    },
    {
      id: 'succinylcholine', name: 'Succinylcholine', trade: 'Anectine', cat: ['rsi'],
      cls: 'Neuromuscular blocker (depolarizing)',
      action: 'Depolarizes the motor end plate, causing fasciculations then paralysis lasting 5–10 minutes.',
      ind: ['Paralysis for rapid sequence intubation'],
      contra: ['Personal or family history of malignant hyperthermia', 'Hyperkalemia risk: burns or crush injuries over 24 hours old, renal failure, neuromuscular disease, prolonged immobility'],
      se: ['Hyperkalemia', 'Bradycardia (especially children and repeat doses)', 'Fasciculations, muscle pain', 'Malignant hyperthermia'],
      adult: '1.5 mg/kg IV for RSI',
      peds: '2 mg/kg IV (infants and small children), 1.5 mg/kg older children',
      supplied: '20 mg/mL — 200 mg/10 mL vials (refrigerate)',
      pearls: ['Paralytics carry a red cap and a "Warning: paralyzing agent" label.'],
      label: { type: 'vial', amt: 200, amtUnit: 'mg', vol: 10, conc: 20, concUnit: 'mg/mL', route: 'For IV or IM use. Refrigerate', color: '#dc2626', cap: '#dc2626', paralytic: true }
    },
    {
      id: 'oralglucose', name: 'Oral glucose', trade: 'Glutose', cat: ['endo'],
      cls: 'Carbohydrate (oral glucose gel)',
      action: 'Raises blood glucose after absorption from the GI tract.',
      ind: ['Hypoglycemia in a patient who is awake and can swallow'],
      contra: ['Altered mental status with an unprotected airway', 'Inability to swallow'],
      se: ['Nausea, aspiration if consciousness is impaired'],
      adult: '15 g orally (one tube); may repeat',
      peds: '0.5–1 g/kg orally (max 15 g per dose) per protocol',
      supplied: '15 g tube (40% glucose gel)',
      pearls: ['Reassess glucose 10–15 minutes after each dose.'],
      label: { type: 'tube', amt: 15, amtUnit: 'g', route: 'For oral use only', color: '#ea580c', cap: '#f97316' }
    }
  ];

  var FIELDS = {
    cls: 'Drug class', action: 'Mechanism of action', ind: 'Indications', contra: 'Contraindications',
    se: 'Side effects', adult: 'Adult dose', peds: 'Pediatric dose', supplied: 'How supplied'
  };

  global.PharmData = {
    CATS: CATS, DRUGS: DRUGS, FIELDS: FIELDS,
    byId: function (id) { return DRUGS.filter(function (d) { return d.id === id; })[0]; }
  };
})(window);
