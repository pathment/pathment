const crypto = require('crypto');
const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const AppError = require('../utils/errors/AppError');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const logger = require('../utils/logger');
const organizationService = require('./organizationService');
const externalAppService = require('./externalAppService');
const authzService = require('./authzService');
const buildmentClient = require('./buildmentClient');
const { resolveMenteeClanId } = require('./menteeClanScope');
const { PERMISSIONS } = require('../config/permissions');

const { BuildmentError } = buildmentClient;

/**
 * courseService - external courses (Buildment) as Pathment tasks.
 *
 * A course is assigned like a quiz or interview: an `assigned_task` of type
 * 'course' plus a 1:1 CourseEnrollment. The split of responsibility is strict:
 *
 *   Pathment  owns the task, its deadline, points and who assigned it.
 *   Buildment owns the course, the seat, the learner's account and progress.
 *
 * So assigning ENROLLS (never creates a Buildment login — the learner signs up
 * there with the same email), progress is only ever READ, and unassigning
 * CANCELS to release the seat. The assigned task's id is Buildment's
 * `external_assignment_id`, which is what makes retries idempotent.
 *
 * The assign drawer does this in two steps: it ENROLLS first (enrollLearners,
 * under an id minted here) and only then assigns, and the task is created with
 * that same id — so the invariant above holds either way. An enrollment that
 * never becomes a task is given back with releaseEnrollments.
 */

const PROVIDER = 'buildment';
const COURSES_TTL_MS = 60 * 1000;      // course list cache, per workspace
const SYNC_FRESH_MS = 60 * 1000;       // a snapshot younger than this is served as-is
const SYNC_MIN_GAP_MS = 10 * 1000;     // floor between provider reads even on "refresh"
const OPEN_LIFECYCLES = ['PENDING_ACCOUNT', 'PAYMENT_REQUIRED', 'ACTIVE'];
const LIFECYCLES = [...OPEN_LIFECYCLES, 'COMPLETED', 'CANCELLED', 'EXPIRED'];
const LIVE_LIFECYCLES = [...OPEN_LIFECYCLES, 'COMPLETED']; // the learner still holds the seat
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const coursesCache = new Map(); // organizationId → { at, courses }

const toCourse = (c) => ({
  courseId: c.course_id,
  courseSlug: c.course_slug || null,
  title: c.title,
  description: c.description || null,
  price: Number(c.price) || 0, // integer cents
  currency: c.currency || 'USD',
  pricingType: c.pricing_type || 'FREE',
  expiresAt: c.expires_at || null,
  availableSeats: Number.isFinite(Number(c.available_enrollment_count)) ? Number(c.available_enrollment_count) : null,
});

const enrollmentShape = (row, task, extra = {}) => ({
  taskId: row.assignedTaskId,
  taskStatus: task?.status || null,
  provider: row.provider,
  courseId: row.courseId,
  courseTitle: row.courseTitle,
  learnerEmail: row.learnerEmail,
  lifecycle: row.lifecycle,
  progressStatus: row.progressStatus || 'NOT_STARTED',
  overallProgress: row.overallProgress || 0,
  completedLessons: row.completedLessons,
  totalLessons: row.totalLessons,
  currentChapter: row.currentChapter || null,
  lastSyncedAt: row.lastSyncedAt,
  appUrl: null,
  ...extra,
});

/** Buildment's enroll refusals, in words a mentor can act on. */
function enrollError(error) {
  if (!(error instanceof BuildmentError)) return error;
  const { upstreamStatus: status, upstreamCode: code } = error;
  if (code === 'CAPACITY') return new AppError('No seats are left for this course on Edorax.', 409, 'COURSE_CAPACITY');
  if (code === 'EXPIRED') return new AppError('Your workspace\'s access to this course has expired on Edorax.', 409, 'COURSE_EXPIRED');
  if (code === 'NOT_ALLOWED') return new AppError('Enrollment in this course is currently switched off for your workspace on Edorax.', 409, 'COURSE_NOT_ALLOWED');
  if (code === 'NOT_ALLOCATED' || status === 404) return new AppError('This course is not available to your workspace on Edorax.', 409, 'COURSE_NOT_AVAILABLE');
  if (status === 409) return new AppError('This learner is already enrolled in this course through a different organization.', 409, 'COURSE_ENROLLED_ELSEWHERE');
  if (status === 400) return new ValidationError('Edorax rejected the enrollment — check the mentee\'s email address.');
  return error;
}

class CourseService {
  // ── connection ──────────────────────────────────────────────────────────
  async _connection({ required = true } = {}) {
    const organizationId = await organizationService.currentId();
    const connection = await externalAppService.getConnection(organizationId, PROVIDER);
    if (!connection && required) {
      throw new AppError('Edorax is not connected for this workspace.', 409, 'COURSES_NOT_CONNECTED');
    }
    return connection ? { ...connection, organizationId } : null;
  }

  /**
   * Run a provider call; if Buildment rejects the stored keys, flag the
   * connection so the Courses surfaces disappear until an admin reconnects.
   */
  async _call(connection, operation) {
    try {
      return await operation(connection.credentials);
    } catch (error) {
      if (error instanceof BuildmentError && error.upstreamStatus === 401) {
        await externalAppService.markRejected(connection.row);
        coursesCache.delete(connection.organizationId);
        throw new AppError('Edorax rejected this workspace\'s keys. An admin needs to reconnect Edorax in Settings → Apps.', 409, 'COURSES_NOT_CONNECTED');
      }
      throw error;
    }
  }

  /** Drives whether the client shows any course UI at all. */
  async status() {
    const connection = await this._connection({ required: false });
    return {
      connected: Boolean(connection),
      provider: PROVIDER,
      organizationName: connection?.metadata?.organizationName || null,
      appUrl: buildmentClient.appUrl(connection?.endpoint),
    };
  }

  // ── catalog ─────────────────────────────────────────────────────────────
  async listCourses({ fresh = false } = {}) {
    const connection = await this._connection();
    const cached = coursesCache.get(connection.organizationId);
    if (!fresh && cached && Date.now() - cached.at < COURSES_TTL_MS) return cached.courses;
    const courses = (await this._call(connection, (c) => buildmentClient.listCourses(c))).map(toCourse);
    coursesCache.set(connection.organizationId, { at: Date.now(), courses });
    return courses;
  }

  // ── assign = enroll ─────────────────────────────────────────────────────
  /**
   * Resolve a course BEFORE any task rows exist, so a course the workspace may
   * not assign fails fast. Only ids from Buildment's own list are accepted.
   */
  async prepare(courseId, { checkSeats = true } = {}) {
    if (!courseId) throw new ValidationError('A course task needs a course');
    const connection = await this._connection();
    const course = (await this.listCourses({ fresh: true })).find((c) => c.courseId === courseId);
    if (!course) throw new ValidationError('That course is not available to your workspace on Edorax');
    if (checkSeats && course.availableSeats !== null && course.availableSeats <= 0) {
      throw new AppError('No seats are left for this course on Edorax.', 409, 'COURSE_CAPACITY');
    }
    return { connection, course };
  }

  /** A 404 from Buildment is an answer ("no such enrollment"), not a failure. */
  async _orNull(run) {
    try {
      return await run();
    } catch (error) {
      if (error instanceof BuildmentError && error.upstreamStatus === 404) return null;
      throw error;
    }
  }

  async _learnerEmail(menteeId) {
    const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'email'] });
    if (!mentee?.email) throw new ValidationError('This mentee has no email address to enroll with');
    return mentee.email.trim().toLowerCase();
  }

  /** Same gate as assigning a task: task.assign on the mentee's clan. */
  async _assertCanAssign(user, menteeId, requestedClanId) {
    const clanId = await resolveMenteeClanId(menteeId, requestedClanId, { actorId: user.id });
    if (!clanId) throw new ValidationError('Mentee has no clan membership');
    if (!await authzService.can(user, PERMISSIONS.TASK_ASSIGN, await authzService.scopeOfClan(clanId))) {
      throw new ForbiddenError('You cannot assign work in this clan');
    }
  }

  // ── enroll first, assign second ─────────────────────────────────────────
  /**
   * Enroll mentees in a course WITHOUT creating tasks, so the mentor sees the
   * provider's answer before assigning. Each success returns the assignment id
   * the task must then be created with. Per-mentee failures do not stop the rest.
   */
  async enrollLearners(courseId, menteeIds, user, requestedClanId = null) {
    const prepared = await this.prepare(courseId, { checkSeats: false });
    const results = [];
    for (const menteeId of menteeIds) {
      try {
        await this._assertCanAssign(user, menteeId, requestedClanId);
        results.push({ menteeId, ok: true, ...(await this._enrollLearner(prepared, menteeId, user.id)) });
      } catch (error) {
        if (!error.isOperational) logger.error('Course enrollment failed', { menteeId, message: error.message });
        results.push({ menteeId, ok: false, error: error.isOperational ? error.message : 'Could not enroll on Edorax', code: error.code || null });
      }
    }
    coursesCache.delete(prepared.connection.organizationId); // seats were just taken
    return { results, enrolled: results.filter((r) => r.ok).length };
  }

  async _enrollLearner({ connection, course }, menteeId, mentorId) {
    const learnerEmail = await this._learnerEmail(menteeId);

    // An earlier "Enroll" that was never assigned still holds its seat: reuse
    // that enrollment rather than asking for a second one.
    let assignmentId = crypto.randomUUID();
    const existing = await this._orNull(() => this._call(connection, (c) => buildmentClient.findEnrollment(c, { courseId: course.courseId, learnerEmail })));
    const existingId = existing && LIVE_LIFECYCLES.includes(existing.lifecycle) ? existing.external_assignment_id : null;
    if (UUID.test(existingId || '')) {
      if (await models.AssignedTask.findByPk(existingId, { attributes: ['id'] })) {
        throw new AppError('This mentee already has this course assigned as a task.', 409, 'COURSE_ALREADY_ASSIGNED');
      }
      assignmentId = existingId;
    }

    let result;
    try {
      result = await this._call(connection, (c) => buildmentClient.enroll(c, {
        studentEmail: learnerEmail, courseId: course.courseId, externalAssignmentId: assignmentId, mentorId,
      }));
    } catch (error) {
      throw enrollError(error);
    }
    return {
      assignmentId,
      lifecycle: LIFECYCLES.includes(result.lifecycle) ? result.lifecycle : 'PENDING_ACCOUNT',
      learnerEmail,
    };
  }

  /**
   * Assigning a course the mentee was already enrolled in: confirm that
   * enrollment with Buildment (right course, right learner, seat still held)
   * instead of creating one. The task is then created with `assignmentId` as its id.
   */
  async prepareEnrolled(courseId, assignmentId, menteeId) {
    const { connection, course } = await this.prepare(courseId, { checkSeats: false });
    const notEnrolled = () => new AppError('This mentee is not enrolled in the course on Edorax yet — enroll them first.', 409, 'COURSE_NOT_ENROLLED');
    if (!UUID.test(assignmentId || '')) throw notEnrolled();
    if (await models.AssignedTask.findByPk(assignmentId, { attributes: ['id'] })) {
      throw new AppError('This mentee already has this course assigned as a task.', 409, 'COURSE_ALREADY_ASSIGNED');
    }
    const learnerEmail = await this._learnerEmail(menteeId);
    const enrollment = await this._orNull(() => this._call(connection, (c) => buildmentClient.getEnrollment(c, assignmentId)));
    if (!enrollment
      || enrollment.course_id !== course.courseId
      || String(enrollment.learner_email || '').toLowerCase() !== learnerEmail
      || !LIVE_LIFECYCLES.includes(enrollment.lifecycle)) {
      throw notEnrolled();
    }
    return {
      connection,
      course,
      enrolled: { assignmentId, learnerEmail, externalEnrollmentId: enrollment.enrollment_id || null, lifecycle: enrollment.lifecycle },
    };
  }

  /** Give back seats "Enroll" took that never became a task. Never touches a task's enrollment. */
  async releaseEnrollments(courseId, enrollments, user, requestedClanId = null) {
    const connection = await this._connection();
    const results = [];
    for (const { menteeId, assignmentId } of enrollments) {
      try {
        await this._assertCanAssign(user, menteeId, requestedClanId);
        if (await models.AssignedTask.findByPk(assignmentId, { attributes: ['id'] })) {
          throw new ValidationError('This enrollment belongs to a task — cancel the task instead');
        }
        const learnerEmail = await this._learnerEmail(menteeId);
        await this._orNull(() => this._cancelUpstream(connection, { courseId, learnerEmail, assignedTaskId: assignmentId }));
        results.push({ menteeId, ok: true });
      } catch (error) {
        if (!error.isOperational) logger.error('Course enrollment release failed', { menteeId, message: error.message });
        results.push({ menteeId, ok: false, error: error.isOperational ? error.message : 'Could not cancel the Edorax enrollment' });
      }
    }
    coursesCache.delete(connection.organizationId);
    return { results, released: results.filter((r) => r.ok).length };
  }

  _record(assignedTask, course, { learnerEmail, externalEnrollmentId, lifecycle }) {
    return models.CourseEnrollment.create({
      assignedTaskId: assignedTask.id,
      provider: PROVIDER,
      courseId: course.courseId,
      courseSlug: course.courseSlug,
      courseTitle: course.title,
      learnerEmail,
      externalEnrollmentId: externalEnrollmentId || null,
      lifecycle: LIFECYCLES.includes(lifecycle) ? lifecycle : 'PENDING_ACCOUNT',
      lastSyncedAt: new Date(),
    });
  }

  /**
   * Enroll the task's mentee and record the enrollment. Throws → caller removes
   * the task. When the mentee was enrolled ahead of the task (`enrolled`), only
   * the record is written and a failure leaves that enrollment for a retry.
   */
  async enrollForTask(assignedTask, { connection, course, enrolled = null }) {
    if (enrolled) return this._record(assignedTask, course, enrolled);
    const learnerEmail = await this._learnerEmail(assignedTask.menteeId);

    let result;
    try {
      result = await this._call(connection, (c) => buildmentClient.enroll(c, {
        studentEmail: learnerEmail,
        courseId: course.courseId,
        externalAssignmentId: assignedTask.id,
        mentorId: assignedTask.mentorId,
      }));
    } catch (error) {
      throw enrollError(error);
    }
    coursesCache.delete(connection.organizationId); // a seat was just taken

    try {
      return await this._record(assignedTask, course, {
        learnerEmail, externalEnrollmentId: result.enrollment_id, lifecycle: result.lifecycle,
      });
    } catch (error) {
      // The seat is taken on Buildment but we could not record it: give it back.
      await this._cancelUpstream(connection, { courseId: course.courseId, learnerEmail, assignedTaskId: assignedTask.id })
        .catch((cancelError) => logger.error('Course enrollment rollback failed', { taskId: assignedTask.id, message: cancelError.message }));
      throw error;
    }
  }

  // ── read + sync ─────────────────────────────────────────────────────────
  async getForTask(taskId, user, { refresh = false } = {}) {
    // Scoped in explicitly: pool work is hidden by default, and a candidate's
    // own course task must be readable by them — otherwise the course they
    // were set is work they cannot open. Pool work answers to the pool, so it
    // is the candidate themselves or a pool reviewer, never a clan mentor.
    const task = await models.AssignedTask.scope('withPoolWork').findByPk(taskId);
    if (!task) throw new NotFoundError('Task not found');
    const isOwner = Boolean(task.menteeId) && task.menteeId === user.id;
    const allowed = task.poolMemberId
      ? isOwner || await authzService.canActOnTask(user.id, task, PERMISSIONS.POOL_REVIEW)
      : await authzService.canViewMentee(user, task.menteeId);
    if (!allowed) {
      throw new ForbiddenError('You do not have access to this task');
    }
    const row = await models.CourseEnrollment.findOne({ where: { assignedTaskId: task.id } });
    if (!row) throw new NotFoundError('This task has no course enrollment');

    const age = row.lastSyncedAt ? Date.now() - new Date(row.lastSyncedAt).getTime() : Infinity;
    let syncError = null;
    if (age > (refresh ? SYNC_MIN_GAP_MS : SYNC_FRESH_MS)) {
      try {
        await this.sync(row, task);
      } catch (error) {
        // Serve the last snapshot rather than failing the task page.
        syncError = error.isOperational ? error.message : 'Could not refresh from Edorax';
        if (!error.isOperational) logger.error('Course sync failed', { taskId: task.id, message: error.message });
      }
    }
    const connection = await this._connection({ required: false });
    return enrollmentShape(row, task, { syncError, appUrl: buildmentClient.appUrl(connection?.endpoint) });
  }

  /** Read lifecycle + progress from Buildment and reflect it on the task. */
  async sync(row, task = null) {
    if (row.lifecycle === 'CANCELLED') return row;
    const connection = await this._connection();
    const assignedTask = task || await models.AssignedTask.findByPk(row.assignedTaskId);

    let patch;
    try {
      const p = await this._call(connection, (c) => buildmentClient.getProgress(c, { courseId: row.courseId, learnerEmail: row.learnerEmail }));
      patch = {
        lifecycle: LIFECYCLES.includes(p.lifecycle) ? p.lifecycle : row.lifecycle,
        progressStatus: p.completed === true ? 'COMPLETED' : (p.status || 'NOT_STARTED'),
        overallProgress: Math.max(0, Math.min(100, Math.round(Number(p.overall_progress) || 0))),
        completedLessons: Number.isFinite(Number(p.completed_lessons)) ? Number(p.completed_lessons) : null,
        totalLessons: Number.isFinite(Number(p.total_lessons)) ? Number(p.total_lessons) : null,
        currentChapter: p.current_chapter || null,
      };
    } catch (error) {
      if (!(error instanceof BuildmentError) || error.upstreamStatus !== 404) throw error;
      // No progress record: fall back to the enrollment itself for access state.
      const e = await this._call(connection, (c) => buildmentClient.getEnrollment(c, row.assignedTaskId))
        .catch((inner) => { if (inner instanceof BuildmentError && inner.upstreamStatus === 404) return null; throw inner; });
      if (!e) return row;
      patch = {
        lifecycle: LIFECYCLES.includes(e.lifecycle) ? e.lifecycle : row.lifecycle,
        overallProgress: Math.max(0, Math.min(100, Math.round(Number(e.percent_complete) || 0))),
      };
    }
    await row.update({ ...patch, lastSyncedAt: new Date() });
    if (assignedTask) await this._reflectOnTask(row, assignedTask);
    return row;
  }

  /** Buildment progress → Pathment task status. Never moves a task backwards. */
  async _reflectOnTask(row, task) {
    const finished = row.progressStatus === 'COMPLETED' || row.lifecycle === 'COMPLETED';
    if (finished && ['assigned', 'not_started', 'in_progress', 'revision_needed'].includes(task.status)) {
      await this._completeTask(row, task);
      await this._reflectOnPool(task);
      return;
    }
    const started = row.overallProgress > 0 || row.progressStatus === 'IN_PROGRESS';
    if (started && ['assigned', 'not_started'].includes(task.status)) {
      await task.update({ status: 'in_progress', startedAt: task.startedAt || new Date() });
      await this._reflectOnPool(task);
    }
  }

  /**
   * A pool candidate's status is derived from their task statuses, and the
   * course sync is the one place a task moves with nobody touching it. Without
   * this a candidate who started or finished a course would still read as
   * "active" on the pool screen. Never fatal: the score is read from the
   * enrollment, not from this.
   */
  async _reflectOnPool(task) {
    if (!task.poolMemberId) return;
    try {
      await require('./poolWorkEvents').refreshMemberStatus(task.poolMemberId);
    } catch (error) {
      logger.warn('Pool member status not refreshed after course sync', { taskId: task.id, message: error.message });
    }
  }

  /**
   * Finishing the course on Buildment completes the task through the shared
   * review path (points, gamification, notifications) — the same route an
   * auto-graded quiz takes. If that path refuses (e.g. the assigning mentor no
   * longer reviews this clan) the task stays 'submitted' for a mentor to approve.
   */
  async _completeTask(row, task) {
    const lessons = row.totalLessons ? ` — ${row.completedLessons ?? row.totalLessons}/${row.totalLessons} lessons` : '';
    const note = `Course completed on Edorax: ${row.courseTitle}${lessons}.`;
    try {
      await require('./clanLifecycleService').assertTaskWritable(task);
      const submission = await sequelize.transaction(async (transaction) => {
        const last = await models.TaskSubmission.findOne({
          where: { assignedTaskId: task.id }, order: [['version', 'DESC']], transaction,
        });
        const version = (last?.version || 0) + 1;
        const created = await models.TaskSubmission.create({
          assignedTaskId: task.id,
          version,
          submissionText: note,
          submissionUrls: [],
          status: 'pending',
          submittedAt: new Date(),
        }, { transaction });
        await task.update({
          status: 'submitted',
          submittedAt: new Date(),
          startedAt: task.startedAt || new Date(),
          currentSubmissionVersion: version,
          isLate: task.dueDate ? new Date() > new Date(task.dueDate) : false,
        }, { transaction });
        return created;
      });
      await require('./submissionService').reviewSubmission(submission.id, task.mentorId, {
        decision: 'approved',
        isApproved: true,
        rating: 5,
        feedbackText: note,
        pointsPercent: 100,
      });
      await task.reload();
    } catch (error) {
      logger.warn('Course task could not be auto-completed', { taskId: task.id, message: error.message });
      await task.reload().catch(() => {});
    }
  }

  // ── unassign = cancel ───────────────────────────────────────────────────
  async _cancelUpstream(connection, { courseId, learnerEmail, assignedTaskId }) {
    const orgSlug = connection.metadata?.organizationSlug;
    if (!orgSlug) throw new AppError('Edorax connection is missing its organization — reconnect it in Settings → Apps.', 409, 'COURSES_NOT_CONNECTED');
    return this._call(connection, (c) => buildmentClient.cancel(c, {
      orgSlug, email: learnerEmail, courseId, externalAssignmentId: assignedTaskId,
    }));
  }

  /** Whether a task is a course task (cheap guard for the task lifecycle hooks). */
  async enrollmentForTask(taskId) {
    return models.CourseEnrollment.findOne({ where: { assignedTaskId: taskId } });
  }

  /**
   * Release the Buildment seat before a course task is cancelled or removed.
   * No-op for non-course tasks. A Buildment failure throws, so the task is NOT
   * removed while its seat is still held; "already gone" there counts as done.
   */
  async cancelForTask(task) {
    const row = await this.enrollmentForTask(task.id);
    if (!row || row.lifecycle === 'CANCELLED') return;
    const connection = await this._connection({ required: false });
    if (!connection) {
      // Workspace disconnected Buildment: nothing we can release from here.
      logger.warn('Course task removed without an Edorax connection; seat not released', { taskId: task.id });
    } else {
      try {
        await this._cancelUpstream(connection, { courseId: row.courseId, learnerEmail: row.learnerEmail, assignedTaskId: task.id });
      } catch (error) {
        if (!(error instanceof BuildmentError) || error.upstreamStatus !== 404) {
          if (error instanceof BuildmentError) {
            throw new AppError(`Could not cancel the Edorax enrollment (${error.message}). The task was not changed — try again.`, 502, 'BUILDMENT_ERROR');
          }
          throw error;
        }
      }
      coursesCache.delete(connection.organizationId);
    }
    await row.update({ lifecycle: 'CANCELLED' });
  }

  // ── background ──────────────────────────────────────────────────────────
  /** One pass over this workspace's open enrollments, least-recently-synced first. */
  async syncActive({ limit = 200 } = {}) {
    if (!(await this._connection({ required: false }))) return { synced: 0 };
    const rows = await models.CourseEnrollment.findAll({
      where: { lifecycle: { [Op.in]: OPEN_LIFECYCLES } },
      include: [{
        // Scoped in explicitly: AssignedTask's default scope hides pool work,
        // and a selection pool's course tasks need syncing just as much as a
        // clan's — their progress IS the candidate's score.
        model: models.AssignedTask.scope('withPoolWork'), as: 'assignedTask', required: true,
        where: { status: { [Op.notIn]: ['completed', 'cancelled', 'submitted'] } },
      }],
      order: [[sequelize.literal('"CourseEnrollment"."last_synced_at" ASC NULLS FIRST')]],
      limit,
    });
    let synced = 0;
    for (const row of rows) {
      try {
        await this.sync(row, row.assignedTask);
        synced += 1;
      } catch (error) {
        logger.warn('Course sync skipped', { taskId: row.assignedTaskId, message: error.message });
        if (error.code === 'COURSES_NOT_CONNECTED') break; // keys rejected: stop this workspace's pass
      }
    }
    return { synced };
  }
}

module.exports = new CourseService();
