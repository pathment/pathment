/**
 * Migration: 074_quiz_tasks
 *
 * Quiz-type tasks — a mentor authors a reusable **Quiz Kit** (an ordered set of
 * auto-gradable questions) and assigns it to a mentee as a `quiz` task. The mentee
 * takes it in a lightweight runner; the objective answers are graded instantly.
 * At assign time the mentor picks how it finalizes:
 *   - 'auto'   → the score posts to points/gamification the moment they submit.
 *   - 'review' → it lands in Approvals for the mentor to confirm/adjust first.
 *
 *  - quiz_kits         reusable quiz definition (author once, assign many).
 *  - quiz_questions    one row per question: single | multi | boolean | short.
 *                      options + correct_option_ids drive auto-grading; short
 *                      answers grade against accepted_answers (exact | keyword).
 *  - quiz_assignments  1:1 with an assigned_task of type 'quiz'; snapshots the
 *                      per-assignment options (evaluation mode, retake, timer…).
 *  - quiz_sessions     one attempt at a quiz assignment (auto_score / max_score).
 *  - quiz_answers      one row per question per session (snapshotted), with the
 *                      auto-grade result and any mentor override.
 *
 * `roadmap_tasks.type` gains the value 'quiz' (app-level enum in the model — the
 * column is already STRING(20), so no DB constraint change is needed here).
 *
 * Run:      node server/scripts/migrations/074_quiz_tasks.js
 * Rollback: node server/scripts/migrations/074_quiz_tasks.js --rollback
 */
const { Sequelize } = require('sequelize');
const sequelize = require('./_db');

async function createTable(qi, name, spec) {
  try {
    await qi.createTable(name, spec);
    console.log(`  ✓ Created ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ ${name} exists, skipping`);
    else throw e;
  }
}

async function addIndex(qi, table, cols, name, opts = {}) {
  try {
    await qi.addIndex(table, cols, { name, ...opts });
    console.log(`  ✓ Index ${name}`);
  } catch (e) {
    if (/already exists/i.test(e.message)) console.log(`  ℹ Index ${name} exists`);
    else throw e;
  }
}

const now = () => Sequelize.fn('NOW');
const TS = () => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: now() },
});

async function up() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Running migration 074: quiz tasks (kits + questions + assignments + sessions + answers)');

  await createTable(qi, 'quiz_kits', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    title: { type: Sequelize.STRING(255), allowNull: false },
    description: { type: Sequelize.TEXT, allowNull: true },
    created_by: { type: Sequelize.UUID, allowNull: false },
    program_id: { type: Sequelize.UUID, allowNull: true },
    clan_id: { type: Sequelize.UUID, allowNull: true },
    // Whole-quiz timer in seconds (null = untimed).
    time_limit_seconds: { type: Sequelize.INTEGER, allowNull: true },
    // Pass mark as a percentage 0–100 (null = no pass/fail line).
    pass_score: { type: Sequelize.INTEGER, allowNull: true },
    // Assign-drawer defaults (each overridable per assignment).
    shuffle_questions: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    show_answers: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    allow_retake_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    // 'auto' → finalize on submit; 'review' → mentor confirms in Approvals.
    evaluation_default: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'auto' },
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'draft' },
    settings: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'quiz_questions', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    kit_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'quiz_kits', key: 'id' }, onDelete: 'CASCADE' },
    position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // single | multi | boolean | short — all auto-gradable.
    kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'single' },
    prompt: { type: Sequelize.TEXT, allowNull: false },
    points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 5 },
    required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    // Choice questions: [{ id, label }]. correct_option_ids holds the answer key.
    options: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    correct_option_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    // Short-answer questions: accepted strings + how to match them.
    accepted_answers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    match_mode: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'exact' },
    // Shown to the mentee after grading (when show_answers is on).
    explanation: { type: Sequelize.TEXT, allowNull: true },
    config: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'quiz_assignments', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    assigned_task_id: { type: Sequelize.UUID, allowNull: false, unique: true, references: { model: 'assigned_tasks', key: 'id' }, onDelete: 'CASCADE' },
    kit_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'quiz_kits', key: 'id' }, onDelete: 'RESTRICT' },
    // Per-assignment options snapshot (set at assign time).
    evaluation_mode: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'auto' },
    allow_retake: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    time_limit_seconds: { type: Sequelize.INTEGER, allowNull: true },
    shuffle_questions: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    show_answers: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    pass_score: { type: Sequelize.INTEGER, allowNull: true },
    ...TS(),
  });

  await createTable(qi, 'quiz_sessions', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    assigned_task_id: { type: Sequelize.UUID, allowNull: false },
    quiz_assignment_id: { type: Sequelize.UUID, allowNull: false },
    mentee_id: { type: Sequelize.UUID, allowNull: false },
    attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
    status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'in_progress' },
    started_at: { type: Sequelize.DATE, allowNull: true },
    current_position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    submitted_at: { type: Sequelize.DATE, allowNull: true },
    // Auto-grade tallies (filled on submit).
    auto_score: { type: Sequelize.INTEGER, allowNull: true },
    max_score: { type: Sequelize.INTEGER, allowNull: true },
    score_percent: { type: Sequelize.FLOAT, allowNull: true },
    passed: { type: Sequelize.BOOLEAN, allowNull: true },
    meta: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
    ...TS(),
  });

  await createTable(qi, 'quiz_answers', {
    id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
    session_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'quiz_sessions', key: 'id' }, onDelete: 'CASCADE' },
    question_id: { type: Sequelize.UUID, allowNull: false },
    position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    kind: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'single' },
    prompt_snapshot: { type: Sequelize.TEXT, allowNull: true },
    points_possible: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
    // The mentee's response — choices and/or free text.
    selected_option_ids: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
    answer_text: { type: Sequelize.TEXT, allowNull: true },
    // Auto-grade result + optional mentor override (review mode).
    is_correct: { type: Sequelize.BOOLEAN, allowNull: true },
    auto_points: { type: Sequelize.INTEGER, allowNull: true },
    points_awarded: { type: Sequelize.INTEGER, allowNull: true },
    score_note: { type: Sequelize.TEXT, allowNull: true },
    ...TS(),
  });

  await addIndex(qi, 'quiz_kits', ['created_by'], 'quiz_kits_created_by_idx');
  await addIndex(qi, 'quiz_kits', ['program_id'], 'quiz_kits_program_idx');
  await addIndex(qi, 'quiz_kits', ['status'], 'quiz_kits_status_idx');
  await addIndex(qi, 'quiz_questions', ['kit_id'], 'quiz_questions_kit_idx');
  await addIndex(qi, 'quiz_assignments', ['assigned_task_id'], 'quiz_assignments_task_idx', { unique: true });
  await addIndex(qi, 'quiz_assignments', ['kit_id'], 'quiz_assignments_kit_idx');
  await addIndex(qi, 'quiz_sessions', ['assigned_task_id'], 'quiz_sessions_task_idx');
  await addIndex(qi, 'quiz_sessions', ['mentee_id'], 'quiz_sessions_mentee_idx');
  await addIndex(qi, 'quiz_sessions', ['status'], 'quiz_sessions_status_idx');
  await addIndex(qi, 'quiz_answers', ['session_id'], 'quiz_answers_session_idx');
  await addIndex(qi, 'quiz_answers', ['session_id', 'question_id'], 'quiz_answers_session_question_idx', { unique: true });

  console.log('✅ Migration 074 complete');
}

async function down() {
  const qi = sequelize.getQueryInterface();
  console.log('▶ Rolling back migration 074');
  for (const t of ['quiz_answers', 'quiz_sessions', 'quiz_assignments', 'quiz_questions', 'quiz_kits']) {
    try { await qi.dropTable(t); console.log(`  ✓ Dropped ${t}`); }
    catch (e) { if (!/does not exist/i.test(e.message)) throw e; }
  }
  console.log('✅ Rollback 074 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
