const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const { uploadToCloudinary } = require('../utils/cloudinaryUpload');
const groqService = require('./groqService');
const logger = require('../utils/logger');
const {
  preCheckHardConstraints,
  aggregateMenteeData,
  buildBatchMenteePrompt,
  extractJsonFromText,
  enrichEvaluationResults
} = require('../utils/certificateUtils');
const { sortCriteriaByPriority } = require('../utils/criteriaUtils');

function deduplicateById(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

class CertificateService {
  // ==================== QUALIFICATION & SCOPE METHODS ====================

  async getMentorScopedMenteeIds(mentorId, programId, userRole) {
    if (userRole !== 'mentor') return null;

    const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, userRole);
    if (!clanIds || clanIds.length === 0) return [];

    const menteeMembers = await models.ClanMembership.findAll({
      where: {
        clanId: { [Op.in]: clanIds },
        role: 'mentee',
        status: 'active'
      },
      attributes: ['userId'],
      raw: true
    });

    return menteeMembers.map(m => m.userId);
  }

  async getMentorScopedMenteeClans(mentorId, programId, userRole) {
    const clanInclude = {
      model: models.Clan,
      as: 'clan',
      attributes: []
    };
    if (programId) {
      clanInclude.where = { programId };
    }

    const mentorClans = await models.ClanMembership.findAll({
      where: {
        userId: mentorId,
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      attributes: ['clanId'],
      include: [clanInclude],
      raw: true
    });
    let clanIds = mentorClans.map(c => c.clanId || c['clan.id']).filter(Boolean);
    return clanIds;
  }

  async getQualification(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const mentorId = user.role === 'mentor' ? user.id : queryMentorId;

    const activeMentees = [];
    const pausedMentees = [];

    const pausedMenteeIdsSet = new Set();
    if (programId) {
      const pausedMemberships = await models.ClanMembership.findAll({
        where: { role: 'mentee', status: 'paused' },
        include: [{
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: ['id']
        }],
        attributes: ['userId'],
        raw: true
      });
      pausedMemberships.forEach(pm => pausedMenteeIdsSet.add(pm.userId));
    }

    if (mentorId) {
      const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: { [Op.in]: ['active', 'paused'] } },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        const seenMentees = new Set();
        for (const mem of menteeMembers) {
          if (!mem.user || seenMentees.has(mem.user.id)) continue;
          seenMentees.add(mem.user.id);
          const u = mem.user;
          const row = { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email };
          (mem.status === 'paused' || u.status === 'suspended' || pausedMenteeIdsSet.has(u.id))
            ? pausedMentees.push(row)
            : activeMentees.push(row);
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
      });
      for (const e of enrollments) {
        if (!e.mentee) continue;
        const row = { id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email };
        (e.status === 'paused' || e.mentee.status === 'suspended' || pausedMenteeIdsSet.has(e.mentee.id))
          ? pausedMentees.push(row)
          : activeMentees.push(row);
      }
    }

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

    const latestQueueRun = await models.AIEvaluationQueue.findOne({
      where: { templateId: id, status: 'completed' },
      order: [['createdAt', 'DESC']],
      attributes: ['runId'],
      raw: true
    });

    let aiResults = [];
    if (latestQueueRun) {
      const jobs = await models.AIEvaluationQueue.findAll({
        where: { runId: latestQueueRun.runId, status: 'completed' },
        attributes: ['result'],
        raw: true
      });
      aiResults = jobs.map(j => j.result).filter(Boolean);
    }

    if (aiResults.length === 0 && Array.isArray(template.aiEvaluation?.results)) {
      aiResults = template.aiEvaluation.results;
    }

    const aiResultMap = Object.fromEntries(aiResults.map(r => [r.mentee_id || r.id, r]));
    const hasAiRun = aiResults.length > 0;

    const buildMenteeRow = (m) => {
      const aiEval = aiResultMap[m.id];
      if (hasAiRun && aiEval) {
        return {
          ...m,
          assignedTier: aiEval.certificate_tier || null,
          tierMatches: { [aiEval.certificate_tier || 'participation']: Number(aiEval.match_score) || 0 },
          criteriaMatch: Number(aiEval.match_score) || 0,
          issuedTiers: issuedMap[m.id] || []
        };
      }
      return {
        ...m,
        assignedTier: null,
        tierMatches: {},
        criteriaMatch: null,
        issuedTiers: issuedMap[m.id] || []
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
          { model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }
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

  async getTemplateHistory(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, template.programId || null, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: [...menteeIds, user.id] };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email', 'role']
        },
        {
          model: models.User,
          as: 'mentor',
          attributes: ['id', 'firstName', 'lastName', 'email']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const instanceIds = instances.map(i => i.id);
    const queueEntries = instanceIds.length ? await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } }
    }) : [];

    const queueMap = Object.fromEntries(queueEntries.map(q => [q.instanceId, q]));

    return instances.map(inst => {
      const q = queueMap[inst.id];
      const status = (inst.pdfUrl && inst.imageUrl) ? 'completed' : (q?.status ?? 'pending');

      return {
        id: inst.id,
        pdfUrl: inst.pdfUrl,
        imageUrl: inst.imageUrl,
        tier: inst.tier,
        createdAt: inst.createdAt,
        recipient: inst.mentee ? {
          id: inst.mentee.id,
          firstName: inst.mentee.firstName,
          lastName: inst.mentee.lastName,
          email: inst.mentee.email,
          role: inst.mentee.role
        } : null,
        status,
        error: q ? q.error : null
      };
    });
  }

  async runAIEvaluation(id, queryMentorId, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id, status: 'active' } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const programId = template.programId;
    const criteria = sortCriteriaByPriority(Array.isArray(template.criteria) ? template.criteria : []);

    const menteeRows = [];
    const mentorId = user.role === 'mentor' ? user.id : queryMentorId;

    const pausedMenteeIdsSet = new Set();
    if (programId) {
      const pausedMemberships = await models.ClanMembership.findAll({
        where: { role: 'mentee', status: 'paused' },
        include: [{
          model: models.Clan,
          as: 'clan',
          where: { programId },
          attributes: ['id']
        }],
        attributes: ['userId'],
        raw: true
      });
      pausedMemberships.forEach(pm => pausedMenteeIdsSet.add(pm.userId));
    }

    if (mentorId) {
      const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
      if (clanIds.length > 0) {
        const menteeMembers = await models.ClanMembership.findAll({
          where: { clanId: { [Op.in]: clanIds }, role: 'mentee', status: 'active' },
          include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
        });
        for (const m of menteeMembers) {
          if (m.user && m.user.status !== 'suspended' && m.status !== 'paused' && !pausedMenteeIdsSet.has(m.user.id)) {
            menteeRows.push({ id: m.user.id, firstName: m.user.firstName, lastName: m.user.lastName, email: m.user.email });
          }
        }
      }
    } else {
      const enrollments = await models.Enrollment.findAll({
        where: { programId },
        include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] }]
      });
      for (const e of enrollments) {
        if (e.mentee && e.status !== 'paused' && e.mentee.status !== 'suspended' && !pausedMenteeIdsSet.has(e.mentee.id)) {
          menteeRows.push({ id: e.mentee.id, firstName: e.mentee.firstName, lastName: e.mentee.lastName, email: e.mentee.email });
        }
      }
    }

    const mentees = deduplicateById(menteeRows);

    if (mentees.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    const menteeIds = mentees.map(m => m.id);

    if (!mentorId) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, null
      );
      return { runId, total };
    }

    const clanIds = await this.getMentorScopedMenteeClans(mentorId, programId, user.role);
    if (clanIds.length === 0) {
      return { total: 0, runId: null, data: [] };
    }

    if (clanIds.length === 1) {
      const { runId, total } = await this.enqueueEvaluation(
        id, menteeIds, user.id, criteria, clanIds[0]
      );
      return { runId, total };
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

    return { runId: sharedRunId, total };
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
      return { isDone: true, runId: null, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const jobs = await models.AIEvaluationQueue.findAll({
      where: { runId: targetRunId },
      attributes: ['menteeId', 'status', 'result', 'error'],
      raw: true
    });

    if (jobs.length === 0) {
      return { isDone: true, runId: targetRunId, total: 0, completed: 0, failed: 0, pending: 0, data: [] };
    }

    const total = jobs.length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const pending = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;
    const isDone = pending === 0;

    const completedResults = jobs
      .filter(j => j.status === 'completed' && j.result)
      .map(j => j.result);

    const enrichedResults = await enrichEvaluationResults(completedResults);

    return {
      runId: targetRunId,
      isDone,
      total,
      completed,
      failed,
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
          points_pct: t.pointsPct
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
        rule:     String(crc.rule || crc.name || 'Custom Qualification Rule').trim(),
        passed:   Boolean(crc.passed ?? crc.status === 'passed'),
        evidence: String(crc.evidence || crc.reason || '').trim()
      }));

      const blockersAnalysisObj = aiItem.blockers_analysis || aiItem.blockersAnalysis || {};

      let qualifiedTier = 'participation';
      const normalizedMatched = matchedKw.map(k => String(k).toLowerCase());

      for (const tierConfig of sortedCriteria) {
        const tierId = tierConfig.id;

        if (!this.isTierAllowed(tierId, maxTierId, sortedCriteria)) {
          continue;
        }

        const requiredKw = Array.isArray(tierConfig.keywords) ? tierConfig.keywords : [];
        const unfulfilledKw = requiredKw.filter(kw => !normalizedMatched.includes(String(kw).toLowerCase()));
        if (unfulfilledKw.length > 0) {
          continue;
        }

        if (tierConfig.customRule?.trim()) {
          const failedRule = customRulesCheck.some(c => c.passed === false);
          if (failedRule) {
            continue;
          }
        }

        qualifiedTier = tierId;
        break;
      }

      const assignedTier = aiItem.certificate_tier || aiItem.certificateTier || aiItem.tier || maxTierId;

      const validTier = qualifiedTier !== 'participation' ? qualifiedTier : assignedTier;

      const hardConstraintsCheck = livePreCheck.hardChecks[validTier]
        ?? (validTier === 'participation'
          ? Object.values(livePreCheck.hardChecks)[0] ?? { score_ok: false, blockers_ok: false, completion_rate_ok: false, on_time_rate_ok: false, rating_ok: false, attendance_ok: false }
          : { score_ok: true, blockers_ok: true, completion_rate_ok: true, on_time_rate_ok: true, rating_ok: true, attendance_ok: true });

      let finalReasoning = aiItem.reasoning || aiItem.summary || '';
      if (validTier !== assignedTier) {
        const tierName = sortedCriteria.find(c => c.id === validTier)?.name || validTier;
        finalReasoning = `Mentee qualifies for the ${tierName} based on priority tier evaluation: hard constraints, required keywords, and custom rules were all satisfied.`;
      }

      const result = {
        mentee_id:            menteeId,
        is_eligible:          validTier !== 'participation',
        certificate_tier:     validTier,
        match_score:          cappedScore,
        matched_keywords:     matchedKw,
        missing_keywords:     missingKw,
        custom_rules_check:   customRulesCheck,
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

  async evaluateSingleMentee(template, menteePayload, preCheckResult, adminUserId) {
    const batchRes = await this.evaluateBatchMentees(
      template,
      [{ menteeId: menteePayload.mentee_id, menteePayload, preCheck: preCheckResult }],
      adminUserId
    );
    return batchRes[0]?.result;
  }

  buildFallbackResult(menteePayload, preCheckResult) {
    const cappedScore = Math.min(100, Math.max(0, Number(menteePayload.normalized_score) || 0));
    const blockers    = menteePayload.blockers ?? {};

    return {
      mentee_id:       menteePayload.mentee_id,
      is_eligible:     preCheckResult.maxEligibleTier !== 'participation',
      certificate_tier: preCheckResult.maxEligibleTier,
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
        summary:  'AI response could not be parsed. Tier assigned by server-side constraint checks.'
      },
      reasoning: `Server pre-check determined ${preCheckResult.maxEligibleTier} tier based on: score=${cappedScore}%, completion=${menteePayload.completion_rate}%, on-time=${menteePayload.on_time_rate}%.`
    };
  }

  async enqueueEvaluation(templateId, menteeIds, triggeredBy, criteria, clanId = null, runId = null) {
    const sortedCriteria = sortCriteriaByPriority(criteria);

    await models.AIEvaluationQueue.destroy({ where: { templateId } });

    const payloads = await aggregateMenteeData(menteeIds, clanId);
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

  async createTemplate({ name, bgImageUrl, logoUrl, logoConfig, config, criteria, programId }, userId) {
    if (!name || typeof name !== 'string' || !name.trim()) {
      throw new ValidationError('Template name is required');
    }
    if (!programId) {
      throw new ValidationError('Program ID is required');
    }
    if (!config || !Array.isArray(config)) {
      throw new ValidationError('Template config must be an array of elements');
    }

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

    if (user.role === 'mentor') {
      const memberships = await models.ClanMembership.findAll({
        where: {
          userId: user.id,
          role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
          status: 'active'
        },
        include: [{ model: models.Clan, as: 'clan', attributes: ['programId'] }]
      });
      const programIds = [...new Set(memberships.map(m => m.clan?.programId).filter(Boolean))];

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
      if (!Array.isArray(config)) {
        throw new ValidationError('Template config must be an array');
      }
      template.config = config;
    }
    if (criteria !== undefined) {
      if (!Array.isArray(criteria)) {
        throw new ValidationError('Template criteria must be an array of tiers');
      }
      console.log('[DEBUG updateTemplate] criteria received:', JSON.stringify(criteria, null, 2));
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

  async issueCertificates({ templateId, menteeIds, mentorId, tier, recipients }, userId) {
    if (!templateId) {
      throw new ValidationError('Template ID is required');
    }

    const t = await sequelize.transaction();
    try {
      const template = await models.CertificateTemplate.findOne({
        where: { id: templateId, status: 'active' },
        transaction: t
      });

      if (!template) {
        throw new NotFoundError('Certificate template not found');
      }

      let instancesData = [];
      if (Array.isArray(recipients) && recipients.length > 0) {
        instancesData = recipients.map(r => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId: r.menteeId,
          mentorId: mentorId || null,
          issuedBy: userId,
          pdfUrl: null,
          imageUrl: null,
          tier: r.tier || 'participation',
          metadata: {}
        }));
      } else {
        if (!Array.isArray(menteeIds) || menteeIds.length === 0) {
          throw new ValidationError('At least one mentee ID or recipients list is required');
        }
        instancesData = menteeIds.map(menteeId => ({
          id: crypto.randomUUID(),
          templateId,
          menteeId,
          mentorId: mentorId || null,
          issuedBy: userId,
          pdfUrl: null,
          imageUrl: null,
          tier: tier || 'participation',
          metadata: {}
        }));
      }

      const queueJobsData = instancesData.map(inst => ({
        id: crypto.randomUUID(),
        instanceId: inst.id,
        status: 'pending',
        attempts: 0
      }));

      const instances = await models.CertificateInstance.bulkCreate(instancesData, { transaction: t });
      const queueJobs = await models.CertificateQueue.bulkCreate(queueJobsData, { transaction: t });

      await t.commit();

      return {
        instances: instances.map(i => ({ id: i.id, menteeId: i.menteeId })),
        jobs: queueJobs.map(j => ({ id: j.id, instanceId: j.instanceId })),
        count: instances.length
      };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  async listMenteeCertificates(menteeId, user) {
    if (user.id !== menteeId) {
      if (user.role === 'mentee') {
        throw new ForbiddenError('You can only view your own certificates');
      }

      if (user.role === 'mentor') {
        const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
        if (scopedIds !== null && !scopedIds.includes(menteeId)) {
          throw new ForbiddenError('You can only view certificates for mentees in your clan');
        }
      }
    }

    return models.CertificateInstance.findAll({
      where: { menteeId },
      include: [
        {
          model: models.CertificateTemplate,
          as: 'template',
          attributes: ['id', 'name', 'bgImageUrl']
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
          as: 'template'
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

    if (user.id !== instance.menteeId) {
      if (user.role === 'mentee') {
        throw new ForbiddenError('You can only view your own certificates');
      }

      if (user.role === 'mentor') {
        const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
        if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
          throw new ForbiddenError('Access denied to this certificate');
        }
      }
    }

    return instance;
  }

  async deleteCertificateInstance(id, user) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    if (user && user.role === 'mentor' && user.id !== instance.menteeId) {
      const scopedIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
      if (scopedIds !== null && !scopedIds.includes(instance.menteeId)) {
        throw new ForbiddenError('You can only revoke certificates for mentees in your clan');
      }
    }

    await models.CertificateQueue.destroy({ where: { instanceId: id } });
    await instance.destroy();
    return true;
  }

  async resetQueueEntry(instanceId) {
    const [queueEntry, created] = await models.CertificateQueue.findOrCreate({
      where: { instanceId },
      defaults: { status: 'pending', attempts: 0, error: null }
    });

    if (!created) {
      queueEntry.status = 'pending';
      queueEntry.attempts = 0;
      queueEntry.error = null;
      queueEntry.lockedAt = null;
      await queueEntry.save();
    }
    return queueEntry;
  }

  async bulkResetQueueEntries(instanceIds) {
    if (!instanceIds.length) return;

    await models.CertificateQueue.update(
      { status: 'pending', attempts: 0, error: null, lockedAt: null },
      { where: { instanceId: { [Op.in]: instanceIds } } }
    );

    const existing = await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } },
      attributes: ['instanceId'],
      raw: true
    });
    const existingIds = new Set(existing.map(e => e.instanceId));
    const missing = instanceIds.filter(id => !existingIds.has(id));

    if (missing.length > 0) {
      await models.CertificateQueue.bulkCreate(
        missing.map(id => ({ id: crypto.randomUUID(), instanceId: id, status: 'pending', attempts: 0 }))
      );
    }
  }

  async resendCertificateInstance(id) {
    const instance = await models.CertificateInstance.findOne({ where: { id } });
    if (!instance) throw new NotFoundError('Certificate instance not found');

    instance.pdfUrl = null;
    instance.imageUrl = null;
    await instance.save();

    await this.resetQueueEntry(id);
    return true;
  }

  async revokeAllTemplateCertificates(id, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    if (user.role === 'mentor') {
      const mentorScopedIds = await this.getMentorScopedMenteeIds(
        user.id, template.programId, user.role
      );
      if (mentorScopedIds === null) {
        throw new ForbiddenError('Unauthorized: unable to verify program scope');
      }
      if (mentorScopedIds.length === 0) {
        throw new ForbiddenError('You do not have access to this certificate template');
      }
    }

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, template.programId, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause,
      attributes: ['id']
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length > 0) {
      await models.CertificateQueue.destroy({ where: { instanceId: { [Op.in]: instanceIds } } });
      await models.CertificateInstance.destroy({ where: { id: { [Op.in]: instanceIds } } });
    }

    return { count: instances.length };
  }

  async resendAllTemplateCertificates(id, failedOnly, user) {
    const template = await models.CertificateTemplate.findOne({ where: { id } });
    if (!template) throw new NotFoundError('Certificate template not found');

    const whereClause = { templateId: id };

    const menteeIds = await this.getMentorScopedMenteeIds(user.id, null, user.role);
    if (menteeIds !== null) {
      whereClause.menteeId = { [Op.in]: menteeIds };
    }

    const instances = await models.CertificateInstance.findAll({
      where: whereClause
    });
    const instanceIds = instances.map(i => i.id);

    if (instanceIds.length === 0) {
      return { updated: 0 };
    }

    const queueEntries = await models.CertificateQueue.findAll({
      where: { instanceId: { [Op.in]: instanceIds } }
    });
    const queueMap = Object.fromEntries(queueEntries.map(q => [q.instanceId, q]));

    let targetInstanceIds = [];
    if (failedOnly) {
      targetInstanceIds = instances.filter(inst => {
        const q = queueMap[inst.id];
        return q && q.status === 'failed';
      }).map(i => i.id);
    } else {
      targetInstanceIds = instanceIds;
    }

    if (targetInstanceIds.length === 0) {
      return { updated: 0 };
    }

    await models.CertificateInstance.update(
      { pdfUrl: null, imageUrl: null },
      { where: { id: { [Op.in]: targetInstanceIds } } }
    );

    await this.bulkResetQueueEntries(targetInstanceIds);

    return { updated: targetInstanceIds.length };
  }
}

module.exports = new CertificateService();
