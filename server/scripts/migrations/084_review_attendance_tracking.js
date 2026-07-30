/**
 * Migration: 084_review_attendance_tracking
 *
 * Adds cohort_review_sessions.attendance_tracking (BOOLEAN, default false).
 * When a mentor turns this on for a live review, mentees who join are
 * auto-marked present. Default OFF so a general call records no attendance.
 *
 * Additive + defaulted — existing sessions keep working (attendance off).
 *
 * Run:      node server/scripts/migrations/084_review_attendance_tracking.js
 * Rollback: node server/scripts/migrations/084_review_attendance_tracking.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TABLE = 'cohort_review_sessions';
const COLUMN = 'attendance_tracking';

async function columnExists(transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = '${TABLE}' AND column_name = '${COLUMN}'`,
    { transaction }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 084: review attendance tracking');
  await sequelize.transaction(async (transaction) => {
    if (await columnExists(transaction)) {
      console.log(`  ℹ ${TABLE}.${COLUMN} exists, skipping`);
    } else {
      await qi.addColumn(TABLE, COLUMN, { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, { transaction });
      console.log(`  ✓ Added ${TABLE}.${COLUMN}`);
    }
  });
  console.log('✅ Migration 084 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 084');
  await sequelize.transaction(async (transaction) => {
    if (await columnExists(transaction)) {
      await qi.removeColumn(TABLE, COLUMN, { transaction });
      console.log(`  ✓ Dropped ${TABLE}.${COLUMN}`);
    }
  });
  console.log('✅ Rollback 084 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
