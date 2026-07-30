/**
 * Migration: 078_rubric_snippets
 *
 * Reusable grading-rubric snippets. Writing a good rubric is the hard part of
 * AI scoring, and the same wording ("full marks = a specific shipped project
 * AND their own role…") gets reused across questions, assessments and future
 * cohorts. Saving them as named snippets makes that reuse one click instead of
 * copy-paste, and keeps scoring consistent between intakes.
 *
 *  - rubric_snippets: org-wide library. `title` is how it's picked from the
 *    dropdown, `body` is the text inserted into a rubric field.
 *
 * Purely additive — a new table, nothing existing is touched.
 *
 * Run:      node server/scripts/migrations/078_rubric_snippets.js
 * Rollback: node server/scripts/migrations/078_rubric_snippets.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

const TABLE = 'rubric_snippets';

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 078: rubric snippets');

  const [existing] = await sequelize.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = '${TABLE}'`
  );
  if (existing.length) {
    console.log(`  ℹ ${TABLE} exists, skipping`);
  } else {
    await qi.createTable(TABLE, {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(160), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      created_by: { type: Sequelize.UUID, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
    });
    console.log(`  ✓ Created ${TABLE}`);
    try {
      await qi.addIndex(TABLE, ['title'], { name: 'rubric_snippets_title' });
      console.log('  ✓ Index rubric_snippets_title');
    } catch (e) {
      if (!/already exists/i.test(e.message)) throw e;
    }
  }
  console.log('✅ Migration 078 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 078');
  try {
    await qi.dropTable(TABLE);
    console.log(`  ✓ Dropped ${TABLE}`);
  } catch (e) {
    if (!/does not exist/i.test(e.message)) throw e;
  }
  console.log('✅ Rollback 078 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
