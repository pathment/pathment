/**
 * Migration: 088_review_polls_enabled
 *
 * Adds `polls_enabled` (BOOLEAN, default false) to `cohort_review_sessions` — the
 * mentor's toggle for enabling Jitsi in-call polls, propagated to mentees.
 *
 * Run:      node server/scripts/migrations/088_review_polls_enabled.js
 * Rollback: node server/scripts/migrations/088_review_polls_enabled.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 088: review polls_enabled');
  await sequelize.transaction(async (t) => {
    if (await columnExists('cohort_review_sessions', 'polls_enabled', t)) {
      console.log('  ℹ cohort_review_sessions.polls_enabled exists, skipping');
    } else {
      await qi.addColumn('cohort_review_sessions', 'polls_enabled',
        { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, { transaction: t });
      console.log('  ✓ Added cohort_review_sessions.polls_enabled');
    }
  });
  console.log('✅ Migration 088 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 088');
  await sequelize.transaction(async (t) => {
    if (await columnExists('cohort_review_sessions', 'polls_enabled', t)) {
      await qi.removeColumn('cohort_review_sessions', 'polls_enabled', { transaction: t });
      console.log('  ✓ Dropped cohort_review_sessions.polls_enabled');
    }
  });
  console.log('✅ Rollback 088 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
