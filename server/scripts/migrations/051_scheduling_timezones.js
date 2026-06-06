/**
 * Migration: 051_scheduling_timezones
 *
 * Timezone correctness for scheduling. Slots/meetings used to store a bare
 * wall-clock string ('2:00 PM') with no zone, so a US-hosted slot read as the
 * same "2:00 PM" to a mentee in Pakistan — a different real moment. We add:
 *   • availability_slots / scheduled_meetings: `starts_at` (timestamptz, the
 *     true UTC instant) + `timezone` (the zone it was authored in).
 *   • schedule_templates / mentee_schedules: `timezone` (recurring blocks are
 *     wall-clock-in-a-zone; we render them with an explicit zone label).
 *
 * Run:      node server/scripts/migrations/051_scheduling_timezones.js
 * Rollback: node server/scripts/migrations/051_scheduling_timezones.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

const COLS = [
  ['availability_slots', 'starts_at', { type: 'TIMESTAMPTZ' }],
  ['availability_slots', 'timezone', { type: 'STRING50' }],
  ['scheduled_meetings', 'starts_at', { type: 'TIMESTAMPTZ' }],
  ['scheduled_meetings', 'timezone', { type: 'STRING50' }],
  ['schedule_templates', 'timezone', { type: 'STRING50' }],
  ['mentee_schedules', 'timezone', { type: 'STRING50' }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 051: scheduling timezones');
  for (const [table, col, def] of COLS) {
    const type = def.type === 'TIMESTAMPTZ' ? S.DATE : S.STRING(50);
    try {
      await qi.addColumn(table, col, { type, allowNull: true });
      console.log(`  ✓ added ${table}.${col}`);
    } catch (e) {
      if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${col} exists, skipping`);
      else throw e;
    }
  }
  console.log('✅ Migration 051 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 051');
  for (const [table, col] of COLS) {
    try { await qi.removeColumn(table, col); console.log(`  ✓ dropped ${table}.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 051 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
