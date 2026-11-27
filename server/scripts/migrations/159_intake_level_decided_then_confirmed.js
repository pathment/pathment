/**
 * Migration: 159_intake_level_decided_then_confirmed
 *
 * The level an applicant is placed at now has a provenance and a confirmation,
 * because it decides which assessment they sit.
 *
 *  - applications.level_source                     'self' | 'ai' | 'admin'
 *  - applications.level_confirmed_at               when a human accepted it
 *  - applications.level_confirmed_by               who accepted it
 *  - applications.level_changed_after_assessment   an admin moved the level
 *                                                  after the paper was sat, so
 *                                                  the score is against a paper
 *                                                  written for another level
 *
 * Additive and nullable (the flag defaults false), so the running code ignores
 * every one of them until the release that reads them.
 *
 * Backfill: an application the review has already placed carries 'ai'; one that
 * still sits at the level its applicant picked carries 'self'.
 *
 * Run:      node server/scripts/migrations/159_intake_level_decided_then_confirmed.js
 * Rollback: node server/scripts/migrations/159_intake_level_decided_then_confirmed.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['applications', 'level_source', { type: Sequelize.STRING(10), allowNull: true }],
  ['applications', 'level_confirmed_at', { type: Sequelize.DATE, allowNull: true }],
  ['applications', 'level_confirmed_by', { type: Sequelize.UUID, allowNull: true }],
  ['applications', 'level_changed_after_assessment', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 159: intake level decided, then confirmed');
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

  // Idempotent: only fills rows that have no provenance yet.
  const [, meta] = await sequelize.query(`
    UPDATE applications
       SET level_source = CASE
             WHEN recommended_level IS NOT NULL AND recommended_level = level THEN 'ai'
             ELSE 'self'
           END
     WHERE level_source IS NULL
       AND level IS NOT NULL
  `);
  console.log(`  ✓ Backfilled level_source on ${meta?.rowCount ?? 0} application(s)`);
  console.log('✅ Migration 159 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 159');
  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 159 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
