/**
 * Migration: 097_delay_review_status
 *
 * Adds explicit review lifecycle to delay_events so mentors can reject a
 * pending delay without deleting the record (issue #699).
 *
 * Run:      node server/scripts/migrations/097_delay_review_status.js
 * Rollback: node server/scripts/migrations/097_delay_review_status.js --rollback
 */
const sequelize = require('./_db');

async function columnExists(table, column, t) {
  const [r] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name='${table}' AND column_name='${column}'`,
    { transaction: t }
  );
  return r.length > 0;
}

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 097: delay review status');

  await sequelize.transaction(async (t) => {
    if (!(await columnExists('delay_events', 'review_status', t))) {
      await qi.addColumn('delay_events', 'review_status', {
        type: sequelize.Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'pending',
      }, { transaction: t });
      console.log('  ✓ Added delay_events.review_status');
    }

    if (!(await columnExists('delay_events', 'rejection_reason', t))) {
      await qi.addColumn('delay_events', 'rejection_reason', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true,
      }, { transaction: t });
      console.log('  ✓ Added delay_events.rejection_reason');
    }

    if (!(await columnExists('delay_events', 'reviewed_at', t))) {
      await qi.addColumn('delay_events', 'reviewed_at', {
        type: sequelize.Sequelize.DATE,
        allowNull: true,
      }, { transaction: t });
      console.log('  ✓ Added delay_events.reviewed_at');
    }

    if (!(await columnExists('delay_events', 'reviewed_by', t))) {
      await qi.addColumn('delay_events', 'reviewed_by', {
        type: sequelize.Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      }, { transaction: t });
      console.log('  ✓ Added delay_events.reviewed_by');
    }

    await sequelize.query(
      `UPDATE delay_events SET review_status = 'accepted' WHERE accepted = true`,
      { transaction: t }
    );
    await sequelize.query(
      `UPDATE delay_events SET review_status = 'pending' WHERE accepted = false AND (review_status IS NULL OR review_status = 'pending')`,
      { transaction: t }
    );
  });

  console.log('✅ Migration 097 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 097');
  await sequelize.transaction(async (t) => {
    for (const col of ['reviewed_by', 'reviewed_at', 'rejection_reason', 'review_status']) {
      if (await columnExists('delay_events', col, t)) {
        await qi.removeColumn('delay_events', col, { transaction: t });
        console.log(`  ✓ Dropped delay_events.${col}`);
      }
    }
  });
}

if (require.main === module) {
  const rollback = process.argv.includes('--rollback');
  (rollback ? down() : up())
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
