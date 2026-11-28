/**
 * poolScoringService — explainable scores, the proposed shortlist, and the
 * human decision.
 *
 * A score is points earned, and every point is traceable to one piece of work.
 * Each piece is worth a number decided when it was added to the pool (from its
 * difficulty, through the pool's curve), and a candidate earns:
 *
 *   points × rating ÷ 5     for work whose latest review approved it
 *   points                  when it was approved without a rating
 *   0                       for anything else — not handed in, or not approved
 *
 * Quiz and interview reviews already store their result on the same 0–5
 * rating, so one rule covers every kind of work. A hand adjustment
 * (`manualScores.adjustment`) is added on top for a judgement made off the
 * platform; it is the only number a person types, and it is always shown
 * separately.
 *
 * A COURSE is the exception, and deliberately so:
 *
 *   points × progress ÷ 100   from Edorax's own progress figure
 *
 * Nobody reviews a course. Edorax measures it, so a reviewer would only be
 * retyping a number the provider already knows. Progress is used rather than
 * a pass mark because a pass mark gives everyone who passes an identical
 * score, and a selection round ranks people — flattening the top of the list
 * into one tie is the opposite of what the pool needs. A finished course is
 * 100% and therefore worth full points, which is the same answer the review
 * path would have given, so the two rules agree at the only point they meet.
 * An unfinished required course is a warning, never a blocker: progress is not
 * something a reviewer can clear, and the qualification deadline is what
 * closes the round.
 *
 * There are no weights and no percentages. The total is the sum of its parts
 * because the parts ARE points. Work handed in but not yet reviewed stops the
 * shortlist being confirmed — nobody is ranked on unreviewed work.
 *
 * The system PROPOSES; a person with pool.select DECIDES. A tie at the cutoff
 * is never broken silently, and any change to the proposal needs a reason.
 *
 * Shortlists are snapshots in the audit log, not a table of their own:
 *   POOL_SHORTLIST_GENERATED   { version, fingerprint, policy, quota, blockers, entries }
 *   POOL_SELECTION_CONFIRMED   { shortlistId, version, fingerprint, entries (with outcomes), overrides }
 * The fingerprint is a hash of everything the ranking was built from.
 * Generating with an unchanged fingerprint returns the existing snapshot (no
 * new version, nobody re-notified), and confirming re-checks it, so a
 * selection can never be confirmed on scores that have since moved. The
 * confirmed result itself is written onto each PoolMember (decision, score
 * components, total, rank) — the spec's auditable record.
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const poolService = require('./poolService');
const { ADJUSTMENT_KEY } = poolService;
const poolWorkEvents = require('./poolWorkEvents');
const selectionMath = require('./selectionMath');

const { OUTCOMES, HARD_BLOCKERS, round2, courseProgress } = selectionMath;
const GENERATED = 'POOL_SHORTLIST_GENERATED';
const CONFIRMED = 'POOL_SELECTION_CONFIRMED';

class PoolScoringService {
  /**
   * Score every candidate still in the running. Pure read — nothing is saved.
   * Returns rows sorted for display (highest first; ties in a stable order).
   */
  async compute(poolId) {
    const pool = await poolService.getPool(poolId);
    const workItems = poolService.workItems(pool).filter((w) => !w.cancelledAt);
    const members = await models.PoolMember.findAll({
      where: { poolId, [Op.or]: [{ decision: null }, { decision: { [Op.notIn]: ['withdrawn', 'disqualified'] } }] },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    });
    // Scoring must read targeting exactly as handing work out does, or someone
    // is ranked against work that never reached them.
    const roundLevels = await poolService.levelsFor(pool, members);
    // The templates carry the difficulty a piece of work falls back to when it
    // has no points of its own (work added before points existed).
    const templates = workItems.length ? await models.RoadmapTask.findAll({
      where: { id: { [Op.in]: workItems.map((w) => w.roadmapTaskId) } },
      attributes: ['id', 'difficulty'],
    }) : [];
    const difficultyOf = new Map(templates.map((t) => [t.id, t.difficulty]));
    const tasks = members.length ? await models.AssignedTask.scope('withPoolWork').findAll({
      where: { poolMemberId: { [Op.in]: members.map((m) => m.id) }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id', 'poolMemberId', 'roadmapTaskId', 'status'],
    }) : [];
    const feedback = tasks.length ? await models.TaskFeedback.findAll({
      where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) } },
      attributes: ['assignedTaskId', 'rating', 'isApproved', 'createdAt'],
      order: [['createdAt', 'DESC']],
    }) : [];
    const latestApproved = new Map();
    for (const f of feedback) {
      if (f.isApproved && !latestApproved.has(f.assignedTaskId)) latestApproved.set(f.assignedTaskId, f);
    }
    const taskFor = new Map(tasks.map((t) => [`${t.poolMemberId}:${t.roadmapTaskId}`, t]));
    // Course work is scored from the provider's progress, so the enrollment
    // rows are read alongside the tasks. Only fetched when the pool has course
    // work at all, which most rounds will not.
    const hasCourseWork = workItems.some((w) => w.kind === 'course');
    const courseFor = new Map();
    if (hasCourseWork && tasks.length) {
      const enrollments = await models.CourseEnrollment.findAll({
        where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) } },
        attributes: ['assignedTaskId', 'lifecycle', 'progressStatus', 'overallProgress'],
      });
      for (const e of enrollments) courseFor.set(e.assignedTaskId, e);
    }

    // What a perfect round is worth. Shown next to every total, so a score is
    // readable without knowing how the pool was set up.
    const possible = workItems.reduce(
      (sum, w) => sum + poolService.pointsOf(pool, w, difficultyOf.get(w.roadmapTaskId)),
      0,
    );

    const rows = members.map((member) => {
      let total = 0;
      let complete = true;
      // What a perfect round is worth FOR THIS CANDIDATE. Work aimed at other
      // levels is not theirs to earn, so counting it would rank a beginner
      // against a total they were never allowed to reach.
      let possibleForMember = 0;
      const parts = workItems.map((w) => {
        const worth = poolService.pointsOf(pool, w, difficultyOf.get(w.roadmapTaskId));
        const t = taskFor.get(`${member.id}:${w.roadmapTaskId}`);
        // The rule itself lives in selectionMath, so a pool round and a clan
        // round cannot drift into scoring the same work differently.
        const { earned, status } = selectionMath.scorePart({
          worth,
          kind: w.kind,
          targeted: poolService.targetsMember(w, member, roundLevels),
          task: t,
          approval: t ? latestApproved.get(t.id) : null,
          enrollment: t ? courseFor.get(t.id) : null,
        });
        total += earned;
        if (status !== 'not_targeted') {
          possibleForMember += worth;
          if (w.required !== false && status !== 'scored') complete = false;
        }
        return {
          key: w.id,
          label: w.title,
          kind: w.kind,
          required: w.required !== false,
          points: worth,
          earned: round2(earned),
          status,
        };
      });

      // A judgement made off the platform. Added, never hidden inside a part.
      const adjustmentEntry = member.manualScores?.[ADJUSTMENT_KEY];
      const adjustment = Number.isFinite(Number(adjustmentEntry?.score)) ? Number(adjustmentEntry.score) : 0;
      total += adjustment;

      return {
        memberId: member.id,
        name: models.PoolMember.displayName(member),
        email: member.email,
        activated: Boolean(member.userId),
        decision: member.decision,
        createdAt: member.createdAt,
        components: parts,
        adjustment: round2(adjustment),
        adjustmentNote: adjustmentEntry?.note || null,
        // Their own perfect round, which equals the pool's when no work is
        // aimed at a level.
        possible: possibleForMember,
        total: round2(total),
        complete,
      };
    });

    selectionMath.rankRows(rows);
    return { pool, policy: pool.scoringPolicy || {}, workItems, possible, rows };
  }

  /** The blockers and warnings for a computed ranking, plus proposed outcomes. */
  _propose(pool, policy, workItems, rows) {
    return selectionMath.propose({
      quota: pool.selectionQuota,
      waitlistSize: pool.settings?.waitlistSize,
      qualificationDueAt: pool.qualificationDueAt,
    }, workItems, rows);
  }

  /** A hash of everything the ranking is built from. Same inputs → same fingerprint. */
  _fingerprint(policy, quota, waitlistSize, undecided) {
    return selectionMath.fingerprint(policy, quota, waitlistSize, undecided);
  }

  /** The current ranking, with what would block or warn a shortlist made from it. */
  async _current(poolId) {
    const { pool, policy, workItems, possible, rows } = await this.compute(poolId);
    const proposal = this._propose(pool, policy, workItems, rows);
    const fingerprint = this._fingerprint(policy, proposal.quota, proposal.waitlistSize, proposal.undecided);
    return { pool, policy, workItems, possible, rows, ...proposal, fingerprint };
  }

  /** Live scores for the Scores tab — what a shortlist generated now would contain. */
  async liveScores(poolId) {
    const { policy, workItems, possible, rows, blockers, warnings, proposed } = await this._current(poolId);
    return {
      policy,
      possible,
      // The work, in the order the score columns read, so a table can be built
      // from this one answer without a second request.
      work: workItems.map((w) => ({ key: w.id, label: w.title, kind: w.kind, required: w.required !== false })),
      blockers,
      warnings,
      rows: rows.map((r) => ({ ...r, proposedOutcome: proposed.get(r.memberId) || null })),
    };
  }

  /** Every shortlist version, with its status read from the log. */
  async _versions(poolId) {
    const logs = await poolService.snapshots(poolId, [GENERATED, CONFIRMED]);
    const generated = logs.filter((l) => l.action === GENERATED);
    const confirmation = logs.find((l) => l.action === CONFIRMED) || null;
    const latestId = generated.length ? generated[generated.length - 1].id : null;
    return {
      confirmation,
      versions: generated.map((g) => {
        const v = g.newValues || {};
        const confirmed = confirmation && confirmation.newValues?.shortlistId === g.id;
        const status = confirmed ? 'confirmed'
          : (g.id === latestId && !confirmation) ? ((v.blockers || []).some((b) => b.severity === 'block') ? 'blocked' : 'draft')
            : 'superseded';
        return {
          id: g.id,
          version: v.version,
          status,
          quota: v.quota,
          blockers: v.blockers || [],
          fingerprint: v.fingerprint,
          createdAt: g.createdAt,
          confirmedAt: confirmed ? confirmation.createdAt : null,
          possible: v.possible ?? null,
          log: g,
        };
      }),
    };
  }

  async listShortlists(poolId) {
    const { versions } = await this._versions(poolId);
    return versions.reverse().map(({ log, ...v }) => v);
  }

  /** One version, with each candidate's components, rank and outcome. */
  async getShortlist(poolId, shortlistId) {
    const { versions, confirmation } = await this._versions(poolId);
    const found = versions.find((v) => v.id === shortlistId);
    if (!found) throw new NotFoundError('Shortlist not found');
    const { log, ...meta } = found;
    const entries = log.newValues?.entries || [];
    const finals = meta.status === 'confirmed'
      ? new Map((confirmation.newValues?.entries || []).map((e) => [e.poolMemberId, e]))
      : new Map();
    const members = entries.length ? await models.PoolMember.findAll({
      where: { id: { [Op.in]: entries.map((e) => e.poolMemberId) } },
      attributes: ['id', 'email', 'userId', 'decision', 'details'],
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    }) : [];
    const memberById = new Map(members.map((m) => [m.id, m]));
    return {
      ...meta,
      possible: log.newValues?.possible ?? null,
      work: log.newValues?.work || [],
      entries: entries.map((e) => {
        const m = memberById.get(e.poolMemberId);
        const final = finals.get(e.poolMemberId);
        return {
          ...e,
          id: e.poolMemberId,
          finalOutcome: final?.finalOutcome || null,
          overrideReason: final?.overrideReason || null,
          member: m ? {
            id: m.id, email: m.email, decision: m.decision,
            firstName: m.details?.firstName || null, lastName: m.details?.lastName || null,
            user: m.user ? { firstName: m.user.firstName, lastName: m.user.lastName } : null,
          } : null,
        };
      }),
    };
  }

  /**
   * Generate the proposed shortlist. Idempotent: if nothing that feeds it has
   * changed since the latest version, that version is returned and nobody is
   * notified again.
   */
  async generate(poolId, actor) {
    if (await poolService.isSelectionConfirmed(poolId)) {
      throw new ValidationError('A shortlist is already confirmed. Change individual decisions instead.');
    }
    const { pool, policy, possible, workItems, rows, quota, waitlistSize, blockers, warnings, proposed, undecided, fingerprint } = await this._current(poolId);
    const { versions } = await this._versions(poolId);
    const latest = versions[versions.length - 1];
    if (latest && latest.fingerprint === fingerprint) {
      return { shortlist: await this.getShortlist(poolId, latest.id), reused: true };
    }
    const version = versions.length + 1;
    const ranked = new Map(rows.map((r) => [r.memberId, r]));
    const log = await poolService.snapshot(pool.id, actor.id, GENERATED, {
      version,
      fingerprint,
      policy: { ...policy, waitlistSize },
      possible,
      work: workItems.map((w) => ({ key: w.id, label: w.title, kind: w.kind, required: w.required !== false })),
      quota,
      blockers: [...blockers.map((b) => ({ ...b, severity: 'block' })), ...warnings.map((w) => ({ ...w, severity: 'warn' }))],
      entries: undecided.map((r) => ({
        poolMemberId: r.memberId,
        rank: ranked.get(r.memberId).rank,
        totalScore: r.total,
        complete: r.complete,
        components: r.components,
        adjustment: r.adjustment,
        possible: r.possible,
        proposedOutcome: proposed.get(r.memberId),
      })),
    });
    await this._notifyOperators(pool, {
      title: blockers.length ? `${pool.name}: shortlist v${version} needs a decision` : `${pool.name}: shortlist v${version} is ready`,
      message: blockers.length ? blockers.map((b) => b.message).join(' · ') : `Top ${quota} proposed. Review and confirm the selection.`,
      relatedEntityId: log.id,
      dedupeType: 'pool_shortlist',
      exclude: actor.id,
    });
    return { shortlist: await this.getShortlist(poolId, log.id), reused: false };
  }

  /**
   * A person confirms the selection. `overrides` change a proposed outcome —
   * each needs a reason, and every candidate tied at the cutoff must be
   * decided explicitly. The scores are re-checked first: if anything moved
   * since this version was generated, it must be generated again.
   */
  async confirm(poolId, shortlistId, { overrides = [] } = {}, actor) {
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'confirm a selection');
    const shortlist = await this.getShortlist(poolId, shortlistId);
    if (shortlist.status === 'confirmed') throw new ValidationError('This shortlist is already confirmed');
    if (shortlist.status === 'superseded') throw new ValidationError('A newer shortlist exists — confirm that one');

    const hard = (shortlist.blockers || []).filter((b) => b.severity === 'block' && HARD_BLOCKERS.includes(b.code));
    if (hard.length) throw new ValidationError(`Resolve these first, then generate the shortlist again: ${hard.map((b) => b.message).join('; ')}`);

    const current = await this._current(poolId);
    if (current.fingerprint !== shortlist.fingerprint) {
      throw new ValidationError('Scores or candidates changed since this shortlist was generated — generate it again');
    }

    const byMember = new Map();
    for (const o of Array.isArray(overrides) ? overrides : []) {
      if (!o?.memberId) continue;
      if (!OUTCOMES.includes(o.outcome)) throw new ValidationError(`Unknown outcome "${o.outcome}"`);
      byMember.set(o.memberId, { outcome: o.outcome, reason: String(o.reason || '').trim() });
    }
    const entryByMember = new Map(shortlist.entries.map((e) => [e.poolMemberId, e]));
    for (const memberId of byMember.keys()) {
      if (!entryByMember.has(memberId)) throw new ValidationError('An override names a candidate who is not on this shortlist');
    }
    const tie = (shortlist.blockers || []).find((b) => b.code === 'tie_at_cutoff');
    if (tie) {
      const undecidedTie = tie.memberIds.filter((id) => !byMember.has(id) || !byMember.get(id).reason);
      if (undecidedTie.length) {
        throw new ValidationError(`Decide every candidate tied at the cutoff, with a reason (${undecidedTie.length} still to decide)`);
      }
    }
    for (const [memberId, o] of byMember) {
      if (o.outcome !== entryByMember.get(memberId).proposedOutcome && !o.reason) {
        throw new ValidationError('Every change to the proposed outcome needs a reason');
      }
    }

    const now = new Date();
    const outcomes = { selected: [], waitlisted: [], not_selected: [] };
    const finalEntries = [];
    await sequelize.transaction(async (transaction) => {
      for (const entry of shortlist.entries) {
        const o = byMember.get(entry.poolMemberId);
        const finalOutcome = o ? o.outcome : entry.proposedOutcome;
        const reason = o?.reason || null;
        outcomes[finalOutcome].push(entry.poolMemberId);
        finalEntries.push({ poolMemberId: entry.poolMemberId, rank: entry.rank, totalScore: entry.totalScore, proposedOutcome: entry.proposedOutcome, finalOutcome, overrideReason: reason });
        const [n] = await models.PoolMember.update({
          decision: finalOutcome,
          decisionReason: reason || `Confirmed from shortlist v${shortlist.version}`,
          decidedById: actor.id,
          decidedAt: now,
          scoreComponents: entry.components,
          totalScore: entry.totalScore,
          rank: entry.rank,
          placement: finalOutcome === 'selected' ? { status: 'pending' } : {},
        }, { where: { id: entry.poolMemberId, decision: null }, transaction });
        if (!n) throw new ValidationError('Someone was decided while this was being confirmed — generate the shortlist again');
      }
    });

    await poolService.snapshot(pool.id, actor.id, CONFIRMED, {
      shortlistId: shortlist.id,
      version: shortlist.version,
      fingerprint: shortlist.fingerprint,
      selected: outcomes.selected.length,
      waitlisted: outcomes.waitlisted.length,
      notSelected: outcomes.not_selected.length,
      overrides: [...byMember.entries()].map(([memberId, o]) => ({ memberId, outcome: o.outcome, reason: o.reason })),
      entries: finalEntries,
    });
    await this._notifyOutcomes(pool, outcomes);
    return this.getShortlist(poolId, shortlist.id);
  }

  /**
   * Change one candidate's decision after confirmation — promote someone from
   * the waitlist, or take a selected person out before placement. Always with
   * a reason, always audited. A placed candidate is managed from their clan.
   */
  async setDecision(poolId, memberId, { decision, reason }, actor) {
    if (!OUTCOMES.includes(decision)) throw new ValidationError('Choose selected, waitlisted or not selected');
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError('Give a reason for changing this decision');
    const pool = await poolService.getPool(poolId);
    poolService.assertActive(pool, 'change decisions');
    if (!(await poolService.isSelectionConfirmed(poolId))) {
      throw new ValidationError('Confirm a shortlist first — decisions come from it');
    }
    const member = await models.PoolMember.findOne({ where: { id: memberId, poolId } });
    if (!member) throw new NotFoundError('Candidate not found in this pool');
    if (['withdrawn', 'disqualified'].includes(member.decision)) throw new ValidationError(`This candidate was ${member.decision}`);
    if (member.placedAt) throw new ValidationError('This candidate is already placed in a clan');
    if (member.decision === decision) return member;
    const before = { decision: member.decision, decisionReason: member.decisionReason };
    await member.update({
      decision, decisionReason: text.slice(0, 2000), decidedById: actor.id, decidedAt: new Date(),
      placement: decision === 'selected' ? { status: 'pending', targetClanId: member.placement?.targetClanId || null } : {},
    });
    await poolService.audit(pool.id, actor.id, 'POOL_DECISION_CHANGED', { memberId, decision, reason: text }, before);
    await this._notifyOutcomes(pool, { [decision]: [member.id] }, { changed: true });
    return member;
  }

  async _notifyOutcomes(pool, outcomes, { changed = false } = {}) {
    const orchestrator = require('./notificationOrchestrator');
    // Every route to "selected" (shortlist confirm, a changed decision, the
    // progress threshold) comes through here, so the clan's mentors hear once.
    if (outcomes.selected?.length) {
      const automation = require('./poolAutomationService');
      await automation.safely('notify incoming mentors', () => automation.notifyIncomingMentors(pool, outcomes.selected));
    }
    const words = {
      selected: { title: `You have been selected: ${pool.name}`, message: 'Congratulations — you were selected. You will be placed in a clan shortly.' },
      waitlisted: { title: `You are on the waitlist: ${pool.name}`, message: 'You were placed on the waitlist. We will let you know if a place opens up.' },
      not_selected: { title: `${pool.name}: the outcome`, message: 'Thank you for taking part. You were not selected in this round.' },
    };
    for (const [outcome, memberIds] of Object.entries(outcomes)) {
      if (!memberIds?.length) continue;
      const members = await models.PoolMember.findAll({ where: { id: { [Op.in]: memberIds }, userId: { [Op.ne]: null } }, attributes: ['id', 'userId'] });
      for (const m of members) {
        // Dedupe also matches the stored (relatedEntityType, relatedEntityId),
        // so the first outcome is keyed on the member (sent once, ever) and a
        // later CHANGE gets a key of its own — each change is a new message.
        const entity = changed
          ? { relatedEntityType: 'pool_decision_change', relatedEntityId: crypto.randomUUID() }
          : { relatedEntityType: 'pool_outcome', relatedEntityId: m.id };
        await orchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.POOL_OUTCOME,
          recipients: [{ userId: m.userId }],
          payload: {
            ...words[outcome],
            actionUrl: '/mentee/dashboard',
            actionLabel: 'See outcome',
            ...entity,
            emailSubject: words[outcome].title,
          },
          dedupe: entity,
        }).catch((e) => console.error('[pool] outcome notification failed:', e.message));
      }
    }
  }

  /** Tell the pool's operators (pool.select holders + creator) something needs them. */
  async _notifyOperators(pool, { title, message, relatedEntityId, dedupeType, exclude = null, tab = 'shortlist' }) {
    try {
      const recipients = (await poolWorkEvents.holdersOf(pool, P.POOL_SELECT)).filter((id) => id !== exclude);
      if (!recipients.length) return;
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_ATTENTION,
        recipients: recipients.map((userId) => ({ userId })),
        payload: {
          title, message,
          actionUrl: poolWorkEvents.poolUrl(pool.id, tab),
          actionLabel: 'Open pool',
          relatedEntityType: dedupeType,
          relatedEntityId,
        },
        dedupe: { relatedEntityType: dedupeType, relatedEntityId },
      });
    } catch (error) {
      console.error('[pool] operator notification failed:', error.message);
    }
  }
}

module.exports = new PoolScoringService();
module.exports.HARD_BLOCKERS = HARD_BLOCKERS;

