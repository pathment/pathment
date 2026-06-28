const { models, sequelize } = require('../db');
const { Op } = require('sequelize');
const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');

const HEARTBEAT_INTERVAL_MINUTES = 5;
const IDLE_THRESHOLD_MINUTES = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayDate() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
}

async function getOrCreateSession(userId) {
  const date = todayDate();
  const [session] = await models.ActivitySession.findOrCreate({
    where: { userId, date },
    defaults: {
      userId,
      date,
      sessionStart: new Date(),
      activeMinutes: 0,
      pageViews: 0,
      eventsCount: 0,
    },
  });
  return session;
}

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * POST /activity/session/start
 * Called when the app mounts. Creates or retrieves today's session.
 */
const startSession = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const session = await getOrCreateSession(userId);

  // Mark lastHeartbeat = now so the FIRST heartbeat (5 min later) counts those minutes.
  // Without this, the first heartbeat treats itself as "no prior beat" and skips adding time.
  await session.update({ lastHeartbeat: new Date() });

  console.log('[ACTIVITY] startSession userId=%s date=%s', userId, session.date);

  res.status(200).json(
    successResponse('Session started', { sessionId: session.id, date: session.date })
  );
});

/**
 * POST /activity/session/heartbeat
 * Called every 5 minutes while the tab is visible.
 * Only adds active time if the last heartbeat was recent (< IDLE_THRESHOLD).
 */
const heartbeat = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const session = await getOrCreateSession(userId);
  const now = new Date();

  // Client reports exactly how many minutes the tab was visible since the last
  // heartbeat / focus event. We cap it at IDLE_THRESHOLD to discard stale pings.
  const reported = parseFloat(req.body?.durationMinutes) || 0;
  const addMinutes = Math.round(Math.min(Math.max(0, reported), IDLE_THRESHOLD_MINUTES));

  console.log('[ACTIVITY] heartbeat userId=%s body=%j reported=%d addMinutes=%d currentTotal=%d',
    userId, req.body, reported, addMinutes, session.activeMinutes);

  await session.update({
    lastHeartbeat: now,
    activeMinutes: (session.activeMinutes || 0) + addMinutes,
    sessionEnd: now,
  });

  console.log('[ACTIVITY] heartbeat saved newTotal=%d', (session.activeMinutes || 0) + addMinutes);

  res.status(200).json(
    successResponse('Heartbeat recorded', { activeMinutes: (session.activeMinutes || 0) + addMinutes })
  );
});

/**
 * POST /activity/session/end
 * Called via sendBeacon when the tab is closed/hidden.
 */
const endSession = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const session = await getOrCreateSession(userId);

  await session.update({ sessionEnd: new Date() });

  res.status(200).json(successResponse('Session ended'));
});

/**
 * POST /activity/event
 * Log a named event (task_opened, submission_started, etc.)
 */
const logEvent = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const {
    eventType,
    eventCategory = 'general',
    entityType,
    entityId,
    metadata = {},
  } = req.body;

  if (!eventType) {
    return res.status(400).json({ success: false, message: 'eventType is required' });
  }

  const [event, session] = await Promise.all([
    models.AnalyticsEvent.create({
      userId,
      eventType,
      eventCategory,
      eventData: { entityType, entityId, ...metadata },
      sessionId: null, // Not linking to session UUID - keeps it simple
    }),
    getOrCreateSession(userId),
  ]);

  await session.increment('eventsCount');

  res.status(201).json(successResponse('Event logged', { eventId: event.id }));
});

/**
 * POST /activity/page-view
 * Lightweight page view tracker (separate from events for performance).
 */
const logPageView = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const { page } = req.body;

  const [session] = await Promise.all([
    getOrCreateSession(userId),
    models.AnalyticsEvent.create({
      userId,
      eventType: 'page_view',
      eventCategory: 'navigation',
      eventData: { page },
    }),
  ]);

  await session.increment('pageViews');

  res.status(200).json(successResponse('Page view logged'));
});

// ─── Read endpoints ────────────────────────────────────────────────────────────

/**
 * GET /activity/me/summary?days=7
 * Mentee's own activity summary.
 */
const getMySummary = catchAsync(async (req, res) => {
  const userId = req.user.id;
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));

  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceDate = since.toISOString().split('T')[0];

  const [sessions, recentEvents, completedTasks] = await Promise.all([
    models.ActivitySession.findAll({
      where: { userId, date: { [Op.gte]: sinceDate } },
      order: [['date', 'ASC']],
      attributes: ['date', 'activeMinutes', 'pageViews', 'eventsCount', 'sessionStart', 'sessionEnd'],
    }),
    models.AnalyticsEvent.findAll({
      where: {
        userId,
        createdAt: { [Op.gte]: since },
        eventCategory: { [Op.in]: ['task', 'submission'] },
      },
      order: [['createdAt', 'DESC']],
      limit: 20,
      attributes: ['eventType', 'eventData', 'createdAt'],
    }),
    models.AssignedTask.findAll({
      where: {
        menteeId: userId,
        submittedAt: { [Op.gte]: since },
        timeSpentHours: { [Op.ne]: null },
      },
      attributes: ['timeSpentHours'],
    }),
  ]);

  const totalActiveMinutes = sessions.reduce((s, r) => s + (r.activeMinutes || 0), 0);
  const activeDays = sessions.filter(r => (r.activeMinutes || 0) > 0).length;
  const todaySession = sessions.find(r => r.date === todayDate());
  const totalWorkHours = completedTasks.reduce((s, t) => s + (parseFloat(t.timeSpentHours) || 0), 0);

  res.status(200).json(
    successResponse('Activity summary retrieved', {
      summary: {
        totalActiveMinutes,
        activeDays,
        avgDailyMinutes: activeDays > 0 ? Math.round(totalActiveMinutes / activeDays) : 0,
        todayActiveMinutes: todaySession?.activeMinutes || 0,
        currentStreak: computeStreak(sessions),
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      },
      dailySessions: sessions,
      recentEvents,
    })
  );
});

/**
 * GET /activity/mentee/:id/summary?days=7
 * Mentor or admin viewing a mentee's activity.
 */
const getMenteeSummary = catchAsync(async (req, res) => {
  const { id: menteeId } = req.params;
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));

  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceDate = since.toISOString().split('T')[0];

  const [sessions, recentEvents, mentee, completedTasks] = await Promise.all([
    models.ActivitySession.findAll({
      where: { userId: menteeId, date: { [Op.gte]: sinceDate } },
      order: [['date', 'ASC']],
      attributes: ['date', 'activeMinutes', 'pageViews', 'eventsCount', 'sessionStart'],
    }),
    models.AnalyticsEvent.findAll({
      where: {
        userId: menteeId,
        createdAt: { [Op.gte]: since },
      },
      order: [['createdAt', 'DESC']],
      limit: 30,
      attributes: ['eventType', 'eventData', 'createdAt'],
    }),
    models.User.findByPk(menteeId, {
      attributes: ['id', 'firstName', 'lastName', 'email'],
    }),
    models.AssignedTask.findAll({
      where: {
        menteeId,
        submittedAt: { [Op.gte]: since },
        timeSpentHours: { [Op.ne]: null },
      },
      attributes: ['timeSpentHours'],
    }),
  ]);

  if (!mentee) {
    return res.status(404).json({ success: false, message: 'Mentee not found' });
  }

  const totalActiveMinutes = sessions.reduce((s, r) => s + (r.activeMinutes || 0), 0);
  const activeDays = sessions.filter(r => (r.activeMinutes || 0) > 0).length;
  const todaySession = sessions.find(r => r.date === todayDate());
  const totalWorkHours = completedTasks.reduce((s, t) => s + (parseFloat(t.timeSpentHours) || 0), 0);

  res.status(200).json(
    successResponse('Mentee activity retrieved', {
      mentee,
      summary: {
        totalActiveMinutes,
        activeDays,
        avgDailyMinutes: activeDays > 0 ? Math.round(totalActiveMinutes / activeDays) : 0,
        todayActiveMinutes: todaySession?.activeMinutes || 0,
        currentStreak: computeStreak(sessions),
        totalWorkHours: Math.round(totalWorkHours * 10) / 10,
      },
      dailySessions: sessions,
      recentEvents,
    })
  );
});

/**
 * GET /activity/admin/overview?days=7
 * Admin view: per-mentee activity rollup.
 */
const getAdminOverview = catchAsync(async (req, res) => {
  const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));

  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  const sinceDate = since.toISOString().split('T')[0];

  // Get all mentee sessions in range
  const sessions = await models.ActivitySession.findAll({
    where: { date: { [Op.gte]: sinceDate } },
    include: [
      {
        model: models.User,
        as: 'user',
        where: { role: 'mentee', status: 'active' },
        attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl'],
        required: true,
      },
    ],
    order: [['date', 'DESC']],
  });

  // Group by user
  const byUser = {};
  for (const s of sessions) {
    const uid = s.userId;
    if (!byUser[uid]) {
      byUser[uid] = {
        user: s.user,
        totalActiveMinutes: 0,
        activeDays: 0,
        lastActiveDate: null,
        todayActiveMinutes: 0,
        sessions: [],
      };
    }
    byUser[uid].totalActiveMinutes += s.activeMinutes || 0;
    if ((s.activeMinutes || 0) > 0) byUser[uid].activeDays += 1;
    if (!byUser[uid].lastActiveDate || s.date > byUser[uid].lastActiveDate) {
      byUser[uid].lastActiveDate = s.date;
    }
    if (s.date === todayDate()) {
      byUser[uid].todayActiveMinutes = s.activeMinutes || 0;
    }
    byUser[uid].sessions.push({ date: s.date, activeMinutes: s.activeMinutes });
  }

  const menteeStats = Object.values(byUser).map(m => ({
    ...m,
    avgDailyMinutes: m.activeDays > 0 ? Math.round(m.totalActiveMinutes / m.activeDays) : 0,
  }));

  // Platform-wide stats
  const totalActiveToday = menteeStats.filter(m => m.todayActiveMinutes > 0).length;
  const totalActiveThisWeek = menteeStats.filter(m => m.activeDays > 0).length;
  const avgMinutes = menteeStats.length > 0
    ? Math.round(menteeStats.reduce((s, m) => s + m.avgDailyMinutes, 0) / menteeStats.length)
    : 0;

  res.status(200).json(
    successResponse('Admin activity overview retrieved', {
      platform: {
        activeToday: totalActiveToday,
        activeThisWeek: totalActiveThisWeek,
        avgDailyMinutesPerMentee: avgMinutes,
        periodDays: days,
      },
      menteeStats: menteeStats.sort((a, b) => b.totalActiveMinutes - a.totalActiveMinutes),
    })
  );
});

// ─── Utility ──────────────────────────────────────────────────────────────────

function computeStreak(sessions) {
  if (!sessions.length) return 0;
  const activeDates = new Set(
    sessions.filter(s => (s.activeMinutes || 0) > 0).map(s => s.date)
  );
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (activeDates.has(dateStr)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

module.exports = {
  startSession,
  heartbeat,
  endSession,
  logEvent,
  logPageView,
  getMySummary,
  getMenteeSummary,
  getAdminOverview,
};
