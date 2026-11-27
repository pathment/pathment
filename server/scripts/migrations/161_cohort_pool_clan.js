/**
 * Migration: 161_cohort_pool_clan
 *
 *  - cohorts.pool_clan_id   the selection round this intake feeds.
 *
 * Replaces `candidate_pools.settings.autoAddFromCohortIds` — a list of cohort
 * ids buried in the round's JSON — with a plain column on the intake. The old
 * shape is why `levelsFor` never saw the intake's levels: it read the round's
 * `cohortId` and the attachment lived somewhere else entirely, so the work
 * screen offered no level picker and every piece of work was saved aimed at
 * nobody, which used to mean everybody.
 *
 * Additive and nullable. No backfill: the live rounds are migrated onto
 * pool-clans in their own migration, where the clan ids exist to point at.
 *
 * Run:      node server/scripts/migrations/161_cohort_pool_clan.js
 * Rollback: node server/scripts/migrations/161_cohort_pool_clan.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['cohorts', 'pool_clan_id', { type: Sequelize.UUID, allowNull: true }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 161: cohort → selection round');
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
  await sequelize.query('CREATE INDEX IF NOT EXISTS cohorts_pool_clan_idx ON cohorts (pool_clan_id)');
  console.log('  ✓ Index cohorts_pool_clan_idx');
  console.log('✅ Migration 161 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 161');
  await sequelize.query('DROP INDEX IF EXISTS cohorts_pool_clan_idx');
  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 161 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
