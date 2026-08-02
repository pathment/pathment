/**
 * Migration: 085_review_schedules
 *
 * Recurring cohort-review scheduling.
 *
 *  review_schedules — a mentor's recurring review for a clan (simple recurrence:
 *  a weekday + local time, weekly or every 2 weeks, optional end date).
 *   - clan_id, mentor_id (host)
 *   - title
 *   - day_of_week      INTEGER 0..6 (0 = Sunday)
 *   - time_local       STRING 'HH:mm' (wall-clock in `timezone`)
 *   - timezone         IANA zone the wall-clock is in (DST-safe)
 *   - interval_weeks   1 (weekly) or 2 (biweekly)
 *   - duration_minutes default 60
 *   - starts_on        DATEONLY first eligible date
 *   - ends_on          DATEONLY optional last date
 *   - active           BOOLEAN
 *
 *  cohort_review_sessions — each generated occurrence links back + carries its
 *  exact UTC start instant:
 *   - scheduled_at        DATE (UTC instant the room auto-opens)
 *   - review_schedule_id  UUID -> review_schedules
 *   - invites_sent_at / reminded_24h_at / reminded_1h_at — so invites/reminders fire once
 *
 * Additive; existing (ad-hoc) sessions keep working with these all null.
 *
 * Run:      node server/scripts/migrations/085_review_schedules.js
 * Rollback: node server/scripts/migrations/085_review_schedules.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const SESSION_COLUMNS = [
  ['cohort_review_sessions', 'scheduled_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_sessions', 'review_schedule_id', { type: Sequelize.UUID, allowNull: true }],
  ['cohort_review_sessions', 'invites_sent_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_sessions', 'reminded_24h_at', { type: Sequelize.DATE, allowNull: true }],
  ['cohort_review_sessions', 'reminded_1h_at', { type: Sequelize.DATE, allowNull: true }],
];

async function tableExists(name, t) {
  const [r] = await sequelize.query(`SELECT to_regclass('public.${name}') IS NOT NULL AS x`, { transaction: t });
  return r[0].x;
}
async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 085: review schedules');
  await sequelize.transaction(async (t) => {
    if (await tableExists('review_schedules', t)) {
      console.log('  ℹ review_schedules exists, skipping');
    } else {
      await qi.createTable('review_schedules', {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        clan_id: { type: Sequelize.UUID, allowNull: false },
        mentor_id: { type: Sequelize.UUID, allowNull: false },
        title: { type: Sequelize.STRING(200), allowNull: true },
        day_of_week: { type: Sequelize.INTEGER, allowNull: false },
        time_local: { type: Sequelize.STRING(5), allowNull: false },
        timezone: { type: Sequelize.STRING(64), allowNull: false },
        interval_weeks: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        duration_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 60 },
        starts_on: { type: Sequelize.DATEONLY, allowNull: false },
        ends_on: { type: Sequelize.DATEONLY, allowNull: true },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      }, { transaction: t });
      await qi.addIndex('review_schedules', ['clan_id'], { transaction: t });
      await qi.addIndex('review_schedules', ['active'], { transaction: t });
      console.log('  ✓ Created review_schedules');
    }
    for (const [table, column, spec] of SESSION_COLUMNS) {
      if (await columnExists(table, column, t)) { console.log(`  ℹ ${table}.${column} exists, skipping`); }
      else { await qi.addColumn(table, column, spec, { transaction: t }); console.log(`  ✓ Added ${table}.${column}`); }
    }
  });
  console.log('✅ Migration 085 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 085');
  await sequelize.transaction(async (t) => {
    for (const [table, column] of [...SESSION_COLUMNS].reverse()) {
      if (await columnExists(table, column, t)) { await qi.removeColumn(table, column, { transaction: t }); console.log(`  ✓ Dropped ${table}.${column}`); }
    }
    if (await tableExists('review_schedules', t)) { await qi.dropTable('review_schedules', { transaction: t }); console.log('  ✓ Dropped review_schedules'); }
  });
  console.log('✅ Rollback 085 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
