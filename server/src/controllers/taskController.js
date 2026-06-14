const taskService = require('../services/taskService');
const authzService = require('../services/authzService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');

/**
 * Auto-assign week tasks to mentee
 * POST /api/tasks/auto-assign
 */
exports.autoAssignWeekTasks = catchAsync(async (req, res) => {
  const { enrollmentId, weekNumber } = req.body;
  
  const result = await taskService.autoAssignWeekTasks(enrollmentId, weekNumber);
  res.status(201).json(successResponse('Tasks auto-assigned successfully', result, 201));
});

/**
 * Create custom task (mentor creates for mentee)
 * POST /api/tasks/custom
 */
exports.createCustomTask = catchAsync(async (req, res) => {
  const mentorId = req.user.id;

  const task = await taskService.createCustomTask(req.body, mentorId);
  res.status(201).json(successResponse('Custom task created successfully', { task }, 201));
});

/**
 * Assign one custom task to many mentees (bulk)
 * POST /api/tasks/custom/bulk
 */
exports.bulkCreateCustomTasks = catchAsync(async (req, res) => {
  const mentorId = req.user.id;
  const result = await taskService.bulkCreateCustomTasks(req.body, mentorId);
  res.status(201).json(successResponse(`Assigned to ${result.assigned} mentee(s)`, result, 201));
});

/**
 * Get tasks for mentee
 * GET /api/tasks/mentee/:menteeId
 */
exports.getMenteeTasks = catchAsync(async (req, res) => {
  const { menteeId } = req.params;
  const { status, enrollmentId, isCustomTask } = req.query;

  // Authorization (scoped, derived): the mentee themselves, an admin, the matched
  // mentor, OR any lead/co-mentor of the mentee's clan. This is mentee-centric —
  // it returns ALL of the mentee's work regardless of who assigned it, so a
  // co-mentor sees the same picture as the lead (not just their own assignments).
  const assignments = req.loadAssignments ? await req.loadAssignments() : undefined;
  if (!(await authzService.canViewMentee(req.user, menteeId, { assignments }))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const tasks = await taskService.getMenteeTasks(menteeId, {
    status,
    enrollmentId,
    isCustomTask: isCustomTask === 'true' ? true : isCustomTask === 'false' ? false : undefined
  });
  
  res.status(200).json(successResponse('Tasks retrieved', { tasks }));
});

/**
 * Get tasks for mentor (to review)
 * GET /api/tasks/mentor/:mentorId
 */
exports.getMentorTasks = catchAsync(async (req, res) => {
  const { mentorId } = req.params;
  const { status, enrollmentId, menteeId, pendingReview } = req.query;

  // Security: only an admin may read another mentor's tasks; everyone else
  // (incl. co-mentors, whose base role isn't 'mentor') is restricted to their
  // own. Checked on derived capabilities, not the primary role.
  const isAdmin = req.loadCapabilities ? (await req.loadCapabilities()).includes('admin') : req.user.role === 'admin';
  if (!isAdmin && req.user.id !== mentorId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const tasks = await taskService.getMentorTasks(mentorId, {
    status,
    enrollmentId,
    menteeId,
    pendingReview: pendingReview === 'true'
  });
  
  res.status(200).json(successResponse('Tasks retrieved', { tasks }));
});

/**
 * Get single assigned task by ID
 * GET /api/tasks/:taskId
 */
exports.getTaskById = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  
  const task = await taskService.getAssignedTaskById(taskId);

  // Ownership via scoped RBAC (replaces the legacy "you must be THE assigning
  // mentor" check, which wrongly blocked co-mentors / cross-clan cover): the
  // mentee sees their own task; anyone else must be able to view the task's
  // mentee — admin, the matched mentor, or a lead/co-mentor of the mentee's clan
  // who still holds mentee.view (respects a revoked co-mentor permission).
  const assignments = req.loadAssignments ? await req.loadAssignments() : undefined;
  const allowed = await authzService.canViewMentee(req.user, task.menteeId, { assignments });
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  res.status(200).json(successResponse('Task retrieved', { task }));
});

/**
 * Submit task
 * POST /api/tasks/:taskId/submit
 */
exports.submitTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const menteeId = req.user.id;
  
  const task = await taskService.submitTask(taskId, menteeId, req.body);
  res.status(200).json(successResponse('Task submitted successfully', { task }));
});

/**
 * Review task submission
 * POST /api/tasks/:taskId/review
 */
exports.reviewTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const mentorId = req.user.id;
  
  const task = await taskService.reviewTask(taskId, mentorId, req.body);
  res.status(200).json(successResponse('Task reviewed successfully', { task }));
});

/**
 * Update task status
 * PATCH /api/tasks/:taskId/status
 */
exports.updateTaskStatus = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { status } = req.body;
  
  const task = await taskService.updateTaskStatus(taskId, req.user.id, req.user.role, status);
  res.status(200).json(successResponse('Task status updated', { task }));
});

/**
 * Get mentor task statistics
 * GET /api/tasks/mentor/:mentorId/stats
 */
exports.getMentorTaskStats = catchAsync(async (req, res) => {
  const { mentorId } = req.params;

  // Security: only an admin may read another mentor's stats; everyone else is
  // restricted to their own (derived capabilities, not primary role).
  const isAdmin = req.loadCapabilities ? (await req.loadCapabilities()).includes('admin') : req.user.role === 'admin';
  if (!isAdmin && req.user.id !== mentorId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const stats = await taskService.getMentorTaskStats(mentorId);
  res.status(200).json(successResponse('Stats retrieved', { stats }));
});

/**
 * Get mentee task statistics
 * GET /api/tasks/mentee/:menteeId/stats
 */
exports.getMenteeTaskStats = catchAsync(async (req, res) => {
  const { menteeId } = req.params;
  const { enrollmentId } = req.query;
  
  // Security: Mentees can only view their own stats
  if (req.user.role === 'mentee' && req.user.id !== menteeId) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  
  const stats = await taskService.getMenteeTaskStats(menteeId, enrollmentId);
  res.status(200).json(successResponse('Stats retrieved', { stats }));
});

/**
 * Cancel a task
 * POST /api/tasks/:taskId/cancel
 */
exports.cancelTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { reason } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  const task = await taskService.cancelTask(taskId, userId, userRole, reason);
  res.status(200).json(successResponse('Task cancelled successfully', { task }));
});

/**
 * Edit a mentee's assigned task (per-mentee overrides + note + due date)
 * PATCH /api/tasks/:taskId
 */
exports.updateAssignedTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const task = await taskService.updateAssignedTask(taskId, req.user.id, req.user.role, req.body);
  res.status(200).json(successResponse('Task updated successfully', { task }));
});

/**
 * Reassign (reactivate) a cancelled task
 * POST /api/tasks/:taskId/reassign
 */
exports.reassignTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const task = await taskService.reactivateTask(taskId, req.user.id, req.user.role, { dueDate: req.body && req.body.dueDate });
  res.status(200).json(successResponse('Task reassigned successfully', { task }));
});

/**
 * Get roadmap tasks for a program
 * GET /api/tasks/roadmap/program/:programId?menteeId=xxx
 */
exports.getRoadmapTasks = catchAsync(async (req, res) => {
  const { programId } = req.params;
  const { menteeId } = req.query; // Optional menteeId to check assignment status

  const roadmap = await taskService.getRoadmapTasks(programId, menteeId);
  res.status(200).json(successResponse('Roadmap retrieved', { roadmap }));
});

/**
 * Delete custom task
 * DELETE /api/tasks/:taskId
 */
exports.deleteCustomTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const mentorId = req.user.id;

  const result = await taskService.deleteCustomTask(taskId, mentorId);
  res.status(200).json(successResponse(result.message, {}));
});

/**
 * Change an assigned task's deadline (mentor/admin)
 * PATCH /api/tasks/:taskId/due-date  { dueDate }
 */
exports.updateTaskDueDate = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const { dueDate } = req.body;
  const task = await taskService.updateTaskDueDate(taskId, req.user.id, req.user.role, dueDate);
  res.status(200).json(successResponse('Deadline updated', { task }));
});

/**
 * Unassign (delete) an assigned task — roadmap or custom (mentor/admin)
 * POST /api/tasks/:taskId/unassign
 */
exports.unassignTask = catchAsync(async (req, res) => {
  const { taskId } = req.params;
  const result = await taskService.unassignTask(taskId, req.user.id, req.user.role);
  res.status(200).json(successResponse(result.message, {}));
});

module.exports = exports;
