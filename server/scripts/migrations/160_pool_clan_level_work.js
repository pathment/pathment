/**
 * Migration: 160_pool_clan_level_work
 *
 * A selection round is a clan (`clans.kind = 'pool'`). Two additive columns
 * give it the one thing an ordinary clan has no need of: work chosen by the
 * level each member arrived at.
 *
 *  - clans.level_rules            [{ level, roadmapId, stepIndexes? }] — what
 *                                 each level does. JSONB rather than a join
 *                                 table because it is edited as one list under
 *                                 a row lock, exactly as the old pool's
 *                                 `work_items` was.
 *  - clan_memberships.level       the level this member joined at. Null for
 *                                 every ordinary clan membership, and for a
 *                                 candidate nobody has levelled yet — who
 *                                 therefore gets no work rather than all of it.
 *
 * Both nullable (the list defaults to empty), so the running code ignores them.
 *
 * Run:      node server/scripts/migrations/160_pool_clan_level_work.js
 * Rollback: node server/scripts/migrations/160_pool_clan_level_work.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const COLUMNS = [
  ['clans', 'level_rules', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }],
  ['clan_memberships', 'level', { type: Sequelize.STRING(40), allowNull: true }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 160: pool clan level work');
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
  // Finding a round's members by level is the hot path on its roster screen.
  await sequelize.query(
    'CREATE INDEX IF NOT EXISTS clan_memberships_clan_level_idx ON clan_memberships (clan_id, level)'
  );
  console.log('  ✓ Index clan_memberships_clan_level_idx');
  console.log('✅ Migration 160 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 160');
  await sequelize.query('DROP INDEX IF EXISTS clan_memberships_clan_level_idx');
  for (const [table, column] of COLUMNS) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await qi.removeColumn(table, column);
      console.log(`  ✓ Dropped ${table}.${column}`);
    } catch (e) {
      if (!/does not exist|no such column/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Rollback 160 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
