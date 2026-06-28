/**
 * Catalog of "profile" fields an admin can add to a cohort's application form.
 * Each is tagged with a `key` (the stable field key stored in the application's
 * `responses`) and where it maps on registration so the mentee NEVER re-enters
 * it during onboarding - collect once at apply, reuse everywhere.
 *
 * `target`: 'user' | 'menteeProfile' - which record the answer lands on.
 * `field`:  the column on that record.
 * `array`:  true → the answer is split into a string[] (comma/newline separated).
 *
 * The client form builder imports the same catalog (lib/config/intakeFields.ts);
 * keep the two in sync.
 */
const INTAKE_PROFILE_FIELDS = [
  { key: 'firstName', label: 'First name', type: 'text', target: 'user', field: 'firstName' },
  { key: 'lastName', label: 'Last name', type: 'text', target: 'user', field: 'lastName' },
  { key: 'phone', label: 'Phone', type: 'phone', target: 'user', field: 'phone' },
  { key: 'gender', label: 'Gender', type: 'select', target: 'user', field: 'gender', options: ['female', 'male', 'non-binary', 'prefer not to say', 'other'] },
  { key: 'city', label: 'City', type: 'text', target: 'user', field: 'city' },
  { key: 'country', label: 'Country', type: 'text', target: 'user', field: 'country' },
  { key: 'currentEducation', label: 'Current education', type: 'text', target: 'menteeProfile', field: 'currentEducation' },
  { key: 'currentOccupation', label: 'Current occupation', type: 'text', target: 'menteeProfile', field: 'currentOccupation' },
  { key: 'priorExperience', label: 'Prior experience', type: 'textarea', target: 'menteeProfile', field: 'priorExperience' },
  { key: 'learningGoals', label: 'Learning goals', type: 'textarea', target: 'menteeProfile', field: 'learningGoals', array: true },
  { key: 'interests', label: 'Interests', type: 'textarea', target: 'menteeProfile', field: 'interests', array: true },
  { key: 'preferredLearningStyle', label: 'Preferred learning style', type: 'select', target: 'menteeProfile', field: 'preferredLearningStyle', options: ['visual', 'auditory', 'reading', 'kinesthetic'] },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'url', target: 'menteeProfile', field: 'linkedinUrl' },
  { key: 'githubUrl', label: 'GitHub URL', type: 'url', target: 'menteeProfile', field: 'githubUrl' },
  { key: 'portfolioUrl', label: 'Portfolio URL', type: 'url', target: 'menteeProfile', field: 'portfolioUrl' }
];

// ── Format validation (mirror client lib/config/intakeFields.ts) ───────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-\s\d]{7,20}$/;

function parseUrl(v) {
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
}

/**
 * The type to validate against — explicit non-text type wins, else inferred from
 * the field KEY so legacy profile fields saved as plain `text` (before typed
 * validation existed) still get checked.
 */
function effectiveType(field) {
  if (field.type && field.type !== 'text') return field.type;
  const key = String(field.key || '').toLowerCase();
  if (key.endsWith('url') || key.includes('linkedin') || key.includes('github') || key.includes('portfolio') || key.includes('website')) return 'url';
  if (key === 'email' || key.endsWith('email')) return 'email';
  if (key.includes('phone') || key.includes('mobile')) return 'phone';
  return field.type || 'text';
}

/**
 * Validate ONE answer against its field type. Returns an error string, or null
 * when valid / empty. Mirrors the client so a direct API call can't slip a bad
 * value (e.g. plain text in a LinkedIn URL field) past the form.
 */
function validateIntakeValue(field, raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return null;
  const key = String(field.key || '').toLowerCase();
  switch (effectiveType(field)) {
    case 'email':
      return EMAIL_RE.test(v) ? null : 'Enter a valid email address';
    case 'phone':
      return PHONE_RE.test(v) ? null : 'Enter a valid phone number';
    case 'number':
      return /^-?\d+(\.\d+)?$/.test(v) ? null : 'Enter a number';
    case 'date':
      return Number.isNaN(Date.parse(v)) ? 'Enter a valid date' : null;
    case 'url': {
      const u = parseUrl(v);
      if (!u || !u.hostname.includes('.')) return 'Enter a valid URL (e.g. https://example.com)';
      const host = u.hostname.toLowerCase();
      if (key.includes('linkedin') && !host.endsWith('linkedin.com')) return 'Enter a LinkedIn URL (linkedin.com/in/…)';
      if (key.includes('github') && !host.endsWith('github.com')) return 'Enter a GitHub URL (github.com/…)';
      return null;
    }
    default:
      return null;
  }
}

const BY_KEY = INTAKE_PROFILE_FIELDS.reduce((acc, f) => { acc[f.key] = f; return acc; }, {});

/**
 * Given an application's stored answers, split them into the user-record patch
 * and the mentee-profile patch (only for keys present in the catalog + answered).
 */
function mapResponsesToProfile(responses = {}) {
  const userPatch = {};
  const profilePatch = {};
  for (const [key, raw] of Object.entries(responses || {})) {
    const def = BY_KEY[key];
    if (!def || raw == null || String(raw).trim() === '') continue;
    const value = def.array
      ? String(raw).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
      : String(raw).trim();
    if (def.target === 'user') userPatch[def.field] = value;
    else profilePatch[def.field] = value;
  }
  return { userPatch, profilePatch };
}

/**
 * Normalize a saved intake form schema: profile fields adopt their CATALOG type
 * (and options) so legacy fields stored as plain `text` become `url`/`phone`/etc.
 * on the next save. Custom (`q_`) fields are left exactly as authored.
 */
function normalizeFormSchema(schema) {
  if (!Array.isArray(schema)) return [];
  return schema.map((f) => {
    if (!f || !f.key) return f;
    const def = BY_KEY[f.key];
    if (!def) return f; // custom question — author owns its type
    return {
      ...f,
      type: def.type,
      profileKey: def.key,
      ...(def.options ? { options: def.options } : {}),
    };
  });
}

module.exports = { INTAKE_PROFILE_FIELDS, BY_KEY, mapResponsesToProfile, validateIntakeValue, normalizeFormSchema };
