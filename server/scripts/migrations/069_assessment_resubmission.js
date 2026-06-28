/**
 * Migration: 069_assessment_resubmission
 *
 * Applicants can update their assessment as many times as they like before the
 * deadline (the cohort's apply-closes date); the admin always sees the latest
 * (final) version. We track how many times it was (re)submitted so the reviewer
 * knows it's the final of N.
 *
 *   assessment_submissions.submission_count  how many times the applicant submitted.
 *
 * Run:      node server/scripts/migrations/069_assessment_resubmission.js
 * Rollback: node server/scripts/migrations/069_assessment_resubmission.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 069: assessment resubmission count');
  try {
    await qi.addColumn('assessment_submissions', 'submission_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 });
    console.log('  ✓ Added assessment_submissions.submission_count');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ submission_count exists, skipping'); else throw e;
  }
  console.log('✅ Migration 069 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 069');
  try { await qi.removeColumn('assessment_submissions', 'submission_count'); console.log('  ✓ Dropped submission_count'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 069 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
