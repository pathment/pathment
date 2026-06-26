/**
 * Migration: 067_recurring_availability
 *
 * Recurring weekly 1:1 availability. A mentor sets their weekly hours once
 * (e.g. "Mon 18:00–21:00, Thu 09:00–21:00") and the booking system materializes
 * concrete bookable slots from those rules for the coming weeks.
 *
 *   availability_rules         one row per (mentor, weekday, time range)
 *   availability_slots.rule_id tags slots generated from a rule, so they can be
 *                              regenerated/cleaned up without touching the
 *                              one-off slots a mentor published by hand.
 *
 * Run:      node server/scripts/migrations/067_recurring_availability.js
 * Rollback: node server/scripts/migrations/067_recurring_availability.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 067: recurring availability');

  try {
    await qi.createTable('availability_rules', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      weekday: { type: Sequelize.INTEGER, allowNull: false },          // 0=Sun … 6=Sat
      start_time: { type: Sequelize.STRING(5), allowNull: false },     // '18:00'
      end_time: { type: Sequelize.STRING(5), allowNull: false },       // '21:00'
      slot_mins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 30 },
      timezone: { type: Sequelize.STRING(50), allowNull: true },
      active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log('  ✓ Created availability_rules');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ availability_rules exists, skipping'); else throw e;
  }

  try {
    await qi.addIndex('availability_rules', ['mentor_id'], { name: 'availability_rules_mentor_idx' });
    console.log('  ✓ Index availability_rules_mentor_idx');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ Index exists'); else throw e;
  }

  try {
    await qi.addColumn('availability_slots', 'rule_id', { type: Sequelize.UUID, allowNull: true });
    console.log('  ✓ Added availability_slots.rule_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ availability_slots.rule_id exists, skipping'); else throw e;
  }

  console.log('✅ Migration 067 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 067');
  try { await qi.removeColumn('availability_slots', 'rule_id'); console.log('  ✓ Dropped availability_slots.rule_id'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  try { await qi.dropTable('availability_rules'); console.log('  ✓ Dropped availability_rules'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 067 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
