/**
 * Migration: 061_cohort_review_edit_access
 *
 * Mentor edit/delete requests when cohort review deletion is locked, plus
 * time-bound clan-wide unlock grants.
 *
 * Run:      node server/scripts/migrations/061_cohort_review_edit_access.js
 * Rollback: node server/scripts/migrations/061_cohort_review_edit_access.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 061: cohort review edit access');

  try {
    await qi.createTable('cohort_review_edit_requests', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      mentor_id: { type: Sequelize.UUID, allowNull: false },
      session_id: { type: Sequelize.UUID, allowNull: false },
      clan_id: { type: Sequelize.UUID, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'pending' },
      resolution_note: { type: Sequelize.TEXT, allowNull: true },
      resolved_by: { type: Sequelize.UUID, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await qi.addIndex('cohort_review_edit_requests', ['mentor_id', 'session_id'], { name: 'cohort_review_edit_req_mentor_session_idx' });
    await qi.addIndex('cohort_review_edit_requests', ['status'], { name: 'cohort_review_edit_req_status_idx' });
    console.log('  ✓ created cohort_review_edit_requests');
  } catch (e) {
    if (!/already exists/i.test(e.message)) throw e;
    console.log('  ℹ cohort_review_edit_requests exists, skipping');
  }

  try {
    await qi.createTable('cohort_review_clan_grants', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clan_id: { type: Sequelize.UUID, allowNull: false },
      granted_by: { type: Sequelize.UUID, allowNull: false },
      note: { type: Sequelize.TEXT, allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    await qi.addIndex('cohort_review_clan_grants', ['clan_id'], { name: 'cohort_review_clan_grants_clan_idx' });
    await qi.addIndex('cohort_review_clan_grants', ['expires_at'], { name: 'cohort_review_clan_grants_expires_idx' });
    console.log('  ✓ created cohort_review_clan_grants');
  } catch (e) {
    if (!/already exists/i.test(e.message)) throw e;
    console.log('  ℹ cohort_review_clan_grants exists, skipping');
  }

  console.log('✅ Migration 061 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  try { await qi.dropTable('cohort_review_clan_grants'); console.log('  ✓ dropped cohort_review_clan_grants'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  try { await qi.dropTable('cohort_review_edit_requests'); console.log('  ✓ dropped cohort_review_edit_requests'); } catch (e) { if (!/does not exist/.test(e.message)) throw e; }
}

if (require.main === module) {
  const rollback = process.argv.includes('--rollback');
  sequelize.authenticate()
    .then(() => (rollback ? down() : up()))
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { up, down };
