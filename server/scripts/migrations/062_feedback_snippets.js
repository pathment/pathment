/**
 * Migration: 062_feedback_snippets
 *
 * Per-mentor saved feedback snippets — short reusable bits of review feedback a
 * mentor can insert into either review drawer (single or bulk). Backs Phase 2 of
 * mentor feedback alongside the AI-drafted feedback feature. `label` is a short
 * human title shown in the Snippets menu; `body` is the inserted text.
 *
 * Run:      node server/scripts/migrations/062_feedback_snippets.js
 * Rollback: node server/scripts/migrations/062_feedback_snippets.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 062: feedback_snippets');
  await qi.createTable('feedback_snippets', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    mentor_id: { type: S.UUID, allowNull: false },
    label: { type: S.STRING(80), allowNull: false },
    body: { type: S.TEXT, allowNull: false },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created feedback_snippets')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ feedback_snippets exists, skipping'); else throw e;
  });

  await qi.addIndex('feedback_snippets', ['mentor_id']).catch(() => {});
  console.log('✅ Migration 062 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('feedback_snippets').catch(() => {});
  console.log('✅ Rollback 062 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
