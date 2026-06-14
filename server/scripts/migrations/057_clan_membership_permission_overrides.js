/**
 * Migration: 057_clan_membership_permission_overrides
 *
 * Co-mentors default to FULL lead-mentor parity (minus team management). A lead
 * mentor (or admin) can then revoke specific permissions for an individual
 * co-mentor — and that must hold no matter HOW the person became a co-mentor
 * (added to the team, accepted cross-clan cover, or granted the role via IAM).
 *
 * So overrides live in their own table keyed by (clan_id, user_id), independent
 * of the grant source. `denied` is the list of co-mentor permissions revoked for
 * that person in that clan. No row / empty list = full default access.
 *
 * (Supersedes the earlier draft of this migration that put the column on
 * clan_memberships; the table is source-independent. The old column is dropped
 * defensively below so re-running is safe.)
 *
 * Run:      node server/scripts/migrations/057_clan_membership_permission_overrides.js
 * Rollback: node server/scripts/migrations/057_clan_membership_permission_overrides.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 057: clan_member_permissions (co-mentor overrides)');

  const exists = await qi.showAllTables().then((t) => t.map(String).includes('clan_member_permissions'));
  if (exists) {
    console.log('  ℹ clan_member_permissions already exists, skipping table create');
  } else {
    await qi.createTable('clan_member_permissions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clan_id: { type: Sequelize.UUID, allowNull: false },
      user_id: { type: Sequelize.UUID, allowNull: false },
      // The co-mentor permission keys revoked for this person in this clan.
      denied: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      updated_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });
    await qi.addIndex('clan_member_permissions', ['clan_id', 'user_id'], { unique: true, name: 'clan_member_permissions_clan_user_uk' });
    await qi.addIndex('clan_member_permissions', ['user_id']);
    console.log('  ✓ Created clan_member_permissions');
  }

  // Drop the earlier (superseded) per-membership column if it exists.
  try {
    await qi.removeColumn('clan_memberships', 'permission_overrides');
    console.log('  ✓ Dropped superseded clan_memberships.permission_overrides');
  } catch (e) {
    if (/does not exist|no such column|unknown column/i.test(e.message)) console.log('  ℹ clan_memberships.permission_overrides not present, skipping');
    else throw e;
  }

  console.log('✅ Migration 057 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 057');
  try { await qi.dropTable('clan_member_permissions'); console.log('  ✓ Dropped clan_member_permissions'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 057 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
