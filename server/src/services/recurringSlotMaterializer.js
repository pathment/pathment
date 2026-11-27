const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { TASK_TYPES } = require('../utils/taskSchedule');
const { zonedWallClockToUtc } = require('../utils/timezone');
const { nextOccurrences } = require('../utils/reviewRecurrence');
const { VISIBLE_MEMBERSHIP_STATUSES, CLAN_ROLE_RANK } = require('../config/membership');
const { isProgrammeClan } = require('../config/clanKinds');

/**
 * How far ahead a repeat is allowed to materialise. Was 14 days, which for a
 * weekday repeat is ten tasks in somebody's list before they have done the
 * first one. A week is enough to plan around and small enough to be wrong
 * about.
 */
const HORIZON_DAYS = 7;

/**
 * How many past-due, never-submitted occurrences of the SAME repeat may be
 * outstanding before the repeat stops producing new ones.
 *
 * A repeat is a standing instruction, not a licence to pile up. Somebody who
 * stopped submitting for a month came back to twenty-two open "Tech talk"
 * tasks, every one overdue - useless to them, and it buries the mentor's
 * review queue under one mentee. Three is a fortnight of slack on a weekly
 * repeat and still a short list to catch up on.
 */
const MAX_OVERDUE_OCCURRENCES = 3;

/** Statuses that mean the mentee has not handed this occurrence in yet. */
const UNSUBMITTED_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];

/** Clan roles that can own an occurrence on a mentee's behalf. */
const MENTOR_CLAN_ROLES = ['lead_mentor', 'core_team', 'co_mentor'];

class RecurringSlotMaterializer {
  /**
   * Periodic tick run by notificationScheduler.
   * Finds all active MenteeSchedule recurring slots and materializes upcoming tasks.
   */
  async tick() {
    try {
      const menteeSchedules = await models.MenteeSchedule.findAll();
      let createdCount = 0;
      let updatedCount = 0;

      for (const ms of menteeSchedules) {
        const schedule = Array.isArray(ms.schedule) ? ms.schedule : [];
        const mentorId = ms.assignedBy;

        for (const slot of schedule) {
          if (slot.kind !== 'recurring' || !slot.recurring) continue;

          const rec = slot.recurring;
          if (!(rec.mentorId || mentorId) || !rec.title || !rec.startsOn || rec.dayOfWeek == null || !rec.timeLocal) continue;

          try {
            // `_processSlotForMentee` returns { createdForSlot, updatedForSlot },
            // not a number. Adding the object to a number stringified it, so
            // createdCount came out as "0[object Object]" — which is not > 0,
            // so the "materialized N task(s)" line never printed however much
            // work the tick actually did, and any caller reading the count got
            // a string. `activateSlotForMentor` already unwraps it this way.
            const result = await this._processSlotForMentee(ms.menteeId, rec.mentorId || mentorId, slot.id, rec, rec.clanId || ms.clanId);
            createdCount += Number(result?.createdForSlot) || 0;
            updatedCount += Number(result?.updatedForSlot) || 0;
          } catch (err) {
            console.error(`[recurringSlotMaterializer] Error processing slot ${slot.id} for mentee ${ms.menteeId}:`, err.message);
          }
        }
      }

      if (createdCount > 0 || updatedCount > 0) {
        console.log(`[recurringSlotMaterializer] Materialized ${createdCount} and updated ${updatedCount} recurring schedule task(s)`);
      }
      return { createdCount, updatedCount };
    } catch (error) {
      console.error('[recurringSlotMaterializer] tick failed:', error.message);
      return { createdCount: 0, updatedCount: 0, error: error.message };
    }
  }

  /**
   * Materialize occurrences for a specific slot across all mentees assigned by mentorId.
   * Driven by mentor's "Activate now" button or fire-and-forget after slot creation.
   */
  async activateSlotForMentor(mentorId, slotId, menteeIds = null) {
    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'slot';
    const where = Array.isArray(menteeIds) && menteeIds.length
      ? { menteeId: menteeIds }
      : { assignedBy: mentorId };
    const menteeSchedules = await models.MenteeSchedule.findAll({ where });

    let appliedMentees = 0;
    let createdTasks = 0;
    let updatedTasks = 0;

    for (const ms of menteeSchedules) {
      const schedule = Array.isArray(ms.schedule) ? ms.schedule : [];
      let slot = schedule.find((s, i) => (s.id || slug(s.label) || `block-${i}`) === slotId);
      if (!slot && /^(slot|block)-\d+$/.test(slotId)) {
        const num = Number(slotId.replace(/^(slot|block)-/, ''));
        if (num >= 0 && num < schedule.length) slot = schedule[num];
      }
      if (!slot || slot.kind !== 'recurring' || !slot.recurring || (slot.recurring.mentorId || ms.assignedBy) !== mentorId) continue;

      const rec = slot.recurring;
      if (!(rec.mentorId || mentorId) || !rec.title || !rec.startsOn || rec.dayOfWeek == null || !rec.timeLocal) continue;

      appliedMentees++;
      const res = await this._processSlotForMentee(ms.menteeId, rec.mentorId || mentorId, slot.id || slotId, rec, rec.clanId || ms.clanId);
      createdTasks += (res?.createdForSlot || 0);
      updatedTasks += (res?.updatedForSlot || 0);
    }

    return { appliedMentees, createdTasks, updatedTasks };
  }

  /**
   * Process a single recurring slot for a mentee and create missing occurrence tasks.
   * Uses a batch query for existing tasks to minimise DB round-trips.
   */
  async _processSlotForMentee(menteeId, mentorId, slotId, recConfig, clanId = null) {
    // The scheduler and an activation request may race across server processes.
    return sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(hashtext(:key))', {
        replacements: { key: `task-schedule:${menteeId}:${slotId}` }, transaction
      });
      return this._materialize(menteeId, mentorId, slotId, recConfig, clanId);
    });
  }

  /**
   * Who the occurrence is assigned BY.
   *
   * `taskService._isMentorForMentee` refuses when the mentor and the mentee are
   * the same person, and it is right to: a co-mentor of the clan they also
   * learn in matches every clan check below it, so without that line they could
   * assign their own work and then review it. That check stays exactly as it is.
   *
   * What it was never meant to judge is a SCHEDULER acting on a repeat somebody
   * set earlier. Core team members are precisely the overlapping case -
   * `co_mentor` and `mentee` in one standing clan - so when such a person put a
   * repeat on their own task, every occurrence this file computed was refused
   * with "You are not the mentor for this mentee", hourly, into the log and
   * nowhere a human would look. Fourteen refusals in a single tick on
   * production, and a mentor UI still cheerfully reading "Repeats every
   * weekday".
   *
   * So the scheduler stops asking the guard to approve a self-assignment and
   * names a real mentor instead: the clan's lead, or the most senior other
   * mentor in it. A clan with nobody but the mentee has no honest answer, and
   * the slot is skipped with a reason rather than failing once per occurrence
   * for ever.
   */
  async _responsibleMentorId(menteeId, mentorId, clanId) {
    if (mentorId && mentorId !== menteeId) return mentorId;
    if (!clanId) return null;

    const clan = await models.Clan.findByPk(clanId, { attributes: ['leadMentorId'] });
    if (clan?.leadMentorId && clan.leadMentorId !== menteeId) return clan.leadMentorId;

    const rows = await models.ClanMembership.findAll({
      where: {
        clanId,
        userId: { [Op.ne]: menteeId },
        status: { [Op.in]: VISIBLE_MEMBERSHIP_STATUSES },
        role: { [Op.in]: MENTOR_CLAN_ROLES },
      },
      attributes: ['userId', 'role'],
    });
    const senior = [...rows].sort(
      (a, b) => (CLAN_ROLE_RANK[b.role] ?? -1) - (CLAN_ROLE_RANK[a.role] ?? -1)
    )[0];
    return senior?.userId || null;
  }

  /**
   * Tell the mentor once that a repeat has stopped for a backlog.
   *
   * Written straight to the table rather than through notificationOrchestrator
   * because that dedupes on (type, relatedEntity) with no time window at all:
   * routed through it, a mentee who falls behind again in three months would
   * be silently skipped, for ever, on the strength of one notice from today.
   * A week is the right memory for this. In-app only on purpose - a paused
   * repeat is worth seeing, not worth an email.
   */
  async _noteBacklog(menteeId, mentorId, overdueCount, title) {
    if (!mentorId || mentorId === menteeId || !models.Notification) return;
    const since = new Date(Date.now() - 7 * 86400000);
    const already = await models.Notification.findOne({
      where: {
        userId: mentorId,
        type: 'task',
        relatedEntityType: 'recurring_backlog',
        relatedEntityId: menteeId,
        createdAt: { [Op.gte]: since },
      },
      attributes: ['id'],
    });
    if (already) return;

    const mentee = await models.User.findByPk(menteeId, { attributes: ['firstName', 'lastName'] });
    const name = mentee ? `${mentee.firstName || ''} ${mentee.lastName || ''}`.trim() : 'A mentee';
    await models.Notification.create({
      userId: mentorId,
      type: 'task',
      audience: 'mentor',
      title: 'A repeating task has paused',
      message: `${name || 'A mentee'} has ${overdueCount} overdue "${title}" tasks, so no new ones are being created until they catch up.`,
      actionUrl: `/mentor/mentees/${menteeId}`,
      actionLabel: 'Open mentee',
      relatedEntityType: 'recurring_backlog',
      relatedEntityId: menteeId,
      status: 'unread',
    });
  }

  async _materialize(menteeId, mentorId, slotId, recConfig, clanId = null) {
    const clan = clanId && await models.Clan.findByPk(clanId);
    if (isProgrammeClan(clan) && clan?.frozenAt) return { createdForSlot: 0, updatedForSlot: 0 };

    const assigningMentorId = await this._responsibleMentorId(menteeId, mentorId, clanId);
    if (!assigningMentorId) {
      console.warn(`[recurringSlotMaterializer] Slot ${slotId} for mentee ${menteeId} has no mentor other than the mentee; skipping`);
      return { createdForSlot: 0, updatedForSlot: 0, skipped: 'no-mentor' };
    }

    const taskService = require('./taskService');
    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);
    const targetDays = Array.isArray(recConfig.daysOfWeek) && recConfig.daysOfWeek.length > 0
      ? recConfig.daysOfWeek.map(Number)
      : [Number(recConfig.dayOfWeek ?? 1)];

    let rawOccurrences = [];
    for (const day of targetDays) {
      const scheduleDef = {
        dayOfWeek: day,
        timeLocal: recConfig.timeLocal,
        timezone: recConfig.timezone || 'UTC',
        intervalWeeks: Number(recConfig.intervalWeeks) || 1,
        startsOn: recConfig.startsOn,
        endsOn: recConfig.endsOn || null,
      };
      const occs = nextOccurrences(scheduleDef, now, 4).filter((o) => o.start <= horizon);
      rawOccurrences.push(...occs);
    }

    if (recConfig.mode === 'once') {
      // Include overdue once-only schedules after worker downtime; unique occurrence keys prevent duplicates.
      const start = zonedWallClockToUtc(recConfig.startsOn, recConfig.timeLocal, recConfig.timezone || 'UTC');
      rawOccurrences = start && start <= horizon ? [{ start, dateStr: recConfig.startsOn }] : [];
    }

    // Deduplicate by date string
    const occMap = new Map();
    for (const o of rawOccurrences) {
      if (!occMap.has(o.dateStr)) occMap.set(o.dateStr, o);
    }
    const occurrences = [...occMap.values()].sort((a, b) => a.start.getTime() - b.start.getTime());

    let createdForSlot = 0;
    let updatedForSlot = 0;

    if (occurrences.length === 0) {
      return { createdForSlot, updatedForSlot };
    }

    /**
     * Backpressure. Past-due occurrences of THIS repeat that were never handed
     * in are counted, and once there are too many the repeat stops producing.
     * Nothing already created is cancelled and nothing is lost: the count is
     * recomputed every tick, so the moment they submit, the next occurrence
     * appears by itself.
     *
     * Only PAST-DUE ones count. A repeat is allowed to run a week ahead (see
     * HORIZON_DAYS) and those are not late yet, so a mentee keeping up is never
     * throttled by work they have not reached.
     *
     * Existing occurrences are still refreshed below while a repeat is paused -
     * the date or title may have changed, and an occurrence someone can see
     * should be correct whether or not a new one is due.
     */
    const overdueOpen = await models.AssignedTask.count({
      where: {
        menteeId,
        scheduleSlotId: slotId,
        status: { [Op.in]: UNSUBMITTED_STATUSES },
        dueDate: { [Op.lt]: new Date(new Date().toISOString().split('T')[0]) },
      },
    });
    const pausedForBacklog = overdueOpen >= MAX_OVERDUE_OCCURRENCES;
    if (pausedForBacklog) {
      await this._noteBacklog(
        menteeId,
        assigningMentorId,
        overdueOpen,
        String(recConfig.title || '').trim() || 'Scheduled Task'
      );
    }

    // Batch-fetch all existing tasks for this slot + occurrence dates
    const existings = await models.AssignedTask.findAll({
      where: {
        menteeId,
        scheduleSlotId: slotId,
        occurrenceDate: occurrences.map((o) => o.dateStr),
        ...(clanId ? { clanId } : {}),
      },
      include: [{ model: models.RoadmapTask, as: 'roadmapTask' }]
    });
    const existingMap = new Map(existings.map((e) => [e.occurrenceDate, e]));

    for (const occ of occurrences) {
      const occurrenceDate = occ.dateStr;
      const offsetDays = Number(recConfig.dueOffsetDays) || 7;
      const occDateObj = new Date(occurrenceDate + 'T00:00:00Z');
      const dueDateObj = new Date(occDateObj.getTime() + offsetDays * 86400000);
      const dueDate = dueDateObj.toISOString().split('T')[0];

      const title = String(recConfig.title || '').trim() || 'Scheduled Task';
      const rawType = String(recConfig.type || 'discussion').toLowerCase();
      const type = TASK_TYPES.includes(rawType) ? rawType : 'discussion';

      const existing = existingMap.get(occurrenceDate);
      if (existing) {
        // Never rewrite a task someone has begun or reviewed, or lose the saved task recipe.
        if (recConfig.task || !['assigned', 'not_started'].includes(existing.status)) continue;
        try {
          let updatedAny = false;
          const expectedDesc = `Recurring task (${title}) for ${occurrenceDate}`;

          // Update RoadmapTask only if fields actually differ
          if (existing.roadmapTask) {
            const rt = existing.roadmapTask;
            if (rt.title !== title || rt.type !== type || rt.description !== expectedDesc) {
              await rt.update({ title, type, description: expectedDesc });
              updatedAny = true;
            }
          }

          // Update AssignedTask only if the due date actually differs
          const existingDueDateStr = existing.dueDate ? new Date(existing.dueDate).toISOString().split('T')[0] : null;
          if (existingDueDateStr !== dueDate) {
            await existing.update({ dueDate });
            updatedAny = true;
          }

          if (updatedAny) updatedForSlot++;
        } catch (err) {
          console.error(`[recurringSlotMaterializer] Error updating occurrence ${occurrenceDate}:`, err.message);
        }
        continue;
      }

      if (pausedForBacklog) continue;

      try {
        await taskService.createCustomTask(
          {
            ...recConfig.task,
            menteeId,
            title,
            type,
            description: recConfig.task?.description ?? `Scheduled task (${title}) for ${occurrenceDate}`,
            dueDate,
            scheduleSlotId: slotId,
            occurrenceDate,
            clanId: clanId || undefined,
            skipNotification: true,
          },
          assigningMentorId
        );
        createdForSlot++;
      } catch (err) {
        if (!/unique/i.test(err.message)) {
          console.error(`[recurringSlotMaterializer] Failed to create task for mentee ${menteeId}, slot ${slotId}, occ ${occurrenceDate}:`, err.message);
        }
      }
    }

    return { createdForSlot, updatedForSlot, ...(pausedForBacklog ? { pausedForBacklog: overdueOpen } : {}) };
  }
}

module.exports = new RecurringSlotMaterializer();
