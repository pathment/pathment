'use strict';

/**
 * Assigning a course is one action, and it fails cleanly.
 *
 * It used to be two: "Enroll on Edorax", then "Assign". Now the mentor just
 * assigns, and the server does it in the safe order:
 *
 *   1. take the seat on Edorax   — refused or unreachable → nothing in Pathment
 *   2. create the task on it     — fails → the seat is given back
 *
 * Every failure says in words what state it left things in. Edorax is faked at
 * the HTTP boundary with a fake that remembers enrollments, because the second
 * step confirms the first one with Edorax.
 */

const { models, sequelize } = require('../../src/db');
const seed = require('../helpers/seed');
const taskService = require('../../src/services/taskService');
const externalAppService = require('../../src/services/externalAppService');

const KEYS = { accessKey: 'edx_access_key_1234', secretKey: 'edx_secret_key_5678' };
const COURSE = {
  course_id: 'cmvlsl6a600064kxp2ouztw8q', course_slug: 'think-clearly', title: 'Think Clearly',
  description: 'Logic for the AI era', price: 0, currency: 'USD', pricing_type: 'FREE', status: 'PUBLISHED',
  expires_at: null, available_enrollment_count: 50,
};

// ── a fake Edorax that keeps its enrollments ─────────────────────────────────
let calls;
let edorax;
let held; // external_assignment_id → enrollment
const realFetch = global.fetch;
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function fakeFetch(input, init = {}) {
  const url = new URL(String(input));
  if (url.origin !== 'http://edorax.test') return realFetch(input, init);
  const call = {
    method: init.method || 'GET',
    path: url.pathname.replace('/integrations/v1', ''),
    query: Object.fromEntries(url.searchParams),
    body: init.body ? JSON.parse(init.body) : null,
  };
  calls.push(call);
  const handler = edorax[`${call.method} ${call.path}`];
  if (!handler) return Promise.resolve(json(404, { error: 'Not found' }));
  const answer = handler(call);
  if (answer === 'NETWORK') return Promise.reject(new TypeError('fetch failed'));
  return Promise.resolve(json(answer[0], answer[1]));
}
const callsTo = (key) => calls.filter((c) => `${c.method} ${c.path}` === key);

let mentor;
let mentee;

beforeAll(() => { global.fetch = fakeFetch; });
afterAll(() => { global.fetch = realFetch; });

beforeEach(async () => {
  await seed.cleanDb();
  await sequelize.query('TRUNCATE course_enrollments, organization_apps CASCADE');
  calls = [];
  held = new Map();
  edorax = {
    'GET /connection': () => [200, { connected: true, organization_slug: 'pathment', organization_name: 'Pathment' }],
    'GET /courses': () => [200, { courses: [COURSE] }],
    'POST /enrollments': (call) => {
      const e = {
        enrollment_id: `enr_${held.size + 1}`, course_id: call.body.course_id, learner_email: call.body.student_email,
        lifecycle: 'PENDING_ACCOUNT', external_assignment_id: call.body.external_assignment_id,
      };
      held.set(e.external_assignment_id, e);
      return [201, { ...e, created: true }];
    },
    'GET /enrollments': (call) => {
      const e = call.query.external_assignment_id
        ? held.get(call.query.external_assignment_id)
        : [...held.values()].find((x) => x.course_id === call.query.course_id && x.learner_email === call.query.learner_email && x.lifecycle !== 'CANCELLED');
      return e ? [200, { enrollment: e }] : [404, { error: 'No enrollment' }];
    },
    'POST /enrollments/cancel': (call) => {
      const e = held.get(call.body.external_assignment_id);
      if (e) e.lifecycle = 'CANCELLED';
      return [200, { cancelled: true }];
    },
  };

  const admin = await seed.createAdmin();
  mentor = await seed.createMentor({ email: 'mentor@test.com' });
  mentee = await seed.createMentee({ email: 'ada@test.com' });
  const program = await seed.createProgram({ createdBy: admin.id });
  await seed.createClan({ programId: program.id, leadMentor: mentor, mentees: [mentee], name: 'Clan' });

  const [app] = await models.ExternalApp.findOrCreate({
    where: { integrationKey: 'buildment' },
    defaults: { name: 'EdoraX', type: 'course', integrationKey: 'buildment', backendUrl: 'http://edorax.test' },
  });
  await app.update({ backendUrl: 'http://edorax.test', isActive: true });
  await externalAppService.connect(admin, null, app.id, KEYS);
  calls = [];
});

const assign = () => taskService.createCustomTask({
  menteeId: mentee.id, title: 'Think Clearly', type: 'course', difficulty: 'medium',
  course: { courseId: COURSE.course_id },
}, mentor.id);
const courseTasks = () => models.AssignedTask.count({ where: { menteeId: mentee.id } });

describe('assigning a course in one action', () => {
  it('enrolls first, then creates the task on that enrollment', async () => {
    const task = await assign();

    expect(callsTo('POST /enrollments')).toHaveLength(1);
    const enrolled = callsTo('POST /enrollments')[0].body;
    // The task IS the enrollment: Edorax's assignment id is the task id.
    expect(task.id).toBe(enrolled.external_assignment_id);
    expect(enrolled.student_email).toBe('ada@test.com');
    expect(await models.CourseEnrollment.count({ where: { assignedTaskId: task.id } })).toBe(1);
    expect(callsTo('POST /enrollments/cancel')).toHaveLength(0);
  });

  it('Edorax unreachable: nothing is assigned, and it says so', async () => {
    edorax['GET /courses'] = () => 'NETWORK';
    await expect(assign()).rejects.toThrow(/Edorax can't be reached right now, so nothing was assigned/);
    expect(await courseTasks()).toBe(0);
    expect(callsTo('POST /enrollments')).toHaveLength(0);
  });

  it('Edorax failing mid-enroll: nothing is assigned, and it says so', async () => {
    edorax['POST /enrollments'] = () => [503, { error: 'Service unavailable' }];
    await expect(assign()).rejects.toThrow(/can't be reached.*nothing was assigned/);
    expect(await courseTasks()).toBe(0);
  });

  it('Edorax refusing (no seats): nothing is assigned, with the reason', async () => {
    edorax['POST /enrollments'] = () => [409, { error: 'Full', code: 'CAPACITY' }];
    await expect(assign()).rejects.toThrow(/No seats are left/);
    expect(await courseTasks()).toBe(0);
  });

  it('the task failing after the seat was taken gives the seat back', async () => {
    const spy = jest.spyOn(models.AssignedTask, 'create').mockRejectedValueOnce(new Error('db exploded'));
    try {
      await expect(assign()).rejects.toThrow(/Nothing was assigned, and the Edorax seat was given back/);
    } finally {
      spy.mockRestore();
    }
    expect(await courseTasks()).toBe(0);
    expect(callsTo('POST /enrollments/cancel')).toHaveLength(1);
    expect([...held.values()][0].lifecycle).toBe('CANCELLED');
  });

  it('a seat an earlier attempt left behind is reused, not taken twice', async () => {
    // An earlier attempt took the seat, then could not give it back.
    const leftover = '6f1c2a90-1111-4222-8333-944455556666';
    held.set(leftover, {
      enrollment_id: 'enr_old', course_id: COURSE.course_id, learner_email: 'ada@test.com',
      lifecycle: 'PENDING_ACCOUNT', external_assignment_id: leftover,
    });
    const task = await assign();
    expect(task.id).toBe(leftover);
    expect(await courseTasks()).toBe(1);
  });
});
