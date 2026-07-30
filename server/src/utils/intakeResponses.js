/**
 * Turn an application's raw `responses` map into lines an AI (or a human) can
 * actually read.
 *
 * Responses are keyed by intake-form field key — profile fields use a readable
 * catalog key (`city`, `github`) but CUSTOM questions use an opaque `q_xxxxx`.
 * Sending those raw means the model sees `q_1a2b3c: 2 years at Acme` with no
 * idea what was asked, which quietly wrecks both scoring and level placement.
 * The question text lives on the cohort's `intakeFormSchema`, so resolve it.
 */

/** Prettify a bare key when the form schema has no label for it. */
function humanizeKey(key) {
  const k = String(key || '').replace(/^q_/, '');
  return k.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

/**
 * @param {object} responses            application.responses
 * @param {Array}  intakeFormSchema     cohort.intakeFormSchema ([{key,label}])
 * @returns {string[]} "Question: answer" lines, blanks dropped
 */
function labelledResponses(responses = {}, intakeFormSchema = []) {
  const labels = new Map(
    (Array.isArray(intakeFormSchema) ? intakeFormSchema : [])
      .filter((f) => f && f.key)
      .map((f) => [String(f.key), String(f.label || humanizeKey(f.key))])
  );

  const lines = [];
  for (const [key, value] of Object.entries(responses || {})) {
    if (value == null || value === '') continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!String(text).trim()) continue;
    lines.push(`${labels.get(key) || humanizeKey(key)}: ${text}`);
  }
  return lines;
}

module.exports = { labelledResponses, humanizeKey };
