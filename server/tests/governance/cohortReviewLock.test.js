'use strict';

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const orgGovernanceService = require('../../src/services/orgGovernanceService');
const {
  cleanDb,
  createAdmin,
  createMentor,
  authHeader,
} = require('../helpers/seed');

describe('Org governance — cohort review delete lock', () => {
  let admin;
  let mentor;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentor = await createMentor({ email: 'mentor-lock@test.com' });
  });

  it('defaults to unlocked', async () => {
    const governance = await orgGovernanceService.get();
    expect(governance.cohortReviewDeleteLocked).toBe(false);
  });

  it('admin can toggle lock via API', async () => {
    const lockRes = await request(app)
      .put('/api/governance')
      .set('Authorization', authHeader(admin))
      .send({ cohortReviewDeleteLocked: true });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.governance.cohortReviewDeleteLocked).toBe(true);

    const getRes = await request(app)
      .get('/api/governance')
      .set('Authorization', authHeader(admin));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.governance.cohortReviewDeleteLocked).toBe(true);
  });

  it('mentor cannot delete a session when locked', async () => {
    const session = await models.CohortReviewSession.create({
      mentorId: mentor.id,
      sessionDate: '2026-06-10',
      status: 'in_progress',
    });

    await orgGovernanceService.update(admin.id, { cohortReviewDeleteLocked: true });

    const delRes = await request(app)
      .delete(`/api/mentor/review/sessions/${session.id}`)
      .set('Authorization', authHeader(mentor));
    expect(delRes.status).toBe(403);

    const stillThere = await models.CohortReviewSession.findByPk(session.id);
    expect(stillThere).not.toBeNull();
  });

  it('mentor can delete a session when unlocked', async () => {
    const session = await models.CohortReviewSession.create({
      mentorId: mentor.id,
      sessionDate: '2026-06-11',
      status: 'in_progress',
    });

    const delRes = await request(app)
      .delete(`/api/mentor/review/sessions/${session.id}`)
      .set('Authorization', authHeader(mentor));
    expect(delRes.status).toBe(200);

    const gone = await models.CohortReviewSession.findByPk(session.id);
    expect(gone).toBeNull();
  });

  it('list sessions includes policies for mentors', async () => {
    await orgGovernanceService.update(admin.id, { cohortReviewDeleteLocked: true });

    const res = await request(app)
      .get('/api/mentor/review/sessions')
      .set('Authorization', authHeader(mentor));
    expect(res.status).toBe(200);
    expect(res.body.data.policies.cohortReviewDeleteLocked).toBe(true);
  });

  it('mentor cannot update governance settings', async () => {
    const res = await request(app)
      .put('/api/governance')
      .set('Authorization', authHeader(mentor))
      .send({ cohortReviewDeleteLocked: true });
    expect(res.status).toBe(403);
  });
});
