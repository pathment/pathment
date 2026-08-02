const { Op } = require('sequelize');
const { models } = require('../db');

/**
 * reviewRecordsService — admin-facing reporting over cohort-review sessions.
 *
 * Reads the same cohort_review_sessions + cohort_review_entries that mentors
 * fill in, and rolls them up org-wide, filterable by clan / mentor / date range.
 * Read-only: it never mutates a review record (deletion stays behind the lock).
 */

const attRate = (present, total) => (total > 0 ? Math.round((present / total) * 100) : 0);

class ReviewRecordsService {
  /**
   * Org review records with rollups.
   * @param {{clanId?:string, mentorId?:string, from?:string, to?:string, limit?:number}} f
   * @returns {{summary, byClan, byMentor, sessions}}
   */
  async orgReviewRecords(f = {}) {
    const where = {};
    if (f.clanId) where.clanId = f.clanId;
    if (f.mentorId) where.mentorId = f.mentorId;
    if (f.from || f.to) {
      where.sessionDate = {};
      if (f.from) where.sessionDate[Op.gte] = f.from;
      if (f.to) where.sessionDate[Op.lte] = f.to;
    }

    const sessions = await models.CohortReviewSession.findAll({
      where,
      include: [
        { model: models.CohortReviewEntry, as: 'entries', attributes: ['attendance', 'status', 'talkSeconds', 'contributionPoints', 'secondsPresent'] },
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        ...(models.Clan ? [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }] : []),
      ],
      order: [['sessionDate', 'DESC'], ['createdAt', 'DESC']],
      limit: Math.min(Number(f.limit) || 300, 500),
    });

    const rows = sessions.map((s) => this._rowFromSession(s));

    // ── rollups ────────────────────────────────────────────────────────────
    const summary = rows.reduce((a, r) => {
      a.sessions += 1;
      a.present += r.present; a.absent += r.absent; a.excused += r.excused;
      a.reviewed += r.reviewed; a.marked += r.present + r.absent + r.excused;
      a.talkSeconds += r.talkSeconds; a.withVideo += r.hadVideo ? 1 : 0;
      return a;
    }, { sessions: 0, present: 0, absent: 0, excused: 0, reviewed: 0, marked: 0, talkSeconds: 0, withVideo: 0 });
    summary.attendanceRate = attRate(summary.present, summary.marked);

    const byClan = this._group(rows, (r) => r.clanId, (r) => r.clanName || 'Unassigned');
    const byMentor = this._group(rows, (r) => r.mentorId, (r) => r.mentorName || 'Unknown');

    return { summary, byClan, byMentor, sessions: rows };
  }

  /** One session with full per-mentee entries (drill-in). */
  async sessionDetail(id) {
    const s = await models.CohortReviewSession.findByPk(id, {
      include: [
        { model: models.CohortReviewEntry, as: 'entries', include: [{ model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }] },
        { model: models.User, as: 'mentor', attributes: ['id', 'firstName', 'lastName'] },
        ...(models.Clan ? [{ model: models.Clan, as: 'clan', attributes: ['id', 'name'] }] : []),
      ],
    });
    if (!s) return null;
    const row = this._rowFromSession(s);
    const entries = (s.entries || []).map((e) => ({
      menteeId: e.menteeId,
      menteeName: e.mentee ? `${e.mentee.firstName || ''} ${e.mentee.lastName || ''}`.trim() : 'Mentee',
      profilePictureUrl: e.mentee?.profilePictureUrl || null,
      attendance: e.attendance,
      status: e.status,
      talkSeconds: e.talkSeconds || 0,
      contributionPoints: e.contributionPoints || 0,
      secondsPresent: e.secondsPresent || 0,
    })).sort((a, b) => a.menteeName.localeCompare(b.menteeName));
    return { ...row, note: s.note || null, entries };
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  _rowFromSession(s) {
    const entries = s.entries || [];
    const present = entries.filter((e) => e.attendance === 'present').length;
    const absent = entries.filter((e) => e.attendance === 'absent').length;
    const excused = entries.filter((e) => e.attendance === 'excused').length;
    const reviewed = entries.filter((e) => e.status === 'reviewed').length;
    const talkSeconds = entries.reduce((sum, e) => sum + (e.talkSeconds || 0), 0);
    const hadVideo = !!(s.meetingStartedAt || s.meetingEndedAt);
    let durationMin = null;
    if (s.meetingStartedAt && s.meetingEndedAt) {
      durationMin = Math.max(0, Math.round((new Date(s.meetingEndedAt) - new Date(s.meetingStartedAt)) / 60000));
    }
    return {
      id: s.id,
      sessionDate: s.sessionDate,
      scheduledAt: s.scheduledAt,
      title: s.title,
      status: s.status,
      recurring: !!s.reviewScheduleId,
      clanId: s.clanId,
      clanName: s.clan?.name || null,
      mentorId: s.mentorId,
      mentorName: s.mentor ? `${s.mentor.firstName || ''} ${s.mentor.lastName || ''}`.trim() : null,
      present, absent, excused, reviewed,
      total: entries.length,
      talkSeconds,
      hadVideo,
      durationMin,
    };
  }

  _group(rows, keyOf, labelOf) {
    const map = new Map();
    for (const r of rows) {
      const key = keyOf(r) || '—';
      if (!map.has(key)) map.set(key, { key, label: labelOf(r), sessions: 0, present: 0, absent: 0, excused: 0, marked: 0, talkSeconds: 0, withVideo: 0 });
      const g = map.get(key);
      g.sessions += 1;
      g.present += r.present; g.absent += r.absent; g.excused += r.excused;
      g.marked += r.present + r.absent + r.excused;
      g.talkSeconds += r.talkSeconds; g.withVideo += r.hadVideo ? 1 : 0;
    }
    return [...map.values()]
      .map((g) => ({ ...g, attendanceRate: attRate(g.present, g.marked) }))
      .sort((a, b) => b.sessions - a.sessions);
  }
}

module.exports = new ReviewRecordsService();
