const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError } = require('../utils/errors/errorTypes');
const cohortService = require('./cohortService');
const clanService = require('./clanService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));

/**
 * promotionService - the mentee→co-mentor pipeline. Readiness/willingness are
 * computed from the mentee's real stats + working-style read, mirroring the
 * prototype's heuristic. Promotion grants the 'mentor' capability and an
 * optional co_mentor clan membership.
 */
class PromotionService {
  async _enrich(candidate) {
    const row = await cohortService.buildMenteeRow(candidate.menteeId);
    const profile = await models.MenteeProfile.findOne({ where: { userId: candidate.menteeId }, attributes: ['personality'] });
    const p = profile?.personality || {};
    const resilience = p.resilience ?? 50;
    const communication = p.communication ?? 50;
    const consistency = p.consistency ?? 50;

    const readiness = row ? clamp(row.absoluteProgress * 0.45 + row.onTimeRate * 0.35 + resilience * 0.2) : 0;
    const willingness = clamp(communication * 0.65 + consistency * 0.35);

    // Data-driven strength suggestions (quick-add chips) — only ones the mentee's
    // real stats actually support, so they're honest, not generic.
    const suggestedStrengths = [];
    if ((row?.onTimeRate ?? 0) >= 90) suggestedStrengths.push('Reliable — consistently on time');
    if ((row?.absoluteProgress ?? 0) >= 60) suggestedStrengths.push('Strong progress through the program');
    if (resilience >= 60) suggestedStrengths.push('Resilient under pressure');
    if (communication >= 60) suggestedStrengths.push('Communicates clearly');
    if (consistency >= 60) suggestedStrengths.push('Consistent week to week');
    if ((row?.openBlockers ?? 0) === 0) suggestedStrengths.push('Self-unblocks');
    if (row?.momentum === 'up') suggestedStrengths.push('Building momentum');

    // Who nominated + which clan it targets, for the admin review screen.
    const nominator = candidate.nominatedBy
      ? await models.User.findByPk(candidate.nominatedBy, { attributes: ['firstName', 'lastName'] })
      : null;
    const clan = candidate.targetClanId
      ? await models.Clan.findByPk(candidate.targetClanId, { attributes: ['id', 'name'] })
      : null;

    return {
      id: candidate.id,
      menteeId: candidate.menteeId,
      stage: candidate.stage,
      motivation: candidate.motivation,
      strengths: candidate.strengths,
      availability: candidate.availability,
      decisionNote: candidate.decisionNote,
      targetClanId: candidate.targetClanId,
      targetClanName: clan?.name || null,
      nominatedBy: candidate.nominatedBy,
      nominatorName: nominator ? `${nominator.firstName} ${nominator.lastName}`.trim() : null,
      createdAt: candidate.createdAt,
      name: row?.name || 'Mentee',
      avatar: row?.avatar || '?',
      avatarUrl: row?.profilePictureUrl || null,
      program: row?.program || null,
      level: row?.level || null,
      absoluteProgress: row?.absoluteProgress ?? 0,
      onTimeRate: row?.onTimeRate ?? 0,
      readiness,
      willingness,
      // Decision-support context for the interview drawer.
      lastActive: row?.lastActive ?? null,
      momentum: row?.momentum ?? null,
      openBlockers: row?.openBlockers ?? 0,
      signals: row?.signals ?? [],
      traits: { resilience, communication, consistency },
      suggestedStrengths
    };
  }

  /**
   * AI-draft the interview write-up (motivation + strengths) from the mentee's
   * REAL stats, so the mentor edits a grounded starting point instead of typing
   * "idk". Honest-by-construction: the prompt is fed only the computed numbers,
   * and we fall back to a rule-based draft if the model output can't be parsed.
   */
  async aiDraft(id) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');
    const c = await this._enrich(candidate);

    const brief = [
      `Mentee: ${c.name}`,
      c.program ? `Program: ${c.program}` : null,
      `Progress through the program: ${c.absoluteProgress}%`,
      `On-time delivery: ${c.onTimeRate}%`,
      `Readiness score: ${c.readiness}/100; willingness score: ${c.willingness}/100`,
      `Working style — resilience ${c.traits.resilience}/100, communication ${c.traits.communication}/100, consistency ${c.traits.consistency}/100`,
      `Open blockers: ${c.openBlockers}; momentum: ${c.momentum || 'steady'}; last active: ${c.lastActive || 'unknown'}`,
      c.signals?.length ? `Signals: ${c.signals.join('; ')}` : null,
    ].filter(Boolean).join('\n');

    const system =
      'You are an experienced mentor drafting brief notes for a co-mentor promotion interview. ' +
      'Using ONLY the data provided (never invent facts), return STRICT JSON with exactly two keys: ' +
      '"motivation" (1-2 sentences on why this mentee is a strong candidate to help lead) and ' +
      '"strengths" (1-2 sentences naming concrete strengths grounded in the numbers). ' +
      'Warm, professional, specific. No markdown, no extra keys, JSON only.';
    const prompt = `Data:\n${brief}\n\nReturn the JSON now.`;

    let motivation = '';
    let strengths = '';
    try {
      const text = await this.constructor._groq().generateText({
        system, prompt, feature: 'summary', userId: candidate.nominatedBy, temperature: 0.5, maxTokens: 300
      });
      const match = String(text || '').match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        motivation = String(parsed.motivation || '').trim();
        strengths = String(parsed.strengths || '').trim();
      }
    } catch (e) {
      console.error('[promotion] AI draft failed, using fallback:', e.message);
    }

    // Rule-based fallback so the button always returns something useful.
    if (!motivation) {
      motivation = `${c.name.split(' ')[0]} is ${c.absoluteProgress}% through the program with ${c.onTimeRate}% on-time delivery` +
        `${c.openBlockers === 0 ? ' and no open blockers' : ''} — a dependable candidate ready to help guide others.`;
    }
    if (!strengths) {
      strengths = (c.suggestedStrengths || []).slice(0, 3).join('; ') || 'Consistent, reliable delivery.';
    }
    return { motivation, strengths };
  }

  static _groq() { return require('./groqService'); }

  /**
   * Tell every admin a candidate needs their attention. `kind`:
   *   'nominated' — a mentor just put someone forward (FYI / tracking)
   *   'awaiting'  — the mentor marked them ready; admin does the final promotion
   * Best-effort: never block the nomination/advance on a notification failure.
   */
  async _notifyAdmins(candidate, kind) {
    try {
      const [mentee, admins] = await Promise.all([
        models.User.findByPk(candidate.menteeId, { attributes: ['firstName', 'lastName'] }),
        models.User.findAll({ where: { role: 'admin', status: 'active' }, attributes: ['id'] })
      ]);
      if (!admins.length) return;
      const who = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'A mentee';
      const awaiting = kind === 'awaiting';
      // Distinct entity tag per kind so the actionable "awaiting" ping isn't
      // deduped away by the earlier "nominated" FYI (the orchestrator dedupes on
      // the payload's relatedEntityType+Id too), while re-saves of the same kind
      // stay collapsed.
      const entityType = awaiting ? 'promotion_awaiting' : 'promotion_nominated';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.PROMOTION_NOMINATED,
        recipients: admins.map((a) => ({ userId: a.id })),
        payload: {
          title: awaiting ? 'Co-mentor promotion awaiting approval' : 'New co-mentor nomination',
          message: awaiting
            ? `${who} has been marked ready for promotion to co-mentor. Review and approve on the Promotions page.`
            : `${who} was nominated to become a co-mentor. Track them on the Promotions page.`,
          actionUrl: '/admin/promotions',
          actionLabel: 'Review promotions',
          relatedEntityType: entityType,
          relatedEntityId: candidate.id,
          emailSubject: awaiting ? `Pathment: ${who} is ready for co-mentor promotion` : `Pathment: ${who} nominated for co-mentor`
        },
        dedupe: { relatedEntityType: entityType, relatedEntityId: candidate.id }
      });
    } catch (e) {
      console.error('[promotion] admin notify failed:', e.message);
    }
  }

  async list({ actorId, isAdmin }) {
    const where = isAdmin ? {} : { nominatedBy: actorId };
    const candidates = await models.PromotionCandidate.findAll({ where, order: [['created_at', 'DESC']] });
    return Promise.all(candidates.map((c) => this._enrich(c)));
  }

  async nominate(menteeId, mentorId) {
    if (!menteeId) throw new ValidationError('menteeId is required');
    const existing = await models.PromotionCandidate.findOne({
      where: { menteeId, stage: { [Op.ne]: 'promoted' } }
    });
    if (existing) throw new ConflictError('This mentee is already in the promotion pipeline');
    const candidate = await models.PromotionCandidate.create({ menteeId, nominatedBy: mentorId, stage: 'nominated' });
    await this._notifyAdmins(candidate, 'nominated');
    return this._enrich(candidate);
  }

  async advance(id, data) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');
    const order = ['nominated', 'interview', 'approved', 'promoted', 'rejected'];
    const prevStage = candidate.stage;
    if (data.stage) {
      if (!order.includes(data.stage)) throw new ValidationError('Invalid stage');
      candidate.stage = data.stage;
    }
    ['motivation', 'strengths', 'availability', 'decisionNote', 'targetClanId'].forEach((k) => {
      if (data[k] !== undefined) candidate[k] = data[k];
    });
    await candidate.save();
    // Reaching "approved" = the mentor handed it to the admin → ping admins.
    if (candidate.stage === 'approved' && prevStage !== 'approved') {
      await this._notifyAdmins(candidate, 'awaiting');
    }
    return this._enrich(candidate);
  }

  /**
   * Tell the mentor who nominated how it ended. `kind`: 'promoted' | 'declined'.
   * Best-effort — never block the action on a notification failure.
   */
  async _notifyNominator(candidate, kind) {
    try {
      if (!candidate.nominatedBy) return;
      const mentee = await models.User.findByPk(candidate.menteeId, { attributes: ['firstName', 'lastName'] });
      const who = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'Your nominee';
      const promoted = kind === 'promoted';
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.PROMOTION_NOMINATED,
        recipients: [{ userId: candidate.nominatedBy }],
        payload: {
          title: promoted ? 'Your nominee was promoted' : 'Nomination not approved',
          message: promoted
            ? `${who}, who you nominated, has been approved and promoted to co-mentor.`
            : `${who}'s promotion to co-mentor was not approved by an admin.${candidate.decisionNote ? ` Note: ${candidate.decisionNote}` : ''}`,
          actionUrl: '/mentor/promotions',
          actionLabel: 'View promotions',
          relatedEntityType: `promotion_result_${kind}`,
          relatedEntityId: candidate.id,
          emailSubject: promoted ? `Pathment: ${who} was promoted to co-mentor` : `Pathment: ${who}'s promotion wasn't approved`
        },
        dedupe: { relatedEntityType: `promotion_result_${kind}`, relatedEntityId: candidate.id }
      });
    } catch (e) {
      console.error('[promotion] nominator notify failed:', e.message);
    }
  }

  /** Admin (or nominating mentor) declines a candidate — closes the pipeline entry. */
  async decline(id, { decisionNote } = {}) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');
    candidate.stage = 'rejected';
    if (decisionNote !== undefined) candidate.decisionNote = decisionNote;
    await candidate.save();
    await this._notifyNominator(candidate, 'declined');
    return this._enrich(candidate);
  }

  /** Final promotion (admin): grant mentor capability + optional co_mentor clan role. */
  async promote(id, { clanId } = {}) {
    const candidate = await models.PromotionCandidate.findByPk(id);
    if (!candidate) throw new NotFoundError('Candidate not found');

    const user = await models.User.findByPk(candidate.menteeId);
    if (!user) throw new NotFoundError('User not found');
    await clanService.ensureCapability(user, 'mentor');

    const targetClan = clanId || candidate.targetClanId;
    if (targetClan) {
      await clanService.addMember(targetClan, { userId: candidate.menteeId, role: 'co_mentor' });
      candidate.targetClanId = targetClan;
    }

    candidate.stage = 'promoted';
    await candidate.save();

    // Tell the new co-mentor the good news.
    try {
      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.PROMOTION_NOMINATED,
        recipients: [{ userId: candidate.menteeId }],
        payload: {
          title: 'You\'re now a co-mentor! 🎉',
          message: targetClan
            ? 'Congratulations — you\'ve been promoted to co-mentor and added to a clan team. Switch to the Mentor view to get started.'
            : 'Congratulations — you\'ve been promoted to co-mentor. Switch to the Mentor view to get started.',
          actionUrl: '/mentor/clan-team',
          actionLabel: 'Open Mentor view',
          relatedEntityType: 'promotion_candidate',
          relatedEntityId: candidate.id,
          emailSubject: 'Pathment: you\'ve been promoted to co-mentor'
        },
        dedupe: { relatedEntityType: 'promotion_done', relatedEntityId: candidate.id }
      });
    } catch (e) {
      console.error('[promotion] promote notify failed:', e.message);
    }

    // Tell the mentor who nominated them, too.
    await this._notifyNominator(candidate, 'promoted');

    return this._enrich(candidate);
  }
}

module.exports = new PromotionService();
