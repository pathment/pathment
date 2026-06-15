/**
 * Migration: 058_blocker_title_text
 *
 * The mentee "Log a blocker" form is a free-form "What's blocking you?" box and
 * people naturally write a paragraph there — but `blockers.title` was
 * VARCHAR(255), so a longer note failed the INSERT with "value too long" and the
 * mentee just saw "Could not log blocker". Widen it to TEXT (no length cap).
 *
 * Run:      node server/scripts/migrations/058_blocker_title_text.js
 * Rollback: node server/scripts/migrations/058_blocker_title_text.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 058: blockers.title → TEXT');
  await qi.changeColumn('blockers', 'title', { type: Sequelize.TEXT, allowNull: false });
  console.log('  ✓ blockers.title is now TEXT');
  console.log('✅ Migration 058 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 058 (TEXT → VARCHAR(255))');
  // Truncates any rows already longer than 255 so the type change can't fail.
  await sequelize.query("UPDATE blockers SET title = LEFT(title, 255) WHERE length(title) > 255");
  await qi.changeColumn('blockers', 'title', { type: Sequelize.STRING(255), allowNull: false });
  console.log('✅ Rollback 058 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
