/**
 * Migration: 087_clan_whatsapp_link
 *
 * Adds `whatsapp_group_link` (nullable) to `clans` — an optional WhatsApp group
 * invite link surfaced to a new mentee (acceptance email + in-app) so they can
 * join their clan's group. Additive; existing clans keep it null.
 *
 * Run:      node server/scripts/migrations/087_clan_whatsapp_link.js
 * Rollback: node server/scripts/migrations/087_clan_whatsapp_link.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 087: clan WhatsApp link');
  await sequelize.transaction(async (t) => {
    if (await columnExists('clans', 'whatsapp_group_link', t)) {
      console.log('  ℹ clans.whatsapp_group_link exists, skipping');
    } else {
      await qi.addColumn('clans', 'whatsapp_group_link', { type: Sequelize.STRING(500), allowNull: true }, { transaction: t });
      console.log('  ✓ Added clans.whatsapp_group_link');
    }
  });
  console.log('✅ Migration 087 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 087');
  await sequelize.transaction(async (t) => {
    if (await columnExists('clans', 'whatsapp_group_link', t)) {
      await qi.removeColumn('clans', 'whatsapp_group_link', { transaction: t });
      console.log('  ✓ Dropped clans.whatsapp_group_link');
    }
  });
  console.log('✅ Rollback 087 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
