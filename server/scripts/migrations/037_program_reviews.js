/**
 * Migration: 037_program_reviews
 * Creates the program_reviews table (the model existed but was never migrated)
 * to back anonymous, structured mentee→mentor feedback at program completion.
 * Adds mentor_id (who is being reviewed) + dimensions JSONB (per-behaviour
 * scores: responsiveness/helpfulness/clarity/support).
 *
 * Run:      node server/scripts/migrations/037_program_reviews.js
 * Rollback: node server/scripts/migrations/037_program_reviews.js --rollback
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 037: program_reviews');
  await qi.createTable('program_reviews', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    program_id: { type: S.UUID, allowNull: false },
    reviewer_id: { type: S.UUID, allowNull: false },
    mentor_id: { type: S.UUID },
    enrollment_id: { type: S.UUID },
    rating: { type: S.DECIMAL(3, 2), allowNull: false },
    review_text: { type: S.TEXT },
    content_quality_rating: { type: S.DECIMAL(3, 2) },
    mentor_quality_rating: { type: S.DECIMAL(3, 2) },
    difficulty_rating: { type: S.DECIMAL(3, 2) },
    dimensions: { type: S.JSONB, allowNull: false, defaultValue: {} },
    would_recommend: { type: S.BOOLEAN },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  }).then(() => console.log('  ✓ Created program_reviews')).catch((e) => {
    if (/already exists/i.test(e.message)) console.log('  ℹ program_reviews exists, skipping'); else throw e;
  });

  // The model predated this migration, so the table may already exist (created
  // by a sequelize sync) WITHOUT the new columns. Add them idempotently.
  const cols = await qi.describeTable('program_reviews').catch(() => ({}));
  if (!cols.mentor_id) {
    await qi.addColumn('program_reviews', 'mentor_id', { type: S.UUID }).then(() => console.log('  ✓ Added mentor_id'));
  }
  if (!cols.dimensions) {
    await qi.addColumn('program_reviews', 'dimensions', { type: S.JSONB, allowNull: false, defaultValue: {} }).then(() => console.log('  ✓ Added dimensions'));
  }

  await qi.addIndex('program_reviews', ['program_id', 'reviewer_id'], { unique: true, name: 'program_reviews_program_reviewer_uniq' }).catch(() => {});
  await qi.addIndex('program_reviews', ['mentor_id']).catch(() => {});
  await qi.addIndex('program_reviews', ['reviewer_id']).catch(() => {});
  console.log('✅ Migration 037 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('program_reviews').catch(() => {});
  console.log('✅ Rollback 037 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
