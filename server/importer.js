// Bulk import of payers and facilities from another system's export (for
// example a CSV or Excel list from a dispatch or billing system). The admin
// page parses the file and maps its columns; rows arrive here as plain
// objects. Each import is planned first (what is new, what matches an
// existing record, what has a problem), so the same code powers the preview
// ("dry run") and the real import, which runs in one transaction.
import { facilityRepo, payerRepo } from './db.js';

export const MAX_IMPORT_ROWS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_PRIOR_AUTH = { emergency: 'not_required', non_emergency: 'varies', repetitive: 'varies' };

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const key = (v) => clean(v, 300).toLowerCase();

// Only non-empty cells change an existing record, so a sparse export never
// wipes details someone already entered.
function changedFields(existing, input, fields) {
  const out = {};
  for (const f of fields) {
    if (input[f] === undefined || input[f] === '') continue;
    if (String(existing[f] ?? '') !== String(input[f])) out[f] = input[f];
  }
  return out;
}

function summarize(results) {
  const count = (a) => results.filter((r) => r.action === a).length;
  return { total: results.length, create: count('create'), update: count('update'), unchanged: count('unchanged'), skip: count('skip'), error: count('error') };
}

// ------------------------------------------------------------- facilities
const FACILITY_TEXT = { external_id: 100, name: 120, address: 300, phone: 40, contact_name: 120, contact_email: 200 };

function facilityFromRow(row) {
  const input = Object.fromEntries(Object.entries(FACILITY_TEXT).map(([f, max]) => [f, clean(row[f], max)]));
  const errors = [];
  const warnings = [];
  if (!input.name) errors.push('No facility name.');
  // A bad cell shouldn't block the row: leave it out and say so.
  if (input.contact_email && !EMAIL_RE.test(input.contact_email)) { warnings.push(`Email “${input.contact_email}” isn’t valid and was left out.`); input.contact_email = ''; }
  return { input, errors, warnings };
}

export async function importFacilities(db, rows, { update = true, dryRun = true, userId = null, rowOffset = 0 } = {}) {
  const repo = facilityRepo(db);
  const existing = await repo.list();
  const byExternal = new Map(existing.filter((f) => f.external_id).map((f) => [key(f.external_id), f]));
  const byName = new Map(existing.map((f) => [key(f.name), f]));
  const seen = new Map();
  const plan = rows.map((row, i) => {
    const { input, errors, warnings } = facilityFromRow(row);
    const base = { row: i + 1 + rowOffset, name: input.name, warning: warnings.join(' ') || undefined };
    if (errors.length) return { ...base, action: 'error', error: errors.join(' ') };
    const k = input.external_id ? `id:${key(input.external_id)}` : `name:${key(input.name)}`;
    if (seen.has(k)) return { ...base, action: 'skip', note: `Same facility as row ${seen.get(k)}.` };
    seen.set(k, base.row);
    const match = (input.external_id && byExternal.get(key(input.external_id))) || byName.get(key(input.name));
    if (!match) return { ...base, action: 'create', input };
    if (!update) return { ...base, action: 'skip', note: `Already saved as “${match.name}”.` };
    const changes = changedFields(match, input, Object.keys(FACILITY_TEXT));
    if (changes.name && byName.has(key(changes.name)) && byName.get(key(changes.name)).id !== match.id) {
      return { ...base, action: 'error', error: `Another saved facility is already named “${changes.name}”.` };
    }
    return Object.keys(changes).length
      ? { ...base, action: 'update', id: match.id, changes, note: `Updates “${match.name}”: ${Object.keys(changes).join(', ')}.` }
      : { ...base, action: 'unchanged', note: `Matches “${match.name}”; nothing new.` };
  });
  if (!dryRun) {
    await db.tx(async (t) => {
      const r = facilityRepo(t);
      for (const p of plan) {
        if (p.action === 'create') await r.create(p.input, userId);
        if (p.action === 'update') await r.update(p.id, p.changes);
      }
    });
  }
  return { results: plan.map(({ input, changes, id, ...rest }) => rest), summary: summarize(plan) };
}

// ----------------------------------------------------------------- payers
const PAYER_TEXT = { external_id: 100, name: 120, description: 1000, contact_name: 120, contact_phone: 40, contact_fax: 40, contact_email: 200, contact_url: 300 };

function slug(name) {
  const s = key(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 36);
  return /^[a-z]/.test(s) ? s : `p_${s || 'payer'}`;
}

function payerFromRow(row) {
  const input = Object.fromEntries(Object.entries(PAYER_TEXT).map(([f, max]) => [f, clean(row[f], max)]));
  const errors = [];
  const warnings = [];
  if (!input.name) errors.push('No payer name.');
  // A bad cell shouldn't block the row: leave it out and say so.
  if (input.contact_email && !EMAIL_RE.test(input.contact_email)) { warnings.push(`Email “${input.contact_email}” isn’t valid and was left out.`); input.contact_email = ''; }
  // Portal links must be https; add it to a bare address like "plan.example.com".
  if (input.contact_url && !/^https:\/\//i.test(input.contact_url)) {
    if (/^http:\/\//i.test(input.contact_url)) input.contact_url = input.contact_url.replace(/^http:/i, 'https:');
    else if (/^[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(input.contact_url)) input.contact_url = `https://${input.contact_url}`;
    else { warnings.push(`Website “${input.contact_url}” isn’t a web address and was left out.`); input.contact_url = ''; }
  }
  const kind = /broker|nemt|transport\s*manager/i.test(String(row.type || '')) ? 'broker' : 'payer';
  return { input, kind, parent: clean(row.parent, 120), errors, warnings };
}

export async function importPayers(db, rows, { update = true, dryRun = true, rowOffset = 0 } = {}) {
  const repo = payerRepo(db);
  const existing = await repo.list();
  const byExternal = new Map(existing.filter((p) => p.external_id).map((p) => [key(p.external_id), p]));
  const byCode = new Map(existing.map((p) => [p.code, p]));
  const byName = new Map(existing.map((p) => [key(p.name), p]));
  const codes = new Set(existing.map((p) => p.code));
  const seen = new Map();
  const plannedPayers = new Map(); // name/id/code -> code, for brokers linked to payers in the same file

  const parsed = rows.map((row, i) => ({ i, ...payerFromRow(row) }));
  // Payers first, so brokers in the same file can be linked to them.
  const ordered = [...parsed.filter((r) => r.kind === 'payer'), ...parsed.filter((r) => r.kind === 'broker')];
  const plan = [];
  for (const { i, input, kind, parent, errors, warnings } of ordered) {
    const base = { row: i + 1 + rowOffset, name: input.name, kind, warning: warnings.join(' ') || undefined };
    if (errors.length) { plan.push({ ...base, action: 'error', error: errors.join(' ') }); continue; }
    const k = input.external_id ? `id:${key(input.external_id)}` : `name:${key(input.name)}`;
    if (seen.has(k)) { plan.push({ ...base, action: 'skip', note: `Same payer as row ${seen.get(k)}.` }); continue; }
    seen.set(k, base.row);

    let parentCode = null;
    if (kind === 'broker' && parent) {
      const p = byCode.get(key(parent)) || byName.get(key(parent)) || byExternal.get(key(parent));
      parentCode = p && p.kind !== 'broker' ? p.code : plannedPayers.get(key(parent)) || null;
    }
    const match = (input.external_id && byExternal.get(key(input.external_id))) || byName.get(key(input.name));
    if (match) {
      for (const alias of [match.name, match.external_id, match.code]) if (alias) plannedPayers.set(key(alias), match.code);
      if (!update) { plan.push({ ...base, action: 'skip', note: `Already set up as “${match.name}”.` }); continue; }
      const changes = changedFields(match, input, Object.keys(PAYER_TEXT));
      if (parentCode && match.kind === 'broker' && match.parent_code !== parentCode) changes.parent_code = parentCode;
      plan.push(Object.keys(changes).length
        ? { ...base, action: 'update', id: match.id, changes, note: `Updates “${match.name}”: ${Object.keys(changes).join(', ')}.` }
        : { ...base, action: 'unchanged', note: `Matches “${match.name}”; nothing new.` });
      continue;
    }
    let code = slug(input.name);
    for (let n = 2; codes.has(code); n++) code = `${slug(input.name).slice(0, 33)}_${n}`;
    codes.add(code);
    for (const alias of [input.name, input.external_id, code]) if (alias) plannedPayers.set(key(alias), code);
    const note = kind === 'broker' && parent && !parentCode ? `Broker: “${parent}” wasn’t found, so it isn’t linked to a payer yet.` : undefined;
    plan.push({
      ...base, action: 'create', note,
      input: {
        ...input, code, kind, parent_code: parentCode,
        description: input.description || 'Imported. Review prior-authorization and documentation rules.',
        requires_medical_necessity: true, // only private pay and facility pay may skip it
        prior_auth: DEFAULT_PRIOR_AUTH,
      },
    });
  }
  plan.sort((a, b) => a.row - b.row);
  if (!dryRun) {
    await db.tx(async (t) => {
      const r = payerRepo(t);
      for (const p of plan.filter((x) => x.action === 'create' && x.kind === 'payer')) await r.create(p.input);
      for (const p of plan.filter((x) => x.action === 'create' && x.kind === 'broker')) await r.create(p.input);
      for (const p of plan.filter((x) => x.action === 'update')) await r.update(p.id, p.changes);
    });
  }
  return { results: plan.map(({ input, changes, id, ...rest }) => rest), summary: summarize(plan) };
}
