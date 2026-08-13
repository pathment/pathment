/**
 * Migration: 089_mentee_transfer_requests
 *
 * Mentor-to-mentor mentee transfers reuse `clan_change_requests` (so admins keep
 * ONE queue) but need two more columns:
 *   - `origin`      'admin' | 'mentor' — who raised it, so the admin view can
 *                   tell a console-created request from a mentor's ask.
 *   - `resolved_at` when it was accepted/rejected (the table only recorded WHO).
 *
 * Also adds a (to_clan_id, status) index: the receiving mentor's inbox queries
 * "pending requests addressed to my clans" on every clan-team load.
 *
 * Additive and idempotent; existing rows default to origin='admin'.
 * The new 'cancelled' status needs no DDL — status is a plain VARCHAR validated
 * in the model.
 *
 * Run:      node server/scripts/migrations/089_mentee_transfer_requests.js
 * Rollback: node server/scripts/migrations/089_mentee_transfer_requests.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`, { transaction: t });
  return r.length > 0;
}
async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, { transaction: t });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 089: mentee transfer requests');
  await sequelize.transaction(async (t) => {
    if (await columnExists('clan_change_requests', 'origin', t)) {
      console.log('  ℹ clan_change_requests.origin exists, skipping');
    } else {
      await qi.addColumn('clan_change_requests', 'origin', {
        type: Sequelize.STRING(20), allowNull: false, defaultValue: 'admin',
      }, { transaction: t });
      console.log('  ✓ Added clan_change_requests.origin');
    }

    if (await columnExists('clan_change_requests', 'resolved_at', t)) {
      console.log('  ℹ clan_change_requests.resolved_at exists, skipping');
    } else {
      await qi.addColumn('clan_change_requests', 'resolved_at', {
        type: Sequelize.DATE, allowNull: true,
      }, { transaction: t });
      console.log('  ✓ Added clan_change_requests.resolved_at');
      // Backfill: anything already decided was decided at its last update.
      await sequelize.query(
        `UPDATE clan_change_requests SET resolved_at = updated_at
           WHERE status IN ('approved','denied') AND resolved_at IS NULL`,
        { transaction: t }
      );
      console.log('  ✓ Backfilled resolved_at for already-decided requests');
    }

    const idx = 'clan_change_requests_to_clan_id_status';
    if (await indexExists(idx, t)) {
      console.log(`  ℹ ${idx} exists, skipping`);
    } else {
      await qi.addIndex('clan_change_requests', ['to_clan_id', 'status'], { name: idx, transaction: t });
      console.log(`  ✓ Added index ${idx}`);
    }
  });
  console.log('✅ Migration 089 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 089');
  await sequelize.transaction(async (t) => {
    const idx = 'clan_change_requests_to_clan_id_status';
    if (await indexExists(idx, t)) { await qi.removeIndex('clan_change_requests', idx, { transaction: t }); console.log(`  ✓ Dropped ${idx}`); }
    if (await columnExists('clan_change_requests', 'resolved_at', t)) { await qi.removeColumn('clan_change_requests', 'resolved_at', { transaction: t }); console.log('  ✓ Dropped resolved_at'); }
    if (await columnExists('clan_change_requests', 'origin', t)) { await qi.removeColumn('clan_change_requests', 'origin', { transaction: t }); console.log('  ✓ Dropped origin'); }
  });
  console.log('✅ Rollback 089 complete');
}

// Guarded, because the runner requires this file to reach up(). Unguarded, the
// require itself ran the migration and then exited the process, so every later
// migration in the run was silently skipped.
if (require.main === module) {
  (async () => {
    try {
      await (process.argv.includes('--rollback') ? down() : up());
      process.exit(0);
    } catch (err) {
      console.error('❌ Migration 089 failed:', err);
      process.exit(1);
    }
  })();
}

module.exports = { up, down };
