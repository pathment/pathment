/**
 * The application form a new intake starts with.
 *
 * A cohort used to open with an empty form, so every admin rebuilt the same
 * twenty questions by hand before they could share the link. These are those
 * questions, as a starting point: the admin can edit, reorder or delete any of
 * them, and nothing here is enforced after creation.
 *
 * Name and email are NOT here — they are always collected, so listing them
 * would be a duplicate the admin has to delete.
 *
 * Two kinds of entry, as everywhere else in the form model:
 *   - a PROFILE field (`profileKey`) carries its answer onto the mentee's
 *     profile at registration, so they never retype it. Prefer one of these
 *     whenever the catalog has a home for the answer.
 *   - a custom `q_…` question is kept on the application for triage only.
 *
 * Wording is deliberately workspace-neutral ("this fellowship", "us") so the
 * default reads correctly for any organisation; an admin can make it specific.
 *
 * The client mirrors this list in lib/config/intakeFields.ts — keep the two in
 * sync, the same way the profile-field catalog already is.
 */

const DEFAULT_INTAKE_FORM = [
  // ── Who they are ────────────────────────────────────────────────────────
  { key: 'phone', profileKey: 'phone', label: 'Phone', type: 'phone', required: true },
  { key: 'currentEducation', profileKey: 'currentEducation', label: 'University or college', type: 'text', required: true },
  {
    key: 'q_current_semester',
    label: 'Current semester',
    type: 'select',
    required: true,
    options: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', 'Graduate'],
  },
  // One required link rather than two optional ones: most applicants have
  // exactly one thing to show, and it lands on the profile either way.
  { key: 'githubUrl', profileKey: 'githubUrl', label: 'GitHub or portfolio link', type: 'url', required: true },

  // ── Where they are ──────────────────────────────────────────────────────
  {
    key: 'q_experience_level',
    label: 'Which statement describes you best?',
    type: 'select',
    required: true,
    options: [
      'I am completely new to programming',
      "I know the basics but haven't built projects",
      'I can build projects with guidance',
      'I can build projects independently',
      'I have internship or freelance experience',
    ],
  },
  {
    key: 'q_skills',
    label: 'Which of these have you used?',
    type: 'checkboxes',
    required: false,
    options: ['HTML', 'CSS', 'JavaScript', 'React', 'Node.js', 'Express', 'MongoDB', 'SQL', 'Python', 'Java', 'C++'],
  },

  // ── Fit ─────────────────────────────────────────────────────────────────
  { key: 'q_returning_fellow', label: 'Were you a fellow last year?', type: 'yes_no', required: true },
  { key: 'q_previous_clan', label: 'If yes, which clan and mentor were you with?', type: 'text', required: false },
  {
    key: 'q_weekly_hours',
    label: 'How many hours per week can you commit?',
    type: 'select',
    required: true,
    options: ['0–10 hours', '10–20 hours', '20–30 hours', '30+ hours'],
  },

  // ── Why ─────────────────────────────────────────────────────────────────
  { key: 'q_motivation', label: 'Why are you applying to this fellowship?', type: 'textarea', required: true },
  // Goals are a profile field: the mentor sees them on day one without asking again.
  { key: 'learningGoals', profileKey: 'learningGoals', label: 'What do you want to achieve from this fellowship?', type: 'textarea', required: true },
  { key: 'q_anything_else', label: 'Anything else you would like us to know?', type: 'textarea', required: false },

  // ── Background ──────────────────────────────────────────────────────────
  // No file-upload field type exists yet, so the résumé is collected as text.
  { key: 'q_resume_text', label: 'Paste your CV or résumé as text', type: 'textarea', required: false },

  // ── Where they came from ────────────────────────────────────────────────
  {
    key: 'q_referral_source',
    label: 'Where did you hear about us?',
    type: 'checkboxes',
    required: true,
    options: ['Instagram', 'LinkedIn', 'Facebook', 'University', 'Friend or referral', 'WhatsApp', 'Other'],
  },
  { key: 'q_referrer', label: 'Who referred you? (if anyone)', type: 'text', required: false },
];

/** A fresh copy, so a caller mutating the schema cannot edit the template. */
const defaultIntakeForm = () => DEFAULT_INTAKE_FORM.map((f) => ({
  ...f,
  ...(f.options ? { options: [...f.options] } : {}),
}));

module.exports = { DEFAULT_INTAKE_FORM, defaultIntakeForm };
