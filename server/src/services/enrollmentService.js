const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError, ConflictError, ForbiddenError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

class EnrollmentService {
  async getEnrollments(filters, pagination) {
    const { status, programId, menteeId, search } = filters;
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const where = {};
    if (status) where.status = status;
    if (programId) where.programId = programId;
    if (menteeId) where.menteeId = menteeId;

    // Server-side search across mentee name, email and program name.
    // Uses $association.column$ syntax so Sequelize can push the filter
    // to the JOIN — requires subQuery: false + distinct: true below.
    if (search && search.trim()) {
      const like = `%${search.trim()}%`;
      where[Op.or] = [
        { '$mentee.first_name$': { [Op.iLike]: like } },
        { '$mentee.last_name$': { [Op.iLike]: like } },
        { '$mentee.email$':     { [Op.iLike]: like } },
        { '$program.name$':     { [Op.iLike]: like } },
      ];
    }

    const { rows, count } = await models.Enrollment.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{
            model: models.MenteeProfile,
            as: 'menteeProfile',
            attributes: ['learningGoals', 'interests', 'priorExperience', 'currentEducation', 'currentOccupation']
          }]
        },
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'status']
        },
        {
          model: models.ProgramLevel,
          as: 'currentLevel',
          attributes: ['id', 'name', 'durationWeeks']
        },
        {
          model: models.MentorMenteeMatch,
          as: 'matches',
          where: { status: 'active' },
          required: false,
          include: [{
            model: models.User,
            as: 'mentor',
            attributes: ['id', 'firstName', 'lastName', 'email']
          }]
        }
      ],
      limit,
      offset,
      order: [['enrolledAt', 'DESC']],
      // distinct: true ensures the count reflects unique Enrollment rows
      // even when matches (hasMany) produces duplicate rows in the JOIN.
      // subQuery: false is required so Sequelize can filter on included
      // model columns ($mentee.first_name$, $program.name$, etc.).
      distinct: true,
      subQuery: false,
    });

    return {
      enrollments: rows,
      pagination: {
        page,
        limit,
        total: count,
        pages: Math.ceil(count / limit)
      }
    };
  }

  async getEnrollmentById(enrollmentId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [{
            model: models.MenteeProfile,
            as: 'menteeProfile'
          }]
        },
        {
          model: models.Program,
          as: 'program',
          include: [{
            model: models.ProgramLevel,
            as: 'levels',
            separate: true,
            order: [['levelOrder', 'ASC']]
          }]
        },
        {
          model: models.ProgramLevel,
          as: 'currentLevel'
        }
      ]
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    return enrollment;
  }

  async createEnrollment(programId, menteeId) {
    // Check if program exists and is active
    const program = await models.Program.findByPk(programId, {
      include: [{
        model: models.ProgramLevel,
        as: 'levels',
        separate: true,
        order: [['levelOrder', 'ASC']]
      }]
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (program.status !== 'published') {
      throw new ValidationError('Program is not available for enrollment');
    }

    // Check if already enrolled
    const existingEnrollment = await models.Enrollment.findOne({
      where: { menteeId, programId }
    });

    if (existingEnrollment) {
      throw new ConflictError('Already enrolled in this program');
    }

    // Get first level
    const firstLevel = program.levels && program.levels.length > 0 ? program.levels[0] : null;

    // Create enrollment
    const enrollment = await models.Enrollment.create({
      menteeId,
      programId,
      currentLevelId: firstLevel?.id,
      status: 'pending_match',
      enrolledAt: new Date()
    });

    const admins = await models.User.findAll({
      where: { role: 'admin', status: 'active' },
      attributes: ['id']
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTEE_ENROLLED,
      recipients: [{ userId: menteeId }],
      payload: {
        title: 'Program enrollment created',
        message: `A new enrollment was created for "${program.name}".`,
        actionUrl: `/mentee/programs`,
        actionLabel: 'View Programs',
        relatedEntityType: 'enrollment',
        relatedEntityId: enrollment.id,
        emailSubject: 'Pathment: Enrollment confirmed'
      },
      dedupe: {
        relatedEntityType: 'enrollment_created',
        relatedEntityId: enrollment.id
      }
    });

    await notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.MENTEE_ENROLLED,
      recipients: admins.map((admin) => ({ userId: admin.id })),
      payload: {
        title: 'Program enrollment created',
        message: `A new enrollment was created for "${program.name}".`,
        actionUrl: `/admin/enrollment/overview`,
        actionLabel: 'View Enrollment',
        relatedEntityType: 'enrollment',
        relatedEntityId: enrollment.id,
        emailSubject: 'Pathment: New program enrollment'
      },
      dedupe: {
        relatedEntityType: 'enrollment_created',
        relatedEntityId: enrollment.id
      }
    });

    return this.getEnrollmentById(enrollment.id);
  }

  async updateEnrollmentStatus(enrollmentId, status, userId, userRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Only admin or the mentee can update status
    if (userRole !== 'admin' && enrollment.menteeId !== userId) {
      throw new ForbiddenError('Not authorized to update this enrollment');
    }

    const validStatuses = ['pending_match', 'matched', 'active', 'approved', 'rejected', 'pending_completion', 'level_completed', 'program_completed', 'dropped'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError('Invalid status');
    }

    await enrollment.update({ status });
    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Mentee or Mentor requests completion of the current level/program.
   * Sets status to pending_completion and records who requested it.
   */
  async requestCompletion(enrollmentId, requestedById, requestedByRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    // Only mentee can self-request; mentor can also request on behalf of mentee
    if (requestedByRole === 'mentee' && enrollment.menteeId !== requestedById) {
      throw new ForbiddenError('Not authorized to request completion for this enrollment');
    }

    if (requestedByRole === 'mentor') {
      // Verify this mentor is actively paired with this enrollment
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: requestedById, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    if (!['active', 'matched'].includes(enrollment.status)) {
      throw new ValidationError(`Cannot request completion from status: ${enrollment.status}`);
    }

    await enrollment.update({
      status: 'pending_completion',
      completionRequestedAt: new Date(),
      completionRequestedBy: requestedById,
      completionRequestedByRole: requestedByRole,
      completionRejectionReason: null
    });

    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Mentor or Admin approves the completion request.
   * Moves enrollment to level_completed or program_completed based on whether a next level exists.
   */
  async approveCompletion(enrollmentId, approverId, approverRole) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.Program,
          as: 'program',
          include: [{
            model: models.ProgramLevel,
            as: 'levels',
            order: [['level_order', 'ASC']]
          }]
        }
      ]
    });
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    if (!['pending_completion', 'matched', 'active'].includes(enrollment.status)) {
      throw new ValidationError('Enrollment is not in a state that can be approved for completion');
    }

    if (approverRole === 'mentor') {
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: approverId, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    // Determine if there is a next level
    const levels = enrollment.program?.levels || [];
    const currentIdx = levels.findIndex(l => l.id === enrollment.currentLevelId);
    const hasNextLevel = currentIdx !== -1 && currentIdx < levels.length - 1;

    const newStatus = hasNextLevel ? 'level_completed' : 'program_completed';

    await enrollment.update({
      status: newStatus,
      completionApprovedAt: new Date(),
      completionApprovedBy: approverId,
      completionApprovedByRole: approverRole,
      completedAt: newStatus === 'program_completed' ? new Date() : enrollment.completedAt
    });

    // Auto-promote: if there is a next level, immediately advance without admin manual step
    if (hasNextLevel) {
      const nextLevel = levels[currentIdx + 1];

      // End the current active mentor-mentee match
      await models.MentorMenteeMatch.update(
        { status: 'completed', endedAt: new Date() },
        { where: { enrollmentId, status: 'active' } }
      );

      // Advance the enrollment to the next level, awaiting a new mentor match
      await enrollment.update({
        currentLevelId: nextLevel.id,
        status: 'pending_match',
        currentWeek: 1,
        nextLevelEnrolledAt: new Date(),
        completionRequestedAt: null,
        completionRequestedBy: null,
        completionRequestedByRole: null,
        completionApprovedAt: null,
        completionApprovedBy: null,
        completionApprovedByRole: null,
        completionRejectionReason: null
      });

      return {
        enrollment: await this.getEnrollmentById(enrollmentId),
        hasNextLevel: true,
        nextLevelId: nextLevel.id,
        nextLevelName: nextLevel.name,
        autoPromoted: true
      };
    }

    return {
      enrollment: await this.getEnrollmentById(enrollmentId),
      hasNextLevel: false,
      nextLevelId: null,
      nextLevelName: null,
      autoPromoted: false
    };
  }

  /**
   * Mentor or Admin rejects the completion request.
   * Returns the enrollment back to active with a reason.
   */
  async rejectCompletion(enrollmentId, rejecterId, rejecterRole, reason) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId);
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    if (!['pending_completion', 'matched', 'active'].includes(enrollment.status)) {
      throw new ValidationError('Enrollment is not in a state where completion can be rejected');
    }

    if (rejecterRole === 'mentor') {
      const match = await models.MentorMenteeMatch.findOne({
        where: { enrollmentId, mentorId: rejecterId, status: 'active' }
      });
      if (!match) throw new ForbiddenError('You are not the active mentor for this enrollment');
    }

    await enrollment.update({
      status: 'matched',
      completionRejectionReason: reason || 'Completion request rejected',
      completionRequestedAt: null,
      completionRequestedBy: null,
      completionRequestedByRole: null
    });

    return this.getEnrollmentById(enrollmentId);
  }

  /**
   * Admin promotes a level_completed mentee to the next level.
   * Deactivates the current mentor match and creates a new pending_match state
   * on the next level so admin can assign a new mentor.
   */
  async promoteToNextLevel(enrollmentId, adminId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        {
          model: models.Program,
          as: 'program',
          include: [{
            model: models.ProgramLevel,
            as: 'levels',
            order: [['level_order', 'ASC']]
          }]
        }
      ]
    });
    if (!enrollment) throw new NotFoundError('Enrollment not found');

    const levels = enrollment.program?.levels || [];
    const currentIdx = levels.findIndex(l => l.id === enrollment.currentLevelId);

    if (!['level_completed', 'matched', 'active'].includes(enrollment.status)) {
      throw new ValidationError('Enrollment status must be level_completed to promote to the next level');
    }

    if (currentIdx === -1 || currentIdx >= levels.length - 1) {
      throw new ValidationError('No next level available — this is the final level');
    }

    const nextLevel = levels[currentIdx + 1];

    // End the current active mentor-mentee match
    await models.MentorMenteeMatch.update(
      { status: 'completed', endedAt: new Date() },
      { where: { enrollmentId, status: 'active' } }
    );

    // Advance the enrollment
    await enrollment.update({
      currentLevelId: nextLevel.id,
      status: 'pending_match',
      currentWeek: 1,
      nextLevelEnrolledAt: new Date(),
      // Reset completion tracking
      completionRequestedAt: null,
      completionRequestedBy: null,
      completionRequestedByRole: null,
      completionApprovedAt: null,
      completionApprovedBy: null,
      completionApprovedByRole: null,
      completionRejectionReason: null
    });

    return {
      enrollment: await this.getEnrollmentById(enrollmentId),
      promotedToLevel: nextLevel
    };
  }

  /**
   * Remove (unenroll) a mentee from a program. Admin-only.
   * Cancels any active match and deletes all associated assigned tasks.
   */
  async removeEnrollment(enrollmentId, adminUserId) {
    const enrollment = await models.Enrollment.findByPk(enrollmentId, {
      include: [
        { model: models.User, as: 'mentee', attributes: ['id', 'firstName', 'lastName'] },
        { model: models.Program, as: 'program', attributes: ['id', 'name'] },
      ],
    });

    if (!enrollment) {
      throw new NotFoundError('Enrollment not found');
    }

    // Cancel all active matches
    await models.MentorMenteeMatch.update(
      { status: 'cancelled' },
      { where: { enrollmentId, status: 'active' } }
    );

    // Delete all assigned tasks for this enrollment
    await models.AssignedTask.destroy({ where: { enrollmentId } });

    await enrollment.destroy();

    return { message: 'Enrollment removed successfully' };
  }
}

module.exports = new EnrollmentService();
