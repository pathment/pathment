/**
 * Migration: 152_quiz_video_proctoring
 *
 * Video answers and full proctoring for quizzes (interviews already have both).
 * Additive only — every column is nullable or has a default, so code that
 * predates it keeps working against the new schema.
 *
 *  - quiz_answers.recording_url        the stored video of a video answer
 *  - quiz_answers.recording_public_id  its Cloudinary id (to replace / delete it)
 *  - quiz_answers.transcript           the live captions taken while recording
 *  - quiz_sessions.proctor_log         snapshots (camera / screen) and events
 *  - quiz_assignments.proctored        camera + entire screen shared, required
 *
 * The question kind 'video' needs no schema change (kind is a plain string).
 *
 * Run:      node server/scripts/migrations/152_quiz_video_proctoring.js
 * Rollback: node server/scripts/migrations/152_quiz_video_proctoring.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function addColumn(qi, table, column, spec) {
  try {
    await qi.addColumn(table, column, spec);
    console.log(`  ✓ Added ${table}.${column}`);
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
    else throw e;
  }
}

async function removeColumn(qi, table, column) {
  try {
    await qi.removeColumn(table, column);
    console.log(`  ✓ Dropped ${table}.${column}`);
  } catch (e) {
    if (!/does not exist|no such column/i.test(e.message)) throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 152: quiz video answers + proctoring');
  await addColumn(qi, 'quiz_answers', 'recording_url', { type: Sequelize.TEXT, allowNull: true });
  await addColumn(qi, 'quiz_answers', 'recording_public_id', { type: Sequelize.TEXT, allowNull: true });
  await addColumn(qi, 'quiz_answers', 'transcript', { type: Sequelize.TEXT, allowNull: true });
  await addColumn(qi, 'quiz_sessions', 'proctor_log', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
  await addColumn(qi, 'quiz_assignments', 'proctored', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
  console.log('✅ Migration 152 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 152');
  await removeColumn(qi, 'quiz_answers', 'recording_url');
  await removeColumn(qi, 'quiz_answers', 'recording_public_id');
  await removeColumn(qi, 'quiz_answers', 'transcript');
  await removeColumn(qi, 'quiz_sessions', 'proctor_log');
  await removeColumn(qi, 'quiz_assignments', 'proctored');
  console.log('✅ Rollback 152 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
