/**
 * Migration: 035_ai_connections
 * Stores admin-configured AI provider connections (bring-your-own-key). The raw
 * key is encrypted at rest; only a masked form is ever returned to the client.
 * Feature→connection routing is stored in system_settings (key 'ai.routing').
 *
 * Run:      node server/scripts/migrations/035_ai_connections.js
 * Rollback: node server/scripts/migrations/035_ai_connections.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 035: ai_connections');
  await qi.createTable('ai_connections', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    provider: { type: S.STRING(20), allowNull: false },
    label: { type: S.STRING(120), allowNull: false },
    model: { type: S.STRING(120) },
    base_url: { type: S.STRING(255) },
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'untested' },
    key_encrypted: { type: S.TEXT, allowNull: false },
    key_masked: { type: S.STRING(60) },
    created_by: { type: S.UUID },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created ai_connections')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ ai_connections exists, skipping'); else throw e;
  });
  console.log('✅ Migration 035 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('ai_connections').catch(() => {});
  console.log('✅ Rollback 035 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
