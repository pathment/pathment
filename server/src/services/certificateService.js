const { requireWorkspaceId } = require('../utils/workspaceExecution');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const groqService = require('./groqService');
const logger = require('../utils/logger');
const emailService = require('./emailService');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { certificateAwardedEmail } = require('../utils/emailTemplate');
const {
  preCheckHardConstraints,
  aggregateMenteeData,
  buildBatchMenteePrompt,
  extractJsonFromText,
  enrichEvaluationResults
} = require('../utils/certificateUtils');
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');
const {
  generateCertificateNumber,
  normalizeCertificateNumber,
  isCertificateNumber,
  MAX_ATTEMPTS: NUMBER_MAX_ATTEMPTS
} = require('../utils/certificateNumber');
const authzService = require('./authzService');
const certificateVerificationService = require('./certificateVerificationService');
const { VISIBLE_MEMBERSHIP_STATUSES, strongestClanRole } = require('../config/membership');
const { PERMISSIONS } = require('../config/permissions');
const { isNonProgrammeClan, isStandingClan } = require('../config/clanKinds');

// A per-tier value is either a line of certificate wording or an image URL.
// Generous enough for a paragraph or a signed Cloudinary URL, bounded so a
// template's JSONB column cannot be used as free storage.
const TIER_VALUE_MAX_LENGTH = 2000;

function deduplicateById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Turn a flat list of a mentee's tasks into the roadmaps they came from.
 *
 * Custom one-off tasks a mentor added are collected separately rather than
 * dropped: they are real work and the admin should see them, but they are not
 * part of any syllabus and counting them as roadmap progress is what made the
 * completion rate mean different things for different people.
 */
function groupTasksByRoadmap(tasks) {
  const byRoadmap = new Map();
  const custom = [];

  for (const task of tasks) {
    if (!task.roadmapId) { custom.push(task); continue; }
    if (!byRoadmap.has(task.roadmapId)) {
      byRoadmap.set(task.roadmapId, {
        id: task.roadmapId,
        name: task.roadmapName || 'Roadmap',
        tasks: []
      });
    }
    byRoadmap.get(task.roadmapId).tasks.push(task);
  }

  const summarise = (group) => {
    const done = group.tasks.filter((t) => t.status === 'completed');
    const ordered = [...group.tasks].sort((a, b) => (a.taskOrder ?? 0) - (b.taskOrder ?? 0));
    return {
      ...group,
      tasks: ordered,
      total: group.tasks.length,
      completed: done.length,
      remaining: group.tasks.length - done.length,
      late: done.filter((t) => t.isLate).length,
      percent: group.tasks.length ? Math.round((done.length / group.tasks.length) * 100) : 0
    };
  };

  const out = [...byRoadmap.values()].map(summarise);
  if (custom.length) {
    out.push(summarise({ id: null, name: 'Custom tasks (not part of a roadmap)', tasks: custom }));
  }
  return out;
}

class CertificateService {
  // ==================== QUALIFICATION & SCOPE METHODS ====================

  /**
   * The clans this user may act on for certificates, inside one program.
   *
   * Derived from the permission they actually hold at each clan
   * (`authzService.clansWhereCan`) rather than from a `clan_memberships` row
   * with role lead_mentor/co_mentor. That matters because cross-clan cover and
   * explicit IAM grants also make somebody responsible for a clan, and reading
   * the membership table directly misses both.
   *
   * `clanId` narrows further to the clan picked in the sidebar, so a mentor who
   * runs several clans evaluates the one they are looking at.
   */
  async getMentorScopedMenteeClans(user, programId, { clanId = null } = {}) {
    if (!user) return [];
    let clanIds = await authzService.clansWhereCan(user, PERMISSIONS.MENTEE_VIEW);
    if (!clanIds.length) return [];

    // A clan outside the programme's accounting (standing, or a selection
    // round): that clan only, never cohort clans of the same program.
    if (clanId) {
      const picked = await models.Clan.findByPk(clanId, { attributes: ['id', 'kind'] });
      if (isNonProgrammeClan(picked)) {
        return clanIds.includes(clanId) ? [clanId] : [];
      }
    }

    {
      const inProgram = await models.Clan.findAll({
        where: { id: { [Op.in]: clanIds }, kind: 'cohort', ...(programId ? { programId } : {}) },
        attributes: ['id'],
        raw: true
      });
      clanIds = inProgram.map((c) => c.id);
    }
    if (clanId) clanIds = clanIds.filter((id) => id === clanId);
    return clanIds;
  }

  /**
   * Throw unless the user may act on this mentee's certificate.
   *
   * The old shape of this check was `if (user.role === 'mentee') deny; if
   * (user.role === 'mentor') scope-check` — which got BOTH halves wrong for a
   * co-mentor promoted from a mentee account. They were denied their own
   * mentees on the read paths, and on delete/revoke the `role === 'mentor'`
   * test simply did not match, so the scope check never ran at all and they
   * could revoke anybody's certificate.
   */
  async assertCanActOnMentee(user, menteeId, message) {
    if (!user) throw new ForbiddenError(message);
    if (user.id === menteeId) return;                       // your own certificate
    const scope = await this.resolveMenteeScope(user);
    if (scope === null) return;                             // admin access
    if (!scope.includes(menteeId)) throw new ForbiddenError(message);
  }

  /**
   * Which mentees this user may see, grade and issue to.
   *
   *   null  → unrestricted, and ONLY for real org/program admin access
   *   [ids] → exactly the mentees they mentor
   *
   * This used to key off `user.role`, the column that records what an account
   * was CREATED as. A co-mentor promoted from mentee still reads 'mentee'
   * there, so the old `userRole !== 'mentor'` test fell through to the
   * unrestricted branch and handed them the entire programme: the AI evaluation
   * they started said "0 / 623" because it was grading every enrolled mentee in
   * the org, not the dozen in their clan. Capability is derived now, and the
   * default is closed — an empty scope means "nobody", never "everybody".
   */
  async resolveMenteeScope(user, { programId = null, clanId = null } = {}) {
    if (!user) return [];
    // `actsAsAdmin`, not `hasAdminAccess`: in the mentor portal an admin gets a
    // mentor's rows. See authzService.actsAsAdmin.
    if (await authzService.actsAsAdmin(user)) return null;

    const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
    if (!clanIds.length) return [];

    const menteeMembers = await models.ClanMembership.findAll({
      where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
      attributes: ['userId'],
      raw: true
    });
    return [...new Set(menteeMembers.map((m) => m.userId))];
  }

  /**
   * The mentees a certificate template is about, for THIS user.
   *
   * `user` decides the scope, not a mentorId the client happened to send: an
   * admin gets the whole programme, anybody else gets only the clans they
   * actually mentor. The caller no longer has to know which of those it is.
   */
  async getScopedMenteesForTemplate(programId, user, { clanId = null } = {}) {
    const activeMentees = [];
    const pausedMentees = [];

    // Outside the programme: roster = that clan only (no enrollments / no cohort).
    if (clanId) {
      const picked = await models.Clan.findByPk(clanId, { attributes: ['id', 'name', 'kind'] });
      if (isNonProgrammeClan(picked)) {
        const isAdmin = await authzService.actsAsAdmin(user);
        if (!isAdmin) {
          const allowed = await this.getMentorScopedMenteeClans(user, programId, { clanId });
          if (!allowed.includes(clanId)) {
            return { activeMentees: [], pausedMentees: [] };
          }
        }
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'profilePictureUrl'] }],
        });
        for (const mem of menteeMembers) {
          if (!mem.user) continue;
          const u = mem.user;
          const row = {
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            email: u.email,
            profilePictureUrl: u.profilePictureUrl ?? null,
            clanId: picked.id,
            clanName: picked.name,
          };
          (mem.status === 'paused' || u.status === 'suspended')
            ? pausedMentees.push(row)
            : activeMentees.push(row);
        }
        return {
          activeMentees: deduplicateById(activeMentees),
          pausedMentees: deduplicateById(pausedMentees),
        };
      }
    }

    // One pass over this programme's mentee memberships answers both questions
    // the roster needs: who is paused, and which clan each person sits in.
    // Resolved up front rather than per row — a cohort is hundreds of people,
    // and this is the difference between one query and hundreds.
    const pausedMenteeIdsSet = new Set();
    const clanByMentee = new Map();
    if (programId) {
      const memberships = await models.ClanMembership.findAll({
        where: { role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
        include: [{ model: models.Clan, as: 'clan', where: { programId, kind: 'cohort' }, attributes: ['id', 'name', 'frozenAt'] }],
        attributes: ['userId', 'status']
      });
      for (const mem of memberships) {
        if (mem.status === 'paused') pausedMenteeIdsSet.add(mem.userId);
        // Prefer a frozen (completed) cohort clan over a live one when both
        // exist — cohort certificates stay on the finished program.
        if (!mem.clan) continue;
        const prev = clanByMentee.get(mem.userId);
        const nextFrozen = !!mem.clan.frozenAt;
        if (!prev || (nextFrozen && !prev._frozen)) {
          clanByMentee.set(mem.userId, {
            clanId: mem.clan.id,
            clanName: mem.clan.name,
            _frozen: nextFrozen,
          });
        }
      }
    }
    const withClan = (row) => {
      const hit = clanByMentee.get(row.id);
      if (!hit) return { ...row, clanId: null, clanName: null };
      return { ...row, clanId: hit.clanId, clanName: hit.clanName };
    };

    // Unrestricted ONLY for real admin access. Everyone else is confined to the
    // clans they mentor — and to none at all if they mentor none, which is the
    // safe answer rather than the whole programme.
    const isAdmin = await authzService.actsAsAdmin(user);

    if (!isAdmin) {
      const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'profilePictureUrl'] }]
        });
        const seenMentees = new Set();
        for (const mem of menteeMembers) {
          if (!mem.user || seenMentees.has(mem.user.id)) continue;
          seenMentees.add(mem.user.id);
          const u = mem.user;
          const row = withClan({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, profilePictureUrl: u.profilePictureUrl ?? null });
          (mem.status === 'paused' || u.status === 'suspended' || pausedMenteeIdsSet.has(u.id))
            ? pausedMentees.push(row)
            : activeMentees.push(row);
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'profilePictureUrl'] }]
      });
      for (const e of enrollments) {
        if (!e.mentee) continue;
        const row = withClan({ id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email, profilePictureUrl: e.mentee.profilePictureUrl ?? null });
        (e.status === 'paused' || e.mentee.status === 'suspended' || pausedMenteeIdsSet.has(e.mentee.id))
          ? pausedMentees.push(row)
          : activeMentees.push(row);
      }
    }

    return {
      activeMentees: deduplicateById(activeMentees),
      pausedMentees: deduplicateById(pausedMentees)
    };
  }

  async getQualification(id, queryMentorId, user, { clanId = null } = {}) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    // `queryMentorId` lets an ADMIN look at one mentor's slice. It can never
    // widen anybody's scope: the resolver below asks what this user actually
    // mentors, so a non-admin is confined to their own clans whatever the
    // client sends.
    const { activeMentees, pausedMentees } = await this.getScopedMenteesForTemplate(
      programId, user, { clanId }
    );

    const existingInstances = await models.CertificateInstance.findAll({
      where: { templateId: id },
      attributes: ['menteeId', 'mentorId', 'tier']
    });
    const issuedMap = {};
    for (const inst of existingInstances) {
      const key = inst.menteeId || inst.mentorId;
      if (key) { issuedMap[key] ??= []; issuedMap[key].push(inst.tier); }
    }

    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    const aiResults = Array.isArray(template.aiEvaluation?.results) ? template.aiEvaluation.results : [];
    const aiResultMap = Object.fromEntries(aiResults.map(r => [r.mentee_id || r.id, r]));
    const reviews = await models.CertificateVerification.findAll({ where: { templateId: id }, raw: true });
    const reviewMap = new Map(reviews.map(row => [row.menteeId, row]));

    const hasAiRun = aiResults.length > 0;

    const buildMenteeRow = (m) => {
      const review = reviewMap.get(m.id);
      const aiEval = aiResultMap[m.id];
      const issuedTiers = issuedMap[m.id] || [];
      const issuedTier = issuedTiers[issuedTiers.length - 1] || null;
      // Once sent, the issued credential is the final answer. Showing an old
      // AI/review "No certificate" decision beside an issued badge made the
      // roster contradict itself after a direct admin issuance.
      if (issuedTier) {
        const evidenceScore = review?.aiMatchScore ?? (Number(aiEval?.match_score) || 0);
        return { ...m, assignedDecision: 'award', assignedTier: issuedTier,
          tierMatches: { [issuedTier]: evidenceScore }, criteriaMatch: evidenceScore, issuedTiers };
      }
      // The dispatched assignment remains authoritative until explicitly reviewed.
      if (review) {
        const tier = review.decision === 'no_certificate' ? null : (review.finalTier ?? review.aiTier);
        return { ...m, assignedDecision: review.decision, assignedTier: tier, tierMatches: tier ? { [tier]: review.aiMatchScore ?? 0 } : {},
          criteriaMatch: review.aiMatchScore, issuedTiers };
      }
      if (hasAiRun && aiEval) {
        return {
          ...m,
          assignedDecision: aiEval.decision || (aiEval.certificate_tier ? 'award' : 'undecided'),
          assignedTier: aiEval.certificate_tier || null,
          tierMatches: aiEval.certificate_tier ? { [aiEval.certificate_tier]: Number(aiEval.match_score) || 0 } : {},
          criteriaMatch: Number(aiEval.match_score) || 0,
          issuedTiers
        };
      }
      return {
        ...m,
        assignedTier: null,
        assignedDecision: 'undecided',
        tierMatches: {},
        criteriaMatch: null,
        issuedTiers
      };
    };

    const result = {
      participation: activeMentees.map(buildMenteeRow),
      paused: pausedMentees.map(m => ({ ...m, assignedTier: null, tierMatches: {}, criteriaMatch: null, issuedTiers: issuedMap[m.id] || [] })),
      mentors: []
    };

    for (const tier of criteria) {
      result[tier.id] = activeMentees.map(buildMenteeRow);
    }

    if (programId) {
      const mentorMemberships = await models.ClanMembership.findAll({
        where: { role: { [Op.in]: ['lead_mentor', 'co_mentor'] }, status: 'active' },
        include: [
          { model: models.Clan, as: 'clan', where: { programId }, attributes: [] },
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'profilePictureUrl'] }
        ]
      });
      const uniqueMentors = [];
      const seenMentorIds = new Set();
      for (const mem of mentorMemberships) {
        if (mem.user && !seenMentorIds.has(mem.user.id)) {
          seenMentorIds.add(mem.user.id);
          uniqueMentors.push({
            id: mem.user.id,
            firstName: mem.user.firstName,
            lastName: mem.user.lastName,
            email: mem.user.email,
            profilePictureUrl: mem.user.profilePictureUrl ?? null,
            assignedTier: null,
            tierMatches: {},
            criteriaMatch: null,
            issuedTiers: issuedMap[mem.user.id] || []
          });
        }
      }
      result.mentors = uniqueMentors;
    }

    return result;
  }

  /**
   * The whole case for one mentee's certificate, in one payload.
   *
   * "Why did this person get Silver?" has, until now, only been answerable by
   * reading a stored AI result — which does not exist until somebody runs the
   * evaluation, and goes stale the moment a task is marked complete. So the
   * metrics here are recomputed live from the record, and the AI's opinion is
   * reported beside them as one input rather than as the answer.
   *
   * Four things go out together because they are only meaningful together:
   *
   *   metrics       what the record says today — completion, on-time,
   *                 blockers, attendance, rating
   *   constraints   how those measure up against each tier's thresholds,
   *                 computed here rather than trusted from an old run
   *   ai            what the AI proposed, and the reasoning it gave
   *   verification  what a mentor decided, and — when they overruled the AI —
   *                 why. This is the part an admin comes here to read.
   *
   * Scoped like every other read: a mentor sees the people they mentor, an
   * admin sees everyone, and a mentee can open their own.
   */
  async getMenteeEvidence(templateId, menteeId, user, { clanId: preferredClanId = null } = {}) {
    const startedAt = Date.now();

    /**
     * Only the three columns this needs.
     *
     * `findByPk` pulled the whole row, and `ai_evaluation` holds EVERY mentee's
     * result for the cycle — on a 600-person fellowship that is megabytes of
     * JSON parsed on every open of one person's drawer, which is what pushed
     * this past the client's 30s timeout. `config` (the full layer layout) came
     * along for the ride too, and neither is read here.
     */
    const template = await models.CertificateTemplate.findByPk(templateId, {
      attributes: ['id', 'programId', 'criteria', 'verificationDeadline']
    });
    if (!template) throw new NotFoundError('Certificate template not found');

    await this.assertCanActOnMentee(user, menteeId, 'Access denied to this mentee');

    const mentee = await models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl']
    });
    if (!mentee) throw new NotFoundError('Mentee not found');

    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    let clanId = null;
    let selectedClan = null;
    if (preferredClanId) {
      const preferred = await models.Clan.findByPk(preferredClanId, { attributes: ['id', 'name', 'kind'] });
      if (isNonProgrammeClan(preferred)) {
        const mem = await models.ClanMembership.findOne({
          where: {
            userId: menteeId,
            clanId: preferredClanId,
            role: 'mentee',
            status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
          },
          attributes: ['clanId'],
        });
        if (mem) {
          clanId = preferredClanId;
          selectedClan = { id: preferred.id, name: preferred.name };
        }
      }
    }
    if (!clanId) {
      const membership = await models.ClanMembership.findOne({
        where: { userId: menteeId, role: 'mentee', status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } },
        include: [{
          model: models.Clan, as: 'clan',
          where: { kind: 'cohort', ...(template.programId ? { programId: template.programId } : {}) },
          attributes: ['id', 'name'],
          required: Boolean(template.programId)
        }]
      });
      if (membership?.clan) {
        clanId = membership.clan.id;
        selectedClan = { id: membership.clan.id, name: membership.clan.name };
      }
    }

    const [metrics] = await aggregateMenteeData([menteeId], clanId, template.programId);
    const { maxEligibleTier, hardChecks } = preCheckHardConstraints(metrics, criteria);

    /**
     * The work itself, grouped by the roadmap it belongs to.
     *
     * "Why does this person get Gold" is only half answered by a completion
     * percentage. The other half is the syllabus: which roadmap they were set,
     * how much of it is done, and precisely what is outstanding. An admin who
     * cannot rely on a mentor's judgement alone needs the evidence under it,
     * and a number without the tasks behind it is still just a claim.
     */
    const roadmaps = groupTasksByRoadmap(metrics.tasks || []);

    // Pull THIS mentee's AI result out of the array in the database rather than
    // shipping the whole array back to pick one from. Guarded on the element
    // actually being an array, since a template that has never been evaluated
    // stores nothing there and jsonb_array_elements would reject it.
    const [aiRows] = await sequelize.query(
      `SELECT elem AS result
         FROM certificate_templates t
         CROSS JOIN LATERAL jsonb_array_elements(t.ai_evaluation -> 'results') AS elem
        WHERE t.organization_id=:organizationId AND t.id = :templateId
          AND jsonb_typeof(t.ai_evaluation -> 'results') = 'array'
          AND COALESCE(elem ->> 'mentee_id', elem ->> 'id') = :menteeId
        LIMIT 1`,
      { replacements: { templateId, menteeId, organizationId: requireWorkspaceId() } }
    );
    const ai = aiRows[0]?.result ?? null;

    const verification = await models.CertificateVerification.findOne({
      where: { templateId, menteeId },
      include: [{ model: models.User, as: 'verifier', attributes: ['id', 'firstName', 'lastName'], required: false }]
    });

    const instance = await models.CertificateInstance.findOne({
      where: { templateId, menteeId },
      attributes: ['id', 'tier', 'certificateNumber', 'createdAt']
    });

    // No-award reviews are internal. They do not create a mentee-facing
    // credential or publish a rejection explanation implicitly.
    if (user?.id === menteeId && !instance &&
        (verification?.decision === 'no_certificate' || ai?.decision === 'no_certificate') &&
        !(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('This certificate decision has not been published.');
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > 2000) {
      // Loud only when it is actually slow. The client gives up at 30s, so a
      // request drifting towards that should leave a trace naming the mentee
      // and the cycle rather than a silent timeout on somebody's screen.
      logger.warn(
        `[certificateService] getMenteeEvidence took ${elapsed}ms ` +
        `(template=${templateId} mentee=${menteeId})`
      );
    }

    return {
      mentee: {
        id: mentee.id,
        firstName: mentee.firstName,
        lastName: mentee.lastName,
        email: mentee.email,
        profilePictureUrl: mentee.profilePictureUrl
      },
      clan: selectedClan,
      criteria: criteria.map((c) => ({
        id: c.id,
        name: c.name,
        minScorePercent:   c.minScorePercent   ?? null,
        maxOpenBlockers:   c.maxOpenBlockers   ?? null,
        minCompletionRate: c.minCompletionRate ?? null,
        minOnTimeRate:     c.minOnTimeRate     ?? null,
        minAvgRating:      c.minAvgRating      ?? null,
        minAttendanceRate: c.minAttendanceRate ?? null,
        reviewChecklist: Array.isArray(c.reviewChecklist) ? c.reviewChecklist : []
      })),
      metrics,
      roadmaps,
      constraints: { maxEligibleTier, hardChecks },
      ai,
      verification: verification ? {
        status:         verification.status,
        stage:          verification.stage,
        aiTier:         verification.aiTier,
        aiMatchScore:   verification.aiMatchScore,
        finalTier:      verification.finalTier,
        decision:       verification.decision,
        aiDecision:     verification.aiDecision,
        decisionHistory: user?.id === menteeId ? [] : verification.decisionHistory || [],
        overridden:     verification.overridden,
        overrideReason: verification.overrideReason,
        criteriaChecks: Array.isArray(verification.criteriaChecks) ? verification.criteriaChecks : [],
        verifiedAt:     verification.verifiedAt,
        verifiedBy:     verification.verifier
          ? `${verification.verifier.firstName || ''} ${verification.verifier.lastName || ''}`.trim()
          : null
      } : null,
      issued: instance ? {
        id:                instance.id,
        tier:              instance.tier,
        certificateNumber: instance.certificateNumber,
        issuedAt:          instance.createdAt
      } : null
    };
  }

  /**
   * Resolve a certificate number for the PUBLIC verification page.
   *
   * Unauthenticated by design — the whole point of printing a number on a
   * credential is that a stranger reading a CV can check it. So the response is
   * deliberately thin: enough to confirm the claim (who, what, which programme,
   * when) and nothing more. No email, no ids, no scores, no internal state —
   * anybody on the internet can call this with a guessed code.
   *
   * A malformed code is refused before it reaches the database, so the endpoint
   * cannot be used to probe with junk.
   */
  async verifyByNumber(rawNumber) {
    if (!isCertificateNumber(rawNumber)) return { valid: false };
    const certificateNumber = normalizeCertificateNumber(rawNumber);

    const instance = await models.CertificateInstance.findOne({
      where: { certificateNumber },
      include: [
        { model: models.User, as: 'mentee', attributes: ['firstName', 'lastName'] },
        {
          model: models.CertificateTemplate,
          as: 'template',
          attributes: ['name', 'criteria'],
          include: [{ model: models.Program, as: 'program', attributes: ['name'], required: false }]
        }
      ]
    });
    if (!instance) return { valid: false };

    const criteria = Array.isArray(instance.template?.criteria) ? instance.template.criteria : [];
    const tierName = criteria.find((c) => c.id === instance.tier)?.name || instance.tier;

    return {
      valid: true,
      certificateNumber,
      recipientName: instance.mentee
        ? `${instance.mentee.firstName || ''} ${instance.mentee.lastName || ''}`.trim()
        : null,
      tier: instance.tier,
      tierName,
      programName: instance.template?.program?.name || null,
      templateName: instance.template?.name || null,
      issuedAt: instance.createdAt
    };
  }

  async getTemplateHistory(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.resolveMenteeScope(user, { programId: template.programId || null });
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: [...menteeIds, user.id] };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { model: models.User, as: 'issuer', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    // What role did these people hold IN THIS PROGRAMME? `users.role` answers a
    // different question — what an account was created as — so a co-mentor
    // promoted from a mentee account was labelled MENTEE next to certificates
    // he had issued. The label has to come from the clan, which is where the
    // authority to issue came from too.
    const peopleIds = [...new Set(
      instances.flatMap((inst) => [inst.mentee?.id, inst.issuer?.id, inst.mentor?.id]).filter(Boolean)
    )];
    const roleInProgram = await this.resolveProgramRoles(peopleIds, template.programId);

    const describe = (u) => (u ? {
      id:        u.id,
      firstName: u.firstName,
      lastName:  u.lastName,
      email:     u.email,
      role:      roleInProgram.get(u.id) || u.role
    } : null);

    return instances.map(inst => ({
      id:        inst.id,
      tier:      inst.tier,
      createdAt: inst.createdAt,
      status:    'issued',
      recipient: describe(inst.mentee),
      issuedBy:  describe(inst.issuer || inst.mentor)
    }));
  }

  /**
   * The role each of these people holds inside one programme, as a label the UI
   * can show: 'admin', 'lead_mentor', 'co_mentor', 'core_team' or 'mentee'.
   *
   * Resolved from clan membership rather than `users.role`, because the account
   * column records only what somebody signed up as and never changes when they
   * are promoted. Somebody in several clans of the programme gets their most
   * senior hat. Anyone with no membership at all is left out of the map so the
   * caller can fall back to whatever it already had.
   */
  async resolveProgramRoles(userIds, programId) {
    const out = new Map();
    if (!userIds.length) return out;

    // An org-level admin outranks any clan role — they issue as the org.
    const admins = (await require('./workspaceRecipients').admins()).filter(admin => userIds.includes(admin.id));
    admins.forEach((a) => out.set(a.id, 'admin'));

    const where = { userId: { [Op.in]: userIds }, status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES } };
    const memberships = await models.ClanMembership.findAll({
      where,
      attributes: ['userId', 'role'],
      include: programId
        ? [{ model: models.Clan, as: 'clan', where: { programId }, attributes: [] }]
        : [],
      raw: true
    });

    const byUser = new Map();
    for (const m of memberships) {
      if (!byUser.has(m.userId)) byUser.set(m.userId, []);
      byUser.get(m.userId).push(m.role);
    }
    for (const [userId, roles] of byUser) {
      if (out.has(userId)) continue; // admin already decided
      const strongest = strongestClanRole(roles);
      if (strongest) out.set(userId, strongest);
    }
    return out;
  }


  async runAIEvaluation(id, queryMentorId, user, { clanId = null, menteeIds: requestedMenteeIds = null } = {}) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    // Who this run is allowed to grade. A mentor grades their own clans and
    // nobody else's — this is the path that used to hand a co-mentor the entire
    // programme ("0 / 623") because it decided scope from `user.role`.
    const { activeMentees } = await this.getScopedMenteesForTemplate(programId, user, { clanId });
    // Never trust IDs supplied by the browser. Selection is intersected with
    // the active, role-scoped roster so an admin/mentor cannot evaluate a
    // hidden recipient from another programme or clan by changing the request.
    const requested = Array.isArray(requestedMenteeIds)
      ? new Set(requestedMenteeIds.filter((value) => typeof value === 'string' && value.length > 0))
      : null;
    const mentees = requested
      ? activeMentees.filter((mentee) => requested.has(mentee.id))
      : activeMentees;

    if (mentees.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    const scopedMenteeIds = mentees.map(m => m.id);
    const [issuedRows, verificationRows, approvedClanRows] = await Promise.all([
      models.CertificateInstance.findAll({
        where: { templateId: id, menteeId: { [Op.in]: scopedMenteeIds } },
        attributes: ['menteeId'], raw: true
      }),
      models.CertificateVerification.findAll({
        where: { templateId: id, menteeId: { [Op.in]: scopedMenteeIds } },
        attributes: ['menteeId', 'clanId', 'status', 'stage'], raw: true
      }),
      models.CertificateClanApproval.findAll({ where: { templateId: id }, attributes: ['clanId'], raw: true })
    ]);
    const issuedIds = new Set(issuedRows.map((row) => row.menteeId));
    const approvedClanIds = new Set(approvedClanRows.map((row) => row.clanId));
    const reviewedIds = new Set(verificationRows
      .filter((row) => row.status === 'verified' || row.stage === 'admin_approved' || approvedClanIds.has(row.clanId))
      .map((row) => row.menteeId));
    const menteeIds = scopedMenteeIds.filter((menteeId) => !issuedIds.has(menteeId) && !reviewedIds.has(menteeId));
    const skipped = {
      issued: issuedIds.size,
      reviewedOrApproved: scopedMenteeIds.filter((id) => !issuedIds.has(id) && reviewedIds.has(id)).length
    };
    skipped.total = skipped.issued + skipped.reviewedOrApproved;

    if (menteeIds.length === 0) {
      return { total: 0, runId: null, data: [], skipped };
    }

    // Replace an older unfinished run only after we know there is real work.
    await models.AIEvaluationQueue.destroy({ where: { templateId: id } });

    // An admin run is programme-wide and carries no clan — but only from the
    // admin portal; a run started on a mentor screen is that mentor's clans.
    if (await authzService.actsAsAdmin(user)) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, null
      );
      return { runId, total, skipped };
    }

    const clanIds = await this.getMentorScopedMenteeClans(user, programId, { clanId });
    if (clanIds.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    if (clanIds.length === 1) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, clanIds[0]
      );
      return { runId, total, skipped };
    }

    const menteeClanMap = new Map();
    const memberships = await models.ClanMembership.findAll({
      where: {
        userId:  { [Op.in]: menteeIds },
        clanId:  { [Op.in]: clanIds },
        role:    'mentee',
        status:  'active'
      },
      attributes: ['userId', 'clanId'],
      raw: true
    });
    for (const mem of memberships) {
      if (!menteeClanMap.has(mem.userId)) {
        menteeClanMap.set(mem.userId, mem.clanId);
      }
    }

    const byClan = new Map();
    for (const menteeId of menteeIds) {
      const clan = menteeClanMap.get(menteeId) ?? clanIds[0];
      if (!byClan.has(clan)) byClan.set(clan, []);
      byClan.get(clan).push(menteeId);
    }

    const sharedRunId = uuidv4();
    let total = 0;
    for (const [clanId, clanMenteeIds] of byClan) {
      const r = await this.enqueueEvaluation(
        id, clanMenteeIds, user.id, criteria, clanId, sharedRunId
      );
      total += r.total;
    }

    return { runId: sharedRunId, total, skipped };
  }

  async getAIEvaluationStatus(runId, templateId) {
    let targetRunId = runId;

    if (!targetRunId && templateId) {
      const latestJob = await models.AIEvaluationQueue.findOne({
        where: { templateId },
        order: [
          [sequelize.literal(`CASE WHEN status IN ('pending', 'processing') THEN 0 ELSE 1 END`), 'ASC'],
          ['createdAt', 'DESC']
        ],
        attributes: ['runId'],
        raw: true
      });
      if (latestJob) targetRunId = latestJob.runId;
    }

    if (!targetRunId) {
      return { isDone: true, runId: null, total: 0, completed: 0, failed: 0, skipped: 0, pending: 0, data: [] };
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId: targetRunId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      return { isDone: true, runId: targetRunId, total: 0, completed: 0, failed: 0, skipped: 0, pending: 0, data: [] };
    }

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone = pending === 0;

    const skipped = jobs.filter(j => j.status === 'completed' && j.result?._skipped).length;
    const completedResults = jobs
      .filter(j => j.status === 'completed' && j.result && !j.result._skipped)
      .map(j => j.result);

    const enrichedResults = await enrichEvaluationResults(completedResults);

    return {
      runId: targetRunId,
      isDone,
      total,
      completed,
      failed,
      skipped,
      pending,
      data: enrichedResults,
      ranAt: isDone ? new Date().toISOString() : null
    };
  }

  // ==================== AI EVALUATION RUNNER METHODS ====================

  isTierAllowed(assignedTier, maxAllowedTierId, criteria) {
    if (!assignedTier || !maxAllowedTierId) return false;
    if (assignedTier === maxAllowedTierId) return true;

    if (maxAllowedTierId === 'participation') return false;

    const tierOrder = (criteria || []).map(c => c.id);
    const assignedIdx = tierOrder.indexOf(assignedTier);
    const maxIdx      = tierOrder.indexOf(maxAllowedTierId);

    if (assignedIdx === -1) return false;
    if (maxIdx === -1) return false;

    return assignedIdx >= maxIdx;
  }

  buildHardConstraintFailures(preCheck, criteria) {
    const failures  = [];
    const hardChecks = preCheck.hardChecks || {};
    const maxTierId  = preCheck.maxEligibleTier;

    const tierIds     = (criteria || []).map(c => c.id);
    const maxTierIndex = tierIds.indexOf(maxTierId);

    const higherTiers = maxTierIndex > 0
      ? tierIds.slice(0, maxTierIndex)
      : maxTierIndex === 0
        ? []
        : tierIds;

    for (const tierId of higherTiers) {
      const tierConfig = criteria.find(c => c.id === tierId);
      const checks     = hardChecks[tierId] || {};
      const tierName   = tierConfig?.name || tierId;

      if (checks.completion_rate_ok === false && tierConfig?.minCompletionRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee completion rate is below required ${tierConfig.minCompletionRate}% threshold.`);
      }
      if (checks.score_ok === false && tierConfig?.minScorePercent != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee score is below required ${tierConfig.minScorePercent}% threshold.`);
      }
      if (checks.blockers_ok === false && tierConfig?.maxOpenBlockers != null && tierConfig.maxOpenBlockers >= 0) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee open blockers exceeds max limit of ${tierConfig.maxOpenBlockers}.`);
      }
      if (checks.on_time_rate_ok === false && tierConfig?.minOnTimeRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee on-time submission rate is below required ${tierConfig.minOnTimeRate}% threshold.`);
      }
      if (checks.rating_ok === false && tierConfig?.minAvgRating != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee average mentor rating is below required ${tierConfig.minAvgRating} threshold.`);
      }
      if (checks.attendance_ok === false && tierConfig?.minAttendanceRate != null) {
        failures.push(`Failed ${tierName} Hard Constraint: Mentee attendance rate is below required ${tierConfig.minAttendanceRate}% threshold.`);
      }
    }

    return failures;
  }

  async evaluateBatchMentees(template, batchItems, adminUserId) {
    if (!batchItems || batchItems.length === 0) return [];

    const ai = await groqService._resolve('certificates', adminUserId);
    if (!ai.enabled) {
      throw new ValidationError(
        'AI is not configured. Add a provider key in Settings → AI Connections and route it to "certificates".'
      );
    }

    const criteria     = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);
    const systemPrompt = buildBatchMenteePrompt(criteria, batchItems.length);

    const compactPayloads = batchItems.map(item => {
      const livePreCheck = preCheckHardConstraints(item.menteePayload, criteria);
      return {
        mentee_id:                item.menteePayload.mentee_id,
        score:                    item.menteePayload.normalized_score,
        completion:               item.menteePayload.completion_rate,
        on_time:                  item.menteePayload.on_time_rate,
        avg_rating:               item.menteePayload.avg_rating,
        max_eligible_tier:        livePreCheck.maxEligibleTier,
        hard_constraint_failures: this.buildHardConstraintFailures(livePreCheck, criteria),
        score_breakdown:          item.menteePayload.score_breakdown,
        cohort_reviews:           item.menteePayload.cohort_reviews,
        clan_name:                item.menteePayload.clan_name,
        tasks: (item.menteePayload.tasks || []).map(t => ({
          title:      t.title,
          status:     t.status,
          type:       t.type,
          isCustom:   Boolean(t.isCustomTask),
          desc:       t.description ? t.description.slice(0, 300) : undefined,
          rating:     t.rating,
          difficulty: t.difficulty,
          points_pct: t.pointsPct,
          submission_evidence: t.status === 'completed' ? t.submissionEvidence : undefined,
          mentor_evidence: t.status === 'completed' ? t.mentorEvidence : undefined
        })),
        blockers: {
          total:            item.menteePayload.blockers?.total            ?? 0,
          open:             item.menteePayload.blockers?.open             ?? 0,
          open_by_severity: item.menteePayload.blockers?.open_by_severity ?? {}
        }
      };
    });

    const userPrompt = JSON.stringify(compactPayloads);

    let response = null;
    const initialCandidates = [ai.model];

    if (ai.provider === 'groq' || /groq/i.test(ai.baseURL || '')) {
      initialCandidates.push('llama-3.3-70b-versatile', 'llama-3.1-8b-instant');
    } else if (ai.provider === 'openai' || /openai/i.test(ai.baseURL || '')) {
      initialCandidates.push('gpt-4o-mini', 'gpt-4o');
    }

    const modelQueue  = [...new Set(initialCandidates.filter(Boolean))];
    const triedModels = new Set();
    let lastError     = null;

    for (let idx = 0; idx < modelQueue.length; idx++) {
      const m = modelQueue[idx];
      if (triedModels.has(m)) continue;
      triedModels.add(m);

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 35000);

      try {
        response = await ai.client.chat.completions.create(
          {
            model: m,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user',   content: userPrompt }
            ],
            temperature: 0.1,
            max_tokens:  3500
          },
          { signal: controller.signal }
        );
        if (response) break;
      } catch (err) {
        lastError = err.name === 'AbortError' || controller.signal.aborted
          ? new Error(`AI Request Timeout for model ${m} during batch evaluation after 35s`)
          : err;

        logger.warn(`[certificateService] Model ${m} batch failed: ${lastError.message}`);

        if (/401|unauthorized|auth|api_key|invalid_key|429|rate_limit|quota|billing/i.test(lastError?.message || '')) {
          break;
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!response) {
      logger.warn('[certificateService] Batch AI call failed, generating fallbacks for batch');
      return batchItems.map(item => ({
        menteeId: item.menteeId,
        result:   this.buildFallbackResult(item.menteePayload, item.preCheck)
      }));
    }

    const raw = response.choices[0]?.message?.content || '';
    return this.parseBatchAIResponse(raw, criteria, batchItems, ai);
  }

  async attemptJSONSelfCorrection(rawText, errorMsg, ai) {
    try {
      logger.info('[certificateService] Triggering AI self-correction retry prompt for malformed JSON...');
      const repairResponse = await ai.client.chat.completions.create({
        model: ai.model || 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a specialized JSON repair assistant. Fix the JSON syntax error in the provided text and output valid JSON ONLY. Do NOT add markdown wrappers or explanations.'
          },
          {
            role: 'user',
            content: `The following response produced a JSON syntax error '${errorMsg}'. Please fix it and return valid JSON array only:\n\n${rawText.slice(0, 3500)}`
          }
        ],
        temperature: 0.0,
        max_tokens:  3500
      });

      const repaired = JSON.parse(extractJsonFromText(repairResponse.choices[0]?.message?.content || ''));
      logger.info('[certificateService] AI self-correction retry successfully repaired the JSON!');
      return repaired;
    } catch (err) {
      logger.warn(`[certificateService] JSON self-correction retry failed: ${err.message}`);
      return null;
    }
  }

  async parseBatchAIResponse(raw, criteria, batchItems, ai = null) {
    let parsedArray = [];

    try {
      const jsonStr = extractJsonFromText(raw);
      parsedArray   = JSON.parse(jsonStr);
      if (!Array.isArray(parsedArray)) parsedArray = [];
    } catch (err) {
      logger.warn(`[certificateService] Direct JSON parse failed (${err.message}). Trying AI self-correction retry...`);
      if (ai) {
        const repaired = await this.attemptJSONSelfCorrection(raw, err.message, ai);
        if (Array.isArray(repaired)) parsedArray = repaired;
      }
    }

    const resultMap = new Map();
    for (const item of parsedArray) {
      const id = item?.mentee_id || item?.id;
      if (id) resultMap.set(String(id), item);
    }

    return batchItems.map(batchItem => {
      const menteeId = batchItem.menteePayload.mentee_id;
      const aiItem   = resultMap.get(String(menteeId));

      const livePreCheck = preCheckHardConstraints(batchItem.menteePayload, criteria);

      if (!aiItem) {
        return { menteeId, result: this.buildFallbackResult(batchItem.menteePayload, livePreCheck) };
      }

      const menteePayload = batchItem.menteePayload;
      const sortedCriteria = sortCriteriaByPriority(criteria);
      const maxTierId     = livePreCheck.maxEligibleTier;

      const rawMatchScore = aiItem.match_score ?? aiItem.matchScore ?? menteePayload.normalized_score;
      const cappedScore   = Math.min(100, Math.max(0, Number(rawMatchScore) || 0));

      const matchedKw = Array.isArray(aiItem.matched_keywords) ? aiItem.matched_keywords
        : (Array.isArray(aiItem.matchedKeywords) ? aiItem.matchedKeywords : []);

      const missingKw = Array.isArray(aiItem.missing_keywords) ? aiItem.missing_keywords
        : (Array.isArray(aiItem.missingKeywords) ? aiItem.missingKeywords : []);

      const customRulesCheck = (
        Array.isArray(aiItem.custom_rules_check) ? aiItem.custom_rules_check
          : (Array.isArray(aiItem.customRulesCheck) ? aiItem.customRulesCheck : [])
      ).map(crc => ({
        tierId:   String(crc.tier_id || crc.tierId || '').trim(),
        rule:     String(crc.rule || crc.name || 'Custom Qualification Rule').trim(),
        passed:   Boolean(crc.passed ?? crc.status === 'passed'),
        evidence: String(crc.evidence || crc.reason || '').trim()
      }));
      const criteriaChecks = (
        Array.isArray(aiItem.criteria_checks) ? aiItem.criteria_checks
          : (Array.isArray(aiItem.criteriaChecks) ? aiItem.criteriaChecks : [])
      ).map(check => ({
        tierId: String(check.tier_id || check.tierId || '').trim(),
        item: String(check.item || check.criterion || '').trim(),
        passed: Boolean(check.passed ?? check.status === 'passed'),
        evidence: String(check.evidence || check.reason || '').trim()
      }));

      const blockersAnalysisObj = aiItem.blockers_analysis || aiItem.blockersAnalysis || {};

      let qualifiedTier = null;
      const normalizedMatched = matchedKw.map(k => String(k).toLowerCase());
      const hasKeywordEvidence = Array.isArray(aiItem.matched_keywords) || Array.isArray(aiItem.matchedKeywords);
      const tierChecks = [];

      for (const tierConfig of sortedCriteria) {
        const tierId = tierConfig.id;
        const hardPassed = Object.values(livePreCheck.hardChecks[tierId] || {}).every(Boolean);
        const requiredKw = Array.isArray(tierConfig.keywords) ? tierConfig.keywords : [];
        const unfulfilledKw = requiredKw.filter(kw => !normalizedMatched.includes(String(kw).toLowerCase()));
        const configuredRule = String(tierConfig.customRule || '').trim();
        const ruleCheck = configuredRule
          ? customRulesCheck.find((check) => check.tierId === tierId || check.rule.toLowerCase() === configuredRule.toLowerCase())
          : null;
        const ruleProven = configuredRule
          ? ruleCheck?.passed === true && Boolean(ruleCheck.evidence)
          : true;
        const requiredChecklist = Array.isArray(tierConfig.reviewChecklist)
          ? tierConfig.reviewChecklist.map((item) => String(item).trim()).filter(Boolean)
          : [];
        const checklistResults = requiredChecklist.map((item) => criteriaChecks.find((check) =>
          check.tierId === tierId && check.item.toLowerCase() === item.toLowerCase()
        ));
        const checklistComplete = checklistResults.every((check) => check?.passed === true && Boolean(check.evidence));

        tierChecks.push({
          tier_id: tierId,
          hard_constraints_passed: hardPassed,
          keywords_passed: requiredKw.length === 0 || (hasKeywordEvidence && unfulfilledKw.length === 0),
          missing_keywords: unfulfilledKw,
          custom_rule: configuredRule || null,
          custom_rule_passed: ruleProven,
          custom_rule_evidence: ruleCheck?.evidence || null,
          checklist_passed: checklistComplete,
          checklist: requiredChecklist.map((item, index) => ({
            item,
            passed: checklistResults[index]?.passed === true && Boolean(checklistResults[index]?.evidence),
            evidence: checklistResults[index]?.evidence || null
          }))
        });

        if (!hardPassed) {
          continue;
        }

        if ((requiredKw.length > 0 && !hasKeywordEvidence) || (configuredRule && !ruleCheck) ||
            (requiredChecklist.length > 0 && checklistResults.some((check) => !check))) {
          return { menteeId, result: this.buildFallbackResult(menteePayload, livePreCheck) };
        }
        if (unfulfilledKw.length > 0) {
          continue;
        }

        if (configuredRule && !ruleProven) {
          continue;
        }
        if (!checklistComplete) continue;

        qualifiedTier = tierId;
        break;
      }

      const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || maxTierId;

      const validTier = qualifiedTier;

      const hardConstraintsCheck = livePreCheck.hardChecks[validTier]
        ?? Object.values(livePreCheck.hardChecks)[0]
        ?? { score_ok: false, blockers_ok: false, completion_rate_ok: false,
          on_time_rate_ok: false, rating_ok: false, attendance_ok: false };

      let finalReasoning = aiItem.reasoning || aiItem.summary || '';
      if (!validTier) {
        finalReasoning = 'No certificate: none of the configured certificate types meet all required criteria. ' + finalReasoning;
      } else if (validTier !== assignedTier) {
        const tierName = sortedCriteria.find(c => c.id === validTier)?.name || validTier;
        finalReasoning = `Mentee qualifies for the ${tierName} based on priority tier evaluation: hard constraints, required keywords, and custom rules were all satisfied.`;
      }

      const result = {
        mentee_id:            menteeId,
        clan_id:              menteePayload.clan_id || null,
        decision:             validTier ? 'award' : 'no_certificate',
        is_eligible:          Boolean(validTier),
        certificate_tier:     validTier,
        match_score:          cappedScore,
        matched_keywords:     matchedKw,
        missing_keywords:     missingKw,
        custom_rules_check:   customRulesCheck,
        criteria_checks:      criteriaChecks,
        tier_checks:          tierChecks,
        evaluation_summary:   validTier
          ? `Award ${sortedCriteria.find((tier) => tier.id === validTier)?.name || validTier}: hard thresholds, required keywords, custom rule, and configured checklist are satisfied.`
          : 'No configured certificate tier has complete evidence for every required threshold, keyword, custom rule, and checklist item.',
        overall_percentage:   Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0)),
        completion_rate:      menteePayload.completion_rate,
        on_time_rate:         menteePayload.on_time_rate,
        avg_rating:           menteePayload.avg_rating,
        score_breakdown:      menteePayload.score_breakdown,
        cohort_reviews:       menteePayload.cohort_reviews,
        hard_constraints_check: hardConstraintsCheck,
        blockers_analysis: {
          total:    Number(blockersAnalysisObj.total)    || (menteePayload.blockers?.total    ?? 0),
          resolved: Number(blockersAnalysisObj.resolved) || (menteePayload.blockers?.resolved ?? 0),
          open:     Number(blockersAnalysisObj.open)     || (menteePayload.blockers?.open     ?? 0),
          impact:   blockersAnalysisObj.impact  || 'Low',
          summary:  blockersAnalysisObj.summary || ''
        },
        reasoning:            finalReasoning
      };

      return { menteeId, result };
    });
  }


  buildFallbackResult(menteePayload, preCheckResult) {
    preCheckResult = preCheckResult || { maxEligibleTier: null, hardChecks: {} };
    const cappedScore = Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0));
    const blockers    = menteePayload.blockers ?? {};

    return {
      mentee_id:       menteePayload.mentee_id,
      clan_id:         menteePayload.clan_id || null,
      _failed: true,
      decision: 'undecided',
      is_eligible: false,
      certificate_tier: null,
      match_score:     cappedScore,
      matched_keywords: [],
      missing_keywords: [],
      overall_percentage:   cappedScore,
      completion_rate:      menteePayload.completion_rate,
      on_time_rate:         menteePayload.on_time_rate,
      avg_rating:           menteePayload.avg_rating,
      score_breakdown:      menteePayload.score_breakdown,
      cohort_reviews:       menteePayload.cohort_reviews,
      hard_constraints_check: preCheckResult.hardChecks[preCheckResult.maxEligibleTier] ?? {
        score_ok: false, blockers_ok: false, completion_rate_ok: false,
        on_time_rate_ok: false, rating_ok: false, attendance_ok: false
      },
      blockers_analysis: {
        total:    blockers.total    ?? 0,
        resolved: blockers.resolved ?? 0,
        open:     blockers.open     ?? 0,
        impact:   (blockers.open ?? 0) > 2 ? 'High' : (blockers.open ?? 0) > 0 ? 'Medium' : 'Low',
        summary:  'AI evaluation failed. No certificate decision has been made.'
      },
      reasoning: 'AI evaluation could not be completed. Retry the evaluation; this is not a No certificate decision.'
    };
  }

  async enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null, runId = null) {
    const sortedCriteria = sortCriteriaByPriority(criteria);

    const template = await models.CertificateTemplate.findByPk(templateId, { attributes: ['programId'] });
    const payloads = await aggregateMenteeData(menteeIds, clanId, template?.programId);
    const jobRunId = runId || uuidv4();

    const queueRows = payloads.map(payload => {
      const preCheck = preCheckHardConstraints(payload, sortedCriteria);
      return {
        runId:        jobRunId,
        templateId,
        menteeId:     payload.mentee_id,
        triggeredBy,
        status:       'pending',
        menteePayload: payload,
        preCheck,
        attempts:     0
      };
    });

    await models.AIEvaluationQueue.bulkCreate(queueRows);
    logger.info(`[certificateService] Enqueued ${queueRows.length} evaluation jobs (runId=${jobRunId}, clanId=${clanId ?? 'none'})`);

    return { runId: jobRunId, total: queueRows.length };
  }

  // ==================== TEMPLATE MANAGEMENT METHODS ====================

  /**
   * Shape-check a template's layers.
   *
   * Tier-aware fields (`tierValues`, `visibleForTiers`) are validated for SHAPE
   * only, never against the template's current tier ids. Criteria are edited
   * independently of the layout — renaming or deleting a tier would otherwise
   * make an existing template unsavable — and the renderer already falls back
   * cleanly for a tier key it does not recognise. Being strict here would turn
   * a survivable mismatch into a save that fails.
   */
  validateTemplateConfig(config) {
    if (!Array.isArray(config)) {
      throw new ValidationError('Template config must be an array of elements');
    }
    for (const el of config) {
      if (el.xPercent != null && (typeof el.xPercent !== 'number' || el.xPercent < 0 || el.xPercent > 100)) {
        throw new ValidationError('Element xPercent must be a number between 0 and 100');
      }
      if (el.yPercent != null && (typeof el.yPercent !== 'number' || el.yPercent < 0 || el.yPercent > 100)) {
        throw new ValidationError('Element yPercent must be a number between 0 and 100');
      }
      if (el.widthPercent != null && (typeof el.widthPercent !== 'number' || el.widthPercent < 0 || el.widthPercent > 100)) {
        throw new ValidationError('Element widthPercent must be a number between 0 and 100');
      }
      if (el.tierValues != null) {
        if (typeof el.tierValues !== 'object' || Array.isArray(el.tierValues)) {
          throw new ValidationError('Element tierValues must be an object keyed by tier id');
        }
        for (const [tierId, value] of Object.entries(el.tierValues)) {
          if (typeof value !== 'string') {
            throw new ValidationError(`Element tierValues.${tierId} must be a string`);
          }
          if (value.length > TIER_VALUE_MAX_LENGTH) {
            throw new ValidationError(`Element tierValues.${tierId} is too long (max ${TIER_VALUE_MAX_LENGTH} characters)`);
          }
        }
      }
      if (el.visibleForTiers != null) {
        if (!Array.isArray(el.visibleForTiers)) {
          throw new ValidationError('Element visibleForTiers must be an array of tier ids');
        }
        if (el.visibleForTiers.some((tierId) => typeof tierId !== 'string' || !tierId.trim())) {
          throw new ValidationError('Element visibleForTiers must contain non-empty tier ids');
        }
      }
    }
  }

  async createTemplate({ name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }, userId) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
    }
    if (!programId) {
      throw new ValidationError('Program ID is required');
    }
    this.validateTemplateConfig(config);

    return models.CertificateTemplate.create({
      name: name.trim(),
      bgImageUrl: bgImageUrl || null,
      logoUrl: logoUrl || null,
      logoConfig: logoConfig || null,
      config,
      criteria: criteria || [],
      programId,
      createdBy: userId,
      status: 'active'
    });
  }

  async listTemplates(queryProgramId, user) {
    const whereClause = { status: 'active' };

    if (queryProgramId) {
      whereClause.programId = queryProgramId;
    }

    /**
     * An admin of some programmes sees those programmes' templates.
     *
     * The admin branch below returned everything, so a programme admin was
     * shown another programme's certificate collections — designs they
     * cannot issue and should not be redesigning. The bound is the same
     * programme scope every other admin list uses; an org-tier admin has
     * none and keeps seeing all of them.
     */
    const adminScope = (await authzService.actsAsAdmin(user))
      ? await authzService.adminProgramScope(user)
      : undefined;
    if (Array.isArray(adminScope)) {
      const allowed = queryProgramId
        ? (adminScope.includes(queryProgramId) ? [queryProgramId] : [])
        : adminScope;
      whereClause.programId = { [Op.in]: allowed };
    }

    // Non-admins see the templates of programmes they mentor in, plus any
    // shared directly with them. Keyed on what they mentor rather than on
    // `user.role`, which says only what their account was created as — a
    // co-mentor promoted from a mentee account was falling past this branch
    // and listing every template in the org.
    if (adminScope === undefined) {
      const mentoredClanIds = await authzService.clansWhereCan(user, PERMISSIONS.MENTEE_VIEW);
      const mentoredClans = mentoredClanIds.length
        ? await models.Clan.findAll({
          where: { id: { [Op.in]: mentoredClanIds } },
          attributes: ['programId'],
          raw: true
        })
        : [];
      const programIds = [...new Set(mentoredClans.map((c) => c.programId).filter(Boolean))];

      const shares = await models.Notification.findAll({
        where: {
          userId: user.id,
          relatedEntityType: 'CertificateTemplate'
        },
        attributes: ['relatedEntityId']
      });
      const sharedIds = [...new Set(shares.map(s => s.relatedEntityId).filter(Boolean))];

      whereClause[Op.or] = [
        { programId: { [Op.in]: programIds } },
        { id: { [Op.in]: sharedIds } }
      ];
    }

    return models.CertificateTemplate.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ]
    });
  }

  async getTemplate(id) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' },
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    return template;
  }

  async updateTemplate(id, { name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        throw new ValidationError('Template name cannot be empty');
      }
      template.name = name.trim();
    }

    if (programId !== undefined) {
      if (!programId) {
        throw new ValidationError('Program ID cannot be empty');
      }
      template.programId = programId;
    }

    if (bgImageUrl !== undefined) template.bgImageUrl = bgImageUrl || null;
    if (logoUrl !== undefined) template.logoUrl = logoUrl || null;
    if (logoConfig !== undefined) template.logoConfig = logoConfig || null;
    if (config !== undefined) {
      this.validateTemplateConfig(config);
      template.config = config;
    }
    if (criteria !== undefined) {
      if (!Array.isArray(criteria)) {
        throw new ValidationError('Template criteria must be an array of tiers');
      }
      template.criteria = criteria;
    }

    await template.save();
    return template;
  }

  async deleteTemplate(id) {
    const template = await models.CertificateTemplate.findOne({
      where: { id, status: 'active' }
    });

    if (!template) {
      throw new NotFoundError('Certificate template not found');
    }

    template.status = 'archived';
    await template.save();
    return true;
  }

  async uploadAsset(fileBuffer) {
    if (!fileBuffer) {
      throw new ValidationError('No file uploaded');
    }
    const result = await uploadToCloudinary(fileBuffer, 'pathment/certificates', 'auto');
    return result.secure_url;
  }

  async sendToMentors(id) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;

    const mentorMemberships = await models.ClanMembership.findAll({
      where: {
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      include: [
        {
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: []
        }
      ],
      attributes: ['userId']
    });
    const mentorIds = [...new Set(mentorMemberships.map(m => m.userId).filter(Boolean))];

    if (mentorIds.length === 0) {
      return { sent: 0 };
    }

    const notifications = mentorIds.map(mentorId => ({
      userId: mentorId,
      type: 'system',
      audience: 'mentor',
      title: `Certificate template shared: ${template.name}`,
      message: `An admin has shared the certificate template "${template.name}" with you. Review criteria and your mentees' eligibility.`,
      actionUrl: `/mentor/certificates`,
      actionLabel: 'View Certificates',
      relatedEntityType: 'CertificateTemplate',
      relatedEntityId: template.id,
      status: 'unread'
    }));

    await models.Notification.bulkCreate(notifications);

    try {
      const { emitToUser } = require('../socket');
      for (const n of notifications) {
        emitToUser(n.userId, 'notification:new', { title: n.title, message: n.message, type: n.type });
      }
    } catch (_) { }

    return { sent: mentorIds.length };
  }

  // ==================== ISSUANCE & QUEUE METHODS ====================

  /**
   * The tier to print, which is only ever the one a human signed off.
   *
   * The caller sends a tier along with the roster, and the two disagree
   * whenever the roster was loaded before somebody changed a grade. The review
   * wins. Where there is no reviewed tier at all there is nothing to print:
   * this used to fall back to 'participation', and that fallback is how two
   * mentees with no review row received a certificate.
   *
   * `blockedRecipients` refuses unreviewed mentees before issuance reaches
   * here, so this throwing means that gate has a hole — better a failed batch
   * than another round of certificates nobody confirmed.
   */
  _requireReviewedTier(verifiedTiers, menteeId, requestedTier, hasRound, adminOverrideReview = false) {
    if (adminOverrideReview) return requestedTier;
    if (verifiedTiers.has(menteeId)) return verifiedTiers.get(menteeId);
    // No review round on this template: the caller's tier is the only grade
    // there is, and issuing directly is a real workflow.
    if (!hasRound) return requestedTier || 'participation';
    throw new ValidationError(
      'This certificate has no signed-off grade, so there is no tier to issue. Sign the grade off first.'
    );
  }

  async issueCertificates({ templateId, menteeIds, mentorId, tier, recipients, adminOverrideReview = false }, userId, user = null) {
    if (!templateId) {
      throw new ValidationError('Template ID is required');
    }
    if (!user) throw new ForbiddenError('You must be signed in to send certificates');

    const t = await sequelize.transaction();
    try {
      const template = await models.CertificateTemplate.findOne({
        where: { id: templateId, status: 'active' },
        include: [{ model: models.Program, as: 'program', required: false }],
        transaction: t,
        lock: { level: t.LOCK.UPDATE, of: models.CertificateTemplate }
      });

      if (!template) {
        throw new NotFoundError('Certificate template not found');
      }
      const isAdmin = await authzService.hasAdminAccess(user);
      const adminBypass = Boolean(adminOverrideReview && isAdmin);
      if (adminOverrideReview && !isAdmin) {
        throw new ForbiddenError('Only an admin can bypass mentor verification');
      }

      // Issuing is a WRITE and the recipient list comes straight from the
      // request body, so it has to be checked against what this user actually
      // mentors. Nothing did that before: a mentor could name any mentee id in
      // the org and a certificate was created for them.
      const requested = Array.isArray(recipients) && recipients.length > 0
        ? recipients.map((r) => r.menteeId)
        : (Array.isArray(menteeIds) ? menteeIds : []);

      // Standee rounds stay issuable after program close; cohort closeout does not.
      let standingClanId = null;
      if (requested.length) {
        const verifClans = await models.CertificateVerification.findAll({
          where: { templateId, menteeId: { [Op.in]: requested } },
          attributes: ['clanId'],
          transaction: t,
          raw: true,
        });
        const ids = [...new Set(verifClans.map((r) => r.clanId).filter(Boolean))];
        if (ids.length === 1) {
          const c = await models.Clan.findByPk(ids[0], { attributes: ['id', 'kind'], transaction: t });
          // Standing specifically: only a clan CONTINUING a closed programme
          // earns the exemption below. A selection round must not inherit it.
          if (isStandingClan(c)) standingClanId = c.id;
        }
      }
      if (!standingClanId && template.program?.closedAt && !await authzService.hasAdminAccess(user)) {
        throw new ForbiddenError('Only an admin can issue certificates after program close');
      }

      const scope = await this.resolveMenteeScope(user, {
        programId: template.programId,
        clanId: standingClanId,
      });
      if (scope !== null) {
        const allowed = new Set(scope);
        const refused = [...new Set(requested.filter((id) => id && !allowed.has(id)))];
        if (refused.length) {
          throw new ForbiddenError(
            `You can only issue certificates to mentees in your clan (${refused.length} recipient(s) are not).`
          );
        }
      }

      // A reviewed tier wins for ordinary mentor/admin requests. The admin UI
      // can explicitly acknowledge a bypass; only that path uses the badge in
      // the request and records an admin-approved issuance decision below.
      const verifiedTiers = await certificateVerificationService.resolveTiers(templateId, requested);
      const aiNoCertificateIds = new Set((template.aiEvaluation?.results || [])
        .filter(result => result.decision === 'no_certificate').map(result => result.mentee_id || result.id));
      const requestedTierByMentee = new Map(
        Array.isArray(recipients)
          ? recipients.map((recipient) => [recipient.menteeId, recipient.tier])
          : requested.map((menteeId) => [menteeId, tier])
      );
      if (adminBypass) {
        const validTierIds = new Set((template.criteria || []).map((item) => item.id));
        const invalidTier = [...requestedTierByMentee.values()].find((value) =>
          !['__no_certificate__', 'no_certificate'].includes(value) && !validTierIds.has(value)
        );
        if (invalidTier) throw new ValidationError('The selected certificate badge is not part of this template.');
      }
      const adminBypassedIds = new Set(adminBypass
        ? requested.filter((id) => !verifiedTiers.has(id) || verifiedTiers.get(id) !== requestedTierByMentee.get(id))
        : []);
      const excludedIds = new Set(requested.filter(id => adminBypass
        ? ['__no_certificate__', 'no_certificate'].includes(requestedTierByMentee.get(id))
        : (verifiedTiers.has(id) ? verifiedTiers.get(id) === null : aiNoCertificateIds.has(id))));


      // Nobody gets the same certificate twice.
      //
      // Both an admin and a mentor can issue for a clan, and either may be
      // looking at a roster loaded before the other pressed the button — so a
      // second send for the same people is expected traffic, not a mistake to
      // reject outright. The already-issued are skipped and reported; the rest
      // go out. Refusing the whole batch would mean one duplicate stopped
      // everybody else's certificate.
      const alreadyIssued = await models.CertificateInstance.findAll({
        where: { templateId, menteeId: { [Op.in]: requested.length ? requested : [null] } },
        attributes: ['menteeId'],
        raw: true,
        transaction: t
      });
      const alreadyIssuedIds = new Set(alreadyIssued.map((r) => r.menteeId));
      const skippedNoCertificate = [...excludedIds].filter(id => !alreadyIssuedIds.has(id)).length;

      /**
       * Only now, and only over the people who would actually receive a
       * certificate: somebody already holding one, or excluded by a
       * No-certificate decision, is skipped rather than made to fail the batch.
       *
       * Two different refusals, so say which one this is — "nobody has reviewed
       * them" and "the clan is not released yet" need opposite actions from
       * whoever reads it, and the second used to be the only one reported. For
       * an admin neither was: `hasAdminAccess` returned early from the gate, and
       * one press of Issue sent 410 certificates of which 195 had never been
       * reviewed.
       *
       * The review gate applies only where a round has actually been opened. A
       * template that has never been reviewed has nothing to bypass, and
       * issuing from it directly is a real workflow, not the defect.
       */
      const sendable = requested.filter((id) => !alreadyIssuedIds.has(id) && !excludedIds.has(id));
      const hasRound = await certificateVerificationService.hasReviewRound(templateId, { transaction: t });
      const { unreviewed, unapproved } = adminBypass
        ? { unreviewed: [], unapproved: [] }
        : await certificateVerificationService.sendBlockers(templateId, sendable, user, { transaction: t });
      if (unreviewed.length) {
        throw new ForbiddenError(
          unreviewed.length === sendable.length
            ? 'These grades have not been signed off yet, so there is nothing to send. A certificate is never issued on the AI\'s grade alone — sign the grades off first.'
            : `${unreviewed.length} of these ${sendable.length} grades have not been signed off yet. Sign them off, or deselect them, before sending.`
        );
      }
      if (unapproved.length) {
        throw new ForbiddenError(
          unapproved.length === sendable.length
            ? 'These certificates have not been approved for release yet. An admin approves each clan once its grades are verified.'
            : `${unapproved.length} of these mentees are in a clan that has not been approved for release yet.`
        );
      }

      let instancesData = [];
      if (Array.isArray(recipients) && recipients.length > 0) {
        instancesData = recipients.filter(r => !alreadyIssuedIds.has(r.menteeId) && !excludedIds.has(r.menteeId)).map(r => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId:  r.menteeId,
          mentorId:  mentorId || null,
          issuedBy:  userId,
          imageUrl:  null,
          // No fallback: a tier is a reviewed decision, not a default. This
          // read `|| 'participation'`, which handed a certificate to two people
          // who had no review row at all. blockedRecipients now refuses them
          // before this line; the throw is the backstop if it ever does not.
          tier:      this._requireReviewedTier(verifiedTiers, r.menteeId, r.tier, hasRound, adminBypass),
          metadata:  adminBypassedIds.has(r.menteeId) ? { adminReviewBypassed: true } : {}
        }));
      } else {
        if (!Array.isArray(menteeIds) || menteeIds.length === 0) {
          throw new ValidationError('At least one mentee ID or recipients list is required');
        }
        instancesData = menteeIds.filter(menteeId => !alreadyIssuedIds.has(menteeId) && !excludedIds.has(menteeId)).map(menteeId => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId,
          mentorId: mentorId || null,
          issuedBy: userId,
          imageUrl: null,
          tier:     this._requireReviewedTier(verifiedTiers, menteeId, tier, hasRound, adminBypass),
          metadata: adminBypassedIds.has(menteeId) ? { adminReviewBypassed: true } : {}
        }));
      }

      if (instancesData.some(instance => ['__no_certificate__', 'no_certificate'].includes(instance.tier))) {
        throw new ValidationError('Record No certificate as a review decision, not a certificate tier.');
      }

      // Every credential gets its public number here, at the moment it becomes
      // real. Generated per row and retried on the unique index: the odds of a
      // collision are negligible, but "negligible" is not "never" and a clash
      // must not fail somebody else's issuance.
      const skipped = requested.length - instancesData.length;
      if (instancesData.length === 0) {
        await t.rollback();
        return { instances: [], count: 0, skipped, skippedNoCertificate, alreadyIssued: skippedNoCertificate === 0 };
      }

      if (adminBypassedIds.size) {
        await certificateVerificationService.recordAdminIssuanceDecisions(
          template,
          instancesData
            .filter((instance) => adminBypassedIds.has(instance.menteeId))
            .map((instance) => ({ menteeId: instance.menteeId, tier: instance.tier })),
          user,
          { transaction: t }
        );
      }

      const instances = await this._createWithNumbers(instancesData, t);
      await t.commit();

      // Fire-and-forget: send notifications + emails immediately (no image — user downloads from dashboard)
      this._notifyRecipients(instances, template, mentorId).catch(err =>
        logger.warn(`[certificateService] Post-issuance notification failed: ${err.message}`)
      );

      return {
        instances: instances.map(i => ({ id: i.id, menteeId: i.menteeId })),
        count: instances.length,
        skippedNoCertificate,
        skipped,
        reviewBypassed: instances.filter((instance) => adminBypassedIds.has(instance.menteeId)).length
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  /**
   * Create the instances, giving each a unique certificate number.
   *
   * bulkCreate in one shot would make a single collision fail the whole batch,
   * so rows are inserted individually and only the clashing row is retried. The
   * unique index is the authority — checking for existence first would race.
   */
  async _createWithNumbers(instancesData, transaction) {
    const created = [];
    for (const data of instancesData) {
      let lastError = null;
      for (let attempt = 0; attempt < NUMBER_MAX_ATTEMPTS; attempt += 1) {
        try {
          created.push(await models.CertificateInstance.create(
            { ...data, certificateNumber: generateCertificateNumber() },
            { transaction }
          ));
          lastError = null;
          break;
        } catch (err) {
          const isNumberClash = err?.name === 'SequelizeUniqueConstraintError'
            && String(err?.parent?.constraint || '').includes('certificate_number');
          if (!isNumberClash) throw err;
          lastError = err;
        }
      }
      if (lastError) throw lastError;
    }
    return created;
  }

  async _notifyRecipients(instances, template, mentorId) {
    if (!instances.length) return;

    const menteeIds = instances.map(i => i.menteeId);
    const mentees = await models.User.findAll({
      where: { id: { [Op.in]: menteeIds } },
      attributes: ['id', 'firstName', 'lastName', 'email', 'role']
    });
    const menteeMap = new Map(mentees.map(m => [m.id, m]));

    let mentorUser = null;
    if (mentorId) {
      mentorUser = await models.User.findByPk(mentorId, {
        attributes: ['id', 'firstName', 'lastName']
      });
    }

    const clientUrl = require('../utils/applicationUrl')();

    for (const inst of instances) {
      const mentee = menteeMap.get(inst.menteeId);
      if (!mentee) continue;

      const tierConfig = Array.isArray(template.criteria)
        ? template.criteria.find(c => c.id === inst.tier)
        : null;
      const tierDisplayName = tierConfig?.name
        ?? (inst.tier.charAt(0).toUpperCase() + inst.tier.slice(1));

      const targetPath = mentee.role === 'mentor' ? '/mentor/certificates' : '/mentee/certificates';
      const certificateLink = `${clientUrl}${targetPath}`;

      const issuerName = mentorUser
        ? `${mentorUser.firstName} ${mentorUser.lastName}`.trim()
        : 'Pathment Admin';

      const { subject, html } = certificateAwardedEmail({
        firstName:       mentee.firstName,
        lastName:        mentee.lastName,
        templateName:    template.name,
        tier:            inst.tier,
        tierDisplayName,
        imageUrl:        null,
        certificateLink
      });

      const idempotencyKey = `certificate_awarded:${inst.menteeId}:certificate_instance:${inst.id}`;

      await emailService.enqueue({
        to:             mentee.email,
        subject,
        html,
        emailType:      NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
        recipientId:    inst.menteeId,
        idempotencyKey
      });

      await notificationOrchestrator.dispatch({
        eventKey:   NOTIFICATION_EVENTS.CERTIFICATE_AWARDED,
        recipients: [{ userId: inst.menteeId }],
        payload: {
          title:             'Certificate Awarded!',
          message:           `Congratulations! You have been awarded a "${tierDisplayName}" certificate for: "${template.name}". Visit your dashboard to view and download it.`,
          actionUrl:         targetPath,
          actionLabel:       'View Certificate',
          relatedEntityType: 'certificate_instance',
          relatedEntityId:   inst.id,
          emailSubject:      subject,
          emailHtml:         html
        }
      });
    }
  }

  async listMenteeCertificates(menteeId, user) {
    await this.assertCanActOnMentee(
      user, menteeId, 'You can only view certificates for mentees in your clan'
    );

    return models.CertificateInstance.findAll({
      where: { menteeId },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          include: [
            {
              model: models.Program,
              as: 'program',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ],
      order: [['createdAt', 'DESC']]
    });
  }

  async getCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({
      where: { id },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          include: [
            {
              model: models.Program,
              as: 'program',
              attributes: ['id', 'name']
            }
          ]
        },
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName']
        },
        {
          model: models.User,
          as: 'issuer',
          attributes: ['id', 'firstName', 'lastName']
        }
      ]
    });

    if (!instance) {
      throw new NotFoundError('Certificate not found');
    }

    await this.assertCanActOnMentee(user, instance.menteeId, 'Access denied to this certificate');

    return instance;
  }

  async deleteCertificateInstance(id, user) {
    if (!(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('Only an admin can revoke an issued certificate');
    }
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');
    const template = await models.CertificateTemplate.findByPk(instance.templateId, { include: [{ model: models.Program, as: 'program' }] });
    if (template?.program?.closedAt && !await authzService.hasAdminAccess(user)) throw new ForbiddenError('Only an admin can revoke certificates after program close');

    await this.assertCanActOnMentee(
      user, instance.menteeId, 'You can only revoke certificates for mentees in your clan'
    );

    await sequelize.transaction(async transaction => {
      await models.AuditLog.create({
        organizationId: instance.organizationId,
        userId: user.id,
        action: 'certificate.revoked',
        entityType: 'CertificateInstance',
        entityId: instance.id,
        oldValues: {
          templateId: instance.templateId,
          menteeId: instance.menteeId,
          tier: instance.tier,
          certificateNumber: instance.certificateNumber,
          issuedAt: instance.createdAt
        }
      }, { transaction });
      await instance.destroy({ transaction });
    });
    return true;
  }

  async resendCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({
      where: { id },
      include: [
        { model: models.CertificateTemplate, as: 'template', required: false,
          include: [{ model: models.Program, as: 'program', required: false }] },
        { model: models.User, as: 'mentee' }
      ]
    });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    // Re-fire the notification so the recipient is reminded
    this._notifyRecipients([instance], instance.template, instance.mentorId).catch(err =>
      logger.warn(`[certificateService] Resend notification failed: ${err.message}`)
    );

    return true;
  }

  async revokeAllTemplateCertificates(id, user) {
    if (!(await authzService.hasAdminAccess(user))) {
      throw new ForbiddenError('Only an admin can revoke issued certificates');
    }
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    // Resolved once: `null` is admin (revoke everything the template issued),
    // an empty list is somebody with no mentees in this programme — who must be
    // refused rather than falling through to an unfiltered destroy.
    const menteeIds = await this.resolveMenteeScope(user, { programId: template.programId });
    if (menteeIds !== null && menteeIds.length === 0) {
      throw new ForbiddenError('You do not have access to this certificate template');
    }

    const whereClause = { templateId: id };
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      attributes: ['id']
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length > 0) {
      await models.CertificateInstance.destroy({ where: { id: { [Op.in]: instanceIds } } });
    }

    return { count: instances.length };
  }

  async resendAllTemplateCertificates(id, failedOnly, user) {
    const template = await models.CertificateTemplate.findOne({
      where: { id },
      include: [{ model: models.Program, as: 'program', required: false }]
    });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const scopedMenteeIds = await this.resolveMenteeScope(user, { programId: template.programId || null });
    if (scopedMenteeIds !== null) {
      whereClause.menteeId = { [Op.in]: scopedMenteeIds };
    }

    const instances = await models.CertificateInstance.findAll({ where: whereClause });

    if (instances.length === 0) {
      return { updated: 0 };
    }

    // Re-send notifications to all (or just a subset — failedOnly no longer meaningful without a queue,
    // so we treat failedOnly=false as "all" and failedOnly=true as a no-op for now).
    if (!failedOnly) {
      this._notifyRecipients(instances, template, null).catch(err =>
        logger.warn(`[certificateService] Bulk resend notification failed: ${err.message}`)
      );
    }

    return { updated: instances.length };
  }
}

module.exports = new CertificateService();
