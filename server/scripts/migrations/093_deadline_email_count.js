/**
 * Migration: 093_deadline_email_count
 *
 * `notificationScheduler.notifyDeadlinePassed()` re-scans every overdue,
 * still-open AssignedTask on each scheduler tick and re-dispatches the
 * "deadline passed" notification every single time — with no cap, a task
 * left overdue for weeks sends the mentee (and mentor) one email per tick
 * forever. `deadline_email_count` tracks how many times this specific task
 * has already triggered a deadline-passed notification, so the scheduler can
 * stop after a bounded number of sends (2) instead of spamming indefinitely.
 *
 * Additive and idempotent. Existing rows default to 0 (never notified yet),
 * which is the correct/safe interpretation for tasks created before this
 * column existed.
 *
 * Run:      node server/scripts/migrations/093_deadline_email_count.js
 * Rollback: node server/scripts/migrations/093_deadline_email_count.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
    { transaction: t }
  );
  return r.length > 0;
}

const COLUMNS = [
  ['deadline_email_count', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 093: deadline email count');
  await sequelize.transaction(async (t) => {
    for (const [name, spec] of COLUMNS) {
      if (await columnExists('assigned_tasks', name, t)) {
        console.log(`  ℹ assigned_tasks.${name} exists, skipping`);
      } else {
        await qi.addColumn('assigned_tasks', name, spec, { transaction: t });
        console.log(`  ✓ Added assigned_tasks.${name}`);
      }
    }
  });
  console.log('✅ Migration 093 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 093');
  await sequelize.transaction(async (t) => {
    for (const [name] of [...COLUMNS].reverse()) {
      if (await columnExists('assigned_tasks', name, t)) {
        await qi.removeColumn('assigned_tasks', name, { transaction: t });
        console.log(`  ✓ Dropped assigned_tasks.${name}`);
      }
    }
  });
  console.log('✅ Rollback 093 complete');
}

if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 093 failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };