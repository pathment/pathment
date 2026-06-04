const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

/**
 * schedulingService — 1:1 availability + meeting booking.
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

  async publishSlot(mentorId, { day, date, time, durationMins }) {
    if (!time) throw new ValidationError('A time is required');
    if (!date && !day) throw new ValidationError('A date is required');
    const dayLabel = this._dayLabel(date) || day;

    // Block duplicates: one slot per mentor per date+time (works for null dates too).
    const existing = await models.AvailabilitySlot.findOne({ where: { mentorId, date: date || null, time } });
    if (existing) throw new ValidationError('You already published a slot at this date and time');

    return models.AvailabilitySlot.create({
      mentorId, day: dayLabel, date: date || null, time, durationMins: durationMins || 30
    });
  }

  async listMyAvailability(mentorId) {
    return models.AvailabilitySlot.findAll({
      where: { mentorId },
      include: [{ model: models.User, as: 'bookedBy', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['created_at', 'ASC']]
    });
  }

  async deleteSlot(mentorId, slotId) {
    const slot = await models.AvailabilitySlot.findByPk(slotId);
    if (!slot) throw new NotFoundError('Slot not found');
    if (slot.mentorId !== mentorId) throw new ValidationError('Not your slot');
    if (slot.taken) throw new ValidationError('This slot is booked — cancel the meeting first');
    await slot.destroy();
    return { deleted: true };
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
    return models.AvailabilitySlot.findAll({
      where: { mentorId, taken: false },
      order: [['created_at', 'ASC']]
    });
  }

  async bookSlot(menteeId, slotId, agenda) {
    return sequelize.transaction(async (transaction) => {
      const slot = await models.AvailabilitySlot.findByPk(slotId, { transaction });
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
        agenda: agenda || null,
        status: 'scheduled'
      }, { transaction });

      return { slot, meeting };
    }).then(async ({ meeting }) => {
      try {
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.MENTOR_NUDGE, // reuse: lightweight in-app notice
          recipients: [{ userId: meeting.mentorId }],
          payload: {
            title: 'A mentee booked a 1:1',
            message: `${meeting.day} at ${meeting.time}${meeting.agenda ? ` — ${meeting.agenda}` : ''}`,
            actionUrl: '/mentor/schedules',
            actionLabel: 'View schedule'
          }
        });
      } catch (e) { /* non-fatal */ }
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

  async updateMeetingStatus(userId, meetingId, status) {
    if (!['scheduled', 'done', 'cancelled'].includes(status)) throw new ValidationError('Invalid status');
    const meeting = await models.ScheduledMeeting.findByPk(meetingId);
    if (!meeting) throw new NotFoundError('Meeting not found');
    if (meeting.mentorId !== userId && meeting.menteeId !== userId) {
      throw new ValidationError('Not your meeting');
    }
    meeting.status = status;
    await meeting.save();

    // Free the slot if cancelled.
    if (status === 'cancelled' && meeting.availabilitySlotId) {
      const slot = await models.AvailabilitySlot.findByPk(meeting.availabilitySlotId);
      if (slot) { slot.taken = false; slot.takenBy = null; await slot.save(); }
    }
    return meeting;
  }
}

module.exports = new SchedulingService();
