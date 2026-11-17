'use strict';

/**
 * Reviews nobody pressed Finish on close themselves once their day is over,
 * but only the ones where something was actually recorded, and never a live
 * call or a review still on its own day.
 */

const { models } = require('../../src/db');
const cohortReviewService = require('../../src/services/cohortReviewService');
const { cleanDb, createMentor, createMentee, createAdmin, createProgram } = require('../helpers/seed');

const NOW = new Date('2026-11-17T09:00:00Z');

describe('closing unfinished reviews', () => {
  let mentor, mentee, clan;

  beforeEach(async () => {
    await cleanDb();
    const admin = await createAdmin();
    mentor = await createMentor({ email: 'lead@test.com' });
    mentee = await createMentee({ email: 'learner@test.com' });
    const program = await createProgram({ createdBy: admin.id, name: 'Fellowship' });
    clan = await models.Clan.create({ programId: program.id, name: 'Clan', leadMentorId: mentor.id, createdBy: admin.id });
  });

  const session = async (sessionDate, entry, extra = {}) => {
    const s = await models.CohortReviewSession.create({ mentorId: mentor.id, clanId: clan.id, sessionDate, status: 'in_progress', ...extra });
    if (entry) await models.CohortReviewEntry.create({ sessionId: s.id, menteeId: mentee.id, ...entry });
    return s;
  };

  it('finishes a past review where attendance or a review was recorded', async () => {
    const marked = await session('2026-11-14', { attendance: 'present' });
    const seen = await session('2026-11-15', { status: 'reviewed' });
    expect(await cohortReviewService.closeStaleSessions(NOW)).toBe(2);
    for (const s of [marked, seen]) {
      await s.reload();
      expect(s.status).toBe('finished');
      expect(s.finishedAt).not.toBeNull();
    }
  });

  it('leaves today, yesterday (still running somewhere), untouched and live reviews alone', async () => {
    const today = await session('2026-11-17', { attendance: 'present' });
    const yesterday = await session('2026-11-16', { attendance: 'present' });
    const untouched = await session('2026-11-10', { status: 'pending' });
    const live = await session('2026-11-12', { attendance: 'present' }, { meetingStartedAt: new Date('2026-11-12T10:00:00Z') });
    expect(await cohortReviewService.closeStaleSessions(NOW)).toBe(0);
    for (const s of [today, yesterday, untouched, live]) expect((await s.reload()).status).toBe('in_progress');
  });
});
