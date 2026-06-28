/**
 * Migration: 068_intake_levels_assessments
 *
 * Admissions intake upgrades:
 *  - cohorts.levels         optional applicant levels (e.g. Beginner/L1/L2) the
 *                           apply form offers; [] = no level question.
 *  - cohorts.timezone       the zone "apply closes <date>" is interpreted in, so
 *                           the close instant is end-of-day in the org's region.
 *  - cohort_assessments     N assessments per cohort, optionally tagged to a level.
 *                           One is picked at random per applicant from the pool that
 *                           matches their level (or the level-less pool). Replaces
 *                           the single cohorts.assessment_id (kept as legacy fallback).
 *  - applications.level             the level the applicant selected.
 *  - applications.assigned_assessment_id  the assessment randomly assigned to them
 *                           (stable across resume so they always see the same one).
 *  - users.gender           collected on the intake form, mapped onto the account.
 *
 * Run:      node server/scripts/migrations/068_intake_levels_assessments.js
 * Rollback: node server/scripts/migrations/068_intake_levels_assessments.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function addColumn(qi, table, col, opts) {
  try {
    await qi.addColumn(table, col, opts);
    console.log(`  ✓ Added ${table}.${col}`);
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${col} exists, skipping`);
    else throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 068: intake levels + assessment pools');

  await addColumn(qi, 'cohorts', 'levels', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
  await addColumn(qi, 'cohorts', 'timezone', { type: Sequelize.STRING(64), allowNull: true });

  await addColumn(qi, 'applications', 'level', { type: Sequelize.STRING(40), allowNull: true });
  await addColumn(qi, 'applications', 'assigned_assessment_id', { type: Sequelize.UUID, allowNull: true });

  await addColumn(qi, 'users', 'gender', { type: Sequelize.STRING(20), allowNull: true });

  try {
    await qi.createTable('cohort_assessments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      cohort_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'cohorts', key: 'id' }, onDelete: 'CASCADE' },
      assessment_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'assessments', key: 'id' }, onDelete: 'CASCADE' },
      // null = applies to the level-less pool (no levels, or "everyone").
      level: { type: Sequelize.STRING(40), allowNull: true },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log('  ✓ Created cohort_assessments');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohort_assessments exists, skipping'); else throw e;
  }

  for (const [cols, name] of [[['cohort_id'], 'cohort_assessments_cohort_idx'], [['cohort_id', 'level'], 'cohort_assessments_cohort_level_idx']]) {
    try { await qi.addIndex('cohort_assessments', cols, { name }); console.log(`  ✓ Index ${name}`); }
    catch (e) { if (/already exists/i.test(e.message)) console.log(`  ℹ Index ${name} exists`); else throw e; }
  }

  console.log('✅ Migration 068 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 068');
  try { await qi.dropTable('cohort_assessments'); console.log('  ✓ Dropped cohort_assessments'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  for (const [table, col] of [['users', 'gender'], ['applications', 'assigned_assessment_id'], ['applications', 'level'], ['cohorts', 'timezone'], ['cohorts', 'levels']]) {
    try { await qi.removeColumn(table, col); console.log(`  ✓ Dropped ${table}.${col}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 068 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
