/**
 * Copy a mentee's earlier clan work into the clan they have just joined.
 *
 * Written for standing clans — a cohort carrying on past its programme. The
 * people move across; without this their work does not, and every clan-scoped
 * read filters on `assigned_tasks.clan_id` exactly, with no fallback. So a
 * mentee lands in an empty clan and the work they were in the middle of
 * becomes unreachable from both sides.
 *
 * The handover pool has the same problem for the same reason, so it uses the
 * same mirror into an ordinary cohort clan. The target's KIND was never what
 * made this correct — the same organisation, the same programme, a different
 * clan, and the idempotency key are — so the only thing a cohort target needs
 * extra is `enrollmentId`, because cohort work must hang off an enrolment
 * (taskService refuses to create it otherwise, and the enrolment carries the
 * task stats). Standing clans have no enrolment and pass nothing.
 *
 * COPIES, never moves. Re-pointing `clan_id` would empty the finished
 * programme's record and change what the certificates issued on it read. The
 * source rows are never touched; the copy keeps the source's status, dates,
 * points, rating and overrides, so a completed task reads completed and one
 * awaiting review still awaits it.
 *
 * Submissions, their feedback and the day-by-day progress log come too — a
 * "completed" task with nothing handed in is a shell, and a mentor reviewing
 * it needs what was actually submitted. Blockers and delay events do NOT:
 * both are counted in risk and fairness scoring, and one person's single open
 * blocker must not become two.
 *
 * Quiz, interview and course tasks are left where they were taken. They carry
 * attempt state in their own tables, some of it behind a unique key on the
 * task, so a copied attempt is either an attempt nobody sat or a constraint
 * violation.
 *
 * Idempotent per TASK CHAIN, not per row. Every copy points back at its source
 * through `continued_from_task_id`, so one piece of work is a chain:
 * cohort original → standing copy → copy of that copy. Checking only the direct
 * source row was not enough: the second time somebody's work was mirrored, the
 * original AND its earlier copy both looked new, and the mentee got the same
 * task twice in one clan (and a mentee coming back to a clan got their own task
 * back as a copy). Now each chain contributes at most one row — its newest live
 * link — and a chain with any link already in the target clan is skipped. Safe
 * to call on every join and to re-run after a partial failure.
 *
 * Takes `sequelize` rather than importing it so the backfill migration and the
 * live service run exactly the same code against their own connections.
 */

/** Carried over verbatim; clan, enrolment and provenance are set explicitly. */
const CARRIED = [
  'organization_id', 'roadmap_task_id', 'mentee_id', 'status',
  'assigned_at', 'due_date', 'started_at', 'submitted_at', 'completed_at',
  'current_submission_version', 'revision_count', 'time_spent_hours',
  'final_rating', 'points_awarded', 'points_base', 'is_late', 'repeat_rule',
  'self_assigned', 'is_custom_task', 'cancelled_by', 'cancelled_at',
  'cancellation_reason', 'track_id', 'schedule_slot_id', 'occurrence_date',
  'type_override', 'title_override', 'description_override',
  'deliverable_override', 'acceptance_criteria_override', 'resources_override',
  'mentor_note', 'open_source_org_ids',
];

const ATTEMPT_BACKED = `('quiz', 'interview', 'course')`;

/**
 * Source tasks still needing a mirror into `clanId`.
 *
 * "Their previous clan" means the mentee's own work in another clan of the
 * SAME programme — so somebody in two programmes never has one programme's
 * work surface in the other's continuation.
 */
const pendingSql = `
  WITH RECURSIVE mine AS (
    SELECT id, continued_from_task_id, clan_id FROM assigned_tasks WHERE mentee_id = :menteeId
  ), chain AS (
    -- Roots: never copied from anything (or the source row is gone).
    SELECT m.id, m.id AS root FROM mine m
     WHERE m.continued_from_task_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM mine p WHERE p.id = m.continued_from_task_id)
    UNION ALL
    SELECT m.id, c.root FROM mine m JOIN chain c ON m.continued_from_task_id = c.id
  )
  SELECT id FROM (
    SELECT DISTINCT ON (ch.root) t.id, t.assigned_at
      FROM assigned_tasks t
      JOIN chain ch ON ch.id = t.id
      JOIN clans src ON src.id = t.clan_id
      JOIN clans sc  ON sc.id = :clanId
      LEFT JOIN roadmap_tasks rt ON rt.id = t.roadmap_task_id
     WHERE t.clan_id IS NOT NULL
       AND t.pool_member_id IS NULL
       AND t.clan_id <> sc.id
       AND src.organization_id = sc.organization_id
       AND src.program_id IS NOT DISTINCT FROM sc.program_id
       AND COALESCE(t.type_override, rt.type, '') NOT IN ${ATTEMPT_BACKED}
       -- Nothing from this chain is in the target clan yet.
       AND NOT EXISTS (
         SELECT 1 FROM chain other JOIN mine om ON om.id = other.id
          WHERE other.root = ch.root AND om.clan_id = sc.id
       )
       -- Nor is the same step, assigned there separately (a mentor gave it
       -- again before the work came across). Recurring work repeats per
       -- occurrence, so the occurrence is part of "the same step".
       AND NOT EXISTS (
         SELECT 1 FROM assigned_tasks here
          WHERE here.clan_id = sc.id AND here.mentee_id = t.mentee_id
            AND here.roadmap_task_id = t.roadmap_task_id
            AND here.occurrence_date IS NOT DISTINCT FROM t.occurrence_date
            AND here.status <> 'cancelled'
       )
     -- One source per chain: a live link over a cancelled one, then the
     -- most recently worked on, so the copy carries the latest state.
     ORDER BY ch.root, (t.status = 'cancelled'), t.updated_at DESC, t.id
  ) pick
   ORDER BY assigned_at`;

/**
 * Who owns the copy.
 *
 * The source mentor, when they came across too — their queue, their history,
 * and the mentee keeps the person they were working with. When they did not,
 * the copy would belong to somebody outside this clan: it would never appear
 * in any mentor's queue and the lead could not review it, so a live task
 * would arrive unreachable. In that case it goes to the standing clan's lead,
 * who is the person actually responsible for it now.
 */
const MENTOR_FOR_COPY = `
  CASE WHEN EXISTS (
    SELECT 1 FROM clan_memberships cm
     WHERE cm.clan_id = :clanId AND cm.user_id = src.mentor_id
       AND cm.role IN ('lead_mentor', 'co_mentor', 'core_team')
       AND cm.status IN ('active', 'paused')
  ) THEN src.mentor_id
  ELSE COALESCE((SELECT lead_mentor_id FROM clans WHERE id = :clanId), src.mentor_id)
  END`;

/** Copy one source task, with its submissions, feedback and progress log. */
async function mirrorOne(sequelize, { clanId, sourceId, enrollmentId = null, transaction }) {
  const cols = CARRIED.join(', ');
  const [[copy]] = await sequelize.query(`
    INSERT INTO assigned_tasks (id, clan_id, enrollment_id, continued_from_task_id, mentor_id, ${cols}, created_at, updated_at)
    SELECT gen_random_uuid(), :clanId, :enrollmentId, src.id, ${MENTOR_FOR_COPY}, ${CARRIED.map((c) => `src.${c}`).join(', ')}, NOW(), NOW()
      FROM assigned_tasks src WHERE src.id = :sourceId
    RETURNING id`, { replacements: { clanId, sourceId, enrollmentId }, transaction });
  if (!copy) return { tasks: 0, submissions: 0, feedback: 0, progress: 0 };

  // Versions are preserved: the review screens read "latest" as version DESC.
  const [subs] = await sequelize.query(`
    INSERT INTO task_submissions
      (id, organization_id, assigned_task_id, version, submission_text, submission_urls,
       status, extension_requested, extension_reason, extension_days, extension_status,
       submitted_at, reviewed_at)
    SELECT gen_random_uuid(), s.organization_id, :newTaskId, s.version, s.submission_text, s.submission_urls,
           s.status, s.extension_requested, s.extension_reason, s.extension_days, s.extension_status,
           s.submitted_at, s.reviewed_at
      FROM task_submissions s WHERE s.assigned_task_id = :sourceId
    RETURNING id`, { replacements: { newTaskId: copy.id, sourceId }, transaction });

  // Re-pointed onto the copied submission by version; the source submission
  // id means nothing on this task.
  const [fb] = await sequelize.query(`
    INSERT INTO task_feedback
      (id, organization_id, assigned_task_id, submission_id, mentor_id, feedback_text, inline_feedback,
       rating, is_approved, revision_notes, criteria_met, decision, checked_criteria,
       feedback_type, created_at, updated_at)
    SELECT gen_random_uuid(), f.organization_id, :newTaskId, copy.id, f.mentor_id, f.feedback_text, f.inline_feedback,
           f.rating, f.is_approved, f.revision_notes, f.criteria_met, f.decision, f.checked_criteria,
           f.feedback_type, f.created_at, f.updated_at
      FROM task_feedback f
      JOIN task_submissions orig ON orig.id = f.submission_id
      JOIN task_submissions copy ON copy.assigned_task_id = :newTaskId AND copy.version = orig.version
     WHERE f.assigned_task_id = :sourceId
    RETURNING id`, { replacements: { newTaskId: copy.id, sourceId }, transaction });

  const [log] = await sequelize.query(`
    INSERT INTO task_progress_entries
      (id, organization_id, assigned_task_id, mentee_id, date_key, note, minutes_spent, created_at, updated_at)
    SELECT gen_random_uuid(), e.organization_id, :newTaskId, e.mentee_id, e.date_key, e.note, e.minutes_spent, e.created_at, e.updated_at
      FROM task_progress_entries e WHERE e.assigned_task_id = :sourceId
    RETURNING id`, { replacements: { newTaskId: copy.id, sourceId }, transaction });

  return { tasks: 1, submissions: subs.length, feedback: fb.length, progress: log.length };
}

/**
 * Mirror everything this mentee did before, into this standing clan.
 *
 * One transaction per task when none is supplied, so a single bad row cannot
 * cost the rest their copy. Pass a transaction to make the whole mentee
 * all-or-nothing instead.
 */
async function mirrorPriorWork(sequelize, { clanId, menteeId, enrollmentId = null, transaction = null }) {
  const totals = { tasks: 0, submissions: 0, feedback: 0, progress: 0, failed: 0 };
  const [pending] = await sequelize.query(pendingSql, {
    replacements: { clanId, menteeId }, transaction,
  });
  for (const { id: sourceId } of pending) {
    try {
      const run = (t) => mirrorOne(sequelize, { clanId, sourceId, enrollmentId, transaction: t });
      const result = transaction ? await run(transaction) : await sequelize.transaction(run);
      totals.tasks += result.tasks;
      totals.submissions += result.submissions;
      totals.feedback += result.feedback;
      totals.progress += result.progress;
    } catch (error) {
      totals.failed += 1;
      if (transaction) throw error;
      // eslint-disable-next-line no-console
      console.warn(`[standingWorkMirror] task ${sourceId} → clan ${clanId}: ${error.message}`);
    }
  }
  return totals;
}

module.exports = { mirrorPriorWork, CARRIED, ATTEMPT_BACKED };
