/**
 * Application form field model, shared by the admin builder and the public apply
 * page. Two kinds of fields:
 *   - PROFILE fields use a catalog `key` that the server maps straight onto the
 *     User / MenteeProfile at registration (so the mentee never re-enters it).
 *     Keep these keys in sync with server/src/config/intakeProfileFields.js.
 *   - CUSTOM questions use a `q_`-prefixed key and just live in `responses` for
 *     triage - they never collide with a profile key.
 */

export type IntakeFieldType =
  | 'text' | 'textarea' | 'select' | 'checkboxes' | 'number' | 'date' | 'yes_no'
  | 'url' | 'email' | 'phone';

export interface IntakeFormField {
  key: string;
  label: string;
  type: IntakeFieldType;
  required?: boolean;
  options?: string[];
  /** Present on profile-mapped fields; the catalog key that carries to the profile. */
  profileKey?: string;
}

/** Profile fields an admin can drop into the form (carry forward to the profile). */
export const PROFILE_FIELD_CATALOG: { key: string; label: string; type: IntakeFieldType; options?: string[] }[] = [
  { key: 'phone', label: 'Phone', type: 'phone' },
  { key: 'gender', label: 'Gender', type: 'select', options: ['female', 'male', 'non-binary', 'prefer not to say', 'other'] },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'currentEducation', label: 'Current education', type: 'text' },
  { key: 'currentOccupation', label: 'Current occupation', type: 'text' },
  { key: 'priorExperience', label: 'Prior experience', type: 'textarea' },
  { key: 'learningGoals', label: 'Learning goals', type: 'textarea' },
  { key: 'interests', label: 'Interests', type: 'textarea' },
  { key: 'preferredLearningStyle', label: 'Preferred learning style', type: 'select', options: ['visual', 'auditory', 'reading', 'kinesthetic'] },
  { key: 'linkedinUrl', label: 'LinkedIn URL', type: 'url' },
  { key: 'githubUrl', label: 'GitHub URL', type: 'url' },
  { key: 'portfolioUrl', label: 'Portfolio URL', type: 'url' },
];

export const CUSTOM_FIELD_TYPES: { type: IntakeFieldType; label: string }[] = [
  { type: 'text', label: 'Short text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'select', label: 'Dropdown' },
  { type: 'checkboxes', label: 'Checkboxes' },
  { type: 'number', label: 'Number' },
  { type: 'date', label: 'Date' },
  { type: 'yes_no', label: 'Yes / No' },
  { type: 'url', label: 'URL / link' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
];

/**
 * The application form a new intake starts with — the mirror of
 * server/src/config/defaultIntakeForm.js. Keep the two in sync, exactly as the
 * profile-field catalog already is.
 *
 * New cohorts get this from the server at creation. This copy exists so an
 * EXISTING cohort with an empty form can adopt it in one click, rather than
 * rebuilding twenty questions by hand.
 *
 * Name and email are always collected and so are deliberately absent.
 */
export const DEFAULT_INTAKE_FORM: IntakeFormField[] = [
  { key: 'phone', profileKey: 'phone', label: 'Phone', type: 'phone', required: true },
  { key: 'currentEducation', profileKey: 'currentEducation', label: 'University or college', type: 'text', required: true },
  { key: 'q_current_semester', label: 'Current semester', type: 'select', required: true,
    options: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', 'Graduate'] },
  { key: 'githubUrl', profileKey: 'githubUrl', label: 'GitHub or portfolio link', type: 'url', required: true },
  { key: 'q_experience_level', label: 'Which statement describes you best?', type: 'select', required: true,
    options: [
      'I am completely new to programming',
      "I know the basics but haven't built projects",
      'I can build projects with guidance',
      'I can build projects independently',
      'I have internship or freelance experience',
    ] },
  { key: 'q_skills', label: 'Which of these have you used?', type: 'checkboxes', required: false,
    options: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'SQL', 'Python', 'Java', 'C++'] },
  { key: 'q_returning_fellow', label: 'Were you a fellow last year?', type: 'yes_no', required: true },
  { key: 'q_previous_clan', label: 'If yes, which clan and mentor were you with?', type: 'text', required: false },
  { key: 'q_weekly_hours', label: 'How many hours per week can you commit?', type: 'select', required: true,
    options: ['0\u201310 hours', '10\u201320 hours', '20\u201330 hours', '30+ hours'] },
  { key: 'q_motivation', label: 'Why are you applying to this fellowship?', type: 'textarea', required: true },
  { key: 'learningGoals', profileKey: 'learningGoals', label: 'What do you want to achieve from this fellowship?', type: 'textarea', required: true },
  { key: 'q_anything_else', label: 'Anything else you would like us to know?', type: 'textarea', required: false },
  { key: 'q_resume_text', label: 'Paste your CV or r\u00e9sum\u00e9 as text', type: 'textarea', required: false },
  { key: 'q_referral_source', label: 'Where did you hear about us?', type: 'checkboxes', required: true,
    options: ['Instagram', 'LinkedIn', 'Facebook', 'University', 'Friend or referral', 'WhatsApp', 'Other'] },
  { key: 'q_referrer', label: 'Who referred you? (if anyone)', type: 'text', required: false },
];

/** A fresh copy, so editing the form never mutates the template. */
export const defaultIntakeForm = (): IntakeFormField[] =>
  DEFAULT_INTAKE_FORM.map((f) => ({ ...f, ...(f.options ? { options: [...f.options] } : {}) }));

const PROFILE_KEYS = new Set(PROFILE_FIELD_CATALOG.map((f) => f.key));
export const isProfileField = (key: string) => PROFILE_KEYS.has(key);

// ── Format validation (mirror server/src/config/intakeProfileFields.js) ────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\-\s\d]{7,20}$/;

/** Parse a URL, tolerating a missing protocol (linkedin.com/in/x → https://…). */
function parseUrl(v: string): URL | null {
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`); } catch { return null; }
}

/**
 * The type to validate against. An explicit non-text type wins; otherwise we
 * infer from the field KEY so legacy profile fields saved as plain `text` (before
 * typed validation existed) still get checked — `linkedinUrl`/`githubUrl`/
 * `portfolioUrl` → url, `*email*` → email, `phone`/`mobile` → phone.
 */
function effectiveType(field: { key?: string; type?: IntakeFieldType }): IntakeFieldType {
  if (field.type && field.type !== 'text') return field.type;
  const key = (field.key || '').toLowerCase();
  if (key.endsWith('url') || key.includes('linkedin') || key.includes('github') || key.includes('portfolio') || key.includes('website')) return 'url';
  if (key === 'email' || key.endsWith('email')) return 'email';
  if (key.includes('phone') || key.includes('mobile')) return 'phone';
  return field.type || 'text';
}

/**
 * Validate ONE answer against its field type. Returns an error message, or null
 * when valid / empty (emptiness is the caller's "required" concern). Drives both
 * the apply form and the server so a direct API call can't bypass it.
 */
export function validateIntakeValue(field: { key?: string; type?: IntakeFieldType; label?: string }, raw: unknown): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const key = (field.key || '').toLowerCase();
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

/** Slugify a label into a stable, collision-safe custom key (`q_<slug>`). */
export function customKeyFromLabel(label: string, existing: string[] = []): string {
  const base = 'q_' + (label || 'question')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'q_question';
  if (!existing.includes(base)) return base;
  let i = 2;
  while (existing.includes(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}
