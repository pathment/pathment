/**
 * Migration: 162_selection_on_the_clan
 *
 * A selection round is a clan (migration 160), so the ranking and the decision
 * have to hang off the clan rather than off a `candidate_pools` row.
 *
 *  - candidate_pool_members.clan_id             the round this record belongs to
 *  - candidate_pool_members.clan_membership_id  the membership it was opened from
 *  - candidate_pool_members.pool_id             no longer required
 *  - clans.selection_settings                   quota, waitlist, points curve, deadline
 *
 * `PoolMember` stays — it is the SELECTION record, not the membership record.
 * A decision, its reason, the confirmed score, the rank and the placement
 * attempt all live on it, and none of that belongs on a clan membership. It
 * simply points at a clan now instead of a pool.
 *
 * `pool_id` becomes nullable rather than disappearing: the two live rounds
 * still read it until they are migrated (phase 5), and both shapes have to be
 * readable for one release.
 *
 * The unique key per round follows: one record per email per clan, matching
 * the (pool_id, email) key the pool path has. It is partial, so the pool rows
 * (clan_id NULL) are untouched by it.
 *
 * Run:      node server/scripts/migrations/162_selection_on_the_clan.js
 * Rollback: node server/scripts/migrations/162_selection_on_the_clan.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['candidate_pool_members', 'clan_id', { type: Sequelize.UUID, allowNull: true }],
  ['candidate_pool_members', 'clan_membership_id', { type: Sequelize.UUID, allowNull: true }],
  ['clans', 'selection_settings', { type: Sequelize.JSONB, allowNull: false, defaultValue: {} }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 162: selection on the clan');

  for (const [table, column, spec] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.addColumn(table, column, spec);
      console.log(`  ✓ Added ${table}.${column}`);
    } catch (e) {
      if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
      else throw e;
    }
  }

  await sequelize.query('ALTER TABLE candidate_pool_members ALTER COLUMN pool_id DROP NOT NULL');
  console.log('  ✓ candidate_pool_members.pool_id is nullable');

  await sequelize.query(
    'CREATE INDEX IF NOT EXISTS candidate_pool_members_clan_idx ON candidate_pool_members (clan_id)',
  );
  await sequelize.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS candidate_pool_members_clan_email_idx '
    + 'ON candidate_pool_members (clan_id, email) WHERE clan_id IS NOT NULL',
  );
  console.log('  ✓ Indexes candidate_pool_members_clan_idx, candidate_pool_members_clan_email_idx');

  console.log('✅ Migration 162 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 162');

  await sequelize.query('DROP INDEX IF EXISTS candidate_pool_members_clan_email_idx');
  await sequelize.query('DROP INDEX IF EXISTS candidate_pool_members_clan_idx');

  // Dropping clan_id while records point at a clan round would leave those
  // records unreachable rather than undone, so this refuses instead.
  const [[{ onClans }]] = await sequelize.query(
    'SELECT COUNT(*)::int AS "onClans" FROM candidate_pool_members WHERE clan_id IS NOT NULL',
  );
  if (onClans > 0) {
    throw new Error(
      `${onClans} selection record(s) belong to a clan round. Move or delete them before rolling back 162.`,
    );
  }
  await sequelize.query('ALTER TABLE candidate_pool_members ALTER COLUMN pool_id SET NOT NULL');
  console.log('  ✓ candidate_pool_members.pool_id is required again');

  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 162 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
