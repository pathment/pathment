/**
 * selectionMath — the scoring and ranking rules, in one place.
 *
 * Two kinds of selection round read these: the original `CandidatePool`
 * (`poolScoringService`) and a round that is a clan
 * (`poolClanSelectionService`). They gather different things — one has a JSON
 * list of work items, the other has level rules and the clan's assigned tasks
 * — but what a piece of work is WORTH, what blocks a shortlist and how a tie
 * is handled must be the same sentence in both, or two rounds run side by side
 * would rank people differently for the same work.
 *
 * So the gathering stays in each service and the arithmetic lives here. The
 * rules themselves are explained where they are implemented below; the short
 * version is that a score is points earned, every point traces to one piece of
 * work, and nobody is ranked on work nobody has reviewed.
 */
const crypto = require('crypto');

const OUTCOMES = ['selected', 'waitlisted', 'not_selected'];

// Blockers that only a change to the work can clear (add some, review it)
// versus one a person clears by deciding (a tie at the cutoff).
const HARD_BLOCKERS = ['no_work', 'reviews_outstanding'];

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * How far through a course the candidate is, 0–100. A finished course counts
 * as 100 even if the provider's percentage lags behind its own completion
 * flag, so completing a course can never be worth less than almost finishing it.
 */
function courseProgress(enrollment) {
  if (!enrollment) return 0;
  if (enrollment.progressStatus === 'COMPLETED' || enrollment.lifecycle === 'COMPLETED') return 100;
  const pct = Number(enrollment.overallProgress);
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
}

/**
 * What one piece of work earned one candidate, and why.
 *
 *   points × rating ÷ 5     for work whose latest review approved it
 *   points                  when it was approved without a rating
 *   0                       for anything else — not handed in, or not approved
 *
 * A COURSE is the exception, and deliberately so:
 *
 *   points × progress ÷ 100   from the provider's own progress figure
 *
 * Nobody reviews a course. The provider measures it, so a reviewer would only
 * be retyping a number it already knows. Progress is used rather than a pass
 * mark because a pass mark gives everyone who passes an identical score, and a
 * selection round RANKS people — flattening the top of the list into one tie
 * is the opposite of what the round needs. A finished course is 100% and
 * therefore worth full points, which is the same answer the review path would
 * have given, so the two rules agree at the only point they meet.
 *
 * `targeted: false` is its own answer: work aimed at another level is not
 * theirs to earn, so it is neither missing nor owed.
 */
function scorePart({ worth, kind, targeted, task, approval, enrollment }) {
  if (!targeted) return { earned: 0, status: 'not_targeted' };
  if (!task) return { earned: 0, status: 'not_assigned' };

  if (kind === 'course') {
    // The provider's figure, not the task's status: a course auto-approved on
    // completion and one still at 60% are read the same way, so the score
    // never depends on whether the auto-review ran.
    const pct = courseProgress(enrollment);
    return {
      earned: (worth * pct) / 100,
      status: pct >= 100 ? 'scored' : pct > 0 ? 'in_progress' : 'missing',
    };
  }

  if (task.status === 'completed') {
    const rating = approval ? Number(approval.rating) : NaN;
    if (approval && !Number.isFinite(rating)) {
      // Approved with no rating: the reviewer said yes, so the work is worth
      // what it is worth. Scoring it 0 would punish the candidate for how the
      // review was filled in.
      return { earned: worth, status: 'scored' };
    }
    if (Number.isFinite(rating)) {
      return { earned: (worth * Math.max(0, Math.min(5, rating))) / 5, status: 'scored' };
    }
    return { earned: 0, status: 'pending_review' };
  }

  if (task.status === 'submitted') return { earned: 0, status: 'pending_review' };
  if (task.status === 'revision_needed') return { earned: 0, status: 'changes_requested' };
  return { earned: 0, status: 'missing' };
}

/**
 * Highest first, then oldest first, then stable. Competition ranking: equal
 * totals share a rank (1, 2, 2, 4), because the round proposes and a person
 * decides — silently separating a tie would hide the decision.
 */
function rankRows(rows) {
  rows.sort((a, b) => (b.total - a.total)
    || (new Date(a.createdAt) - new Date(b.createdAt))
    || a.memberId.localeCompare(b.memberId));
  rows.forEach((r, i) => { r.rank = i > 0 && r.total === rows[i - 1].total ? rows[i - 1].rank : i + 1; });
  return rows;
}

/**
 * The blockers, the warnings and the proposed outcome for each candidate.
 *
 * A blocker stops a shortlist being confirmed; a warning is something an
 * operator should see and may accept. The line between them is whether a
 * person can clear it by deciding: unreviewed work cannot be decided away, a
 * tie at the cutoff is nothing but a decision.
 *
 * `round` is the terms of the round: { name, quota, waitlistSize,
 * qualificationDueAt }. Where they are stored differs between a pool and a
 * clan; what they mean does not.
 */
function propose(round, workItems, rows) {
  const quota = round.quota;
  const waitlistSize = round.waitlistSize ?? quota;
  const undecided = rows.filter((r) => !r.decision);
  const blockers = [];
  const warnings = [];

  if (!workItems.length) {
    blockers.push({ code: 'no_work', message: 'Add some qualifying work before generating a shortlist — there is nothing to rank on' });
  }
  const outstanding = undecided.filter((r) => r.components.some((c) => c.required && c.status === 'pending_review'));
  if (outstanding.length) {
    blockers.push({
      code: 'reviews_outstanding',
      message: `${outstanding.length} candidate${outstanding.length === 1 ? ' has' : 's have'} required work waiting for review`,
      memberIds: outstanding.map((r) => r.memberId),
    });
  }
  const missing = undecided.filter((r) => r.components.some((c) => c.required && ['missing', 'changes_requested'].includes(c.status)));
  if (missing.length) {
    warnings.push({
      code: 'missing_work',
      message: `${missing.length} candidate${missing.length === 1 ? ' is' : 's are'} missing required work; it earns 0 points`,
      memberIds: missing.map((r) => r.memberId),
    });
  }
  // Unfinished course work is its own case: it has earned part of its points
  // already, and no reviewer can move it along — only the candidate or the
  // deadline can. So it warns, and never blocks.
  const unfinishedCourses = undecided.filter((r) => r.components.some((c) => c.required && c.kind === 'course' && c.status === 'in_progress'));
  if (unfinishedCourses.length) {
    warnings.push({
      code: 'courses_unfinished',
      message: `${unfinishedCourses.length} candidate${unfinishedCourses.length === 1 ? ' has' : 's have'} a required course still in progress; it is scored on the progress so far`,
      memberIds: unfinishedCourses.map((r) => r.memberId),
    });
  }
  const unassigned = undecided.filter((r) => r.components.some((c) => c.required && c.status === 'not_assigned'));
  if (unassigned.length) {
    warnings.push({
      code: 'work_not_given',
      message: `${unassigned.length} candidate${unassigned.length === 1 ? ' was' : 's were'} never given some required work, so they cannot earn its points`,
      memberIds: unassigned.map((r) => r.memberId),
    });
  }
  if (round.qualificationDueAt && new Date(round.qualificationDueAt) > new Date()) {
    warnings.push({ code: 'deadline_not_passed', message: 'The qualification deadline has not passed yet' });
  }
  if (undecided.length < quota) {
    warnings.push({ code: 'fewer_candidates_than_quota', message: `Only ${undecided.length} candidate${undecided.length === 1 ? '' : 's'} for a quota of ${quota}` });
  }

  const proposed = new Map();
  undecided.forEach((r, i) => {
    proposed.set(r.memberId, i < quota ? 'selected' : i < quota + waitlistSize ? 'waitlisted' : 'not_selected');
  });
  if (undecided.length > quota) {
    const cutoff = undecided[quota - 1].total;
    if (undecided[quota].total === cutoff) {
      const tied = undecided.filter((r) => r.total === cutoff).map((r) => r.memberId);
      blockers.push({
        code: 'tie_at_cutoff',
        message: `${tied.length} candidates are tied on ${cutoff} at the cutoff — decide each of them`,
        memberIds: tied,
        total: cutoff,
      });
    }
  }
  return { quota, waitlistSize, blockers, warnings, proposed, undecided };
}

/**
 * A hash of everything the ranking is built from. Same inputs → same
 * fingerprint, so generating twice with nothing changed returns the existing
 * shortlist, and confirming re-checks it — a selection can never be confirmed
 * on scores that have since moved.
 */
function fingerprint(policy, quota, waitlistSize, undecided) {
  const payload = JSON.stringify({
    policy, quota, waitlistSize,
    rows: [...undecided].sort((a, b) => a.memberId.localeCompare(b.memberId))
      .map((r) => [r.memberId, r.total, r.adjustment, r.components.map((c) => [c.key, c.points, c.earned, c.status])]),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = {
  OUTCOMES,
  HARD_BLOCKERS,
  round2,
  courseProgress,
  scorePart,
  rankRows,
  propose,
  fingerprint,
};
