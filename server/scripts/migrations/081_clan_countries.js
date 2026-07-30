/**
 * Migration: 081_clan_countries
 *
 * Clans can declare which countries they serve, so intake candidates can be
 * matched to a clan by country (regional grouping). Like levels, a clan may
 * serve several; empty = serves any country (no constraint).
 *
 *  - clans.countries  TEXT[]  country names this clan serves (matched, lowercased,
 *                             against the applicant's stated country). Empty = any.
 *
 * Additive + defaulted — existing clans stay valid and unconstrained.
 *
 * Run:      node server/scripts/migrations/081_clan_countries.js
 * Rollback: node server/scripts/migrations/081_clan_countries.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['clans', 'countries', { type: Sequelize.ARRAY(Sequelize.STRING(80)), allowNull: false, defaultValue: [] }],
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
  console.log('▶ Running migration 081: clan countries');
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
  console.log('✅ Migration 081 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 081');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await columnExists(table, column, transaction)) {
        await qi.removeColumn(table, column, { transaction });
        console.log(`  ✓ Dropped ${table}.${column}`);
      }
    }
  });
  console.log('✅ Rollback 081 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
