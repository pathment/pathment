/**
 * Migration: 066_feedback_reports
 *
 * In-app feedback / bug reporting. Any signed-in user (mentee / mentor / admin)
 * can report a bug, suggest something, or ask a question, optionally attaching a
 * screenshot or short clip. Admins triage from a list and move each report
 * through a status; the reporter is notified when it changes.
 *
 *   type        bug | suggestion | other
 *   status      open | in_review | planned | fixed | added | declined
 *   priority    low | normal | high
 *   page_url / user_agent   auto-captured context (where the issue happened)
 *   attachment_*            the screenshot / clip on Cloudinary
 *   resolution_note         the admin's reply shown back to the reporter
 *
 * Run:      node server/scripts/migrations/066_feedback_reports.js
 * Rollback: node server/scripts/migrations/066_feedback_reports.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 066: feedback reports');
  try {
    await qi.createTable('feedback_reports', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      reporter_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      reporter_role: { type: Sequelize.STRING(20), allowNull: true },
      type: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'bug' },
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'open' },
      priority: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'normal' },
      page_url: { type: Sequelize.STRING(500), allowNull: true },
      user_agent: { type: Sequelize.STRING(500), allowNull: true },
      attachment_url: { type: Sequelize.TEXT, allowNull: true },
      attachment_type: { type: Sequelize.STRING(20), allowNull: true },   // image | video | file
      attachment_name: { type: Sequelize.STRING(255), allowNull: true },
      resolution_note: { type: Sequelize.TEXT, allowNull: true },
      handled_by: { type: Sequelize.UUID, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      handled_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log('  ✓ Created feedback_reports');
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log('  ℹ feedback_reports exists, skipping'); else throw e;
  }

  const addIndex = async (fields, name) => {
    try { await qi.addIndex('feedback_reports', fields, { name }); console.log(`  ✓ Index ${name}`); }
    catch (e) { if (/already exists/i.test(e.message)) console.log(`  ℹ Index ${name} exists`); else throw e; }
  };
  await addIndex(['status'], 'feedback_reports_status_idx');
  await addIndex(['reporter_id'], 'feedback_reports_reporter_idx');
  await addIndex(['type'], 'feedback_reports_type_idx');

  console.log('✅ Migration 066 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 066');
  try { await qi.dropTable('feedback_reports'); console.log('  ✓ Dropped feedback_reports'); }
  catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  console.log('✅ Rollback 066 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
