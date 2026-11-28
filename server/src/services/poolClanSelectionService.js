/**
 * poolClanSelectionService — ranking and selection for a round that is a clan.
 *
 * Phase 4 of the intake/pool redesign. `poolScoringService` does this for the
 * original `CandidatePool` round, reading a JSON list of work items hung off
 * the pool row. A selection round is a clan now, so there is no such list: the
 * round's level rules say what each level is set to do, and the clan's
 * assigned tasks say how far each candidate got.
 *
 * What does NOT change is the arithmetic. Both services score a piece of work,
 * draw blockers and break ties through `selectionMath`, so two rounds running
 * side by side during the migration rank identical work identically. If you
 * are looking for the rule rather than the plumbing, it is in there.
 *
 * The selection record stays `PoolMember`, pointed at the clan (migration
 * 162). A decision, its reason, the confirmed score, the rank and the
 * placement attempt all live on it; none of that belongs on a clan membership,
 * which exists to say somebody is in the clan.
 *
 * Shortlists are snapshots in the audit log against the CLAN, not a table of
 * their own:
 *   POOL_SHORTLIST_GENERATED   { version, fingerprint, policy, quota, blockers, entries }
 *   POOL_SELECTION_CONFIRMED   { shortlistId, version, fingerprint, entries, overrides }
 * Generating with an unchanged fingerprint returns the existing snapshot, and
 * confirming re-checks it, so a selection can never be confirmed on scores
 * that have since moved.
 */
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { PERMISSIONS: P } = require('../config/permissions');
const { isPoolClan } = require('../config/clanKinds');
const poolService = require('./poolService');
const poolClanService = require('./poolClanService');
const poolWorkEvents = require('./poolWorkEvents');
const selectionMath = require('./selectionMath');

const { OUTCOMES, HARD_BLOCKERS, round2 } = selectionMath;
const { ADJUSTMENT_KEY } = poolService;
const GENERATED = 'POOL_SHORTLIST_GENERATED';
const CONFIRMED = 'POOL_SELECTION_CONFIRMED';
const STILL_RUNNING = { [Op.or]: [{ decision: null }, { decision: { [Op.notIn]: ['withdrawn', 'disqualified'] } }] };

class PoolClanSelectionService {
  /** The round, or a clear refusal. Only a pool clan has a selection. */
  async round(clanId) {
    const clan = await models.Clan.findByPk(clanId);
    if (!clan) throw new NotFoundError('Selection round not found');
    if (!isPoolClan(clan)) throw new ValidationError('That clan is not a selection round');
    return clan;
  }

  /** A round still open to decisions. */
  assertActive(clan, what = 'change') {
    if (clan.status === 'archived') throw new ValidationError(`This round is archived — you cannot ${what}`);
    if (clan.frozenAt) throw new ValidationError(`This round is frozen — you cannot ${what}`);
  }

  async isSelectionConfirmed(clanId) {
    const found = await poolService.snapshotsOn('Clan', clanId, [CONFIRMED]);
    return found.length > 0;
  }

  /**
   * Score every candidate still in the running. Pure read — nothing is saved.
   * Returns rows sorted for display (highest first; ties in a stable order).
   */
  async compute(clanId) {
    const clan = await this.round(clanId);
    const terms = poolClanService.selectionSettings(clan);
    const workItems = await poolClanService.workItems(clan);
    const roundLevels = poolClanService.roundLevels(clan);

    const members = await models.PoolMember.findAll({
      where: { clanId, ...STILL_RUNNING },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }],
    });
    const userIds = members.map((m) => m.userId).filter(Boolean);

    // The clan's own work. `withPoolWork` is still needed: these tasks carry no
    // enrollment, and the default scope hides work that is not a programme's.
    const tasks = userIds.length ? await models.AssignedTask.scope('withPoolWork').findAll({
      where: { clanId, menteeId: { [Op.in]: userIds }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id', 'menteeId', 'roadmapTaskId', 'status'],
    }) : [];
    const taskFor = new Map(tasks.map((t) => [`${t.menteeId}:${t.roadmapTaskId}`, t]));

    const feedback = tasks.length ? await models.TaskFeedback.findAll({
      where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) } },
      attributes: ['assignedTaskId', 'rating', 'isApproved', 'createdAt'],
      order: [['createdAt', 'DESC']],
    }) : [];
    const latestApproved = new Map();
    for (const f of feedback) {
      if (f.isApproved && !latestApproved.has(f.assignedTaskId)) latestApproved.set(f.assignedTaskId, f);
    }

    // Course work is scored from the provider's progress. Only fetched when
    // the round has course work at all, which most rounds will not.
    const courseFor = new Map();
    if (workItems.some((w) => w.kind === 'course') && tasks.length) {
      const enrollments = await models.CourseEnrollment.findAll({
        where: { assignedTaskId: { [Op.in]: tasks.map((t) => t.id) } },
        attributes: ['assignedTaskId', 'lifecycle', 'progressStatus', 'overallProgress'],
      });
      for (const e of enrollments) courseFor.set(e.assignedTaskId, e);
    }

    // What a perfect round is worth, across every level. Shown next to the
    // shortlist; each candidate's own ceiling is on their row.
    const possible = workItems.reduce((sum, w) => sum + w.points, 0);

    const rows = members.map((member) => {
      let total = 0;
      let complete = true;
      // Their own perfect round. Work set for another level is not theirs to
      // earn, so counting it would rank them against a total they were never
      // allowed to reach.
      let possibleForMember = 0;

      const parts = workItems.map((w) => {
        const t = member.userId ? taskFor.get(`${member.userId}:${w.roadmapTaskId}`) : null;
        const { earned, status } = selectionMath.scorePart({
          worth: w.points,
          kind: w.kind,
          targeted: poolService.targetsMember(w, member, roundLevels),
          task: t,
          approval: t ? latestApproved.get(t.id) : null,
          enrollment: t ? courseFor.get(t.id) : null,
        });
        total += earned;
        if (status !== 'not_targeted') {
          possibleForMember += w.points;
          if (w.required && status !== 'scored') complete = false;
        }
        return {
          key: w.id,
          label: w.title,
          kind: w.kind,
          required: w.required,
          points: w.points,
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
        userId: member.userId,
        name: models.PoolMember.displayName(member),
        email: member.email,
        level: member.level || null,
        activated: Boolean(member.userId),
        decision: member.decision,
        createdAt: member.createdAt,
        components: parts,
        adjustment: round2(adjustment),
        adjustmentNote: adjustmentEntry?.note || null,
        possible: possibleForMember,
        total: round2(total),
        complete,
      };
    });

    selectionMath.rankRows(rows);
    return { clan, terms, policy: terms.scoringPolicy, workItems, possible, rows };
  }

  /** The current ranking, with what would block or warn a shortlist made from it. */
  async _current(clanId) {
    const { clan, terms, policy, workItems, possible, rows } = await this.compute(clanId);
    const proposal = selectionMath.propose(terms, workItems, rows);
    const fingerprint = selectionMath.fingerprint(policy, proposal.quota, proposal.waitlistSize, proposal.undecided);
    return { clan, terms, policy, workItems, possible, rows, ...proposal, fingerprint };
  }

  /** Live scores — what a shortlist generated now would contain. */
  async liveScores(clanId) {
    const { policy, workItems, possible, rows, blockers, warnings, proposed } = await this._current(clanId);
    return {
      policy,
      possible,
      // The work, in the order the score columns read, so a table can be built
      // from this one answer without a second request.
      work: workItems.map((w) => ({ key: w.id, label: w.title, kind: w.kind, required: w.required, levels: w.levels })),
      blockers,
      warnings,
      rows: rows.map((r) => ({ ...r, proposedOutcome: proposed.get(r.memberId) || null })),
    };
  }

  /** Every shortlist version, with its status read from the log. */
  async _versions(clanId) {
    const logs = await poolService.snapshotsOn('Clan', clanId, [GENERATED, CONFIRMED]);
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

  async listShortlists(clanId) {
    const { versions } = await this._versions(clanId);
    return versions.reverse().map(({ log, ...v }) => v);
  }

  /** One version, with each candidate's components, rank and outcome. */
  async getShortlist(clanId, shortlistId) {
    const { versions, confirmation } = await this._versions(clanId);
    const found = versions.find((v) => v.id === shortlistId);
    if (!found) throw new NotFoundError('Shortlist not found');
    const { log, ...meta } = found;
    const entries = log.newValues?.entries || [];
    const finals = meta.status === 'confirmed'
      ? new Map((confirmation.newValues?.entries || []).map((e) => [e.poolMemberId, e]))
      : new Map();
    const members = entries.length ? await models.PoolMember.findAll({
      where: { id: { [Op.in]: entries.map((e) => e.poolMemberId) } },
      attributes: ['id', 'email', 'userId', 'decision', 'level', 'details'],
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
            id: m.id, email: m.email, decision: m.decision, level: m.level,
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
  async generate(clanId, actor) {
    if (await this.isSelectionConfirmed(clanId)) {
      throw new ValidationError('A shortlist is already confirmed. Change individual decisions instead.');
    }
    const { clan, policy, possible, workItems, rows, quota, waitlistSize, blockers, warnings, proposed, undecided, fingerprint } = await this._current(clanId);
    const { versions } = await this._versions(clanId);
    const latest = versions[versions.length - 1];
    if (latest && latest.fingerprint === fingerprint) {
      return { shortlist: await this.getShortlist(clanId, latest.id), reused: true };
    }
    const version = versions.length + 1;
    const ranked = new Map(rows.map((r) => [r.memberId, r]));
    const log = await poolService.snapshotOn('Clan', clan.id, actor.id, GENERATED, {
      version,
      fingerprint,
      policy: { ...policy, waitlistSize },
      possible,
      work: workItems.map((w) => ({ key: w.id, label: w.title, kind: w.kind, required: w.required, levels: w.levels })),
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
    await this._notifyOperators(clan, {
      title: blockers.length ? `${clan.name}: shortlist v${version} needs a decision` : `${clan.name}: shortlist v${version} is ready`,
      message: blockers.length ? blockers.map((b) => b.message).join(' · ') : `Top ${quota} proposed. Review and confirm the selection.`,
      relatedEntityId: log.id,
      dedupeType: 'pool_shortlist',
      exclude: actor.id,
    });
    return { shortlist: await this.getShortlist(clanId, log.id), reused: false };
  }

  /**
   * A person confirms the selection. `overrides` change a proposed outcome —
   * each needs a reason, and every candidate tied at the cutoff must be
   * decided explicitly. The scores are re-checked first: if anything moved
   * since this version was generated, it must be generated again.
   */
  async confirm(clanId, shortlistId, { overrides = [] } = {}, actor) {
    const clan = await this.round(clanId);
    this.assertActive(clan, 'confirm a selection');
    const shortlist = await this.getShortlist(clanId, shortlistId);
    if (shortlist.status === 'confirmed') throw new ValidationError('This shortlist is already confirmed');
    if (shortlist.status === 'superseded') throw new ValidationError('A newer shortlist exists — confirm that one');

    const hard = (shortlist.blockers || []).filter((b) => b.severity === 'block' && HARD_BLOCKERS.includes(b.code));
    if (hard.length) throw new ValidationError(`Resolve these first, then generate the shortlist again: ${hard.map((b) => b.message).join('; ')}`);

    const current = await this._current(clanId);
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

    await poolService.snapshotOn('Clan', clan.id, actor.id, CONFIRMED, {
      shortlistId: shortlist.id,
      version: shortlist.version,
      fingerprint: shortlist.fingerprint,
      selected: outcomes.selected.length,
      waitlisted: outcomes.waitlisted.length,
      notSelected: outcomes.not_selected.length,
      overrides: [...byMember.entries()].map(([memberId, o]) => ({ memberId, outcome: o.outcome, reason: o.reason })),
      entries: finalEntries,
    });
    await this._notifyOutcomes(clan, outcomes);
    return this.getShortlist(clanId, shortlist.id);
  }

  /**
   * Change one candidate's decision after confirmation — promote someone from
   * the waitlist, or take a selected person out before placement. Always with
   * a reason, always audited. A placed candidate is managed from their clan.
   */
  async setDecision(clanId, memberId, { decision, reason }, actor) {
    if (!OUTCOMES.includes(decision)) throw new ValidationError('Choose selected, waitlisted or not selected');
    const text = String(reason || '').trim();
    if (!text) throw new ValidationError('Give a reason for changing this decision');
    const clan = await this.round(clanId);
    this.assertActive(clan, 'change decisions');
    if (!(await this.isSelectionConfirmed(clanId))) {
      throw new ValidationError('Confirm a shortlist first — decisions come from it');
    }
    const member = await models.PoolMember.findOne({ where: { id: memberId, clanId } });
    if (!member) throw new NotFoundError('Candidate not found in this round');
    if (['withdrawn', 'disqualified'].includes(member.decision)) throw new ValidationError(`This candidate was ${member.decision}`);
    if (member.placedAt) throw new ValidationError('This candidate is already placed in a clan');
    if (member.decision === decision) return member;
    const before = { decision: member.decision, decisionReason: member.decisionReason };
    await member.update({
      decision, decisionReason: text.slice(0, 2000), decidedById: actor.id, decidedAt: new Date(),
      placement: decision === 'selected' ? { status: 'pending', targetClanId: member.placement?.targetClanId || null } : {},
    });
    await require('../utils/auditContext').createAuditLog({
      userId: actor.id,
      action: 'POOL_DECISION_CHANGED',
      entityType: 'Clan',
      entityId: clan.id,
      newValues: { memberId, decision, reason: text },
      oldValues: before,
    }).catch(() => {});
    await this._notifyOutcomes(clan, { [decision]: [member.id] }, { changed: true });
    return member;
  }

  async _notifyOutcomes(clan, outcomes, { changed = false } = {}) {
    const crypto = require('crypto');
    const orchestrator = require('./notificationOrchestrator');
    const words = {
      selected: { title: `You have been selected: ${clan.name}`, message: 'Congratulations — you were selected. You will be placed in a clan shortly.' },
      waitlisted: { title: `You are on the waitlist: ${clan.name}`, message: 'You were placed on the waitlist. We will let you know if a place opens up.' },
      not_selected: { title: `${clan.name}: the outcome`, message: 'Thank you for taking part. You were not selected in this round.' },
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
        }).catch((e) => console.error('[pool-clan] outcome notification failed:', e.message));
      }
    }
  }

  /** Tell the round's operators (pool.select holders + its creator) it needs them. */
  async _notifyOperators(clan, { title, message, relatedEntityId, dedupeType, exclude = null }) {
    try {
      // holdersOf reads programId and createdById — the same question of a clan.
      const recipients = (await poolWorkEvents.holdersOf(
        { programId: clan.programId, createdById: clan.createdBy }, P.POOL_SELECT,
      )).filter((id) => id !== exclude);
      if (!recipients.length) return;
      await require('./notificationOrchestrator').dispatch({
        eventKey: NOTIFICATION_EVENTS.POOL_ATTENTION,
        recipients: recipients.map((userId) => ({ userId })),
        payload: {
          title, message,
          actionUrl: `/admin/clans/${clan.id}?tab=shortlist`,
          actionLabel: 'Open round',
          relatedEntityType: dedupeType,
          relatedEntityId,
        },
        dedupe: { relatedEntityType: dedupeType, relatedEntityId },
      });
    } catch (error) {
      console.error('[pool-clan] operator notification failed:', error.message);
    }
  }
}

module.exports = new PoolClanSelectionService();
