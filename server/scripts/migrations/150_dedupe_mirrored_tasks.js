/**
 * Migration: 150_dedupe_mirrored_tasks
 *
 * Repairs the duplicate tasks mentees were seeing in their standing clans.
 *
 * Copies point back at their source through `continued_from_task_id`, so one
 * piece of work is a chain (cohort original → standing copy → copy of that
 * copy). The mirror used to dedupe on the direct source row only, so the second
 * time somebody's work was mirrored, the original AND its earlier copy both
 * came across — the same task twice in one clan. The mirror is fixed in
 * standingWorkMirror; this cleans up what it already wrote.
 *
 * For every (clan, mentee, step, occurrence) with more than one LIVE row, at
 * least one of them a mirrored copy, one row is kept
 * and the rest are cancelled. The keeper is the one furthest along
 * (completed > submitted > revision_needed > in_progress > assigned), then the
 * one with the most submissions, then the most recently worked on. Nothing is
 * deleted: each cancelled row's previous status is saved in
 * assigned_task_dedupe_backup, and --rollback restores it exactly.
 *
 * Idempotent: a second run finds no live duplicates and changes nothing.
 *
 * Run:      node server/scripts/migrations/150_dedupe_mirrored_tasks.js
 * Preview:  node server/scripts/migrations/150_dedupe_mirrored_tasks.js --dry-run
 * Rollback: node server/scripts/migrations/150_dedupe_mirrored_tasks.js --rollback
 */
const sequelize = require('./_db');

const REASON = 'Duplicate copy of the same task in this clan (repair 150)';

// The rows to cancel, with the row kept in their place.
//
// "The same task" = same clan, mentee, roadmap step and occurrence (recurring
// work legitimately repeats per occurrence). Copies keep their source's step,
// so this catches both a chain copied twice and a step a mentor re-assigned
// before the old one was copied in. Only groups the mirror created (at least
// one copied row) are touched: a step deliberately assigned twice by hand is
// left alone.
const DUPLICATES_SQL = `
  WITH live AS (
    SELECT t.id, t.clan_id, t.mentee_id, t.status, t.updated_at, t.roadmap_task_id, t.occurrence_date,
           (t.continued_from_task_id IS NOT NULL) is_copy,
           (SELECT count(*) FROM task_submissions s WHERE s.assigned_task_id = t.id) subs
      FROM assigned_tasks t
     WHERE t.status <> 'cancelled' AND t.clan_id IS NOT NULL AND t.pool_member_id IS NULL
       AND t.roadmap_task_id IS NOT NULL
  ), grouped AS (
    SELECT l.*, bool_or(is_copy) OVER g AS mirrored, count(*) OVER g AS n
      FROM live l
    WINDOW g AS (PARTITION BY clan_id, mentee_id, roadmap_task_id, occurrence_date)
  ), ranked AS (
    SELECT gr.*,
           first_value(id) OVER w AS keep_id,
           row_number() OVER w AS rn
      FROM grouped gr
     WHERE mirrored AND n > 1
    WINDOW w AS (
      PARTITION BY clan_id, mentee_id, roadmap_task_id, occurrence_date
      ORDER BY CASE status WHEN 'completed' THEN 5 WHEN 'submitted' THEN 4 WHEN 'revision_needed' THEN 3
                           WHEN 'in_progress' THEN 2 ELSE 1 END DESC,
               subs DESC, updated_at DESC, id
    )
  )
  SELECT id, keep_id, clan_id, mentee_id, status FROM ranked WHERE rn > 1`;

async function up({ dryRun = false } = {}) {
  console.log(dryRun ? '=== DRY RUN ===\n' : '▶ Running migration 150: dedupe mirrored tasks\n');
  const [rows] = await sequelize.query(DUPLICATES_SQL);
  const mentees = new Set(rows.map((r) => r.mentee_id)).size;
  const clans = new Set(rows.map((r) => r.clan_id)).size;
  console.log(`  duplicate rows to cancel: ${rows.length} (mentees: ${mentees}, clans: ${clans})`);
  const byStatus = rows.reduce((m, r) => ({ ...m, [r.status]: (m[r.status] || 0) + 1 }), {});
  console.log('  by status:', JSON.stringify(byStatus));
  if (dryRun || !rows.length) {
    if (dryRun) console.log('\nRe-run without --dry-run to apply.');
    return;
  }

  await sequelize.transaction(async (transaction) => {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS assigned_task_dedupe_backup (
        task_id UUID PRIMARY KEY REFERENCES assigned_tasks(id) ON DELETE CASCADE,
        kept_task_id UUID,
        prior_status VARCHAR(30) NOT NULL,
        prior_cancelled_at TIMESTAMPTZ,
        prior_cancellation_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`, { transaction });
    await sequelize.query(`
      INSERT INTO assigned_task_dedupe_backup (task_id, kept_task_id, prior_status, prior_cancelled_at, prior_cancellation_reason)
      SELECT t.id, d.keep_id, t.status, t.cancelled_at, t.cancellation_reason
        FROM assigned_tasks t JOIN (${DUPLICATES_SQL}) d ON d.id = t.id
      ON CONFLICT (task_id) DO NOTHING`, { transaction });
    const [, meta] = await sequelize.query(`
      UPDATE assigned_tasks t
         SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = :reason, updated_at = NOW()
        FROM assigned_task_dedupe_backup b
       WHERE b.task_id = t.id AND t.status <> 'cancelled'`, { replacements: { reason: REASON }, transaction });
    console.log(`  ✓ cancelled ${meta?.rowCount ?? rows.length} duplicate rows (backup: assigned_task_dedupe_backup)`);
  });
}

async function down() {
  await sequelize.transaction(async (transaction) => {
    const [[exists]] = await sequelize.query(
      "SELECT to_regclass('assigned_task_dedupe_backup') IS NOT NULL AS ok", { transaction },
    );
    if (!exists.ok) { console.log('  ℹ nothing to roll back'); return; }
    const [, meta] = await sequelize.query(`
      UPDATE assigned_tasks t
         SET status = b.prior_status, cancelled_at = b.prior_cancelled_at,
             cancellation_reason = b.prior_cancellation_reason, updated_at = NOW()
        FROM assigned_task_dedupe_backup b
       WHERE b.task_id = t.id AND t.cancellation_reason = :reason`, { replacements: { reason: REASON }, transaction });
    await sequelize.query('DROP TABLE assigned_task_dedupe_backup', { transaction });
    console.log(`  ✓ restored ${meta?.rowCount ?? 0} rows; dropped assigned_task_dedupe_backup`);
  });
}

module.exports = { up, down, DUPLICATES_SQL };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
