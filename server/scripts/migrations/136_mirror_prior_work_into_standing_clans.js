/**
 * Migration: 136_mirror_prior_work_into_standing_clans
 *
 * Give every standing-clan mentee their previous clan's work, in the standing
 * clan, exactly as it stood.
 *
 * A standing clan is a cohort continuing past its programme. The people were
 * moved across; their work was not. Every clan-scoped read filters on
 * `assigned_tasks.clan_id`, and for a standing clan that filter is exact —
 * `clan_id = <this clan>`, no fallback — so the moment somebody joined one,
 * everything still tagged to the cohort clan vanished from both sides of the
 * product. On production that was 2,151 of 2,459 tasks, with 103 mentees
 * seeing an empty clan while having real work behind them.
 *
 * Worse than invisible: 28 of 30 cohort clans are frozen, and
 * `clanLifecycleService.assertTaskWritable` refuses writes on a frozen clan.
 * So 560 live tasks — assigned, in progress, awaiting review, needing
 * revision — could not be submitted or reviewed by anybody.
 *
 * COPIES, never moves. Re-pointing `clan_id` would empty the completed
 * programme's record and change what the certificates issued on it read, so
 * the original rows are left untouched and a mirror is made in the standing
 * clan. The mirror keeps the source's status, dates, points, rating and
 * overrides, so a task that was completed reads completed and one awaiting
 * review still awaits it.
 *
 * What comes with a task:
 *   • submissions   — a "completed" task with nothing handed in is a shell,
 *                     and the mentor's review needs what was submitted.
 *   • feedback      — remapped onto the copied submission it belongs to.
 *   • progress log  — the day-by-day entries.
 *
 * What deliberately does NOT:
 *   • blockers      — an open blocker counts toward risk scoring; copying it
 *                     would have one person's single blocker counted twice.
 *   • delay events  — same reason, in the fairness maths.
 *   • quiz, interview and course tasks — they carry attempt state in their own
 *                     tables, some of it behind a unique key on the task. A
 *                     copied attempt is either a second attempt nobody took or
 *                     a constraint violation. 38 tasks on production; they are
 *                     counted and reported, not touched.
 *
 * Idempotent on `continued_from_task_id`, which already exists for exactly
 * this purpose. A task that has been mirrored into a clan is never mirrored
 * into it again, so a retry after a partial run finishes the job.
 *
 * Run:      node server/scripts/migrations/136_mirror_prior_work_into_standing_clans.js
 * Preview:  node server/scripts/migrations/136_mirror_prior_work_into_standing_clans.js --dry-run
 * Rollback: node server/scripts/migrations/136_mirror_prior_work_into_standing_clans.js --rollback
 */
const sequelize = require('./_db');
// The same implementation the live service uses on every join, so the
// backfill and the ongoing behaviour cannot drift apart.
const { mirrorPriorWork, ATTEMPT_BACKED } = require('../../src/services/standingWorkMirror');

/** Every (standing clan, mentee) pair that might have work to bring across. */
const PAIRS = `
  SELECT sc.id AS clan_id, cm.user_id AS mentee_id
    FROM clans sc
    JOIN clan_memberships cm
      ON cm.clan_id = sc.id AND cm.role = 'mentee' AND cm.status IN ('active', 'paused')
   WHERE sc.kind = 'standing'
   ORDER BY sc.id`;

const LEFT_ALONE = `
  SELECT count(*)::int AS n
    FROM clans sc
    JOIN clan_memberships cm ON cm.clan_id = sc.id AND cm.role = 'mentee' AND cm.status IN ('active','paused')
    JOIN assigned_tasks t ON t.mentee_id = cm.user_id AND t.clan_id IS NOT NULL AND t.clan_id <> sc.id
    LEFT JOIN roadmap_tasks rt ON rt.id = t.roadmap_task_id
   WHERE sc.kind = 'standing'
     AND COALESCE(t.type_override, rt.type, '') IN ${ATTEMPT_BACKED}`;

async function up({ dryRun = false } = {}) {
  const [pairs] = await sequelize.query(PAIRS);
  const [[skipped]] = await sequelize.query(LEFT_ALONE);
  console.log(`  • ${pairs.length} standing-clan membership${pairs.length === 1 ? '' : 's'} to check`);
  console.log(`  • ${skipped.n} quiz/interview/course task${skipped.n === 1 ? '' : 's'} left where they were taken`);

  if (dryRun) {
    // Count without writing, using the service's own definition of "pending".
    const [[{ n }]] = await sequelize.query(`
      SELECT count(*)::int AS n
        FROM clans sc
        JOIN clan_memberships cm ON cm.clan_id = sc.id AND cm.role = 'mentee' AND cm.status IN ('active','paused')
        JOIN assigned_tasks t ON t.mentee_id = cm.user_id AND t.clan_id IS NOT NULL AND t.clan_id <> sc.id
        JOIN clans src ON src.id = t.clan_id
        LEFT JOIN roadmap_tasks rt ON rt.id = t.roadmap_task_id
       WHERE sc.kind = 'standing'
         AND t.pool_member_id IS NULL
         AND src.organization_id = sc.organization_id
         AND src.program_id IS NOT DISTINCT FROM sc.program_id
         AND COALESCE(t.type_override, rt.type, '') NOT IN ${ATTEMPT_BACKED}
         AND NOT EXISTS (
           SELECT 1 FROM assigned_tasks copy
            WHERE copy.clan_id = sc.id AND copy.continued_from_task_id = t.id)`);
    console.log(`  • ${n} task${n === 1 ? '' : 's'} would be mirrored`);
    console.log('  \u2139 dry run \u2014 nothing written.');
    return { tasks: n, skipped: skipped.n, dryRun: true };
  }

  const totals = { tasks: 0, submissions: 0, feedback: 0, progress: 0, failed: 0 };
  for (const { clan_id: clanId, mentee_id: menteeId } of pairs) {
    const result = await mirrorPriorWork(sequelize, { clanId, menteeId });
    for (const key of Object.keys(totals)) totals[key] += result[key];
  }
  console.log(`  \u2713 mirrored ${totals.tasks} tasks, ${totals.submissions} submissions, ${totals.feedback} feedback rows, ${totals.progress} progress entries`);
  if (totals.failed) {
    throw new Error(`${totals.failed} task(s) could not be copied; migration must be retried`);
  }
  return { ...totals, skipped: skipped.n };
}

/**
 * Reversible, unusually — and only because every row this created is marked.
 *
 * A copy is an assigned_task in a STANDING clan with continued_from_task_id
 * set, which nothing else produces. Its children go with it by cascade or by
 * the same key. Work assigned natively in the standing clan has no provenance
 * link and is never touched.
 */
async function down() {
  const [[{ n }]] = await sequelize.query(`
    SELECT count(*)::int AS n FROM assigned_tasks t JOIN clans c ON c.id = t.clan_id
     WHERE c.kind = 'standing' AND t.continued_from_task_id IS NOT NULL`);
  await sequelize.query(`
    WITH copies AS (
      SELECT t.id FROM assigned_tasks t JOIN clans c ON c.id = t.clan_id
       WHERE c.kind = 'standing' AND t.continued_from_task_id IS NOT NULL
    )
    DELETE FROM task_feedback WHERE assigned_task_id IN (SELECT id FROM copies)`);
  await sequelize.query(`
    WITH copies AS (
      SELECT t.id FROM assigned_tasks t JOIN clans c ON c.id = t.clan_id
       WHERE c.kind = 'standing' AND t.continued_from_task_id IS NOT NULL
    )
    DELETE FROM task_progress_entries WHERE assigned_task_id IN (SELECT id FROM copies)`);
  await sequelize.query(`
    WITH copies AS (
      SELECT t.id FROM assigned_tasks t JOIN clans c ON c.id = t.clan_id
       WHERE c.kind = 'standing' AND t.continued_from_task_id IS NOT NULL
    )
    DELETE FROM task_submissions WHERE assigned_task_id IN (SELECT id FROM copies)`);
  await sequelize.query(`
    DELETE FROM assigned_tasks t USING clans c
     WHERE c.id = t.clan_id AND c.kind = 'standing' AND t.continued_from_task_id IS NOT NULL`);
  console.log(`  ✓ removed ${n} mirrored assignments and their submissions, feedback and progress`);
}

module.exports = { up, down };

if (require.main === module) {
  (process.argv.includes('--rollback')
    ? down()
    : up({ dryRun: process.argv.includes('--dry-run') }))
    .catch((error) => { console.error('Migration failed:', error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
