/**
 * Migration: 065_mentee_pause
 *
 * "Paused" mentees: someone who stopped attending (or never started) is moved
 * to a paused state instead of being removed from the clan. Paused mentees are
 * excluded from clan health/risk/leaderboard reports (so they don't drag the
 * numbers down) but stay in the clan and receive win-back reminders. The status
 * itself reuses clan_memberships.status = 'paused' (a STRING, so no enum change);
 * these columns track the pause + the re-engagement cadence.
 *
 *   paused_at         when they were paused
 *   paused_reason     optional note
 *   paused_by         'mentor' | 'system'
 *   reengage_count    how many win-back touches sent
 *   last_reengaged_at last win-back send
 *   reengage_stage    index into the cadence array
 *
 * Run:      node server/scripts/migrations/065_mentee_pause.js
 * Rollback: node server/scripts/migrations/065_mentee_pause.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 065: mentee pause + re-engagement');

  const add = async (name, def) => {
    try { await qi.addColumn('clan_memberships', name, def); console.log(`  ✓ added ${name}`); }
    catch (e) { if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`); else throw e; }
  };
  await add('paused_at', { type: Sequelize.DATE, allowNull: true });
  await add('paused_reason', { type: Sequelize.TEXT, allowNull: true });
  await add('paused_by', { type: Sequelize.STRING(20), allowNull: true });
  await add('reengage_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
  await add('last_reengaged_at', { type: Sequelize.DATE, allowNull: true });
  await add('reengage_stage', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
  // Suppress a pause suggestion the mentor dismissed (keep-active), with an
  // optional snooze-until so it can resurface later.
  await add('pause_suggestion_dismissed_at', { type: Sequelize.DATE, allowNull: true });

  try {
    await qi.addIndex('clan_memberships', ['clan_id', 'status'], { name: 'clan_memberships_clan_status_idx' });
    console.log('  ✓ index clan_memberships_clan_status_idx');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ index exists, skipping'); else throw e;
  }

  console.log('✅ Migration 065 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 065');
  try { await qi.removeIndex('clan_memberships', 'clan_memberships_clan_status_idx'); } catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  for (const c of ['paused_at', 'paused_reason', 'paused_by', 'reengage_count', 'last_reengaged_at', 'reengage_stage', 'pause_suggestion_dismissed_at']) {
    try { await qi.removeColumn('clan_memberships', c); } catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  // Re-activate any paused memberships so the app's status set stays valid.
  try { await sequelize.query(`UPDATE clan_memberships SET status='active' WHERE status='paused'`); } catch (e) { console.log('  ℹ', e.message); }
  console.log('✅ Rollback 065 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
