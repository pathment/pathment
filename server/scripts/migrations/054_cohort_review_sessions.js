/**
 * Migration: 054_cohort_review_sessions
 *
 * Makes a "cohort review" a real, dated, editable artifact instead of an
 * ephemeral page visit. Previously only per-mentee attendance survived (on
 * meeting_notes, "today" only) and seen/deferred lived in browser memory.
 *
 *   cohort_review_sessions ( mentor, session_date, title?, status, finished_at?, note? )
 *     - one row per review pass; session_date is the mentor's LOCAL calendar
 *       date (DATEONLY) so "today" matches their timezone. status in_progress|finished.
 *   cohort_review_entries  ( session → mentee, attendance?, status, note? )
 *     - one row per mentee in a session. attendance present|absent|excused.
 *       status pending|reviewed|deferred. Unique per (session, mentee).
 *
 * Run:      node server/scripts/migrations/054_cohort_review_sessions.js
 * Rollback: node server/scripts/migrations/054_cohort_review_sessions.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 054: cohort review sessions');

  try {
    await qi.createTable('cohort_review_sessions', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      mentor_id: { type: S.UUID, allowNull: false },
      // The mentor's LOCAL calendar date for this review (date-only, no time).
      session_date: { type: S.DATEONLY, allowNull: false },
      title: { type: S.STRING(150), allowNull: true },
      status: { type: S.STRING(20), allowNull: false, defaultValue: 'in_progress' },
      finished_at: { type: S.DATE, allowNull: true },
      note: { type: S.TEXT, allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    });
    await qi.addIndex('cohort_review_sessions', ['mentor_id', 'session_date'], { name: 'cohort_review_sessions_mentor_date_idx' });
    console.log('  ✓ created cohort_review_sessions');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohort_review_sessions exists, skipping');
    else throw e;
  }

  try {
    await qi.createTable('cohort_review_entries', {
      id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
      session_id: { type: S.UUID, allowNull: false },
      mentee_id: { type: S.UUID, allowNull: false },
      attendance: { type: S.STRING(10), allowNull: true },
      status: { type: S.STRING(12), allowNull: false, defaultValue: 'pending' },
      note: { type: S.TEXT, allowNull: true },
      created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
      updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    });
    await qi.addIndex('cohort_review_entries', ['session_id', 'mentee_id'], { unique: true, name: 'cohort_review_entries_session_mentee_uniq' });
    await qi.addIndex('cohort_review_entries', ['session_id'], { name: 'cohort_review_entries_session_idx' });
    console.log('  ✓ created cohort_review_entries');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ cohort_review_entries exists, skipping');
    else throw e;
  }

  console.log('✅ Migration 054 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 054');
  try { await qi.dropTable('cohort_review_entries'); console.log('  ✓ dropped cohort_review_entries'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  try { await qi.dropTable('cohort_review_sessions'); console.log('  ✓ dropped cohort_review_sessions'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  console.log('✅ Rollback 054 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
