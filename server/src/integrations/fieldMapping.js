/**
 * Field mapping: their record → our applicant.
 *
 * A mapping names, for each Pathment field, where its value is in the
 * source's record and how to tidy it:
 *
 *   { fields: { email: { from: 'user.email_address', transform: 'lowercase' },
 *               level: { from: 'track', map: { Advanced: 'senior' }, default: 'beginner' } },
 *     keepUnmapped: true }
 *
 * Pure functions, no database: the same code previews a mapping in the app,
 * runs a sync and is unit-tested on its own.
 */

/** The applicant fields a mapping can fill. */
const TARGET_FIELDS = ['email', 'firstName', 'lastName', 'phone', 'level', 'country', 'externalId'];

const TRANSFORMS = ['trim', 'lowercase', 'uppercase', 'titlecase', 'first_name', 'last_name', 'digits', 'date'];

const MAX_VALUE_LENGTH = 1000;

/** `contact.emails[0]` → the value at that path, or undefined. */
function getPath(record, path) {
  if (record == null || !path) return undefined;
  const parts = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = record;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[part];
  }
  return cur;
}

const words = (v) => String(v).trim().split(/\s+/).filter(Boolean);

function applyTransform(value, transform) {
  if (value == null) return value;
  let v = typeof value === 'string' ? value.trim() : value;
  if (typeof v !== 'string') v = String(v);
  switch (transform) {
    case undefined: case null: case '': case 'trim': return v;
    case 'lowercase': return v.toLowerCase();
    case 'uppercase': return v.toUpperCase();
    case 'titlecase': return v.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
    case 'first_name': return words(v)[0] || '';
    case 'last_name': return words(v).slice(1).join(' ');
    case 'digits': return v.replace(/(?!^\+)[^\d]/g, '');
    case 'date': {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    default: return v;
  }
}

/** Is this a usable mapping? Returns a list of problems (empty = fine). */
function validateMapping(mapping) {
  const problems = [];
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return ['The mapping must be an object'];
  const fields = mapping.fields || {};
  if (typeof fields !== 'object' || Array.isArray(fields)) return ['`fields` must be an object'];
  for (const [target, rule] of Object.entries(fields)) {
    if (!TARGET_FIELDS.includes(target)) problems.push(`Unknown Pathment field "${target}"`);
    if (!rule || typeof rule !== 'object') { problems.push(`"${target}" needs a rule`); continue; }
    if (rule.from != null && typeof rule.from !== 'string') problems.push(`"${target}.from" must be a path`);
    if (rule.from == null && rule.default == null) problems.push(`"${target}" needs "from" or "default"`);
    if (rule.transform != null && !TRANSFORMS.includes(rule.transform)) problems.push(`"${target}.transform" must be one of ${TRANSFORMS.join(', ')}`);
    if (rule.map != null && (typeof rule.map !== 'object' || Array.isArray(rule.map))) problems.push(`"${target}.map" must be an object`);
  }
  return problems;
}

/** The top-level keys a mapping reads from (so the rest can go to `responses`). */
function usedSourceKeys(mapping) {
  return new Set(Object.values(mapping?.fields || {})
    .map((r) => (r && typeof r.from === 'string' ? r.from.replace(/\[\d+\]/g, '').split('.')[0] : null))
    .filter(Boolean));
}

const clip = (v) => (typeof v === 'string' && v.length > MAX_VALUE_LENGTH ? v.slice(0, MAX_VALUE_LENGTH) : v);

/**
 * One source record → { values, responses }.
 *
 * Without a mapping the record must already use Pathment's field names.
 * `values` holds the Pathment fields that came out non-empty; `responses`
 * keeps everything else (an explicit `responses` object in the record, then
 * every unmapped top-level field), so nothing a source sends is dropped.
 */
function mapRecord(record, mapping = null) {
  const src = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  const values = {};
  let used;

  if (mapping && mapping.fields && Object.keys(mapping.fields).length) {
    for (const [target, rule] of Object.entries(mapping.fields)) {
      if (!TARGET_FIELDS.includes(target) || !rule) continue;
      let v = rule.from != null ? getPath(src, rule.from) : undefined;
      if (Array.isArray(v)) v = v[0];
      if (v != null && typeof v === 'object') v = undefined;
      v = applyTransform(v, rule.transform);
      if (v != null && v !== '' && rule.map && typeof rule.map === 'object') {
        // A mapped value; otherwise the default; otherwise their value as sent
        // (so an unexpected level is reported as invalid_level, not silently dropped).
        const hit = Object.entries(rule.map).find(([k]) => k.toLowerCase() === String(v).toLowerCase());
        if (hit) v = hit[1];
        else if (rule.default != null) v = String(rule.default);
      }
      if ((v == null || v === '') && rule.default != null) v = String(rule.default);
      if (v != null && v !== '') values[target] = clip(String(v));
    }
    used = usedSourceKeys(mapping);
  } else {
    for (const target of TARGET_FIELDS) {
      const v = applyTransform(src[target], target === 'email' ? 'lowercase' : 'trim');
      if (v != null && v !== '') values[target] = clip(String(v));
    }
    used = new Set(TARGET_FIELDS);
  }
  if (values.email) values.email = values.email.toLowerCase();

  const responses = {};
  if (src.responses && typeof src.responses === 'object' && !Array.isArray(src.responses)) Object.assign(responses, src.responses);
  if (!mapping || mapping.keepUnmapped !== false) {
    for (const [k, v] of Object.entries(src)) {
      if (k === 'responses' || used.has(k) || v == null) continue;
      responses[k] = typeof v === 'string' ? clip(v) : v;
    }
  }
  return { values, responses };
}

// ── Suggesting a mapping from a sample record ────────────────────────────────
const SYNONYMS = {
  email: ['email', 'emailaddress', 'mail', 'useremail', 'contactemail', 'primaryemail', 'workemail'],
  firstName: ['firstname', 'first', 'givenname', 'forename', 'fname'],
  lastName: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilenumber', 'cell', 'whatsapp', 'tel', 'telephone', 'contactnumber'],
  level: ['level', 'track', 'experience', 'experiencelevel', 'tier', 'stage', 'seniority'],
  country: ['country', 'countryname', 'nationality', 'location'],
  externalId: ['id', 'externalid', 'userid', 'uid', 'memberid', 'studentid', 'applicantid', 'uuid', 'ref', 'reference'],
};
const FULL_NAME = ['name', 'fullname', 'displayname', 'candidatename', 'studentname'];
const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');

/** Every leaf path in a sample record (one level of nesting, first array item). */
function leafPaths(record, prefix = '', depth = 0) {
  const out = [];
  if (!record || typeof record !== 'object' || depth > 2) return out;
  for (const [k, v] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      if (v.length && typeof v[0] !== 'object') out.push({ path: `${path}[0]`, key: k });
      else if (v.length) out.push(...leafPaths(v[0], `${path}[0]`, depth + 1));
    } else if (v && typeof v === 'object') out.push(...leafPaths(v, path, depth + 1));
    else out.push({ path, key: k });
  }
  return out;
}

/**
 * A first guess at a mapping from one sample record: match field names
 * against common spellings (email_address, mobile, full_name …). The admin
 * confirms it on a preview before anything is synced.
 */
function suggestMapping(sample) {
  const leaves = leafPaths(sample);
  const fields = {};
  const taken = new Set();
  const find = (names) => leaves.find((l) => !taken.has(l.path) && names.includes(norm(l.key)));
  for (const target of ['email', 'firstName', 'lastName', 'phone', 'level', 'country', 'externalId']) {
    const hit = find(SYNONYMS[target]);
    if (hit) {
      taken.add(hit.path);
      fields[target] = { from: hit.path, ...(target === 'email' ? { transform: 'lowercase' } : target === 'phone' ? { transform: 'digits' } : {}) };
    }
  }
  // Their ID often has a system-specific name (crm_id, hubspot_id): take the one
  // field that ends in "id", when there is exactly one.
  if (!fields.externalId) {
    const ids = leaves.filter((l) => !taken.has(l.path) && /id$/.test(norm(l.key)) && norm(l.key).length <= 16);
    if (ids.length === 1) { taken.add(ids[0].path); fields.externalId = { from: ids[0].path }; }
  }
  if (!fields.firstName && !fields.lastName) {
    const full = find(FULL_NAME);
    if (full) {
      fields.firstName = { from: full.path, transform: 'first_name' };
      fields.lastName = { from: full.path, transform: 'last_name' };
    }
  }
  return { fields, keepUnmapped: true };
}

module.exports = { TARGET_FIELDS, TRANSFORMS, getPath, applyTransform, validateMapping, mapRecord, suggestMapping };
