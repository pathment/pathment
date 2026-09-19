const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const dailyLogService = require('../services/dailyLogService');
const gamificationService = require('../services/gamificationService');
const { requestedClanId } = require('../middlewares/portalScope');

/**
 * GET /api/mentee/daily-log
 *
 * The streak rides along with the entries because the client cannot always
 * work it out from them. It asks for a window of days to draw the strip with,
 * and a streak longer than that window would be clipped to the window: a
 * mentee on day fifty would be told forty two. Sending the counted answer with
 * the rows it was counted from means the number on this screen and the number
 * on the Points screen come from one place and cannot disagree.
 */
const getMyDailyLogs = catchAsync(async (req, res) => {
  const [entries, streak] = await Promise.all([
    dailyLogService.list(req.user.id, Number(req.query.limit) || 14, requestedClanId(req)),
    gamificationService.readStreak(req.user.id)
  ]);

  res.status(200).json(successResponse('Daily logs retrieved', {
    entries,
    streak: { current: streak.current, longest: streak.longest }
  }));
});

/** POST /api/mentee/daily-log  { dateKey, tasksDone, note } */
const saveMyDailyLog = catchAsync(async (req, res) => {
  const entry = await dailyLogService.upsert(req.user.id, { ...req.body, clanId: requestedClanId(req) });
  const streak = await gamificationService.readStreak(req.user.id);

  res.status(200).json(successResponse('Daily log saved', {
    entry,
    streak: { current: streak.current, longest: streak.longest }
  }));
});

module.exports = { getMyDailyLogs, saveMyDailyLog };
