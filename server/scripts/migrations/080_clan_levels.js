/**
 * Migration: 080_clan_levels
 *
 * Clans can now declare which cohort levels they serve, so accepted candidates
 * can be matched to a clan by level at assign time. A clan may serve MORE than
 * one level, so this is an array of level keys (matching a cohort's `levels`
 * keys, e.g. ['beginner','intermediate']).
 *
 *  - clans.levels  TEXT[]  the level keys this clan serves. Empty = serves any
 *                          level (no level constraint), so existing clans keep
 *                          working unchanged.
 *
 * Additive + defaulted — existing clans stay valid and unconstrained.
 *
 * Run:      node server/scripts/migrations/080_clan_levels.js
 * Rollback: node server/scripts/migrations/080_clan_levels.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['clans', 'levels', { type: Sequelize.ARRAY(Sequelize.STRING(40)), allowNull: false, defaultValue: [] }],
];

async function columnExists(table, column, transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
    { transaction }
  );
  return rows.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 080: clan levels');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column, spec] of COLUMNS) {
      if (await columnExists(table, column, transaction)) {
        console.log(`  ℹ ${table}.${column} exists, skipping`);
      } else {
        await qi.addColumn(table, column, spec, { transaction });
        console.log(`  ✓ Added ${table}.${column}`);
      }
    }
  });
  console.log('✅ Migration 080 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 080');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await columnExists(table, column, transaction)) {
        await qi.removeColumn(table, column, { transaction });
        console.log(`  ✓ Dropped ${table}.${column}`);
      }
    }
  });
  console.log('✅ Rollback 080 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
