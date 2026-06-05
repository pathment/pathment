/**
 * Migration: 043_intake_public_and_assessments
 *
 * Extends the intake pipeline with self-serve registration:
 *   - cohorts: a shareable PUBLIC intake link (slug + on/off + validity window +
 *     application cap) and an optional attached assessment.
 *   - applications: an applicant magic-link token (so a not-yet-registered person
 *     can return to track status / take the assessment) + assessment timestamp.
 *   - assessments / assessment_questions / assessment_submissions: an admin-built,
 *     mixed-type assessment (MCQ auto-graded, text, file upload, external link)
 *     that an applicant completes before review.
 *
 * Run:      node server/scripts/migrations/043_intake_public_and_assessments.js
 * Rollback: node server/scripts/migrations/043_intake_public_and_assessments.js --rollback
 */

const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(process.env.DATABASE_URL, { logging: false });

async function addColumn(qi, table, column, spec) {
  try {
    await qi.addColumn(table, column, spec);
    console.log(`  ✓ Added ${table}.${column}`);
  } catch (e) {
    if (/already exists|duplicate column/i.test(e.message)) console.log(`  ℹ ${table}.${column} exists, skipping`);
    else throw e;
  }
}

async function createTable(qi, name, spec) {
  try {
    await qi.createTable(name, spec);
    console.log(`  ✓ Created ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`);
    else throw e;
  }
}

async function up() {
  const qi = sequelize.getQueryInterface();
  const S = Sequelize;
  console.log('▶ Running migration 043: public intake + assessments');

  // ── cohorts: public intake link + assessment attachment ────────────────────
  await addColumn(qi, 'cohorts', 'public_slug', { type: S.STRING(64), allowNull: true });
  await addColumn(qi, 'cohorts', 'public_enabled', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  await addColumn(qi, 'cohorts', 'apply_opens_at', { type: S.DATE, allowNull: true });
  await addColumn(qi, 'cohorts', 'apply_closes_at', { type: S.DATE, allowNull: true });
  await addColumn(qi, 'cohorts', 'max_applications', { type: S.INTEGER, allowNull: true });
  await addColumn(qi, 'cohorts', 'intake_form_schema', { type: S.JSONB, allowNull: false, defaultValue: [] });
  await addColumn(qi, 'cohorts', 'assessment_id', { type: S.UUID, allowNull: true });
  await addColumn(qi, 'cohorts', 'assessment_required', { type: S.BOOLEAN, allowNull: false, defaultValue: false });
  await qi.addIndex('cohorts', ['public_slug'], { unique: true, name: 'cohorts_public_slug_uniq' }).catch(() => {});

  // ── applications: applicant magic-link + assessment timestamp ───────────────
  await addColumn(qi, 'applications', 'access_token_hash', { type: S.STRING(255), allowNull: true });
  await addColumn(qi, 'applications', 'access_token_expires_at', { type: S.DATE, allowNull: true });
  await addColumn(qi, 'applications', 'assessment_submitted_at', { type: S.DATE, allowNull: true });
  await qi.addIndex('applications', ['access_token_hash'], { name: 'applications_access_token_idx' }).catch(() => {});

  // ── assessments ────────────────────────────────────────────────────────────
  await createTable(qi, 'assessments', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    title: { type: S.STRING(255), allowNull: false },
    description: { type: S.TEXT },
    instructions: { type: S.TEXT },
    program_id: { type: S.UUID, allowNull: true },
    passing_score: { type: S.DECIMAL(6, 2), allowNull: true },
    time_limit_mins: { type: S.INTEGER, allowNull: true },
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'draft' },
    created_by: { type: S.UUID, allowNull: true },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  });
  await qi.addIndex('assessments', ['program_id']).catch(() => {});
  await qi.addIndex('assessments', ['status']).catch(() => {});

  // ── assessment_questions ───────────────────────────────────────────────────
  await createTable(qi, 'assessment_questions', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    assessment_id: { type: S.UUID, allowNull: false },
    // mcq | multi_select | short_text | long_text | file_upload | external_link
    type: { type: S.STRING(20), allowNull: false },
    prompt: { type: S.TEXT, allowNull: false },
    position: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
    required: { type: S.BOOLEAN, allowNull: false, defaultValue: true },
    points: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
    options: { type: S.JSONB, allowNull: false, defaultValue: [] },        // [{id,label}]
    correct_option_ids: { type: S.JSONB, allowNull: false, defaultValue: [] }, // [id] for auto-grade
    config: { type: S.JSONB, allowNull: false, defaultValue: {} },          // {maxLength, acceptTypes,...}
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  });
  await qi.addIndex('assessment_questions', ['assessment_id']).catch(() => {});

  // ── assessment_submissions ─────────────────────────────────────────────────
  await createTable(qi, 'assessment_submissions', {
    id: { type: S.UUID, defaultValue: S.UUIDV4, primaryKey: true },
    assessment_id: { type: S.UUID, allowNull: false },
    application_id: { type: S.UUID, allowNull: false },
    // { [questionId]: { optionIds?, text?, fileUrl?, fileName?, link? } }
    answers: { type: S.JSONB, allowNull: false, defaultValue: {} },
    auto_score: { type: S.DECIMAL(6, 2), allowNull: true },     // sum of auto-graded points
    manual_score: { type: S.DECIMAL(6, 2), allowNull: true },   // admin override for manual items
    total_score: { type: S.DECIMAL(6, 2), allowNull: true },    // final (auto + manual)
    max_score: { type: S.DECIMAL(6, 2), allowNull: true },      // total possible
    status: { type: S.STRING(20), allowNull: false, defaultValue: 'in_progress' }, // in_progress|submitted|graded
    submitted_at: { type: S.DATE, allowNull: true },
    graded_at: { type: S.DATE, allowNull: true },
    graded_by: { type: S.UUID, allowNull: true },
    created_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') },
    updated_at: { type: S.DATE, allowNull: false, defaultValue: S.fn('NOW') }
  });
  await qi.addIndex('assessment_submissions', ['assessment_id']).catch(() => {});
  await qi.addIndex('assessment_submissions', ['application_id']).catch(() => {});
  await qi.addIndex('assessment_submissions', ['assessment_id', 'application_id'], {
    unique: true, name: 'assessment_submissions_assessment_application_uniq'
  }).catch(() => {});

  console.log('✅ Migration 043 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 043');

  await qi.dropTable('assessment_submissions').then(() => console.log('  ✓ Dropped assessment_submissions')).catch(() => {});
  await qi.dropTable('assessment_questions').then(() => console.log('  ✓ Dropped assessment_questions')).catch(() => {});
  await qi.dropTable('assessments').then(() => console.log('  ✓ Dropped assessments')).catch(() => {});

  for (const col of ['access_token_hash', 'access_token_expires_at', 'assessment_submitted_at']) {
    try { await qi.removeColumn('applications', col); console.log(`  ✓ Dropped applications.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }
  for (const col of ['public_slug', 'public_enabled', 'apply_opens_at', 'apply_closes_at', 'max_applications', 'intake_form_schema', 'assessment_id', 'assessment_required']) {
    try { await qi.removeColumn('cohorts', col); console.log(`  ✓ Dropped cohorts.${col}`); }
    catch (e) { if (!/does not exist/.test(e.message)) throw e; }
  }

  console.log('✅ Rollback 043 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
