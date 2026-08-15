/**
 * Migration: 093_clan_invite_link
 *
 * Adds a reusable, shareable clan-join link (`invite_slug` + `invite_enabled`)
 * so a lead mentor can copy one URL for Slack/WhatsApp instead of issuing a
 * per-email RegistrationInvite for every person.
 *
 * Run:      node server/scripts/migrations/093_clan_invite_link.js
 * Rollback: node server/scripts/migrations/093_clan_invite_link.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`, { transaction: t });
  return r.length > 0;
}

async function indexExists(name, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 093: clan invite link');
  await sequelize.transaction(async (t) => {
    if (await columnExists('clans', 'invite_slug', t)) {
      console.log('  ℹ clans.invite_slug exists, skipping');
    } else {
      await qi.addColumn('clans', 'invite_slug', { type: Sequelize.STRING(64), allowNull: true }, { transaction: t });
      console.log('  ✓ Added clans.invite_slug');
    }
    if (await columnExists('clans', 'invite_enabled', t)) {
      console.log('  ℹ clans.invite_enabled exists, skipping');
    } else {
      await qi.addColumn('clans', 'invite_enabled', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false,
      }, { transaction: t });
      console.log('  ✓ Added clans.invite_enabled');
    }
    if (await indexExists('clans_invite_slug_unique', t)) {
      console.log('  ℹ clans_invite_slug_unique exists, skipping');
    } else {
      await sequelize.query(
        'CREATE UNIQUE INDEX clans_invite_slug_unique ON clans (invite_slug) WHERE invite_slug IS NOT NULL',
        { transaction: t }
      );
      console.log('  ✓ Added unique index clans_invite_slug_unique');
    }
  });
  console.log('✅ Migration 093 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 093');
  await sequelize.transaction(async (t) => {
    if (await indexExists('clans_invite_slug_unique', t)) {
      await sequelize.query('DROP INDEX IF EXISTS clans_invite_slug_unique', { transaction: t });
      console.log('  ✓ Dropped clans_invite_slug_unique');
    }
    if (await columnExists('clans', 'invite_enabled', t)) {
      await qi.removeColumn('clans', 'invite_enabled', { transaction: t });
      console.log('  ✓ Dropped clans.invite_enabled');
    }
    if (await columnExists('clans', 'invite_slug', t)) {
      await qi.removeColumn('clans', 'invite_slug', { transaction: t });
      console.log('  ✓ Dropped clans.invite_slug');
    }
  });
  console.log('✅ Rollback 093 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
