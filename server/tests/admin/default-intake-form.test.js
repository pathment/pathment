'use strict';

/**
 * The form a new intake opens with.
 *
 * Most of this is a guard against quiet drift rather than against a crash. A
 * profile key with a typo still saves, still renders and still collects an
 * answer — it just never reaches the mentee's profile, which nobody notices
 * until a mentor asks for something the applicant already typed.
 */

const { DEFAULT_INTAKE_FORM, defaultIntakeForm } = require('../../src/config/defaultIntakeForm');
const { BY_KEY, normalizeFormSchema } = require('../../src/config/intakeProfileFields');

const CUSTOM_TYPES = ['text', 'textarea', 'select', 'checkboxes', 'number', 'date', 'yes_no', 'url', 'email', 'phone'];
const WITH_OPTIONS = ['select', 'checkboxes'];

describe('the default application form', () => {
  it('is not empty, and never collects name or email twice', () => {
    expect(DEFAULT_INTAKE_FORM.length).toBeGreaterThan(5);
    const keys = DEFAULT_INTAKE_FORM.map((f) => f.key);
    // Both are always collected, so listing them would be a field to delete.
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('firstName');
    expect(keys).not.toContain('lastName');
  });

  it('uses only real profile keys, so every mapped answer reaches the profile', () => {
    const mapped = DEFAULT_INTAKE_FORM.filter((f) => f.profileKey);
    expect(mapped.length).toBeGreaterThan(0);
    for (const f of mapped) {
      expect(BY_KEY[f.profileKey]).toBeDefined();
      // The key and the profileKey are the same thing in this model; a mismatch
      // would map the answer onto the wrong column.
      expect(f.key).toBe(f.profileKey);
    }
  });

  it('gives every field a unique key, a label and a known type', () => {
    const keys = DEFAULT_INTAKE_FORM.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of DEFAULT_INTAKE_FORM) {
      expect(typeof f.label).toBe('string');
      expect(f.label.trim().length).toBeGreaterThan(0);
      expect(CUSTOM_TYPES).toContain(f.type);
      // A custom question must not squat on a profile key's namespace.
      if (!f.profileKey) expect(f.key.startsWith('q_')).toBe(true);
    }
  });

  it('gives every choice field at least two options, and no blank ones', () => {
    for (const f of DEFAULT_INTAKE_FORM.filter((x) => WITH_OPTIONS.includes(x.type))) {
      expect(Array.isArray(f.options)).toBe(true);
      expect(f.options.length).toBeGreaterThan(1);
      expect(f.options.every((o) => typeof o === 'string' && o.trim())).toBe(true);
      expect(new Set(f.options).size).toBe(f.options.length);
    }
  });

  it('survives the server\'s own normalisation unchanged in shape', () => {
    const normalised = normalizeFormSchema(defaultIntakeForm());
    expect(normalised).toHaveLength(DEFAULT_INTAKE_FORM.length);
    // Normalisation rewrites a profile field's type from the catalog. If the
    // template disagreed with the catalog the admin would see the type change
    // under them on first save, so they must already agree.
    for (const [i, f] of normalised.entries()) {
      expect(f.key).toBe(DEFAULT_INTAKE_FORM[i].key);
      expect(f.type).toBe(DEFAULT_INTAKE_FORM[i].type);
    }
  });

  it('hands out a copy, so editing one intake cannot change the template', () => {
    const a = defaultIntakeForm();
    a[0].label = 'Edited';
    a.find((f) => f.options).options.push('Injected');
    const b = defaultIntakeForm();
    expect(b[0].label).not.toBe('Edited');
    expect(b.find((f) => f.options).options).not.toContain('Injected');
  });
});

describe('a new intake opens with it', () => {
  const seed = require('../helpers/seed');
  const { models } = require('../../src/db');
  const cohortIntakeService = require('../../src/services/cohortIntakeService');

  let program;
  beforeEach(async () => {
    await seed.cleanDb();
    const admin = await seed.createAdmin();
    program = await seed.createProgram({ createdBy: admin.id, name: 'Fellowship' });
  });

  it('seeds the standard questions on a brand-new cohort', async () => {
    const cohort = await cohortIntakeService.createCohort({ programId: program.id, name: 'Spring intake' }, null);
    const saved = await models.Cohort.findByPk(cohort.id);
    expect(saved.intakeFormSchema).toHaveLength(DEFAULT_INTAKE_FORM.length);
    expect(saved.intakeFormSchema.map((f) => f.key)).toEqual(DEFAULT_INTAKE_FORM.map((f) => f.key));
    // The profile mappings survive the round trip, which is the whole point of
    // preferring a profile field over a custom question.
    expect(saved.intakeFormSchema.find((f) => f.key === 'phone').profileKey).toBe('phone');
  });

  it('lets an explicit form win, so a clone or an import is not overwritten', async () => {
    const mine = [{ key: 'q_only', label: 'Only question', type: 'text', required: true }];
    const cohort = await cohortIntakeService.createCohort(
      { programId: program.id, name: 'Imported intake', intakeFormSchema: mine }, null,
    );
    const saved = await models.Cohort.findByPk(cohort.id);
    expect(saved.intakeFormSchema).toHaveLength(1);
    expect(saved.intakeFormSchema[0].key).toBe('q_only');
  });

  it('leaves an existing cohort alone', async () => {
    const cohort = await cohortIntakeService.createCohort({ programId: program.id, name: 'Spring intake' }, null);
    await cohortIntakeService.updateCohort(cohort.id, { intakeFormSchema: [] });
    const saved = await models.Cohort.findByPk(cohort.id);
    expect(saved.intakeFormSchema).toEqual([]);
  });
});
