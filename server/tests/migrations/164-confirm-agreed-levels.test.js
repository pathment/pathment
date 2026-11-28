'use strict';

/**
 * Migration 164 confirms the levels two judgements already agreed on, and
 * carefully does not confirm anything else.
 *
 * The whole value is in what it leaves alone. `level = self_selected_level` is
 * only meaningful when a review produced that level (`level_source = 'ai'`);
 * on a self-picked application the two are equal because nothing ever looked,
 * and confirming those would place people on an unexamined level — the one
 * thing the confirmation gate exists to prevent.
 */

const { models } = require('../../src/db');
const migration = require('../../scripts/migrations/164_confirm_levels_both_sides_agreed');
const { cleanDb, createAdmin, createProgram } = require('../helpers/seed');

describe('migration 164: confirm the levels both sides agreed on', () => {
  let cohort; let admin;

  const application = (over) => models.Application.create({
    cohortId: cohort.id, email: `${Math.random().toString(36).slice(2)}@test.com`,
    firstName: 'A', lastName: 'B', status: 'pending', source: 'public_link', responses: {},
    ...over,
  });

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'm164@test.com' });
    const program = await createProgram({ createdBy: admin.id });
    cohort = await models.Cohort.create({
      programId: program.id, name: 'Intake', status: 'open',
      levels: [{ key: 'level-1', label: 'One' }, { key: 'level-2', label: 'Two' }],
      intakeFormSchema: [],
    });
  });

  it('confirms a review that landed where the applicant put themselves', async () => {
    const agreed = await application({ level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'ai' });

    await migration.up();

    await agreed.reload();
    expect(agreed.levelConfirmedAt).toBeTruthy();
    // Nobody clicked: that is what a null confirming user means here, and it
    // is what the rollback reads to find its own work.
    expect(agreed.levelConfirmedBy).toBeNull();
  });

  it('leaves a disagreement for a human', async () => {
    const disagreed = await application({ level: 'level-2', selfSelectedLevel: 'level-1', levelSource: 'ai' });

    await migration.up();

    expect((await disagreed.reload()).levelConfirmedAt).toBeNull();
  });

  it('leaves a level nothing has examined alone, however equal the two columns look', async () => {
    const unreviewed = await application({ level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'self' });

    await migration.up();

    expect((await unreviewed.reload()).levelConfirmedAt).toBeNull();
  });

  it('does not touch what a person already confirmed', async () => {
    const when = new Date('2026-11-01T10:00:00Z');
    const byHand = await application({
      level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'ai',
      levelConfirmedAt: when, levelConfirmedBy: admin.id,
    });

    await migration.up();

    await byHand.reload();
    expect(byHand.levelConfirmedBy).toBe(admin.id);
    expect(new Date(byHand.levelConfirmedAt).toISOString()).toBe(when.toISOString());
  });

  it('writes nothing on a dry run', async () => {
    const agreed = await application({ level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'ai' });

    await migration.up({ dryRun: true });

    expect((await agreed.reload()).levelConfirmedAt).toBeNull();
  });

  it('is safe to run twice', async () => {
    const agreed = await application({ level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'ai' });
    await migration.up();
    const first = (await agreed.reload()).levelConfirmedAt;
    await migration.up();

    expect(new Date((await agreed.reload()).levelConfirmedAt).toISOString()).toBe(new Date(first).toISOString());
  });

  it('un-confirms its own work and nobody else\'s', async () => {
    const mine = await application({ level: 'level-1', selfSelectedLevel: 'level-1', levelSource: 'ai' });
    const theirs = await application({
      level: 'level-2', selfSelectedLevel: 'level-2', levelSource: 'ai',
      levelConfirmedAt: new Date('2026-11-01'), levelConfirmedBy: admin.id,
    });

    await migration.up();
    await migration.down();

    expect((await mine.reload()).levelConfirmedAt).toBeNull();
    expect((await theirs.reload()).levelConfirmedAt).toBeTruthy();
    expect((await theirs.reload()).levelConfirmedBy).toBe(admin.id);
  });
});
