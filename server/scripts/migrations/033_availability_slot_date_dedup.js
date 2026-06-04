/**
 * Migration: 033_availability_slot_date_dedup
 *
 * Mentor availability slots had only a free-text `day` label + `time` and NO
 * uniqueness — so a mentor could publish unlimited identical slots. This adds a
 * real `date` (DATEONLY), de-duplicates existing rows, and enforces a unique
 * (mentor_id, date, time) so the same date+time can't be published twice.
 *
 * Run:      node server/scripts/migrations/033_availability_slot_date_dedup.js
 * Rollback: node server/scripts/migrations/033_availability_slot_date_dedup.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 033: availability slot date + dedup');

  try {
    await qi.addColumn('availability_slots', 'date', { type: S.DATEONLY, allowNull: true });
    console.log('  ✓ Added availability_slots.date');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ availability_slots.date exists, skipping');
    else throw e;
  }

  // De-duplicate existing rows (keep the earliest per mentor/day/time; never
  // touch booked slots so we don't orphan a meeting).
  await sequelize.query(`
    DELETE FROM availability_slots a
    USING availability_slots b
    WHERE a.created_at > b.created_at
      AND a.mentor_id = b.mentor_id
      AND a.day = b.day
      AND a.time = b.time
      AND a.taken = false
  `);
  console.log('  ✓ De-duplicated existing day/time slots');

  await qi.addIndex('availability_slots', ['mentor_id', 'date', 'time'], {
    unique: true, name: 'uq_slot_mentor_date_time'
  }).then(() => console.log('  ✓ Added unique index (mentor_id, date, time)'))
    .catch((e) => { if (/already exists/i.test(e.message)) console.log('  ℹ unique index exists, skipping'); else throw e; });

  console.log('✅ Migration 033 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 033');
  await qi.removeIndex('availability_slots', 'uq_slot_mentor_date_time').catch(() => {});
  await qi.removeColumn('availability_slots', 'date').catch((e) => { if (!/does not exist/.test(e.message)) throw e; });
  console.log('✅ Rollback 033 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
