/**
 * Migration: 153_intake_assessment_pipeline
 *
 * Intake assessments sent by invitation, tracked step by step, with proctoring.
 * Additive only — every column is nullable or has a default.
 *
 *  - applications.assessment_invited_at    when we last sent them their assessment
 *  - applications.assessment_invite_count  how many times it was sent
 *  - applications.link_opened_at           first time they opened their link
 *  - applications.assessment_started_at    when they began the assessment
 *  - cohorts.assessment_mode               'after_form' (as before: straight after
 *                                          applying) | 'on_invite' (only once sent)
 *  - assessments.proctored                 camera + entire screen, snapshots
 *  - assessments.enforce_time_limit        the time limit is a real deadline
 *  - assessment_submissions.proctor_log    snapshots (camera / screen) and events
 *  - assessment_submissions.started_at     the clock's start for a timed attempt
 *
 * Run:      node server/scripts/migrations/153_intake_assessment_pipeline.js
 * Rollback: node server/scripts/migrations/153_intake_assessment_pipeline.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['applications', 'assessment_invited_at', { type: Sequelize.DATE, allowNull: true }],
  ['applications', 'assessment_invite_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
  ['applications', 'link_opened_at', { type: Sequelize.DATE, allowNull: true }],
  ['applications', 'assessment_started_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohorts', 'assessment_mode', { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'after_form' }],
  ['assessments', 'proctored', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
  ['assessments', 'enforce_time_limit', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
  ['assessment_submissions', 'proctor_log', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }],
  ['assessment_submissions', 'started_at', { type: Sequelize.DATE, allowNull: true }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 153: intake assessment pipeline');
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
  console.log('✅ Migration 153 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 153');
  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 153 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
