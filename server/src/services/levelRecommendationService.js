const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const { labelledResponses } = require('../utils/intakeResponses');

/**
 * Evidence-based level placement for intake applicants.
 *
 * Applicants self-select a level on the apply form; nothing verifies it, so a
 * "Beginner" with three years of experience (or an "Advanced" who has never
 * shipped anything) stays misplaced. This reads what they actually wrote —
 * intake answers, assessment answers, score — and recommends a level.
 *
 * The split matters:
 *   - the AI only EXTRACTS evidence: per criterion true/false/unclear plus a
 *     verbatim quote from the applicant's own words,
 *   - a DETERMINISTIC rule then decides the level from those verdicts.
 * The policy stays the admin's, identical for every applicant and auditable —
 * the model never silently promotes anyone.
 *
 * Rules live on the cohort (`levelRules`) so they're set before review starts
 * and can be edited any time; a cohort without them gets the defaults below.
 */

/** Conservative: only an explicit `true` counts. `unclear`/null never promotes. */
const isMet = (v) => v === true;

/**
 * Default criteria — the Dev-Weekends model, which is a good general shape:
 * a top criterion strong enough to qualify on its own, plus supporting ones
 * where any two together qualify. Every field here is editable per cohort.
 */
function defaultCriteriaForTopLevel() {
  return [
    {
      key: 'experience_1yr',
      label: '1+ year of real experience',
      how: 'True only when the answers clearly show at least 12 months of real software work — a job title, company or client, with dates. Substantive dated internships count. Course projects, bootcamps and tutorial work do NOT count. Use unclear when there is nothing to judge from.',
      soloQualifies: true,
    },
    {
      key: 'production_fullstack',
      label: 'Multi-vendor / production-grade full-stack project',
      how: 'True when they describe a real production full-stack effort — multi-vendor, multi-tenant, or genuinely deployed and used by real people, with frontend, backend and persistence. Their own role and the hard parts should be clear. Tutorial clones and course assignments do NOT count.',
      soloQualifies: false,
    },
    {
      key: 'leetcode_150_plus',
      label: 'LeetCode 150–200+ problems solved',
      how: 'True when they state a solved count of roughly 150 or more, link a profile with credible activity, or show contest history. A count below 150, or a generic "I practise LeetCode" with no number, is False.',
      soloQualifies: false,
    },
    {
      key: 'dw_bronze',
      label: 'Dev Weekends bronze certification',
      how: 'True when they name a Dev Weekends credential — bronze or above (silver, gold). Otherwise False.',
      soloQualifies: false,
    },
  ];
}

function defaultCriteriaForMiddleLevel() {
  // DW's model has no separate bar for L1: it is where a coding-track applicant
  // lands when they don't clear the top level. Add criteria here only if you
  // want a middle level someone must actively qualify for.
  return [];
}

class LevelRecommendationService {
  // ── Rules ────────────────────────────────────────────────────────────────
  /**
   * The cohort's level rules, seeded from the defaults when unset. Levels are
   * ordered highest-first (the order they're evaluated in); the lowest level is
   * the base everyone falls back to.
   */
  async getRules(cohortId) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    const stored = cohort.levelRules;

    if (stored && Array.isArray(stored.levels) && stored.levels.length) {
      // Drop rules whose level no longer exists (the admin renamed/removed it).
      const valid = new Set(levels.map((l) => l.key));
      const baseKey = valid.has(stored.baseLevelKey) ? stored.baseLevelKey : (levels[0] ? levels[0].key : null);
      return {
        levels: stored.levels.filter((r) => valid.has(r.levelKey)),
        baseLevelKey: baseKey,
        fallthroughLevelKey: valid.has(stored.fallthroughLevelKey)
          ? stored.fallthroughLevelKey
          : (levels[1] ? levels[1].key : baseKey),
        baseLevelLocked: stored.baseLevelLocked !== false,
        cohortLevels: levels,
        seeded: false,
      };
    }
    return { ...this.defaultRules(levels), cohortLevels: levels, seeded: true };
  }

  /**
   * Defaults for a cohort's level list. `levels` is in the admin's own order
   * (lowest → highest), so the LAST entry is the top level.
   */
  defaultRules(levels = []) {
    if (!levels.length) return { levels: [], baseLevelKey: null };
    if (levels.length === 1) return { levels: [], baseLevelKey: levels[0].key };

    const ordered = [...levels];
    const base = ordered[0];
    const top = ordered[ordered.length - 1];
    const middles = ordered.slice(1, -1);

    const rules = [
      { levelKey: top.key, minMet: 2, criteria: defaultCriteriaForTopLevel() },
      ...middles.map((m) => ({ levelKey: m.key, minMet: 1, criteria: defaultCriteriaForMiddleLevel() })),
    ];
    // Highest first — the engine takes the first level whose bar is cleared.
    // Anyone who applied ABOVE the base level and clears nothing lands on the
    // lowest non-base level, NOT the base: the base track sits a different
    // assessment entirely, so dropping a coding-track applicant into it would
    // be a placement error, not a demotion.
    return {
      levels: rules,
      baseLevelKey: base.key,
      fallthroughLevelKey: ordered[1] ? ordered[1].key : base.key,
      baseLevelLocked: true,
    };
  }

  /** Replace the cohort's rules (validated). */
  async setRules(cohortId, rules) {
    const cohort = await models.Cohort.findByPk(cohortId);
    if (!cohort) throw new NotFoundError('Cohort not found');
    const levels = Array.isArray(cohort.levels) ? cohort.levels : [];
    const validKeys = new Set(levels.map((l) => l.key));

    if (!rules || !Array.isArray(rules.levels)) throw new ValidationError('levels must be an array');
    const cleaned = rules.levels.map((r) => {
      if (!validKeys.has(r.levelKey)) throw new ValidationError(`Unknown level: ${r.levelKey}`);
      const criteria = (Array.isArray(r.criteria) ? r.criteria : []).map((c, i) => {
        const label = String(c.label || '').trim();
        if (!label) throw new ValidationError('Every criterion needs a label');
        return {
          key: String(c.key || label.toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 60) || `c_${i}`,
          label: label.slice(0, 160),
          how: String(c.how || '').trim().slice(0, 2000),
          soloQualifies: c.soloQualifies === true,
        };
      });
      const minMet = Number.isFinite(Number(r.minMet)) ? Math.max(1, Math.trunc(Number(r.minMet))) : 1;
      return { levelKey: r.levelKey, minMet, criteria };
    });

    const baseLevelKey = validKeys.has(rules.baseLevelKey) ? rules.baseLevelKey : (levels[0] ? levels[0].key : null);
    await cohort.update({ levelRules: { levels: cleaned, baseLevelKey } });
    return this.getRules(cohortId);
  }

  // ── The deterministic decision ───────────────────────────────────────────
  /**
   * Given per-criterion verdicts, pick the level. Evaluated highest-first: a
   * level is reached when ANY solo-qualifying criterion is met, or when at
   * least `minMet` of its criteria are met. Otherwise fall through to base.
   * Pure and synchronous — same inputs always give the same placement.
   */
  decide(rules, verdicts = {}, selfSelectedLevel = null) {
    const trail = [];
    const baseKey = rules.baseLevelKey || null;

    // Someone who applied on the BASE track sat a different assessment, so
    // there's nothing comparable to promote them on — leave them where they
    // are. (Turn off with baseLevelLocked: false to let the criteria move them.)
    if (rules.baseLevelLocked !== false && baseKey && selfSelectedLevel === baseKey) {
      return { levelKey: baseKey, via: 'base-locked', metKeys: [], trail };
    }

    for (const rule of (rules.levels || [])) {
      const met = (rule.criteria || []).filter((c) => isMet(verdicts[c.key]));
      const solo = met.find((c) => c.soloQualifies);
      if (solo) {
        trail.push({ levelKey: rule.levelKey, reached: true, via: 'solo', criterion: solo.key, met: met.map((c) => c.key) });
        return { levelKey: rule.levelKey, via: 'solo', soloCriterion: solo.key, metKeys: met.map((c) => c.key), trail };
      }
      if (met.length >= rule.minMet) {
        trail.push({ levelKey: rule.levelKey, reached: true, via: 'count', met: met.map((c) => c.key) });
        return { levelKey: rule.levelKey, via: 'count', metKeys: met.map((c) => c.key), trail };
      }
      trail.push({ levelKey: rule.levelKey, reached: false, met: met.map((c) => c.key), needed: rule.minMet });
    }
    // Cleared nothing. A base-track applicant stays at base; anyone who applied
    // above it lands on the lowest non-base level rather than being dropped
    // into a track they never applied for.
    const appliedAboveBase = selfSelectedLevel && baseKey && selfSelectedLevel !== baseKey;
    const landing = appliedAboveBase ? (rules.fallthroughLevelKey || baseKey) : baseKey;
    return { levelKey: landing, via: appliedAboveBase ? 'fallthrough' : 'base', metKeys: [], trail };
  }

  /** Plain-English "why", so the reviewer never sees an unexplained level. */
  buildReason(rules, decision, verdicts, labelFor) {
    const nameOf = (lvlKey) => labelFor(lvlKey) || lvlKey || 'the base level';
    if (decision.via === 'base-locked') {
      return `Kept at ${nameOf(decision.levelKey)}: they applied on this track and sat its assessment, so there is nothing comparable to move them on.`;
    }
    if (decision.via === 'solo') {
      const c = (rules.levels || []).flatMap((r) => r.criteria || []).find((x) => x.key === decision.soloCriterion);
      return `Placed at ${nameOf(decision.levelKey)}: met "${c ? c.label : decision.soloCriterion}", which qualifies on its own.`;
    }
    if (decision.via === 'count') {
      const rule = (rules.levels || []).find((r) => r.levelKey === decision.levelKey);
      const labels = (rule?.criteria || []).filter((c) => decision.metKeys.includes(c.key)).map((c) => `"${c.label}"`);
      return `Placed at ${nameOf(decision.levelKey)}: met ${decision.metKeys.length} of the ${rule?.criteria.length || 0} criteria (${labels.join(', ')}), meeting the bar of ${rule?.minMet}.`;
    }
    const via = decision.via === 'fallthrough' ? 'Placed at' : 'Placed at';
    const missed = (rules.levels || []).map((r) => {
      const met = (r.criteria || []).filter((c) => isMet(verdicts[c.key])).length;
      return `${nameOf(r.levelKey)} (met ${met} of ${r.criteria.length}, needs ${r.minMet})`;
    });
    return missed.length
      ? `${via} ${nameOf(decision.levelKey)}: did not clear ${missed.join('; ')}.`
      : `${via} ${nameOf(decision.levelKey)}.`;
  }

  // ── The AI evidence pass ─────────────────────────────────────────────────
  /** Everything the applicant actually wrote, as grading context. */
  async _evidenceFor(application) {
    // Resolve each answer against the question that was actually asked — the
    // model can't judge "1+ year of experience" from `q_1a2b3c: 2 years`.
    const cohort = await models.Cohort.findByPk(application.cohortId, { attributes: ['intakeFormSchema'] });
    const lines = labelledResponses(application.responses, cohort && cohort.intakeFormSchema);

    let answerBlock = '';
    const sub = await models.AssessmentSubmission.findOne({
      where: { applicationId: application.id },
      order: [['submittedAt', 'DESC']],
    });
    if (sub && sub.assessmentId) {
      const assessment = await models.Assessment.findByPk(sub.assessmentId, {
        include: [{ model: models.AssessmentQuestion, as: 'questions' }],
      });
      const questions = [...((assessment && assessment.questions) || [])].sort((a, b) => a.position - b.position);
      const answers = sub.answers || {};
      const parts = [];
      for (const q of questions) {
        const a = answers[q.id] || {};
        let text = '';
        if (q.type === 'mcq' || q.type === 'multi_select') {
          const byId = new Map((q.options || []).map((o) => [o.id, o.label]));
          text = (a.optionIds || []).map((id) => byId.get(id) || id).join('; ');
        } else if (q.type === 'file_upload') text = a.fileUrl ? `(file: ${a.fileName || a.fileUrl})` : '';
        else if (q.type === 'external_link') text = a.link || '';
        else text = a.text || '';
        if (text) parts.push(`Q: ${q.prompt}\nA: ${text}`);
      }
      answerBlock = parts.join('\n\n');
    }
    return { profileLines: lines, answerBlock, submission: sub };
  }

  /**
   * Recommend a level for ONE applicant. The AI returns a verdict + verbatim
   * quote per criterion; the rule engine decides. Stores both on the
   * application so the reviewer can see exactly why.
   */
  async recommendForApplication(applicationId, actorId) {
    const groqService = require('./groqService');
    const application = await models.Application.findByPk(applicationId);
    if (!application) throw new NotFoundError('Application not found');

    const rules = await this.getRules(application.cohortId);
    const allCriteria = (rules.levels || []).flatMap((r) => r.criteria || []);
    if (!allCriteria.length) {
      return { applicationId, recommended: false, reason: 'no_level_rules' };
    }

    const { profileLines, answerBlock, submission } = await this._evidenceFor(application);
    const labelFor = (key) => (rules.cohortLevels || []).find((l) => l.key === key)?.label || key;

    const criteriaBlock = allCriteria
      .map((c) => `- key: ${c.key}\n  criterion: ${c.label}\n  how to judge: ${c.how || '(judge on the plain meaning of the criterion)'}`)
      .join('\n');

    const prompt = [
      `LEVELS AVAILABLE: ${(rules.cohortLevels || []).map((l) => l.label).join(' · ') || '(none)'}`,
      `APPLICANT SELF-SELECTED: ${labelFor(application.level) || '(none)'}`,
      application.assessmentScore != null ? `ASSESSMENT SCORE: ${application.assessmentScore}` : '',
      '',
      'CRITERIA TO VERIFY:',
      criteriaBlock,
      '',
      'APPLICANT PROFILE (their intake answers):',
      profileLines.length ? profileLines.join('\n') : '(none)',
      '',
      'ASSESSMENT ANSWERS:',
      answerBlock || '(no assessment answers)',
    ].filter(Boolean).join('\n');

    const raw = await groqService.generateText({
      feature: 'assessment',
      userId: actorId,
      temperature: 0.1,
      maxTokens: Math.min(2000, 220 * allCriteria.length + 300),
      system: [
        'You verify placement criteria for a training-program applicant. You do NOT choose their level — you only report, for each criterion, whether the applicant\'s own words prove it.',
        'For EACH criterion return exactly one verdict: true (the evidence clearly proves it), false (the evidence clearly contradicts it or is plainly absent), or unclear (you cannot tell).',
        'Be conservative: only answer true when a specific, concrete detail supports it. Claims with no substance ("I am passionate about coding", "I know many technologies") are NOT evidence. When torn, answer unclear — never guess true.',
        'Every true or false MUST carry `quote`: a short VERBATIM extract from the applicant\'s text that justifies it. Never invent or paraphrase a quote; leave it empty only for unclear.',
        'Also report `coherence`: one short line if their claims contradict the quality of their answers (e.g. claims years of experience but the answers read as a beginner), else an empty string.',
        'Reply with STRICT JSON only, no text outside it: {"criteria":[{"key":"<exact key given>","verdict":"true|false|unclear","quote":"<verbatim or empty>","note":"<one short sentence>"}],"coherence":"<one line or empty>"}.',
      ].join(' '),
      prompt,
    });

    let parsed = {};
    try {
      const m = raw.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    } catch { parsed = {}; }

    const byKey = new Map(allCriteria.map((c) => [c.key, c]));
    const verdicts = {};
    const details = {};
    for (const row of (Array.isArray(parsed.criteria) ? parsed.criteria : [])) {
      const c = row && byKey.get(String(row.key));
      if (!c) continue;
      const v = String(row.verdict || '').toLowerCase();
      const verdict = v === 'true' ? true : v === 'false' ? false : null;
      verdicts[c.key] = verdict;
      details[c.key] = {
        verdict,
        quote: row.quote ? String(row.quote).slice(0, 500) : '',
        note: row.note ? String(row.note).slice(0, 300) : '',
      };
    }
    // Anything the model skipped stays unknown rather than silently counting.
    for (const c of allCriteria) {
      if (!(c.key in verdicts)) { verdicts[c.key] = null; details[c.key] = { verdict: null, quote: '', note: 'not assessed' }; }
    }

    const decision = this.decide(rules, verdicts, application.level || null);
    const reason = this.buildReason(rules, decision, verdicts, labelFor);

    // If nothing could be judged, the criteria don't match what this cohort's
    // form/assessment actually asks — surface that instead of silently placing
    // everyone at the base level.
    const judged = Object.values(details).filter((d) => d.verdict !== null).length;
    const quoted = Object.values(details).filter((d) => d.quote).length;

    const evidence = {
      evidenceThin: judged === 0,
      judgedCount: judged,
      quotedCount: quoted,
      criteriaCount: allCriteria.length,
      criteria: details,
      decision: { via: decision.via, metKeys: decision.metKeys, trail: decision.trail },
      reason,
      coherence: parsed.coherence ? String(parsed.coherence).slice(0, 300) : '',
      selfSelected: application.level || null,
      matchesSelfSelected: (application.level || null) === (decision.levelKey || null),
      submissionId: submission ? submission.id : null,
      at: new Date().toISOString(),
    };

    await application.update({ recommendedLevel: decision.levelKey, levelEvidence: evidence });
    return { applicationId, recommended: true, recommendedLevel: decision.levelKey, evidence };
  }

  /** Apply the recommendation as the applicant's actual level (admin action). */
  async applyRecommendation(applicationId) {
    const application = await models.Application.findByPk(applicationId);
    if (!application) throw new NotFoundError('Application not found');
    if (!application.recommendedLevel) throw new ValidationError('No recommendation to apply — run level recommendation first');
    await application.update({ level: application.recommendedLevel });
    return application;
  }
}

module.exports = new LevelRecommendationService();
module.exports.defaultCriteriaForTopLevel = defaultCriteriaForTopLevel;
module.exports.defaultCriteriaForMiddleLevel = defaultCriteriaForMiddleLevel;
