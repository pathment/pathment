const { Op } = require('sequelize');
const { models } = require('../db');
const cohortService = require('../services/cohortService');
const { sortCriteriaByPriority } = require('./criteriaUtils');
const { isNonProgrammeClan } = require('../config/clanKinds');

// ==================== HARD CONSTRAINTS PRE-CHECK ====================

function preCheckHardConstraints(menteePayload, criteria) {
  if (!criteria || !criteria.length) {
    return {
      maxEligibleTier: null,
      hardChecks: {},
    };
  }

  const sortedCriteria = sortCriteriaByPriority(criteria);

  const hardChecks = {};
  let maxEligibleTier = null;

  for (const tier of sortedCriteria) {
    const tierId = tier.id;
    const checks = {
      score_ok:           true,
      blockers_ok:        true,
      completion_rate_ok: true,
      on_time_rate_ok:    true,
      rating_ok:          true,
      attendance_ok:      true,
    };

    if (tier.minScorePercent != null && menteePayload.normalized_score < tier.minScorePercent) {
      checks.score_ok = false;
    }

    const openBlockers = menteePayload.blockers?.open ?? 0;
    if (tier.maxOpenBlockers != null && tier.maxOpenBlockers >= 0 && openBlockers > tier.maxOpenBlockers) {
      checks.blockers_ok = false;
    }

    if (tier.minCompletionRate != null && menteePayload.completion_rate < tier.minCompletionRate) {
      checks.completion_rate_ok = false;
    }

    if (tier.minOnTimeRate != null && menteePayload.on_time_rate < tier.minOnTimeRate) {
      checks.on_time_rate_ok = false;
    }

    if (tier.minAvgRating != null && (menteePayload.avg_rating == null || menteePayload.avg_rating < tier.minAvgRating)) {
      checks.rating_ok = false;
    }

    if (tier.minAttendanceRate != null && menteePayload.cohort_reviews?.data_available === true) {
      const attendancePct = menteePayload.cohort_reviews.attendance_pct ?? 0;
      if (attendancePct < tier.minAttendanceRate) {
        checks.attendance_ok = false;
      }
    }

    hardChecks[tierId] = checks;

    const allHardPass = Object.values(checks).every(Boolean);
    if (allHardPass && !maxEligibleTier) {
      maxEligibleTier = tierId;
    }
  }

  return {
    maxEligibleTier,
    hardChecks,
  };
}

// ==================== AI EVALUATION HELPERS ====================

function extractJsonFromText(text) {
  let str = (text || '').trim();

  const codeBlock = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlock) str = codeBlock[1].trim();

  const firstBracket = str.indexOf('[');
  const lastBracket  = str.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    return str.slice(firstBracket, lastBracket + 1);
  }

  const firstBrace = str.indexOf('{');
  const lastBrace  = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return str.slice(firstBrace, lastBrace + 1);
  }

  return str;
}

async function enrichEvaluationResults(results) {
  if (!results.length) return results;

  const menteeIds = results.map(r => r.mentee_id).filter(Boolean);
  const mentees = menteeIds.length > 0
    ? await models.User.findAll({
        where: { id: { [Op.in]: menteeIds } },
        attributes: ['id', 'firstName', 'lastName', 'email'],
        raw: true
      })
    : [];

  const menteeMap = Object.fromEntries(mentees.map(m => [m.id, m]));

  const enriched = results.map(ev => ({
    ...ev,
    firstName: menteeMap[ev.mentee_id]?.firstName ?? '',
    lastName:  menteeMap[ev.mentee_id]?.lastName  ?? '',
    email:     menteeMap[ev.mentee_id]?.email      ?? ''
  }));

  enriched.sort((a, b) => b.match_score - a.match_score);
  return enriched;
}

// ==================== AI EVALUATION PROMPT BUILDER ====================

function buildTierDescriptions(criteria) {
  return criteria.map(c => {
    const lines = [`### TIER: "${c.id}" ("${c.name}")`];
    if (c.minScorePercent != null) lines.push(`  - Min score: ${c.minScorePercent}%`);
    if (c.maxOpenBlockers != null && c.maxOpenBlockers >= 0) lines.push(`  - Max open blockers: ${c.maxOpenBlockers}`);
    if (c.minCompletionRate != null) lines.push(`  - Min completion rate: ${c.minCompletionRate}%`);
    if (c.minOnTimeRate != null) lines.push(`  - Min on-time rate: ${c.minOnTimeRate}%`);
    if (c.minAvgRating != null) lines.push(`  - Min avg rating: ${c.minAvgRating}`);
    if (Array.isArray(c.keywords) && c.keywords.length > 0) lines.push(`  - Required Tech Stack / Keywords: ${c.keywords.join(', ')}`);
    if (c.customRule?.trim()) lines.push(`  - Custom Qualification Rule: "${c.customRule.trim()}"`);
    if (Array.isArray(c.reviewChecklist) && c.reviewChecklist.length > 0) {
      lines.push('  - Required Review Checklist (every item needs direct evidence):');
      c.reviewChecklist.forEach((item) => lines.push(`    * ${String(item).trim()}`));
    }
    return lines.join('\n');
  }).join('\n\n');
}

function getDynamicTierOrder(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return { hierarchy: '"participation"', topTierId: 'participation', topTierName: 'Participation Certificate' };
  }

  const hierarchy = criteria.map(c => `"${c.id}" ("${c.name}")`).join(' -> ');
  const topTierId = criteria[0].id;
  const topTierName = criteria[0].name || topTierId;

  return { hierarchy, topTierId, topTierName };
}

function buildBatchMenteePrompt(criteria, batchSize) {
  const sorted = sortCriteriaByPriority(criteria);
  const tierDescriptions = buildTierDescriptions(sorted);
  const { hierarchy, topTierId, topTierName } = getDynamicTierOrder(sorted);

  return `You are an expert AI evaluator assessing a BATCH of up to ${batchSize} mentees for certificate eligibility on a mentorship platform.

TIER DEFINITIONS & QUALIFICATION RULES:
${tierDescriptions || '- participation: everyone with >= 1 completed task'}

EVALUATION INSTRUCTIONS:
1. Each mentee item in the input array contains:
   - "mentee_id": Mentee ID string
   - "score": Normalized performance percentage (0-100)
   - "completion": Task completion rate (0-100)
   - "on_time": On-time submission rate (0-100)
   - "avg_rating": Average mentor rating (1.0-5.0)
   - "max_eligible_tier": Maximum allowed tier ceiling determined by server math.
   - "tasks": List of assigned tasks with "title", "status" ("completed"|"in_progress"|"assigned"|"submitted"), "type" ("project"|"assignment"|"practical"|"exercise"|"quiz"|"custom"), "isCustom" (boolean true for mentor custom tasks), "rating", and "desc".
     CRITICAL RULE 1: Only tasks with status === "completed" count as finished work. Tasks with status "assigned", "in_progress", or "submitted" are UNFINISHED and CANNOT satisfy custom rules or keywords!
     CRITICAL RULE 2: CUSTOM QUALIFICATION RULE & TECH STACK CHECKING:
     - Search completed tasks (status === "completed") using the assignment title/description, "submission_evidence", and "mentor_evidence". Approved submission and mentor evidence are stronger proof than an assignment title.
     - A custom rule is MANDATORY for its own tier. Mark it passed only when the supplied evidence proves it. If evidence is absent or ambiguous, mark it failed; never infer completion from the assignment being present.
     - Every Required Review Checklist item is also MANDATORY for its own tier. Evaluate each item independently from completed work, approved submission evidence, or mentor feedback. Missing or ambiguous proof means failed.
     - Match keywords against completed task titles and descriptions loosely based ONLY on the explicit keywords specified for that tier.

     CRITICAL RULE 3: STRICT EXPLICIT CRITERIA ONLY (NO HALLUCINATED TECH STACK REQUIREMENTS):
     - DO NOT invent, assume, or penalize for missing technologies (such as Node, Express, MongoDB, REST design, Databases, Docker, etc.) that are NOT explicitly listed in the tier's "Required Tech Stack / Keywords" or "Custom Qualification Rule"!
     - Only evaluate against keywords explicitly listed in TIER DEFINITIONS for that tier. If the tier keywords are "HTML, css, js", you MUST ONLY check for HTML, css, js. If all keywords listed for that tier are present in completed tasks (or if no keywords are specified), the Tech Stack check is 100% PASSED.
     - NEVER state in your "reasoning" or "custom_rules_check" that a mentee failed a tier for unlisted technologies!

     CRITICAL RULE 4: EXPLICIT DYNAMIC REASONING FOR HARD CONSTRAINT FAILURES & TIER STEP-DOWN:
     - Each mentee item contains "hard_constraint_failures": Array of exact dynamic metric failure reasons calculated by server math.
     - IF "max_eligible_tier" is lower than "${topTierId}" AND "hard_constraint_failures" contains entries, your "reasoning" MUST quote the exact dynamic failure message provided in "hard_constraint_failures" word-for-word (using the exact threshold percentage specified in hard_constraint_failures).
     - NEVER output hardcoded numbers (like 90%) unless that exact number is provided in hard_constraint_failures!
     - DO NOT invent, guess, or claim missing technologies (like Node, MongoDB, REST design, etc.) as the reason for stepping down! Your reasoning MUST be grounded 100% on actual metric failures from hard_constraint_failures or missing explicit keywords.

     CRITICAL RULE 5: MANDATORY MAXIMUM QUALIFIED TIER ASSIGNMENT (NO UNJUSTIFIED STEP-DOWNS):
     - If a mentee's "max_eligible_tier" is "${topTierId}", AND the mentee's completed tasks satisfy explicit keywords, custom rule, and every configured review checklist item for "${topTierName}" (or those are not configured), YOU MUST ASSIGN "certificate_tier": "${topTierId}"!
     - Stepping down from "max_eligible_tier" to a lower tier is STRICTLY PROHIBITED unless there is an explicit missing keyword, failed Custom Qualification Rule, or failed review checklist item!
     - DO NOT invent "cohort-relative" or unlisted threshold excuses to downgrade a mentee!

2. DYNAMIC TIER STEP-DOWN HIERARCHY (highest to lowest): ${hierarchy}.

3. FOR EVERY MENTEE IN THE INPUT ARRAY, EVALUATE:
   - When no configured certificate type qualifies, use decision "no_certificate", certificate_tier null, and explain the unmet criteria. Never invent a participation award.
   - "certificate_tier": Check the tier's "Custom Qualification Rule" and "Required Tech Stack / Keywords" against the mentee's completed tasks.
     * If the mentee satisfies the Custom Rule, explicit Tech Stack, and every configured review checklist item for "max_eligible_tier", assign "certificate_tier": "max_eligible_tier".
     * If the mentee FAILS the explicit Custom Rule, explicit Tech Stack, or any configured review checklist item for "max_eligible_tier", STEP DOWN to the next lower tier in the hierarchy. Do NOT jump straight to the bottom! Assign the highest lower tier whose rules the mentee DOES satisfy.
   - "match_score": Integer (0-100) reflecting relevance and task quality.
   - "matched_keywords": Array of target keywords matched in completed tasks.
   - "missing_keywords": Array of target keywords missing from completed tasks.
   - "custom_rules_check": One entry for EVERY configured custom rule, shaped as [{ "tier_id": "<exact tier id>", "rule": "<exact configured rule>", "passed": boolean, "evidence": "<exact completed task/submission/mentor evidence, or why proof is missing>" }]. Never reuse one tier's rule verdict for another tier.
   - "criteria_checks": One entry for EVERY configured review checklist item, shaped as [{ "tier_id": "<exact tier id>", "item": "<exact configured checklist text>", "passed": boolean, "evidence": "<exact completed task/submission/mentor evidence, or why proof is missing>" }]. Never mark an item passed without evidence.
   - "blockers_analysis": { "total": number, "resolved": number, "open": number, "impact": "Low"|"Medium"|"High", "summary": "brief summary" }
   - "reasoning": 3-4 sentence detailed narrative explicitly stating hard_constraint_failures (if any), custom rules passed/failed, matched keywords, task performance, and why the tier was assigned or stepped down. NEVER invent unlisted technology names!

4. OUTPUT FORMAT: PURE JSON ARRAY containing exactly one result object per input mentee.
[
  {
    "mentee_id": "<exact input mentee_id>",
    "is_eligible": true,
    "decision": "award or no_certificate",
    "certificate_tier": "<assigned tier id, or null when no type qualifies>",
    "match_score": 85,
    "matched_keywords": ["React", "Node.js"],
    "missing_keywords": [],
    "custom_rules_check": [
      { "tier_id": "gold", "rule": "Custom Qualification Rule", "passed": true, "evidence": "Completed multi-step form assignment; approved submission says …" }
    ],
    "criteria_checks": [
      { "tier_id": "gold", "item": "Completed the multi-vendor project", "passed": true, "evidence": "Approved Multi-vendor project submission …" }
    ],
    "overall_percentage": 92,
    "blockers_analysis": { "total": 0, "resolved": 0, "open": 0, "impact": "Low", "summary": "No blockers" },
    "reasoning": "Mentee completed advanced assignments with a 92% score. Custom qualification rule satisfied."
  }
]`;
}

// ==================== AI EVALUATION DATA AGGREGATOR ====================

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const DIFFICULTY_WEIGHT = { easy: 1, medium: 2, hard: 3, expert: 4 };

function computeBlockerScore(openBlockers, resolvedBlockers) {
  const total = openBlockers.length + resolvedBlockers.length;
  if (total === 0) return 100;

  const openPenalty   = openBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2), 0);
  const resolvedBonus = resolvedBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2) * 0.5, 0);
  const maxPenalty    = total * 3;
  const raw           = Math.max(0, maxPenalty - openPenalty + resolvedBonus);
  return Math.min(100, Math.round((raw / maxPenalty) * 100));
}

function computeWeightedOnTimeRate(completedTasks) {
  if (completedTasks.length === 0) return 0;

  let wtOntime = 0;
  let wtTotal  = 0;
  for (const t of completedTasks) {
    const w = DIFFICULTY_WEIGHT[t.difficulty] ?? DIFFICULTY_WEIGHT.medium;
    wtTotal += w;
    if (!t.isLate) wtOntime += w;
  }
  return wtTotal > 0 ? Math.round((wtOntime / wtTotal) * 100) : 0;
}

function computeAttendance(menteeId, clanSessions, entryMap) {
  if (!clanSessions || clanSessions.length === 0) {
    return {
      total_sessions: 0,
      present: 0,
      excused: 0,
      absent: 0,
      attendance_pct: null,
      avg_contribution_pts: null,
      data_available: false
    };
  }

  let present = 0;
  let excused = 0;
  let absent  = 0;
  let totalContrib = 0;
  let presentCount = 0;

  for (const session of clanSessions) {
    const key   = `${session.id}:${menteeId}`;
    const entry = entryMap.get(key);
    const att   = entry?.attendance ?? null;

    if (att === 'present') {
      present++;
      totalContrib += entry.contributionPoints ?? 0;
      presentCount++;
    } else if (att === 'excused') {
      excused++;
    } else {
      absent++;
    }
  }

  const accepted       = present + excused;
  const totalSessions  = clanSessions.length;
  const attendancePct  = Math.round((accepted / totalSessions) * 100);
  const avgContrib     = presentCount > 0 ? Math.round(totalContrib / presentCount) : 0;

  return {
    total_sessions: totalSessions,
    present,
    excused,
    absent: totalSessions - accepted,
    attendance_pct: attendancePct,
    avg_contribution_pts: avgContrib,
    data_available: true
  };
}

async function aggregateMenteeData(menteeIds, clanId = null, programId = null) {
  if (!menteeIds || !menteeIds.length) return [];
  let standing = false;
  if (clanId) {
    const clan = await models.Clan.findByPk(clanId, { attributes: ['kind', 'programId'] });
    if (isNonProgrammeClan(clan)) {
      // Outside the programme: evidence from this clan only — never a cohort mix.
      standing = true;
      programId = null;
    } else {
      programId = clan?.programId || programId;
    }
  }
  const scope = standing ? { clanId, standing: true } : { clanId, programId };

  const menteeMemberships = await models.ClanMembership.findAll({
    where: {
      userId: { [Op.in]: menteeIds },
      role:   'mentee',
      status: 'active'
    },
    attributes: ['userId', 'clanId'],
    include: [{
      model: models.Clan,
      as: 'clan',
      attributes: ['id', 'name'],
      required: true,
      where: standing
        ? { id: clanId, kind: 'standing' }
        : { kind: 'cohort', ...(programId ? { programId } : {}), ...(clanId ? { id: clanId } : {}) },
    }],
    raw: false
  });

  const menteeClanMap = new Map();
  const allMenteeClanIds = new Set();

  for (const m of menteeMemberships) {
    if (m.userId && m.clanId) {
      if (!menteeClanMap.has(m.userId)) {
        menteeClanMap.set(m.userId, { clanId: m.clanId, clanName: m.clan?.name ?? null });
      }
      allMenteeClanIds.add(m.clanId);
    }
  }

  let clanMentorIds = null;
  let clanName      = null;

  if (clanId) {
    const clanObj = await models.Clan.findByPk(clanId, { attributes: ['id', 'name'], raw: true });
    clanName = clanObj?.name ?? null;

    const mentorMemberships = await models.ClanMembership.findAll({
      where: {
        clanId,
        role: { [Op.in]: ['lead_mentor', 'co_mentor'] },
        status: 'active'
      },
      attributes: ['userId'],
      raw: true
    });
    clanMentorIds = mentorMemberships.map(m => m.userId);
  }

  const taskWhere = {
    menteeId: { [Op.in]: menteeIds },
    ...cohortService.taskFilterForScope(scope),
    status:   { [Op.ne]: 'cancelled' }
  };
  if (clanMentorIds !== null) {
    if (clanMentorIds.length === 0) {
      taskWhere.mentorId = { [Op.in]: ['00000000-0000-0000-0000-000000000000'] };
    } else {
      taskWhere.mentorId = { [Op.in]: clanMentorIds };
    }
  }

  const tasks = await models.AssignedTask.findAll({
    where: taskWhere,
    attributes: [
      'id', 'menteeId', 'mentorId', 'status', 'pointsAwarded', 'pointsBase',
      'finalRating', 'isLate', 'completedAt', 'isCustomTask', 'dueDate',
      'titleOverride', 'descriptionOverride'
    ],
    include: [{
      model: models.RoadmapTask,
      as: 'roadmapTask',
      attributes: ['title', 'type', 'difficulty', 'description', 'pointsBase', 'roadmapId', 'taskOrder'],
      // Which syllabus the task belongs to. An admin asking why somebody is
      // getting a certificate wants the roadmap and what is left of it, not a
      // flat list of titles with no shape.
      include: [{ model: models.Roadmap, as: 'roadmap', attributes: ['id', 'name'], required: false }]
    }],
    raw: false
  });

  // Custom rules must be judged against what the mentee actually submitted
  // and what the mentor approved—not merely the assignment title. Fetch this
  // evidence in two batched queries to avoid an N+1 request per task.
  const completedTaskIds = tasks.filter((task) => task.status === 'completed').map((task) => task.id);
  const [approvedSubmissions, approvedFeedback] = completedTaskIds.length ? await Promise.all([
    models.TaskSubmission.findAll({
      where: { assignedTaskId: { [Op.in]: completedTaskIds }, status: 'approved' },
      attributes: ['assignedTaskId', 'version', 'submissionText', 'submissionUrls'],
      order: [['version', 'DESC']], raw: true
    }),
    models.TaskFeedback.findAll({
      where: { assignedTaskId: { [Op.in]: completedTaskIds }, isApproved: true },
      attributes: ['assignedTaskId', 'feedbackText', 'criteriaMet', 'checkedCriteria', 'rating', 'decision'],
      order: [['createdAt', 'DESC']], raw: true
    })
  ]) : [[], []];
  const submissionByTask = new Map();
  for (const submission of approvedSubmissions) {
    if (!submissionByTask.has(submission.assignedTaskId)) submissionByTask.set(submission.assignedTaskId, submission);
  }
  const feedbackByTask = new Map();
  for (const feedback of approvedFeedback) {
    if (!feedbackByTask.has(feedback.assignedTaskId)) feedbackByTask.set(feedback.assignedTaskId, feedback);
  }

  const blockers = await models.Blocker.findAll({
    where: { menteeId: { [Op.in]: menteeIds }, ...cohortService.clanWhere(scope) },
    attributes: ['menteeId', 'status', 'category', 'severity', 'openedAt', 'resolvedAt'],
    raw: true
  });

  const targetClanIds = clanId ? [clanId] : [...allMenteeClanIds];
  let clanSessionsMap = new Map();
  let entryMap        = new Map();

  if (targetClanIds.length > 0) {
    const sessions = await models.CohortReviewSession.findAll({
      where: { clanId: { [Op.in]: targetClanIds }, status: 'finished' },
      attributes: ['id', 'clanId', 'sessionDate'],
      raw: true
    });

    for (const s of sessions) {
      if (!clanSessionsMap.has(s.clanId)) clanSessionsMap.set(s.clanId, []);
      clanSessionsMap.get(s.clanId).push(s);
    }

    if (sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      const entries = await models.CohortReviewEntry.findAll({
        where: {
          sessionId: { [Op.in]: sessionIds },
          menteeId:  { [Op.in]: menteeIds }
        },
        attributes: ['menteeId', 'sessionId', 'attendance', 'contributionPoints'],
        raw: true
      });
      for (const e of entries) {
        entryMap.set(`${e.sessionId}:${e.menteeId}`, e);
      }
    }
  }

  const taskMap    = {};
  const blockerMap = {};
  for (const id of menteeIds) { taskMap[id] = []; blockerMap[id] = []; }
  for (const t of tasks)   taskMap[t.menteeId]?.push(t);
  for (const b of blockers) blockerMap[b.menteeId]?.push(b);

  return menteeIds.map((id) => {
    const myTasks    = taskMap[id]    || [];
    const myBlockers = blockerMap[id] || [];
    const myClanInfo = menteeClanMap.get(id);

    const resolvedClanId   = clanId || myClanInfo?.clanId || null;
    const resolvedClanName = clanName || myClanInfo?.clanName || null;

    const menteeClanSessions = resolvedClanId ? (clanSessionsMap.get(resolvedClanId) || []) : [];

    let totalBase    = 0;
    let totalAwarded = 0;
    const taskSummaries = [];

    for (const t of myTasks) {
      const taskTitle = t.titleOverride || t.roadmapTask?.title || (t.isCustomTask ? 'Custom Task' : 'Assigned Task');
      const taskDesc  = t.descriptionOverride || t.roadmapTask?.description || null;
      const base      = (t.pointsBase && t.pointsBase > 0) ? t.pointsBase : (t.roadmapTask?.pointsBase || 10);
      const awarded   = t.pointsAwarded ?? 0;
      const submission = submissionByTask.get(t.id);
      const feedback = feedbackByTask.get(t.id);

      totalBase += base;
      if (t.status === 'completed') {
        totalAwarded += Math.min(awarded, base);
      }

      taskSummaries.push({
        title:       taskTitle,
        description: taskDesc ? taskDesc.slice(0, 300) : null,
        roadmapId:   t.isCustomTask ? null : (t.roadmapTask?.roadmapId ?? null),
        roadmapName: t.isCustomTask ? null : (t.roadmapTask?.roadmap?.name ?? null),
        taskOrder:   t.roadmapTask?.taskOrder ?? null,
        dueDate:     t.dueDate ?? null,
        type:        t.roadmapTask?.type ?? (t.isCustomTask ? 'custom' : 'general'),
        difficulty:  t.roadmapTask?.difficulty ?? 'medium',
        status:      t.status,
        isCustomTask: Boolean(t.isCustomTask),
        rating:      t.finalRating ? parseFloat(t.finalRating) : null,
        isLate:      t.isLate,
        pointsPct:   t.status === 'completed' && base > 0
          ? Math.round((Math.min(awarded, base) / base) * 100)
          : null,
        submissionEvidence: t.status === 'completed' && submission?.submissionText
          ? String(submission.submissionText).slice(0, 700)
          : null,
        submissionUrls: t.status === 'completed' && Array.isArray(submission?.submissionUrls)
          ? submission.submissionUrls.slice(0, 5)
          : [],
        mentorEvidence: t.status === 'completed' && feedback ? {
          feedback: String(feedback.feedbackText || '').slice(0, 500),
          criteriaMet: feedback.criteriaMet || feedback.checkedCriteria || [],
          rating: feedback.rating == null ? null : Number(feedback.rating),
          decision: feedback.decision || 'approved'
        } : null
      });
    }

    const completedTasks = myTasks.filter(t => t.status === 'completed');
    const totalTasks     = myTasks.length;

    /**
     * Completion rate is progress through the ROADMAP: of the roadmap tasks
     * assigned to this person, how many are done.
     *
     * Custom one-off tasks a mentor adds are real work but they are not the
     * curriculum, and counting them moved the denominator differently for
     * every mentee — two people with identical roadmap progress scored
     * differently because one had extra ad-hoc tasks. A tier threshold like
     * "80% completion" only means something against a fixed syllabus.
     *
     * Someone with no roadmap tasks at all falls back to everything assigned,
     * because 0% would read as "did nothing" when the truth is "nothing from a
     * roadmap was ever assigned". `basis` records which denominator was used
     * so the certificate evidence can say so rather than leave it inferred.
     */
    // `isCustomTask` is the repo's own discriminator, set at assignment time as
    // `roadmapTaskId ? false : true` and read the same way everywhere else
    // (taskService maps it straight to source 'custom' vs 'roadmap').
    const roadmapTasks     = myTasks.filter(t => !t.isCustomTask);
    const roadmapCompleted = roadmapTasks.filter(t => t.status === 'completed');
    const customTasks      = myTasks.filter(t => t.isCustomTask);
    const customCompleted  = customTasks.filter(t => t.status === 'completed');

    const usingRoadmap    = roadmapTasks.length > 0;
    const completionTotal = usingRoadmap ? roadmapTasks.length : totalTasks;
    const completionDone  = usingRoadmap ? roadmapCompleted.length : completedTasks.length;
    const completionRate  = completionTotal > 0
      ? Math.round((completionDone / completionTotal) * 100)
      : 0;

    const ratedTasks = completedTasks.filter(t => t.finalRating != null);
    const avgRating  = ratedTasks.length > 0
      ? parseFloat((ratedTasks.reduce((s, t) => s + parseFloat(t.finalRating), 0) / ratedTasks.length).toFixed(2))
      : null;

    const pointsPct  = totalBase > 0 ? Math.min(100, (totalAwarded / totalBase) * 100) : 0;
    const ratingPct  = avgRating != null ? (avgRating / 5.0) * 100 : pointsPct;
    const taskScore  = Math.round((pointsPct * 0.6) + (ratingPct * 0.4));

    const onTimePct  = computeWeightedOnTimeRate(completedTasks.map(t => ({
      isLate:     t.isLate,
      difficulty: t.roadmapTask?.difficulty ?? 'medium'
    })));

    const openBlockers     = myBlockers.filter(b => b.status !== 'resolved');
    const resolvedBlockers = myBlockers.filter(b => b.status === 'resolved');
    const blockerScore     = computeBlockerScore(openBlockers, resolvedBlockers);

    const blockersBySeverity = openBlockers.reduce((acc, b) => {
      const sev = b.severity || 'unknown';
      acc[sev] = (acc[sev] || 0) + 1;
      return acc;
    }, {});

    const cohortReviews = computeAttendance(id, menteeClanSessions, entryMap);

    let normalizedScore;
    if (cohortReviews.data_available) {
      normalizedScore = Math.round(
        (taskScore * 0.45) +
        (blockerScore * 0.15) +
        (cohortReviews.attendance_pct * 0.20) +
        (onTimePct * 0.20)
      );
    } else {
      normalizedScore = Math.round(
        (taskScore * 0.55) +
        (blockerScore * 0.20) +
        (onTimePct * 0.25)
      );
    }
    normalizedScore = Math.min(100, Math.max(0, normalizedScore));

    return {
      mentee_id:       id,
      clan_id:         resolvedClanId,
      clan_name:       resolvedClanName,
      normalized_score: normalizedScore,
      completion_rate:  completionRate,
      on_time_rate:     onTimePct,
      avg_rating:       avgRating,
      tasks:            taskSummaries,
      total_tasks:      totalTasks,
      completed_tasks:  completedTasks.length,
      // What the completion rate above was actually measured over, so a person
      // reading the number can see the sum rather than trust it.
      completion_basis: {
        basis:             usingRoadmap ? 'roadmap' : 'all_assigned',
        counted_total:     completionTotal,
        counted_completed: completionDone,
        roadmap_total:     roadmapTasks.length,
        roadmap_completed: roadmapCompleted.length,
        custom_total:      customTasks.length,
        custom_completed:  customCompleted.length
      },
      score_breakdown: {
        points_pct:      Math.round(pointsPct),
        rating_pct:      Math.round(ratingPct),
        task_score:      taskScore,
        blocker_score:   blockerScore,
        on_time_pct:     onTimePct,
        attendance_pct:  cohortReviews.data_available ? cohortReviews.attendance_pct : null,
        composite:       normalizedScore
      },
      blockers: {
        total:             myBlockers.length,
        resolved:          resolvedBlockers.length,
        open:              openBlockers.length,
        open_penalty_pts:  openBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2), 0),
        resolved_bonus_pts: parseFloat(resolvedBlockers.reduce((s, b) => s + (SEVERITY_WEIGHT[b.severity] ?? 2) * 0.5, 0).toFixed(1)),
        blocker_score_pct: blockerScore,
        open_by_severity:  blockersBySeverity,
        resolved_by_severity: resolvedBlockers.reduce((acc, b) => {
          const sev = b.severity || 'unknown';
          acc[sev] = (acc[sev] || 0) + 1;
          return acc;
        }, {}),
        categories: [...new Set(myBlockers.map(b => b.category))]
      },
      cohort_reviews: cohortReviews
    };
  });
}

module.exports = {
  preCheckHardConstraints,
  extractJsonFromText,
  enrichEvaluationResults,
  buildTierDescriptions,
  getDynamicTierOrder,
  buildBatchMenteePrompt,
  aggregateMenteeData
};
