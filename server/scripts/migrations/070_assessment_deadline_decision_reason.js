/**
 * Migration: 070_assessment_deadline_decision_reason
 *
 *  - cohorts.assessment_deadline   an OPTIONAL separate deadline for the
 *                                  assessment (falls back to apply-closes when null).
 *  - applications.decision_reason  the reason shown to the applicant on a
 *                                  decision (e.g. why they were rejected). Kept
 *                                  separate from reviewer_notes (internal).
 *
 * Run:      node server/scripts/migrations/070_assessment_deadline_decision_reason.js
 * Rollback: node server/scripts/migrations/070_assessment_deadline_decision_reason.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function addColumn(qi, table, col, opts) {
  try { await qi.addColumn(table, col, opts); console.log(`  ✓ Added ${table}.${col}`); }
  catch (e) { if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${col} exists, skipping`); else throw e; }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 070: assessment deadline + decision reason');
  await addColumn(qi, 'cohorts', 'assessment_deadline', { type: Sequelize.DATE, allowNull: true });
  await addColumn(qi, 'applications', 'decision_reason', { type: Sequelize.TEXT, allowNull: true });
  console.log('✅ Migration 070 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 070');
  for (const [table, col] of [['cohorts', 'assessment_deadline'], ['applications', 'decision_reason']]) {
    try { await qi.removeColumn(table, col); console.log(`  ✓ Dropped ${table}.${col}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 070 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
