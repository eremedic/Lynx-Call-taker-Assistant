// Minimal, dependency-free .xlsx reader: returns the first worksheet as an
// array of rows (arrays of cell text). Uses the browser's built-in
// DecompressionStream, so nothing is downloaded and no data leaves the page.
(function (root) {
  'use strict';

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function unzip(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('This file is not a valid .xlsx workbook.');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();
    const entries = new Map();
    for (let n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      const method = view.getUint16(p + 10, true);
      const size = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const local = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.set(name, { method, size, local });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has: (name) => entries.has(name),
      async text(name) {
        const e = entries.get(name);
        if (!e) return null;
        const start = e.local + 30 + view.getUint16(e.local + 26, true) + view.getUint16(e.local + 28, true);
        const raw = bytes.subarray(start, start + e.size);
        const data = e.method === 0 ? raw : await inflateRaw(raw);
        return decoder.decode(data);
      },
    };
  }

  const xml = (text) => new DOMParser().parseFromString(text, 'application/xml');
  const byTag = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));

  function colIndex(ref) {
    const letters = (ref.match(/^[A-Z]+/) || [''])[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  async function readFirstSheet(buffer) {
    const zip = await unzip(buffer);
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await zip.text('xl/workbook.xml');
    const rels = await zip.text('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = byTag(xml(wb), 'sheet')[0];
      const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rel = byTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const target = rel.getAttribute('Target').replace(/^\//, '');
        sheetPath = target.startsWith('xl/') ? target : 'xl/' + target;
      }
    }
    const sheetText = await zip.text(sheetPath);
    if (!sheetText) throw new Error('Could not find a worksheet in this workbook.');

    const shared = [];
    const sst = await zip.text('xl/sharedStrings.xml');
    if (sst) for (const si of byTag(xml(sst), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent).join(''));

    const rows = [];
    for (const rowEl of byTag(xml(sheetText), 'row')) {
      const row = [];
      let next = 0;
      for (const c of byTag(rowEl, 'c')) {
        const ref = c.getAttribute('r');
        const ci = ref ? colIndex(ref) : next;
        next = ci + 1;
        const type = c.getAttribute('t');
        const v = byTag(c, 'v')[0];
        let value = '';
        if (type === 's') value = v ? shared[Number(v.textContent)] || '' : '';
        else if (type === 'inlineStr') value = byTag(c, 't').map((t) => t.textContent).join('');
        else if (type === 'b') value = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
        else value = v ? v.textContent : '';
        row[ci] = value;
      }
      for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
      const at = rowEl.getAttribute('r');
      if (at) rows[Number(at) - 1] = row; else rows.push(row);
    }
    return Array.from(rows, (r) => r || []).filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  root.LeieXlsx = { readFirstSheet };
})(typeof window !== 'undefined' ? window : globalThis);
