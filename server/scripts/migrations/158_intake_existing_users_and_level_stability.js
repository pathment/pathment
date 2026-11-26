/**
 * Migration: 158_intake_existing_users_and_level_stability
 *
 * One additive column, nullable, plus a one-off backfill.
 *
 *  - applications.self_selected_level   the level the APPLICANT picked on the
 *                                       form, kept apart from `level`, which the
 *                                       automatic review overwrites with its own
 *                                       decision. The review reads the applicant's
 *                                       own pick as evidence, so feeding it back
 *                                       its previous answer made a re-review land
 *                                       somewhere else each time — and every move
 *                                       swapped the candidate's level-targeted work
 *                                       and emailed them about it.
 *
 * Backfill: the applicant's pick as it was recorded on the first review
 * (`level_evidence -> selfSelected`), falling back to the current level for
 * applications that were never reviewed.
 *
 * Run:      node server/scripts/migrations/158_intake_existing_users_and_level_stability.js
 * Rollback: node server/scripts/migrations/158_intake_existing_users_and_level_stability.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['applications', 'self_selected_level', { type: Sequelize.STRING(40), allowNull: true }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 158: intake existing users + level stability');
  for (const [table, column, spec] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.addColumn(table, column, spec);
      console.log(`  ✓ Added ${table}.${column}`);
    } catch (e) {
      if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
      else throw e;
    }
  }

  // Idempotent: only fills rows that have no value yet.
  const [, meta] = await sequelize.query(`
    UPDATE applications
       SET self_selected_level = LEFT(COALESCE(NULLIF(level_evidence ->> 'selfSelected', ''), level), 40)
     WHERE self_selected_level IS NULL
       AND COALESCE(NULLIF(level_evidence ->> 'selfSelected', ''), level) IS NOT NULL
  `);
  console.log(`  ✓ Backfilled self_selected_level on ${meta?.rowCount ?? 0} application(s)`);
  console.log('✅ Migration 158 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 158');
  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 158 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
