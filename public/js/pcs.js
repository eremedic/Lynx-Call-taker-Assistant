import { api, esc, requireUser, formatDate } from './common.js';

const $ = (sel) => document.querySelector(sel);
const params = new URLSearchParams(location.search);

const field = (label, value, cls = '', multi = false) => `
  <div class="pcs-field ${cls}">
    <span class="lbl">${esc(label)}</span>
    <span class="val${multi ? ' multi' : ''}">${esc(value || '')}</span>
  </div>`;

const check = (label, on) => `<li><span class="box${on ? ' on' : ''}" role="checkbox" aria-checked="${Boolean(on)}"></span><span>${esc(label)}</span></li>`;

const formatAppointment = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
};

function render(p) {
  const t = p.transport;
  document.title = `PCS — ${p.patient.name || `Call #${p.callId}`}`;
  $('#sheet').innerHTML = `
    <header class="pcs-head">
      <div>
        <div class="org">${esc(p.orgName)}</div>
        <h1>Physician Certification Statement</h1>
        <div class="sub">Medical necessity for non-emergency ambulance transport</div>
      </div>
      <div class="ref">Intake call #${esc(p.callId)}<br>${esc(formatDate(p.callDate))}</div>
    </header>

    ${p.notices.map((n) => `<p class="pcs-notice">${esc(n)}</p>`).join('')}

    <section class="pcs-section keep">
      <h2>1. Patient</h2>
      <div class="body pcs-grid">
        ${field('Patient name', p.patient.name, 'span-2')}
        ${field('Date of birth', p.patient.dob)}
        ${field('Weight (lbs)', p.patient.weight)}
        ${field('Medicare / member ID', p.patient.memberId, 'span-2')}
        ${field('Primary payer', p.payer, 'span-2')}
      </div>
    </section>

    <section class="pcs-section keep">
      <h2>2. Transport</h2>
      <div class="body pcs-grid">
        ${field('Date / time of transport', formatAppointment(t.date), 'span-2')}
        ${field('Destination type', t.destinationType, 'span-2')}
        ${field('Origin (pick-up)', t.origin, 'span-2')}
        ${field('Destination', t.destination, 'span-2')}
        <div class="pcs-field span-4">
          <span class="lbl">Repetitive scheduled transport (e.g., dialysis, wound care, chemotherapy)?</span>
          <ul class="pcs-checks inline" style="margin-top: 3px">${check('Yes', t.repetitive)}${check('No', !t.repetitive)}</ul>
        </div>
        ${field('Requested by', t.requestedBy, 'span-2')}
        ${field('Callback phone', t.callbackPhone, 'span-2')}
      </div>
    </section>

    <section class="pcs-section">
      <h2>3. Medical necessity</h2>
      <div class="body">
        <div class="pcs-grid">
          ${field('Diagnosis / condition requiring ambulance transport', p.diagnosis, 'span-4', true)}
          ${p.narrative ? field('Clinical summary from intake', p.narrative, 'span-4', true) : ''}
        </div>
        <p class="pcs-q" style="margin-top: 10px">Is the patient's condition such that transport by any other means (wheelchair van, car, taxi) is contraindicated?</p>
        <ul class="pcs-checks inline">${check('Yes', p.otherMeansContraindicated === true)}${check('No', p.otherMeansContraindicated === false)}</ul>

        <p class="pcs-q">Bed-confined — all three must apply:</p>
        <ul class="pcs-checks one">${p.bedConfinement.map((b) => check(b.label, b.checked)).join('')}</ul>

        <p class="pcs-q">Conditions requiring ambulance transport (check all that apply):</p>
        <ul class="pcs-checks">${p.conditions.map((c) => check(c.label, c.checked)).join('')}</ul>
        <div class="pcs-field" style="margin-bottom: 6px"><span class="lbl">Other (describe)</span><span class="val"></span></div>

        <div class="keep-together">
          <p class="pcs-q">Level of service required:</p>
          <ul class="pcs-checks inline">${p.levelOfService.map((l) => check(l.label, l.checked)).join('')}</ul>
        </div>
      </div>
    </section>

    <div class="pcs-page2-head">
      <span><strong>${esc(p.patient.name || 'Patient')}</strong>${p.patient.dob ? ` · DOB ${esc(p.patient.dob)}` : ''}${p.patient.memberId ? ` · ID ${esc(p.patient.memberId)}` : ''}</span>
      <span>Physician Certification Statement · Intake call #${esc(p.callId)} · Page 2</span>
    </div>
    <section class="pcs-section keep page-2">
      <h2>4. Certification</h2>
      <div class="body">
        <p class="pcs-statement">I certify that the information above is true and correct based on my evaluation of this patient,
          that the patient's condition requires transport by ambulance, and that other means of transportation are contraindicated.
          I understand this information will be used to determine whether the transport meets the payer's medical-necessity requirements.</p>
        <p class="pcs-q">Certifying practitioner:</p>
        <ul class="pcs-checks inline">${p.certifier.types.map((ct) => check(ct, false)).join('')}</ul>
        <p class="pcs-fine">If not signed by the patient's attending physician: I am employed by the patient's attending physician or by the hospital or
          facility where the patient is being treated, and I have personal knowledge of the patient's condition at the time the transport was ordered.</p>
        <div class="pcs-grid" style="margin-top: 8px">
          ${field('Printed name', p.certifier.name, 'span-2')}
          ${field('Credentials', '')}
          ${field('NPI', '')}
          ${field('Facility / practice', '', 'span-2')}
          ${field('Phone', '', 'span-2')}
        </div>
        <div class="pcs-sign">
          <div><div class="line"></div><span class="pcs-field"><span class="lbl">Signature</span></span></div>
          <div><div class="line"></div><span class="pcs-field"><span class="lbl">Date signed</span></span></div>
        </div>
        <p class="pcs-fine"><strong>${esc(p.validity)}</strong></p>
      </div>
    </section>

    <footer class="pcs-foot">
      Prefilled by ${esc(p.orgName)} from intake call #${esc(p.callId)}${p.callTaker ? ` taken by ${esc(p.callTaker)}` : ''}.
      The certifying practitioner must review and correct all information before signing. Please return the signed form to ${esc(p.orgName)}.
    </footer>`;
}

function setEditing(on) {
  const sheet = $('#sheet');
  sheet.classList.toggle('pcs-editing', on);
  $('#edit-hint').hidden = !on;
  sheet.querySelectorAll('.val').forEach((el) => { el.contentEditable = on ? 'true' : 'false'; });
}

async function init() {
  await requireUser();
  const id = Number(params.get('call'));
  const back = params.get('from') === 'admin' ? 'admin.html#calls' : 'index.html';
  $('#back').href = back;
  if (!id) {
    $('#sheet').innerHTML = '<p>No call selected.</p>';
    return;
  }
  try {
    render(await api(`/api/calls/${id}/pcs`));
  } catch (err) {
    $('#sheet').innerHTML = `<p>${esc(err.message)}</p>`;
    return;
  }
  $('#print').addEventListener('click', () => window.print());
  $('#edit-toggle').addEventListener('change', (e) => setEditing(e.target.checked));
  $('#sheet').addEventListener('click', (e) => {
    const box = e.target.closest('.box');
    if (!box || !$('#sheet').classList.contains('pcs-editing')) return;
    box.classList.toggle('on');
    box.setAttribute('aria-checked', String(box.classList.contains('on')));
  });
}

init();
