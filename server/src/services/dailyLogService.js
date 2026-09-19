const { models } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { resolveMenteeClanId, listMenteeClans, clanScopedWhere } = require('./menteeClanScope');

/** Daily check-in log (one entry per mentee per day, upserted). */
class DailyLogService {
  /**
   * @param {string} menteeId
   * @param {object} entry
   */
  async upsert(menteeId, { dateKey, tasksDone, slotsDone, note, clanId: requestedClanId }) {
    if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      throw new ValidationError('dateKey (YYYY-MM-DD) is required');
    }
    const clanId = await resolveMenteeClanId(menteeId, requestedClanId);
    const memberships = await listMenteeClans(menteeId);
    const where = clanScopedWhere({ menteeId, dateKey }, clanId, memberships.length);
    const tasks = Array.isArray(tasksDone) ? tasksDone : [];
    const slots = Array.isArray(slotsDone) ? slotsDone : [];
    let entry = await models.DailyLogEntry.findOne({ where });
    if (entry) {
      entry.tasksDone = tasks;
      entry.slotsDone = slots;
      entry.note = note ?? null;
      entry.loggedAt = new Date();
      if (clanId) entry.clanId = clanId;
      await entry.save();
    } else {
      entry = await models.DailyLogEntry.create({ menteeId, dateKey, tasksDone: tasks, slotsDone: slots, note: note ?? null, clanId: clanId || null });
    }

    // Logging a day is what a streak is made of, and nothing here used to say
    // so: the counter on the profile was only ever moved when a mentor
    // approved a submission, so a mentee could log every day for a fortnight
    // and still be told their streak was zero. Required here rather than at
    // the top of the file because gamification reaches back into this one.
    //
    // Deliberately not fatal. A streak is worth less than the log entry it
    // counts, and refusing to save somebody's day because a badge check threw
    // would be the wrong way round.
    try {
      await require('./gamificationService').updateStreak(menteeId);
    } catch (error) {
      console.error('[DailyLog] Could not update the streak:', error.message);
    }

    return entry;
  }

  async list(menteeId, limit = 14, clanId = null) {
    const resolved = await resolveMenteeClanId(menteeId, clanId);
    const memberships = await listMenteeClans(menteeId);
    return models.DailyLogEntry.findAll({
      where: clanScopedWhere({ menteeId }, resolved, memberships.length),
      order: [['dateKey', 'DESC']],
      limit
    });
  }
}

module.exports = new DailyLogService();
