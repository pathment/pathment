/**
 * Migration: 077_intake_ai_scoring
 *
 * Admissions scoring upgrade — lets admins AI-score open-ended assessment
 * answers (per-question + a holistic overall) against rubrics they write, and
 * gate a cohort on a pass threshold. All columns are additive + nullable, so
 * existing intakes/assessments are untouched and valid immediately.
 *
 *  - assessment_questions.rubric      TEXT   per-question grading guidance the AI
 *                                            scores an open-ended answer against.
 *  - assessments.ai_rubric            TEXT   holistic "what a strong candidate
 *                                            looks like" guidance for the overall
 *                                            0-100 fit score + summary.
 *  - assessment_submissions.ai_draft  JSONB  AI results (a SUGGESTION, never the
 *                                            final score): { perQuestion: {
 *                                            [qid]: { score, note } }, overall,
 *                                            summary, model, at }.
 *  - cohorts.pass_threshold           DECIMAL(5,2)  percent (0-100); an applicant
 *                                            passes when total/max*100 >= this.
 *                                            null = no gate.
 *
 * Run:      node server/scripts/migrations/077_intake_ai_scoring.js
 * Rollback: node server/scripts/migrations/077_intake_ai_scoring.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function columnExists(table, column, transaction) {
  const [rows] = await sequelize.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = '${table}' AND column_name = '${column}'`,
    { transaction }
  );
  return rows.length > 0;
}

const COLUMNS = [
  ['assessment_questions', 'rubric', { type: Sequelize.TEXT, allowNull: true }],
  ['assessments', 'ai_rubric', { type: Sequelize.TEXT, allowNull: true }],
  ['assessment_submissions', 'ai_draft', { type: Sequelize.JSONB, allowNull: true }],
  ['cohorts', 'pass_threshold', { type: Sequelize.DECIMAL(5, 2), allowNull: true }],
];

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 077: intake AI scoring + pass threshold');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column, spec] of COLUMNS) {
      if (await columnExists(table, column, transaction)) {
        console.log(`  ℹ ${table}.${column} exists, skipping`);
      } else {
        await qi.addColumn(table, column, spec, { transaction });
        console.log(`  ✓ Added ${table}.${column}`);
      }
    }
  });
  console.log('✅ Migration 077 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 077');
  await sequelize.transaction(async (transaction) => {
    for (const [table, column] of [...COLUMNS].reverse()) {
      if (await columnExists(table, column, transaction)) {
        await qi.removeColumn(table, column, { transaction });
        console.log(`  ✓ Dropped ${table}.${column}`);
      }
    }
  });
  console.log('✅ Rollback 077 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
