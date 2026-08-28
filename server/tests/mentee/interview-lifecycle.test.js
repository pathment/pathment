'use strict';

const { models } = require('../../src/db');
const svc = require('../../src/services/interviewSessionService');
const { cleanDb, createMentor, createMentee } = require('../helpers/seed');

describe('interview active lifecycle', () => {
  let mentor, mentee, task, assignment, session;

  beforeEach(async () => {
    await cleanDb();
    mentor = await createMentor({ email: 'mentor-lifecycle@test.com' });
    mentee = await createMentee({ email: 'mentee-lifecycle@test.com' });

    const rt = await models.RoadmapTask.create(
      { title: 'Mock interview', description: 'x', type: 'interview', difficulty: 'medium', taskOrder: 1, deliverable: 'x' },
      { validate: false }
    );
    task = await models.AssignedTask.create(
      { menteeId: mentee.id, mentorId: mentor.id, roadmapTaskId: rt.id, status: 'in_progress' },
      { validate: false }
    );
    const kit = await models.InterviewKit.create({ title: 'Kit', createdBy: mentor.id });
    await models.InterviewQuestion.create({ kitId: kit.id, position: 0, kind: 'voice', prompt: 'Q1', points: 5 });
    assignment = await models.InterviewAssignment.create({
      assignedTaskId: task.id,
      kitId: kit.id,
      timingMode: 'total',
      totalSeconds: 1800,
    });
    session = await models.InterviewSession.create({
      assignedTaskId: task.id,
      interviewAssignmentId: assignment.id,
      menteeId: mentee.id,
      attemptNumber: 1,
      status: 'in_progress',
      startedAt: new Date(),
    });
  });

  it('does not expose an active session when the task is cancelled', async () => {
    await task.update({ status: 'cancelled' });
    const cand = await svc.getForCandidate(task.id, mentee.id);
    expect(cand.state.activeSessionId).toBeNull();
  });

  it('abandonInProgressForTask removes live attempts but keeps submitted history', async () => {
    const submitted = await models.InterviewSession.create({
      assignedTaskId: task.id,
      interviewAssignmentId: assignment.id,
      menteeId: mentee.id,
      attemptNumber: 2,
      status: 'submitted',
      startedAt: new Date(),
      submittedAt: new Date(),
    });

    await svc.abandonInProgressForTask(task.id);

    expect(await models.InterviewSession.findByPk(session.id)).toBeNull();
    expect(await models.InterviewSession.findByPk(submitted.id)).not.toBeNull();
  });

  it('blocks startOrResume when the task was cancelled', async () => {
    await task.update({ status: 'cancelled' });
    await expect(svc.startOrResume(task.id, mentee.id)).rejects.toThrow(/cancelled/i);
  });

  it('lets mentors update total timing before submission', async () => {
    const out = await svc.updateAssignmentForMentor(task.id, mentor.id, { totalSeconds: 900 });
    expect(out.options.totalSeconds).toBe(900);
    await assignment.reload();
    expect(assignment.totalSeconds).toBe(900);
  });
});
