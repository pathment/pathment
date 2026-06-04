const { Op } = require('sequelize');
const { models } = require('../db');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');

/**
 * cohortService — assembles a mentor's cohort for the Cockpit on real data,
 * and computes the fairness signals (relativeProgress / momentum / risk) that
 * the new design leans on.
 *
 * FAIRNESS v1 (intentionally simple + documented so it can be tuned later):
 *  - relativeProgress = absoluteProgress + credit for ACCEPTED EXTERNAL delays,
 *    capped, never below absolute. Someone fighting real, logged constraints
 *    reads higher than their raw output; a coasting mentee reads ~= absolute.
 *  - momentum from activity recency + recent completion trend (up/flat/down).
 *  - risk from how far behind the plan they are, how much of that the logged
 *    friction explains, inactivity, and open blockers.
 */

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const daysSince = (date) => {
  if (!date) return Infinity;
  const d = new Date(date).getTime();
  if (Number.isNaN(d)) return Infinity;
  return Math.floor((Date.now() - d) / 86400000);
};
const initialsOf = (first, last) =>
  `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';

// Enrollment statuses considered "current" for a mentee's primary card.
const ACTIVE_ENROLLMENT_STATUSES = [
  'active', 'matched', 'approved', 'pending_completion', 'level_completed'
];

class CohortService {
  /** Resolve the distinct mentee userIds a mentor is responsible for. */
  async resolveMenteeIds(mentorId) {
    const ids = new Set();

    // (a) Legacy / existing path: active 1:1 matches.
    const matches = await models.MentorMenteeMatch.findAll({
      where: { mentorId, status: 'active' },
      attributes: ['menteeId']
    });
    matches.forEach((m) => ids.add(m.menteeId));

    // (b) New path: clans where this user is a mentor → their mentee members.
    const mentorClans = await models.ClanMembership.findAll({
      where: { userId: mentorId, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
      attributes: ['clanId']
    });
    const clanIds = mentorClans.map((c) => c.clanId);
    if (clanIds.length) {
      const menteeMemberships = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: 'active', role: 'mentee' },
        attributes: ['userId']
      });
      menteeMemberships.forEach((m) => ids.add(m.userId));
    }

    return [...ids];
  }

  /** Pick the most relevant enrollment for a mentee's cockpit card. */
  pickPrimaryEnrollment(enrollments) {
    if (!enrollments || !enrollments.length) return null;
    const active = enrollments.find((e) => ACTIVE_ENROLLMENT_STATUSES.includes(e.status));
    if (active) return active;
    // else most recently enrolled
    return [...enrollments].sort(
      (a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0)
    )[0];
  }

  computeOnTimeRate(tasks) {
    const completed = tasks.filter((t) => t.status === 'completed');
    if (!completed.length) return 100; // nothing late yet — don't penalise
    const onTime = completed.filter((t) => !t.isLate).length;
    return Math.round((onTime / completed.length) * 100);
  }

  computeRelativeProgress(absolute, delays) {
    const frictionDays = delays
      .filter((d) => d.accepted && d.category === 'external')
      .reduce((sum, d) => sum + (d.days || 0), 0);
    const credit = Math.min(25, frictionDays * 1.5); // cap the fairness credit
    return clamp(Math.round(absolute + credit), Math.round(absolute), 100);
  }

  computeMomentum(tasks, lastActiveDays) {
    const now = Date.now();
    const inWindow = (t, from, to) => {
      if (t.status !== 'completed' || !t.completedAt) return false;
      const c = new Date(t.completedAt).getTime();
      return c >= from && c < to;
    };
    const last7 = tasks.filter((t) => inWindow(t, now - 7 * 86400000, now)).length;
    const prev7 = tasks.filter((t) => inWindow(t, now - 14 * 86400000, now - 7 * 86400000)).length;

    if (lastActiveDays > 7) return 'down';
    if (last7 > prev7) return 'up';
    if (last7 < prev7) return 'down';
    return 'flat';
  }

  computeRisk({ absolute, relative, expected, lastActiveDays, openBlockers, highSeverityBlockers, momentum }) {
    const behind = expected != null ? Math.max(0, expected - absolute) : 0;
    const gap = relative - absolute; // how much logged friction explains

    let level = 'low';
    const reasons = [];

    if (lastActiveDays > 10) {
      level = 'high';
      reasons.push(`no activity in ${lastActiveDays} days`);
    } else if (behind >= 30 && gap < 10) {
      level = 'high';
      reasons.push('well behind plan with no logged reason');
    } else if (highSeverityBlockers >= 1 && behind >= 20) {
      level = 'high';
      reasons.push('a high-severity blocker is holding them back');
    } else if (behind >= 15 || openBlockers > 0 || momentum === 'down' || lastActiveDays > 5) {
      level = 'watch';
      if (behind >= 15 && gap < 10) reasons.push('slipping behind the plan');
      if (openBlockers > 0) reasons.push(`${openBlockers} open blocker${openBlockers > 1 ? 's' : ''}`);
      if (momentum === 'down') reasons.push('momentum is dropping');
      if (lastActiveDays > 5 && lastActiveDays <= 10) reasons.push(`quiet for ${lastActiveDays} days`);
    }

    // If they're behind but friction explains it, soften the message.
    if (level !== 'low' && gap >= 10 && behind >= 15) {
      reasons.push('but logged real constraints — fighting to keep up');
    }

    return { risk: level, riskReason: reasons.length ? capitalize(reasons.join(', ')) : null };
  }

  async buildMenteeRow(menteeId) {
    const mentee = await models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
      include: [
        { model: models.MenteeProfile, as: 'menteeProfile', attributes: ['lastActivityDate'] },
        {
          model: models.Enrollment,
          as: 'enrollments',
          required: false,
          include: [
            { model: models.Program, as: 'program', attributes: ['id', 'name', 'totalDurationWeeks'] }
          ]
        }
      ]
    });
    if (!mentee) return null;

    const enrollment = this.pickPrimaryEnrollment(mentee.enrollments);

    // Tasks for this mentee (scoped to the primary enrollment when present).
    const taskWhere = { menteeId };
    if (enrollment) taskWhere.enrollmentId = enrollment.id;
    const tasks = await models.AssignedTask.findAll({
      where: taskWhere,
      attributes: ['id', 'status', 'isLate', 'completedAt', 'dueDate']
    });

    const delays = await models.DelayEvent.findAll({
      where: { menteeId },
      attributes: ['days', 'accepted', 'category']
    });

    const blockers = await models.Blocker.findAll({
      where: { menteeId, status: 'open' },
      attributes: ['id', 'severity']
    });

    const absolute = enrollment ? Math.round(Number(enrollment.overallProgressPercentage) || 0) : 0;
    const onTimeRate = this.computeOnTimeRate(tasks);
    const pendingApprovals = tasks.filter((t) => t.status === 'submitted').length;
    const openBlockers = blockers.length;
    const highSeverityBlockers = blockers.filter((b) => b.severity === 'high').length;
    const lastActivityDate = mentee.menteeProfile?.lastActivityDate || null;
    const lastActiveDays = daysSince(lastActivityDate);

    const week = enrollment?.currentWeek || 0;
    const totalWeeks = enrollment?.program?.totalDurationWeeks || 0;
    const expected = totalWeeks ? clamp(Math.round((week / totalWeeks) * 100), 0, 100) : null;

    const relativeProgress = this.computeRelativeProgress(absolute, delays);
    const momentum = this.computeMomentum(tasks, lastActiveDays);
    const { risk, riskReason } = this.computeRisk({
      absolute, relative: relativeProgress, expected, lastActiveDays,
      openBlockers, highSeverityBlockers, momentum
    });

    return {
      id: mentee.id,
      name: `${mentee.firstName} ${mentee.lastName}`.trim(),
      avatar: initialsOf(mentee.firstName, mentee.lastName),
      email: mentee.email,
      profilePictureUrl: mentee.profilePictureUrl || null,
      program: enrollment?.program?.name || '—',
      level: '—',
      week,
      totalWeeks,
      absoluteProgress: absolute,
      relativeProgress,
      onTimeRate,
      pendingApprovals,
      openBlockers,
      momentum,
      risk,
      riskReason,
      avgRating: enrollment ? Number(enrollment.avgTaskRating) || 0 : 0,
      lastActive: lastActivityDate ? humanizeDays(lastActiveDays) : 'never',
      sentiment: 'neutral'
    };
  }

  /**
   * Rich single-mentee profile for the mentor's mentee page: the computed row
   * plus full blockers/delays, tasks grouped by status, and a derived
   * (rule-based, real) summary + signals. The summary is an honest read of the
   * mentee's actual stats — not a fabricated narrative — until the LLM-backed
   * summary feature is wired in.
   */
  async getMenteeDetail(menteeId) {
    const row = await this.buildMenteeRow(menteeId);
    if (!row) return null;

    const [blockers, delays, tasks, insights, menteeProfile] = await Promise.all([
      models.Blocker.findAll({
        where: { menteeId },
        order: [['status', 'ASC'], ['openedAt', 'DESC']],
        include: [{ model: models.AssignedTask, as: 'task', attributes: ['id'], include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title'] }] }]
      }),
      models.DelayEvent.findAll({ where: { menteeId }, order: [['occurredAt', 'DESC']] }),
      models.AssignedTask.findAll({
        where: { menteeId },
        attributes: ['id', 'status', 'dueDate', 'submittedAt', 'completedAt', 'isLate', 'finalRating'],
        include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type'] }],
        order: [['dueDate', 'ASC']]
      }),
      models.Insight.findAll({
        where: { menteeId },
        order: [['created_at', 'DESC']],
        include: [{ model: models.User, as: 'author', attributes: ['firstName', 'lastName'] }]
      }),
      models.MenteeProfile.findOne({ where: { userId: menteeId }, attributes: ['personality'] })
    ]);

    const meetingNotes = await models.MeetingNote.findAll({
      where: { menteeId },
      order: [['date', 'DESC']],
      include: [{ model: models.User, as: 'author', attributes: ['firstName', 'lastName'] }]
    });

    const collaborators = await models.Collaborator.findAll({
      where: { menteeId },
      order: [['created_at', 'DESC']]
    });

    const dailyLogs = await models.DailyLogEntry.findAll({
      where: { menteeId },
      order: [['dateKey', 'DESC']],
      limit: 7
    });

    const completed = tasks.filter((t) => t.status === 'completed').length;

    // Group tasks by status for the profile's work history.
    const tasksByStatus = {};
    tasks.forEach((t) => {
      const key = t.status || 'assigned';
      (tasksByStatus[key] = tasksByStatus[key] || []).push({
        id: t.id,
        title: t.roadmapTask?.title || 'Task',
        type: t.roadmapTask?.type || null,
        status: t.status,
        dueDate: t.dueDate,
        isLate: t.isLate,
        finalRating: t.finalRating != null ? Number(t.finalRating) : null
      });
    });

    const aiSummary = buildSummary(row);
    const aiSignals = buildSignals(row, { completed }, delays);

    return {
      ...row,
      aiSummary,
      aiSignals,
      blockers: blockers.map((b) => ({
        id: b.id,
        title: b.title,
        category: b.category,
        severity: b.severity,
        status: b.status,
        daysOpen: Math.max(0, daysSince(b.openedAt)),
        taskTitle: b.task?.roadmapTask?.title || null
      })),
      delays: delays.map((d) => ({
        id: d.id,
        reason: d.reason,
        kind: d.kind,
        days: d.days,
        accepted: d.accepted,
        category: d.category,
        aiRationale: d.aiRationale,
        occurredAt: d.occurredAt
      })),
      personality: menteeProfile?.personality || null,
      insights: insights.map((i) => ({
        id: i.id,
        kind: i.kind,
        note: i.note,
        source: i.source,
        at: i.createdAt,
        by: i.author ? `${i.author.firstName} ${i.author.lastName}`.trim() : null
      })),
      notes: meetingNotes.map((n) => ({
        id: n.id,
        date: n.date,
        kind: n.kind,
        summary: n.summary,
        sentiment: n.sentiment,
        issues: n.issues || [],
        nextSteps: n.nextSteps || [],
        by: n.author ? `${n.author.firstName} ${n.author.lastName}`.trim() : null
      })),
      collaborators: collaborators.map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
        email: c.email,
        status: c.status
      })),
      dailyLogs: dailyLogs.map((l) => ({
        dateKey: l.dateKey,
        tasksDone: (l.tasksDone || []).length,
        note: l.note,
        loggedAt: l.loggedAt
      })),
      tasksByStatus
    };
  }

  /**
   * Send a gentle nudge to a mentee (in-app notification). Used from the
   * At-Risk view for someone going quiet.
   */
  async sendNudge(mentorId, menteeId, message) {
    const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'firstName'] });
    if (!mentee) throw new NotFoundError('Mentee not found');

    const body = (message && message.trim())
      || `Just checking in, ${mentee.firstName} — how's it going? Let me know if anything's blocking you.`;

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTOR_NUDGE,
      recipients: [{ userId: menteeId }],
      payload: {
        title: 'A nudge from your mentor',
        message: body,
        actionUrl: '/mentee/tasks',
        actionLabel: 'Open my tasks',
        relatedEntityType: 'user',
        relatedEntityId: mentorId
      }
    });

    return { sent: true };
  }

  /** Set a mentee's working-style read (0–100 dims). */
  async updatePersonality(menteeId, dims = {}) {
    const profile = await models.MenteeProfile.findOne({ where: { userId: menteeId } });
    if (!profile) throw new NotFoundError('Mentee profile not found');
    const clampDim = (v) => (v == null ? null : clamp(Math.round(Number(v) || 0), 0, 100));
    const next = {
      consistency: clampDim(dims.consistency),
      communication: clampDim(dims.communication),
      resilience: clampDim(dims.resilience),
      independence: clampDim(dims.independence)
    };
    profile.personality = next;
    await profile.save();
    return next;
  }

  /** Invite a specialist collaborator to a mentee. */
  async addCollaborator(menteeId, { name, role, email }, invitedBy) {
    if (!name || !name.trim() || !role || !role.trim()) throw new ValidationError('name and role are required');
    return models.Collaborator.create({
      menteeId,
      name: name.trim(),
      role: role.trim(),
      email: email || null,
      status: 'invited',
      invitedBy: invitedBy || null
    });
  }

  async removeCollaborator(menteeId, collaboratorId) {
    const collab = await models.Collaborator.findOne({ where: { id: collaboratorId, menteeId } });
    if (!collab) throw new NotFoundError('Collaborator not found');
    await collab.destroy();
    return { removed: true };
  }

  /** Log a 1:1 (or standup/review/pairing) note about a mentee. */
  async logMeetingNote(menteeId, data, mentorId) {
    if (!data.summary || !data.summary.trim()) throw new ValidationError('summary is required');
    return models.MeetingNote.create({
      menteeId,
      mentorId,
      scheduledMeetingId: data.scheduledMeetingId || null,
      date: data.date || new Date(),
      kind: data.kind || '1:1',
      summary: data.summary.trim(),
      sentiment: data.sentiment || 'neutral',
      issues: Array.isArray(data.issues) ? data.issues : [],
      nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps : [],
      createdBy: mentorId
    });
  }

  /** Log a mentor insight/observation about a mentee. */
  async addInsight(menteeId, { kind, note, source }, createdBy) {
    if (!note || !note.trim()) throw new ValidationError('note is required');
    return models.Insight.create({
      menteeId,
      kind: kind || 'general',
      note: note.trim(),
      source: source || null,
      createdBy: createdBy || null
    });
  }

  async getCohort(mentorId) {
    const menteeIds = await this.resolveMenteeIds(mentorId);
    const rows = await Promise.all(menteeIds.map((id) => this.buildMenteeRow(id)));
    const cohort = rows.filter(Boolean);

    const totals = {
      mentees: cohort.length,
      pendingApprovals: cohort.reduce((n, m) => n + m.pendingApprovals, 0),
      openBlockers: cohort.reduce((n, m) => n + m.openBlockers, 0),
      atRisk: cohort.filter((m) => m.risk !== 'low').length,
      onTimeRate: cohort.length
        ? Math.round(cohort.reduce((n, m) => n + m.onTimeRate, 0) / cohort.length)
        : 0
    };

    return { cohort, totals };
  }

  /**
   * Generate a short, sendable written summary of the mentor's cohort using
   * their configured AI connection (feature: 'summary'). We compute the metrics
   * from authoritative cohort data here, hand the model a compact factual brief,
   * and ask for a few tight paragraphs in the mentor's voice. Returns the text;
   * throws ValidationError (no data) or bubbles the AI error (no key configured).
   */
  async generateReportSummary(mentorId, period = 'week') {
    const { cohort } = await this.getCohort(mentorId);
    if (!cohort.length) throw new ValidationError('No cohort data to summarise yet.');

    const size = cohort.length;
    const round = (n) => Math.round(n);
    const avg = (sel) => (size ? cohort.reduce((s, m) => s + sel(m), 0) / size : 0);
    const avgProgress = round(avg((m) => m.absoluteProgress));
    const avgOnTime = round(avg((m) => m.onTimeRate));
    const rated = cohort.filter((m) => m.avgRating > 0);
    const avgRating = rated.length ? Number((rated.reduce((s, m) => s + m.avgRating, 0) / rated.length).toFixed(1)) : null;
    const onTrack = cohort.filter((m) => m.risk === 'low');
    const watch = cohort.filter((m) => m.risk === 'watch');
    const high = cohort.filter((m) => m.risk === 'high');
    const pending = cohort.reduce((n, m) => n + m.pendingApprovals, 0);
    const openBlockers = cohort.reduce((n, m) => n + m.openBlockers, 0);
    const top = [...cohort].sort((a, b) => (b.absoluteProgress + b.onTimeRate) - (a.absoluteProgress + a.onTimeRate)).slice(0, 3);

    const brief = [
      `Period: this ${period}`,
      `Cohort size: ${size} mentees`,
      `Average progress: ${avgProgress}%`,
      `On-time delivery: ${avgOnTime}%`,
      avgRating ? `Average work quality: ${avgRating}/5` : 'Average work quality: no ratings yet',
      `On track: ${onTrack.length}; to watch: ${watch.length}; at risk: ${high.length}`,
      `Pending reviews: ${pending}; open blockers: ${openBlockers}`,
      `Top performers: ${top.map((m) => `${m.name} (${round(m.absoluteProgress)}% done, ${round(m.onTimeRate)}% on time)`).join('; ') || 'none'}`,
      `Needs attention: ${[...high, ...watch].map((m) => `${m.name} — ${m.riskReason || m.risk}`).join('; ') || 'none'}`,
    ].join('\n');

    const system =
      'You are an experienced mentor writing a concise weekly cohort update for your program lead. ' +
      'Write in the first person, warm but professional, 2-3 short paragraphs, no headings, no bullet ' +
      'lists, no markdown. Name specific mentees where relevant. Be honest about risks and concrete ' +
      'about what you will do next. Do not invent facts beyond the brief.';
    const prompt = `Here is the data for my cohort update. Write the update.\n\n${brief}`;

    const groqService = require('./groqService');
    const summary = await groqService.generateText({ system, prompt, feature: 'summary', userId: mentorId, temperature: 0.6, maxTokens: 600 });
    return { summary, period };
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function buildSummary(row) {
  const first = (row.name || 'This mentee').split(' ')[0];
  const momentumWord = row.momentum === 'up' ? 'building' : row.momentum === 'down' ? 'slipping' : 'steady';
  const fairness = row.relativeProgress > row.absoluteProgress
    ? ` Adjusted for logged constraints they read ${row.relativeProgress}% — doing better than raw output suggests.`
    : '';
  const blockerNote = row.openBlockers
    ? ` ${row.openBlockers} open blocker${row.openBlockers > 1 ? 's' : ''} to clear.`
    : '';
  return `${first} is ${row.absoluteProgress}% through the plan with ${row.onTimeRate}% on-time delivery. Momentum is ${momentumWord}.${fairness}${blockerNote}`;
}

function buildSignals(row, counts, delays) {
  const signals = [];
  signals.push(`${row.onTimeRate}% on-time across ${counts.completed} completed task${counts.completed === 1 ? '' : 's'}`);
  const acceptedExternal = (delays || []).filter((d) => d.accepted && d.category === 'external');
  if (acceptedExternal.length) {
    const days = acceptedExternal.reduce((n, d) => n + (d.days || 0), 0);
    signals.push(`Logged ${days}d of accepted external friction — counted in their favour`);
  }
  if (row.openBlockers) signals.push(`${row.openBlockers} open blocker${row.openBlockers > 1 ? 's' : ''}`);
  if (row.pendingApprovals) signals.push(`${row.pendingApprovals} submission${row.pendingApprovals > 1 ? 's' : ''} awaiting your review`);
  signals.push(`Last active ${row.lastActive}`);
  return signals;
}

function humanizeDays(days) {
  if (days === Infinity) return 'never';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

module.exports = new CohortService();
