/**
 * Migration: 036_ai_connection_owner
 * Scopes AI connections to an owner: owner_id NULL = org-wide (admin-managed),
 * owner_id set = that mentor's personal connection.
 *
 * Run:      node server/scripts/migrations/036_ai_connection_owner.js
 * Rollback: node server/scripts/migrations/036_ai_connection_owner.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 036: ai_connections.owner_id');
  try {
    await qi.addColumn('ai_connections', 'owner_id', { type: Sequelize.UUID, allowNull: true });
    console.log('  ✓ Added ai_connections.owner_id');
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log('  ℹ owner_id exists, skipping');
    else throw e;
  }
  await qi.addIndex('ai_connections', ['owner_id']).catch(() => {});
  console.log('✅ Migration 036 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('ai_connections', 'owner_id').catch((e) => { if (!/does not exist/.test(e.message)) throw e; });
  console.log('✅ Rollback 036 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
