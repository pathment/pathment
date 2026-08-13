/**
 * Migration: 091_device_tokens
 *
 * Push had no target. Nothing in the schema stored a device, so the mobile app
 * could ask for permission and get a token and then have nowhere to send it,
 * and the orchestrator had nothing to push to. This adds the registry:
 *
 *   - `token`         the push token itself, UNIQUE. A device that moves between
 *                     accounts re-points to the new user rather than creating a
 *                     second row that would deliver someone else's notification.
 *   - `user_id`       who this device currently belongs to.
 *   - `platform`      'android' | 'ios' | 'web', so a delivery failure can be
 *                     read per platform rather than as one number.
 *   - `last_seen_at`  bumped on every registration. A device silent for months
 *                     can be pruned on evidence instead of a guess.
 *   - `disabled_at`   set when the push service reports the token dead. Kept
 *                     rather than deleted, because "we stopped sending and here
 *                     is when" is diagnosable and a missing row is not.
 *
 * Per device rather than per user is the whole point: someone signed in on a
 * phone and a tablet expects both to buzz, and signing out of one must not
 * silence the other.
 *
 * Run:      node server/scripts/migrations/091_device_tokens.js
 * Rollback: node server/scripts/migrations/091_device_tokens.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function tableExists(table, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name='${table}'`,
    { transaction: t }
  );
  return r.length > 0;
}

async function indexExists(name, t) {
  const [r] = await sequelize.query(`SELECT 1 FROM pg_indexes WHERE indexname='${name}'`, {
    transaction: t
  });
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 091: device tokens');

  await sequelize.transaction(async (t) => {
    if (await tableExists('device_tokens', t)) {
      console.log('  ℹ device_tokens exists, skipping create');
    } else {
      await qi.createTable(
        'device_tokens',
        {
          id: {
            type: Sequelize.UUID,
            defaultValue: Sequelize.literal('gen_random_uuid()'),
            primaryKey: true
          },
          user_id: {
            type: Sequelize.UUID,
            allowNull: false,
            references: { model: 'users', key: 'id' },
            onDelete: 'CASCADE'
          },
          token: { type: Sequelize.TEXT, allowNull: false, unique: true },
          platform: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'android' },
          last_seen_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()')
          },
          disabled_at: { type: Sequelize.DATE, allowNull: true },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('NOW()')
          }
        },
        { transaction: t }
      );
      console.log('  ✓ Created device_tokens');
    }

    if (await indexExists('device_tokens_user_id_idx', t)) {
      console.log('  ℹ device_tokens_user_id_idx exists, skipping');
    } else {
      await qi.addIndex('device_tokens', ['user_id'], {
        name: 'device_tokens_user_id_idx',
        transaction: t
      });
      console.log('  ✓ Added device_tokens_user_id_idx');
    }
  });

  console.log('✓ Migration 091 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 091');

  await sequelize.transaction(async (t) => {
    if (await tableExists('device_tokens', t)) {
      await qi.dropTable('device_tokens', { transaction: t });
      console.log('  ✓ Dropped device_tokens');
    } else {
      console.log('  ℹ device_tokens does not exist, nothing to drop');
    }
  });

  console.log('✓ Rollback 091 complete');
}

// Guarded, because the runner requires this file to reach up(). Unguarded, the
// require itself ran the migration and then exited the process, so every later
// migration in the run was silently skipped.
if (require.main === module) {
  const rollback = process.argv.includes('--rollback');

  (rollback ? down() : up())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('✗ Migration 091 failed:', error.message);
      process.exit(1);
    });
}

module.exports = { up, down };
