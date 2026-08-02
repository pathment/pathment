/**
 * Migration: 086_admin_meetings
 *
 * Admin-hosted live meetings (org broadcasts). An admin schedules a meeting and
 * chooses the audience: mentors only, a specific clan, or both. Attendees get a
 * calendar invite + reminders and a live banner to join the (Jitsi) room.
 *
 *  admin_meetings
 *   - host_id           UUID (the admin who created it)
 *   - title / description
 *   - scheduled_at      DATE (UTC instant it starts)
 *   - duration_minutes  INTEGER (default 60)
 *   - audience_type     STRING 'mentors' | 'clan' | 'both'
 *   - clan_id           UUID (required for 'clan' / 'both')
 *   - meeting_provider / meeting_room / meeting_url
 *   - status            STRING 'scheduled' | 'live' | 'ended' | 'cancelled'
 *   - started_at / ended_at
 *   - invites_sent_at / reminded_24h_at / reminded_1h_at
 *
 * Run:      node server/scripts/migrations/086_admin_meetings.js
 * Rollback: node server/scripts/migrations/086_admin_meetings.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(name, t) {
  const [r] = await sequelize.query(`SELECT to_regclass('public.${name}') IS NOT NULL AS x`, { transaction: t });
  return r[0].x;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 086: admin meetings');
  await sequelize.transaction(async (t) => {
    if (await tableExists('admin_meetings', t)) {
      console.log('  ℹ admin_meetings exists, skipping');
      return;
    }
    await qi.createTable('admin_meetings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      host_id: { type: Sequelize.UUID, allowNull: false },
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      scheduled_at: { type: Sequelize.DATE, allowNull: false },
      duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 60 },
      audience_type: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'mentors' },
      clan_id: { type: Sequelize.UUID, allowNull: true },
      meeting_provider: { type: Sequelize.STRING(20), allowNull: true },
      meeting_room: { type: Sequelize.STRING(120), allowNull: true },
      meeting_url: { type: Sequelize.STRING(500), allowNull: true },
      status: { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'scheduled' },
      started_at: { type: Sequelize.DATE, allowNull: true },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      invites_sent_at: { type: Sequelize.DATE, allowNull: true },
      reminded_24h_at: { type: Sequelize.DATE, allowNull: true },
      reminded_1h_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    }, { transaction: t });
    await qi.addIndex('admin_meetings', ['status', 'scheduled_at'], { transaction: t });
    await qi.addIndex('admin_meetings', ['clan_id'], { transaction: t });
    console.log('  ✓ Created admin_meetings');
  });
  console.log('✅ Migration 086 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 086');
  await sequelize.transaction(async (t) => {
    if (await tableExists('admin_meetings', t)) { await qi.dropTable('admin_meetings', { transaction: t }); console.log('  ✓ Dropped admin_meetings'); }
  });
  console.log('✅ Rollback 086 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
