const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');
const { zonedWallClockToUtc, todayInZone } = require('../utils/timezone');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HORIZON_DAYS = 28; // materialize recurring availability ~4 weeks ahead

/**
 * schedulingService - 1:1 availability + meeting booking.
 */
class SchedulingService {
  // ── Availability (mentor) ─────────────────────────────────────────────────
  /** 'YYYY-MM-DD' → 'Thu, Jun 5' (display label derived from the date). */
  _dayLabel(date) {
    if (!date) return null;
    const d = new Date(`${date}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  /** A user's saved IANA timezone (falls back to UTC). */
  async _userTimeZone(userId) {
    const s = await models.UserSettings.findOne({ where: { userId }, attributes: ['timezone'] });
    return s?.timezone || 'UTC';
  }

  async publishSlot(mentorId, { day, date, time, durationMins, timezone }) {
    if (!time) throw new ValidationError('A time is required');
    if (!date && !day) throw new ValidationError('A date is required');
    const dayLabel = this._dayLabel(date) || day;

    // Block duplicates: one slot per mentor per date+time (works for null dates too).
    const existing = await models.AvailabilitySlot.findOne({ where: { mentorId, date: date || null, time } });
    if (existing) throw new ValidationError('You already published a slot at this date and time');

    // Anchor the wall-clock to the mentor's zone → a real UTC instant, so a
    // mentee in any timezone sees the correct local time. Recurring (no date)
    // slots can't be a single instant; they just carry the zone label.
    const tz = timezone || await this._userTimeZone(mentorId);
    const startsAt = date ? zonedWallClockToUtc(date, time, tz) : null;

    return models.AvailabilitySlot.create({
      mentorId, day: dayLabel, date: date || null, time, durationMins: durationMins || 30,
      startsAt, timezone: tz
    });
  }

  /**
   * The mentor's own list — only their MANUAL one-off slots (upcoming). Recurring
   * availability is managed through the weekly editor, and bookings of any kind
   * surface under "Upcoming 1:1s", so we keep this list from being flooded with
   * the dozens of auto-generated recurring slots.
   */
  async listMyAvailability(mentorId) {
    const todayStr = todayInZone(await this._userTimeZone(mentorId));
    return models.AvailabilitySlot.findAll({
      where: { mentorId, ruleId: null, [Op.or]: [{ date: null }, { date: { [Op.gte]: todayStr } }] },
      include: [{ model: models.User, as: 'bookedBy', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['date', 'ASC'], ['starts_at', 'ASC'], ['created_at', 'ASC']]
    });
  }

  async deleteSlot(mentorId, slotId) {
    const slot = await models.AvailabilitySlot.findByPk(slotId);
    if (!slot) throw new NotFoundError('Slot not found');
    if (slot.mentorId !== mentorId) throw new ValidationError('Not your slot');
    if (slot.taken) throw new ValidationError('This slot is booked - cancel the meeting first');
    if (slot.ruleId) throw new ValidationError('This is a recurring slot - change your weekly hours to remove it');
    await slot.destroy();
    return { deleted: true };
  }

  // ── Recurring weekly availability (rules → materialized slots) ──────────────
  _parseHHMM(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1]; const mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
  }
  _minutesTo24(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  }
  _minutesToDisplay(min) {
    const h = Math.floor(min / 60); const m = min % 60;
    const ap = h < 12 ? 'AM' : 'PM';
    const hh = (h % 12) === 0 ? 12 : (h % 12);
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  }
  // Date helpers anchored at noon-UTC so weekday/arithmetic never trip over DST.
  _addDays(dateStr, n) {
    const d = new Date(`${dateStr}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  _weekdayOf(dateStr) {
    return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  }

  async getRules(mentorId) {
    return models.AvailabilityRule.findAll({
      where: { mentorId },
      order: [['weekday', 'ASC'], ['start_time', 'ASC']]
    });
  }

  /** Replace a mentor's whole weekly availability, then regenerate slots. */
  async setRules(mentorId, rules, timezone) {
    const tz = timezone || await this._userTimeZone(mentorId);
    const clean = [];
    for (const r of (rules || [])) {
      const wd = Number(r.weekday);
      if (!(wd >= 0 && wd <= 6)) continue;
      const start = this._parseHHMM(r.startTime);
      const end = this._parseHHMM(r.endTime);
      const slotMins = Number(r.slotMins) || 30;
      if (start == null || end == null) throw new ValidationError(`Enter a valid time range for ${WEEKDAYS[wd]}`);
      if (end <= start) throw new ValidationError(`${WEEKDAYS[wd]}: the end time must be after the start time`);
      if (end - start < slotMins) throw new ValidationError(`${WEEKDAYS[wd]}: the range is shorter than one ${slotMins}-minute slot`);
      clean.push({
        mentorId, weekday: wd,
        startTime: this._minutesTo24(start), endTime: this._minutesTo24(end),
        slotMins, timezone: tz, active: true
      });
    }

    await sequelize.transaction(async (t) => {
      await models.AvailabilityRule.destroy({ where: { mentorId }, transaction: t });
      if (clean.length) await models.AvailabilityRule.bulkCreate(clean, { transaction: t });
      // Drop future, un-booked, recurring-generated slots so removed hours vanish.
      // Manual one-off slots (rule_id null) and already-booked slots are untouched.
      await models.AvailabilitySlot.destroy({
        where: { mentorId, taken: false, ruleId: { [Op.ne]: null }, date: { [Op.gte]: todayInZone(tz) } },
        transaction: t
      });
    });

    await this.materializeForMentor(mentorId);
    return this.getRules(mentorId);
  }

  /**
   * Expand a mentor's active rules into concrete bookable AvailabilitySlot rows
   * for the coming weeks. Idempotent: only creates slots that don't already
   * exist (mentor+date+time is unique), skips times already in the past, and
   * never touches booked or manual slots. Safe to call on every booking fetch.
   */
  async materializeForMentor(mentorId, horizonDays = HORIZON_DAYS) {
    const rules = await models.AvailabilityRule.findAll({ where: { mentorId, active: true } });
    if (!rules.length) return 0;
    const tz = rules[0].timezone || await this._userTimeZone(mentorId);
    const todayStr = todayInZone(tz);
    const now = Date.now();

    const want = [];
    for (let i = 0; i <= horizonDays; i++) {
      const dateStr = this._addDays(todayStr, i);
      const wd = this._weekdayOf(dateStr);
      for (const rule of rules) {
        if (rule.weekday !== wd) continue;
        const start = this._parseHHMM(rule.startTime);
        const end = this._parseHHMM(rule.endTime);
        if (start == null || end == null) continue;
        for (let m = start; m + rule.slotMins <= end; m += rule.slotMins) {
          const startsAt = zonedWallClockToUtc(dateStr, this._minutesTo24(m), tz);
          if (startsAt && startsAt.getTime() < now) continue; // don't publish the past
          want.push({
            date: dateStr, time: this._minutesToDisplay(m), startsAt,
            durationMins: rule.slotMins, ruleId: rule.id, day: this._dayLabel(dateStr)
          });
        }
      }
    }
    if (!want.length) return 0;

    const existing = await models.AvailabilitySlot.findAll({
      where: { mentorId, date: { [Op.gte]: todayStr } },
      attributes: ['date', 'time']
    });
    const have = new Set(existing.map((s) => `${s.date}|${s.time}`));

    const seen = new Set();
    const rows = [];
    for (const w of want) {
      const key = `${w.date}|${w.time}`;
      if (have.has(key) || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        mentorId, day: w.day, date: w.date, time: w.time,
        durationMins: w.durationMins, startsAt: w.startsAt, timezone: tz,
        ruleId: w.ruleId, taken: false
      });
    }
    if (rows.length) {
      // ignoreDuplicates guards against a concurrent materialize racing the unique index.
      await models.AvailabilitySlot.bulkCreate(rows, { ignoreDuplicates: true });
    }
    return rows.length;
  }

  // ── Booking (mentee) ──────────────────────────────────────────────────────

  /** Resolve the mentor userIds responsible for a mentee (matches + clans). */
  async getMenteeMentorIds(menteeId) {
    const ids = new Set();
    const matches = await models.MentorMenteeMatch.findAll({
      where: { menteeId, status: 'active' }, attributes: ['mentorId']
    });
    matches.forEach((m) => ids.add(m.mentorId));

    const menteeClans = await models.ClanMembership.findAll({
      where: { userId: menteeId, status: 'active', role: 'mentee' }, attributes: ['clanId']
    });
    const clanIds = menteeClans.map((c) => c.clanId);
    if (clanIds.length) {
      const mentors = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: 'active', role: { [Op.in]: ['lead_mentor', 'co_mentor'] } },
        attributes: ['userId']
      });
      mentors.forEach((m) => ids.add(m.userId));
    }
    return [...ids];
  }

  /** For a mentee: their mentors, each with their open (bookable) slots. */
  async getBookableForMentee(menteeId) {
    const mentorIds = await this.getMenteeMentorIds(menteeId);
    if (!mentorIds.length) return [];
    const mentors = await models.User.findAll({
      where: { id: { [Op.in]: mentorIds } },
      attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl']
    });
    const result = [];
    for (const mentor of mentors) {
      const slots = await this.listOpenForMentor(mentor.id);
      result.push({
        mentor: { id: mentor.id, name: `${mentor.firstName} ${mentor.lastName}`.trim() },
        slots
      });
    }
    return result;
  }

  async listOpenForMentor(mentorId) {
    await this.materializeForMentor(mentorId).catch((e) => console.error('[Scheduling] materialize failed:', e.message));
    const todayStr = todayInZone(await this._userTimeZone(mentorId));
    return models.AvailabilitySlot.findAll({
      where: { mentorId, taken: false, [Op.or]: [{ date: null }, { date: { [Op.gte]: todayStr } }] },
      order: [['date', 'ASC'], ['starts_at', 'ASC'], ['created_at', 'ASC']]
    });
  }

  async bookSlot(menteeId, slotId, agenda) {
    return sequelize.transaction(async (transaction) => {
      // Row-level lock (SELECT ... FOR UPDATE) so two mentees booking the same slot at the
      // same instant serialize: the second request blocks here until the first commits, then
      // re-reads taken=true and gets the "already booked" error instead of double-booking.
      const slot = await models.AvailabilitySlot.findByPk(slotId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!slot) throw new NotFoundError('Slot not found');
      if (slot.taken) throw new ValidationError('This slot has already been booked');

      slot.taken = true;
      slot.takenBy = menteeId;
      await slot.save({ transaction });

      const meeting = await models.ScheduledMeeting.create({
        mentorId: slot.mentorId,
        menteeId,
        availabilitySlotId: slot.id,
        kind: '1:1',
        day: slot.day,
        time: slot.time,
        durationMins: slot.durationMins,
        startsAt: slot.startsAt,
        timezone: slot.timezone,
        agenda: agenda || null,
        status: 'scheduled'
      }, { transaction });

      return { slot, meeting };
    }).then(async ({ meeting }) => {
      // The slot was pre-published by the mentor, so a booking is already confirmed.
      // Notify BOTH parties — the mentee gets a confirmation (this was missing before,
      // so mentees never heard back after booking) and the mentor gets a heads-up.
      try {
        const [mentor, mentee] = await Promise.all([
          models.User.findByPk(meeting.mentorId, { attributes: ['firstName', 'lastName'] }),
          models.User.findByPk(meeting.menteeId, { attributes: ['firstName', 'lastName'] })
        ]);
        const mentorName = mentor ? `${mentor.firstName} ${mentor.lastName}`.trim() : 'your mentor';
        const menteeName = mentee ? `${mentee.firstName} ${mentee.lastName}`.trim() : 'A mentee';
        const when = `${meeting.day} at ${meeting.time}`;
        const agendaLine = meeting.agenda ? ` - ${meeting.agenda}` : '';

        // Mentee: their 1:1 is confirmed (in-app + email).
        // NOTE: deliberately no relatedEntityType on the payload — the cancel notification
        // dedupes on (type:'system', relatedEntityType:'scheduled_meeting', meetingId), and
        // reusing that combo here would later suppress the cancellation notice for this meeting.
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.MEETING_BOOKED,
          recipients: [{ userId: meeting.menteeId }],
          payload: {
            title: `1:1 confirmed - ${when}`,
            message: `Your 1:1 with ${mentorName} is booked for ${when}.${agendaLine}`,
            actionUrl: '/mentee/meetings',
            actionLabel: 'View meeting',
            emailSubject: `Your 1:1 with ${mentorName} is confirmed (${when})`
          },
          dedupe: { relatedEntityType: 'meeting_booked', relatedEntityId: meeting.id }
        });

        // Mentor: a mentee booked (in-app only — keep mentor email noise down).
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.MEETING_BOOKED,
          recipients: [{ userId: meeting.mentorId }],
          payload: {
            title: 'A mentee booked a 1:1',
            message: `${menteeName} booked a 1:1 on ${when}.${agendaLine}`,
            actionUrl: '/mentor/schedules',
            actionLabel: 'View schedule'
          },
          channelOverrides: { email: false },
          dedupe: { relatedEntityType: 'meeting_booked_mentor', relatedEntityId: meeting.id }
        });
      } catch (e) {
        console.error('[Scheduling] booking notify failed:', e.message);
      }
      return meeting;
    });
  }

  // ── Meetings (both) ───────────────────────────────────────────────────────
  async listMeetings(userId, role) {
    const where = role === 'mentee' ? { menteeId: userId } : { mentorId: userId };
    return models.ScheduledMeeting.findAll({
      where,
      include: [
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['created_at', 'DESC']]
    });
  }

  async updateMeetingStatus(userId, meetingId, status, reason = null) {
    if (!['scheduled', 'done', 'cancelled'].includes(status)) throw new ValidationError('Invalid status');
    const meeting = await models.ScheduledMeeting.findByPk(meetingId);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (meeting.mentorId !== userId && meeting.menteeId !== userId) {
      throw new ValidationError('Not your meeting');
    }

    meeting.status = status;
    if (status === 'cancelled') {
      meeting.cancellationReason = reason && String(reason).trim() ? String(reason).trim().slice(0, 1000) : null;
      meeting.cancelledBy = userId;
    }
    await meeting.save();

    // Free the slot if cancelled.
    if (status === 'cancelled' && meeting.availabilitySlotId) {
      const slot = await models.AvailabilitySlot.findByPk(meeting.availabilitySlotId);
      if (slot) { slot.taken = false; slot.takenBy = null; await slot.save(); }
    }

    // Tell the other party who cancelled and why.
    if (status === 'cancelled') {
      this._notifyCancellation(meeting, userId).catch((e) => console.error('[Scheduling] cancel notify failed:', e.message));
    }
    return meeting;
  }

  /** Notify the counterparty that a 1:1 was cancelled, surfacing the reason. */
  async _notifyCancellation(meeting, cancelledById) {
    const byMentor = cancelledById === meeting.mentorId;
    const recipientId = byMentor ? meeting.menteeId : meeting.mentorId;
    const canceller = await models.User.findByPk(cancelledById, { attributes: ['firstName', 'lastName'] });
    const cancellerName = canceller ? `${canceller.firstName} ${canceller.lastName}`.trim() : (byMentor ? 'Your mentor' : 'Your mentee');
    const when = `${meeting.day} at ${meeting.time}`;
    const reasonLine = meeting.cancellationReason ? ` Reason: “${meeting.cancellationReason}”` : '';

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MEETING_CANCELLED,
      recipients: [{ userId: recipientId }],
      payload: {
        title: `1:1 cancelled - ${when}`,
        message: `${cancellerName} cancelled your 1:1 on ${when}.${reasonLine}${byMentor ? ' Book another slot when you’re ready.' : ''}`,
        actionUrl: byMentor ? '/mentee/meetings' : '/mentor/schedules',
        actionLabel: byMentor ? 'Find a new slot' : 'View schedule',
        relatedEntityType: 'scheduled_meeting',
        relatedEntityId: meeting.id,
        emailSubject: `Your 1:1 on ${when} was cancelled`
      },
      dedupe: { relatedEntityType: 'meeting_cancelled', relatedEntityId: meeting.id }
    });
  }
}

module.exports = new SchedulingService();
