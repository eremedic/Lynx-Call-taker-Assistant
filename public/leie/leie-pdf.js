// Reads the text of a PDF with the bundled pdf.js (vendor/), entirely in this
// browser. Returns positioned lines for LeieCore.pdfLinesToTable and
// LeieCore.extractPersonFromLines. The pdf.js worker script is loaded on the
// page, so pdf.js runs it on the main thread; that also works when this page
// is opened straight from disk.
(function (root) {
  'use strict';

  async function readLines(buffer) {
    const lib = root.pdfjsLib;
    if (!lib) throw new Error('The PDF reader did not load. Save the file as CSV or Excel and try again.');
    let pdf;
    try {
      // isEvalSupported: false keeps pdf.js from compiling code from font data.
      pdf = await lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true }).promise;
    } catch (err) {
      if (err && err.name === 'PasswordException') throw new Error('This PDF is password-protected. Remove the password and try again.');
      throw new Error('This file could not be read as a PDF.');
    }
    const lines = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter((i) => typeof i.str === 'string' && i.str.trim())
        .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, h: Math.abs(i.transform[3]) || i.height || 10, str: i.str }))
        .sort((a, b) => b.y - a.y || a.x - b.x);
      let cur = null;
      for (const it of items) {
        if (cur && Math.abs(cur.y - it.y) <= Math.max(2, it.h * 0.45)) cur.items.push(it);
        else { cur = { page: p, y: it.y, items: [it] }; lines.push(cur); }
      }
      page.cleanup();
    }
    await pdf.destroy();
    lines.forEach((l) => l.items.sort((a, b) => a.x - b.x));
    if (!lines.length) {
      throw new Error('This PDF has no readable text. It is probably a scanned image; ask for a text-based PDF, CSV, or Excel file.');
    }
    return lines;
  }

  root.LeiePdf = { readLines };
})(typeof window !== 'undefined' ? window : globalThis);
