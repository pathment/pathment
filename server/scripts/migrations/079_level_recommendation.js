/**
 * Migration: 079_level_recommendation
 *
 * Evidence-based level placement. Applicants self-select a level on the apply
 * form, which decides only which assessment they sit — nothing verifies it, so
 * a "Beginner" with three years of experience (or the reverse) stays misplaced.
 *
 *  - cohorts.level_rules          JSONB  the admin-editable entry criteria per
 *                                        level (seeded with sensible defaults).
 *                                        Shape:
 *                                        { levels: [{ levelKey, minMet,
 *                                            criteria: [{ key, label, how,
 *                                              soloQualifies }] }],
 *                                          baseLevelKey }
 *  - applications.recommended_level  STRING  the level the rules landed on.
 *  - applications.level_evidence     JSONB   why: per-criterion verdict +
 *                                        verbatim quote, the matched rule, and
 *                                        a reason written for the reviewer.
 *
 * All additive + nullable — existing cohorts and applications stay valid, and
 * a cohort with no rules simply gets the defaults the first time it's asked.
 *
 * Run:      node server/scripts/migrations/079_level_recommendation.js
 * Rollback: node server/scripts/migrations/079_level_recommendation.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['cohorts', 'level_rules', { type: Sequelize.JSONB, allowNull: true }],
  ['applications', 'recommended_level', { type: Sequelize.STRING(40), allowNull: true }],
  ['applications', 'level_evidence', { type: Sequelize.JSONB, allowNull: true }],
];

async function columnExists(table, column, transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
    { transaction }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 079: level recommendation');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column, spec] of COLUMNS) {
      if (await columnExists(table, column, transaction)) {
        console.log(`  ℹ ${table}.${column} exists, skipping`);
      } else {
        await qi.addColumn(table, column, spec, { transaction });
        console.log(`  ✓ Added ${table}.${column}`);
      }
    }
  });
  console.log('✅ Migration 079 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 079');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await columnExists(table, column, transaction)) {
        await qi.removeColumn(table, column, { transaction });
        console.log(`  ✓ Dropped ${table}.${column}`);
      }
    }
  });
  console.log('✅ Rollback 079 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
