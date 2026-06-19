'use strict';

const request = require('supertest');
const app = require('../../src/index');
const { models } = require('../../src/db');
const orgSystemSettingsService = require('../../src/services/orgSystemSettingsService');
const {
  cleanDb,
  createAdmin,
  createMentor,
  authHeader,
} = require('../helpers/seed');

describe('Cohort review delete lock (system settings)', () => {
  let admin;
  let mentor;

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin();
    mentor = await createMentor({ email: 'mentor-lock@test.com' });
    await models.SystemSettings.destroy({ where: { settingKey: 'org.system' }, force: true });
    await models.SystemSettings.destroy({ where: { settingKey: 'org.governance' }, force: true });
  });

  it('defaults to unlocked', async () => {
    const settings = await orgSystemSettingsService.get();
    expect(settings.cohortReviewDeleteLocked).toBe(false);
  });

  it('admin can toggle lock via system settings API', async () => {
    const lockRes = await request(app)
      .put('/api/admin/system-settings')
      .set('Authorization', authHeader(admin))
      .send({ cohortReviewDeleteLocked: true });
    expect(lockRes.status).toBe(200);
    expect(lockRes.body.data.settings.cohortReviewDeleteLocked).toBe(true);
  });

  it('mentor cannot delete when locked', async () => {
    const session = await models.CohortReviewSession.create({
      mentorId: mentor.id,
      sessionDate: '2026-06-10',
      status: 'in_progress',
    });
    await orgSystemSettingsService.update(admin.id, { cohortReviewDeleteLocked: true });

    const delRes = await request(app)
      .delete(`/api/mentor/review/sessions/${session.id}`)
      .set('Authorization', authHeader(mentor));
    expect(delRes.status).toBe(403);
  });

  it('mentor can request edit when locked', async () => {
    const session = await models.CohortReviewSession.create({
      mentorId: mentor.id,
      sessionDate: '2026-06-12',
      status: 'in_progress',
    });
    await orgSystemSettingsService.update(admin.id, { cohortReviewDeleteLocked: true });

    const reqRes = await request(app)
      .post(`/api/mentor/review/sessions/${session.id}/edit-request`)
      .set('Authorization', authHeader(mentor))
      .send({ reason: 'Duplicate entry' });
    expect(reqRes.status).toBe(201);
    expect(reqRes.body.data.request.status).toBe('pending');
  });

  it('admin can approve request and mentor can then delete', async () => {
    const session = await models.CohortReviewSession.create({
      mentorId: mentor.id,
      sessionDate: '2026-06-13',
      status: 'in_progress',
    });
    await orgSystemSettingsService.update(admin.id, { cohortReviewDeleteLocked: true });

    const reqRes = await request(app)
      .post(`/api/mentor/review/sessions/${session.id}/edit-request`)
      .set('Authorization', authHeader(mentor))
      .send({ reason: 'Cleanup' });
    const requestId = reqRes.body.data.request.id;

    await request(app)
      .post(`/api/admin/cohort-review/edit-requests/${requestId}/resolve`)
      .set('Authorization', authHeader(admin))
      .send({ status: 'approved' });

    const delRes = await request(app)
      .delete(`/api/mentor/review/sessions/${session.id}`)
      .set('Authorization', authHeader(mentor));
    expect(delRes.status).toBe(200);
  });

  it('list sessions includes policies for mentors', async () => {
    await orgSystemSettingsService.update(admin.id, { cohortReviewDeleteLocked: true });

    const res = await request(app)
      .get('/api/mentor/review/sessions')
      .set('Authorization', authHeader(mentor));
    expect(res.status).toBe(200);
    expect(res.body.data.policies.cohortReviewDeleteLocked).toBe(true);
  });
});
