/**
 * Minimal, correct CSV (RFC-4180-ish) — no dependency. Handles the things the
 * old hand-rolled invite parser didn't: quoted fields, embedded commas, quotes
 * ("" escaping) and newlines. Used by the admissions export/import round-trip,
 * where applicant answers routinely contain commas and line breaks.
 */

/** One value → a CSV cell (quote only when needed). */
function cell(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Rows (array of objects) → CSV text.
 * @param {Array<{key:string,header:string}>} columns ordered column spec
 * @param {Array<object>} rows
 */
function toCsv(columns, rows) {
  const head = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => cell(row[c.key])).join(','));
  // Excel opens UTF-8 correctly with a BOM; without it, accented names garble.
  return '﻿' + [head, ...body].join('\r\n') + '\r\n';
}

/**
 * CSV text → array of row objects keyed by the header row. A small state
 * machine so quoted fields with commas / newlines survive intact.
 */
function parseCsv(text) {
  let s = String(text || '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1); // strip BOM
  const rows = [];
  let field = '';
  let record = [];
  let inQuotes = false;
  let i = 0;
  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { rows.push(record); record = []; };

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { pushField(); i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { pushField(); pushRecord(); i += 1; continue; }
    field += ch; i += 1;
  }
  // Flush a trailing field/record (file may not end in a newline).
  if (field.length || record.length) { pushField(); pushRecord(); }

  // Drop a fully-empty trailing record (common when file ends with a newline).
  while (rows.length && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((h) => h.trim());
  const out = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = r[idx] != null ? r[idx] : ''; });
    return obj;
  });
  return { headers, rows: out };
}

module.exports = { toCsv, parseCsv, cell };
