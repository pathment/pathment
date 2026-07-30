/**
 * Migration: 083_review_meeting
 *
 * Live video (Jitsi) inside cohort review: an embeddable room per session, with
 * auto-attendance and a per-mentee contribution signal.
 *
 *  cohort_review_sessions:
 *   - meeting_provider    STRING  'jitsi' (future-proofs for other providers)
 *   - meeting_room        STRING  non-guessable room slug (identity is steered
 *                                 by joining THROUGH Pathment, not the URL)
 *   - meeting_url         STRING  full join URL (derived, stored for convenience)
 *   - external_meeting_url STRING fallback link (Meet/Zoom) if the provider is down
 *   - meeting_started_at  DATE    when the host opened the room
 *   - meeting_ended_at    DATE    when it was closed / scored
 *
 *  cohort_review_entries:
 *   - joined_at           DATE    first join (self-reported)
 *   - left_at             DATE    last leave
 *   - seconds_present     INTEGER accumulated presence
 *   - auto_present        BOOLEAN attendance set by the system vs the mentor
 *   - talk_seconds        INTEGER dominant-speaker time (contribution proxy)
 *   - contribution_points INTEGER points awarded for this session (audit + idempotency)
 *
 * All additive/nullable/defaulted — existing sessions and the manual flow keep working.
 *
 * Run:      node server/scripts/migrations/083_review_meeting.js
 * Rollback: node server/scripts/migrations/083_review_meeting.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['cohort_review_sessions', 'meeting_provider', { type: Sequelize.STRING(20), allowNull: true }],
  ['cohort_review_sessions', 'meeting_room', { type: Sequelize.STRING(120), allowNull: true }],
  ['cohort_review_sessions', 'meeting_url', { type: Sequelize.STRING(500), allowNull: true }],
  ['cohort_review_sessions', 'external_meeting_url', { type: Sequelize.STRING(500), allowNull: true }],
  ['cohort_review_sessions', 'meeting_started_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_sessions', 'meeting_ended_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_entries', 'joined_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_entries', 'left_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_entries', 'seconds_present', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
  ['cohort_review_entries', 'auto_present', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }],
  ['cohort_review_entries', 'talk_seconds', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
  ['cohort_review_entries', 'contribution_points', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
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
  console.log('▶ Running migration 083: review meeting');
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
  console.log('✅ Migration 083 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 083');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await columnExists(table, column, transaction)) {
        await qi.removeColumn(table, column, { transaction });
        console.log(`  ✓ Dropped ${table}.${column}`);
      }
    }
  });
  console.log('✅ Rollback 083 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
