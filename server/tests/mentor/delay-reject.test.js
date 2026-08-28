'use strict';

const { models } = require('../../src/db');
const frictionService = require('../../src/services/frictionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('delay request rejection', () => {
  let mentor, mentee, delay;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor-delay@test.com' });
    mentee = await createMentee({ email: 'mentee-delay@test.com' });
    delay = await models.DelayEvent.create({
      menteeId: mentee.id,
      reason: 'Power outage for two days',
      kind: 'electricity',
      days: 2,
      reviewStatus: 'pending',
      accepted: false,
    });
  });

  it('marks a pending delay rejected instead of deleting it', async () => {
    const out = await frictionService.rejectDelay(delay.id, { reason: 'No evidence provided' }, mentor);
    expect(out.reviewStatus).toBe('rejected');
    expect(out.rejectionReason).toBe('No evidence provided');
    expect(out.accepted).toBe(false);

    const row = await models.DelayEvent.findByPk(delay.id);
    expect(row).not.toBeNull();
    expect(row.reviewStatus).toBe('rejected');
  });

  it('does not allow accepting a rejected delay', async () => {
    await frictionService.rejectDelay(delay.id, {}, mentor);
    await expect(frictionService.acceptDelay(delay.id, { accepted: true }, mentor))
      .rejects.toThrow(/rejected/i);
  });

  it('does not allow rejecting an accepted delay', async () => {
    await frictionService.acceptDelay(delay.id, { accepted: true }, mentor);
    await expect(frictionService.rejectDelay(delay.id, {}, mentor))
      .rejects.toThrow(/accepted/i);
  });
});
