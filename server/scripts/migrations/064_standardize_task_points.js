/**
 * Migration: 064_standardize_task_points
 *
 * Points are now STANDARD by difficulty (easy 5, medium 10, hard 20, expert 40)
 * — the single source of truth. This backfills the stored `points_base` columns
 * so existing tasks display and award the standard going forward:
 *   - roadmap_tasks.points_base ← standard for its difficulty
 *   - assigned_tasks.points_base ← its roadmap task's standard
 *
 * NOTE: this does NOT retroactively re-award already-completed tasks — mentees
 * keep the points they already earned, so the leaderboard history is untouched.
 * Only future approvals use the standard (and reads derive points from
 * difficulty regardless of the stored column).
 *
 * Keep this in sync with server/src/config/points.js.
 *
 * Run:      node server/scripts/migrations/064_standardize_task_points.js
 * Rollback: node server/scripts/migrations/064_standardize_task_points.js --rollback
 *           (no-op: prior arbitrary per-task values are not recoverable)
 */
const { QueryTypes } = require('sequelize');
const sequelize = require('./_db');

async function up() {
  console.log('▶ Running migration 064: standardize task points by difficulty');

  const [rt] = await sequelize.query(`
    UPDATE roadmap_tasks SET points_base = CASE LOWER(difficulty)
      WHEN 'easy' THEN 5
      WHEN 'medium' THEN 10
      WHEN 'hard' THEN 20
      WHEN 'expert' THEN 40
      ELSE 10
    END;
  `);
  console.log(`  ✓ roadmap_tasks.points_base standardized (${rt?.rowCount ?? '?'} rows)`);

  const [at] = await sequelize.query(`
    UPDATE assigned_tasks a
    SET points_base = rt.points_base
    FROM roadmap_tasks rt
    WHERE a.roadmap_task_id = rt.id;
  `);
  console.log(`  ✓ assigned_tasks.points_base mirrored from roadmap tasks (${at?.rowCount ?? '?'} rows)`);

  const dist = await sequelize.query(
    `SELECT LOWER(difficulty) AS difficulty, points_base, COUNT(*)::int AS n
       FROM roadmap_tasks GROUP BY 1, 2 ORDER BY 1`,
    { type: QueryTypes.SELECT }
  );
  dist.forEach((d) => console.log(`    · ${d.difficulty}: ${d.points_base} pts × ${d.n}`));

  console.log('✅ Migration 064 complete');
}

async function down() {
  console.log('▶ Rollback 064: no-op (prior arbitrary per-task points are not recoverable)');
  console.log('✅ Rollback 064 complete');
}

if (require.main === module) {
  const isRollback = process.argv.slice(2).some((a) => a === '--rollback' || a === '-r');
  (async () => { try { await (isRollback ? down() : up()); process.exit(0); } catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); } })();
}

module.exports = { up, down };
