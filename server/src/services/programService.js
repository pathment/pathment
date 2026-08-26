const { sequelize, models } = require('../db');
const { Op } = require('sequelize');
const { 
  NotFoundError, 
  ConflictError, 
  ForbiddenError,
  ValidationError 
} = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

// Helper function for audit logging (non-blocking)
// Shared audit writer: records IP + user-agent from the request context automatically.
const { createAuditLog } = require('../utils/auditContext');

class ProgramService {
  /**
   * Create a new program
   */
  async createProgram(programData, createdBy) {
    const {
      name,
      description,
      type,
      totalDurationWeeks,
      estimatedHoursPerWeek,
      startDate,
      endDate,
      maxEnrollments,
      tags,
      learningOutcomes,
      prerequisites,
      targetAudience,
      isTemplate,
      status,
      visibility
    } = programData;

    // Validate dates
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      throw new ValidationError('End date must be after start date');
    }

    const program = await models.Program.create({
      createdBy,
      name,
      description,
      type,
      status: status || 'draft',
      // Private by default - programs are invite-driven, never publicly browsed.
      visibility: visibility === 'public' ? 'public' : 'private',
      totalDurationWeeks,
      estimatedHoursPerWeek,
      startDate,
      endDate,
      maxEnrollments,
      tags: tags || [],
      learningOutcomes: learningOutcomes || [],
      prerequisites,
      targetAudience,
      isTemplate: isTemplate || false,
      publishedAt: status === 'published' ? new Date() : null
    });

    // Create audit log
    await createAuditLog({
      userId: createdBy,
      action: 'PROGRAM_CREATED',
      entityType: 'Program',
      entityId: program.id,
      newValues: {
        name: program.name,
        type: program.type,
        status: program.status
      }
    });

    // Only public programs are broadcast to mentees - private programs are
    // invite-driven and never browsed, so no "new program available" blast.
    if (program.status === 'published' && program.visibility === 'public') {
      const mentees = await models.User.findAll({
        where: { role: 'mentee', status: 'active' },
        attributes: ['id'],
        limit: 5000
      });

      await notificationOrchestrator.dispatch({
        eventKey: NOTIFICATION_EVENTS.PROGRAM_UPDATED,
        recipients: mentees.map((m) => ({ userId: m.id })),
        payload: {
          title: 'New program available',
          message: `"${program.name}" is now available for enrollment.`,
          actionUrl: `/programs/${program.id}`,
          actionLabel: 'Browse Programs',
          relatedEntityType: 'program',
          relatedEntityId: program.id,
          emailSubject: 'Pathment: New program available'
        },
        dedupe: {
          relatedEntityType: 'program_created',
          relatedEntityId: program.id
        }
      });
    }

    return program;
  }

  /**
   * Get all programs with filters
   */
  async getPrograms(filters = {}, userId = null, userRole = null) {
    const {
      status,
      type,
      tags,
      search,
      createdBy,
      isTemplate,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = filters;

    const where = {};

    // Filter by status - admins and creators can see all, others only public+published.
    // Privacy is enforced here at the API: a non-admin/non-creator can never list
    // a private program, regardless of any query params they send.
    if (userRole === 'admin' || (createdBy && createdBy === userId)) {
      if (status) where.status = status;
    } else {
      where.status = 'published';
      where.visibility = 'public';
    }

    if (type) where.type = type;
    if (isTemplate !== undefined) where.isTemplate = isTemplate;
    if (createdBy) where.createdBy = createdBy;

    // Tag filtering
    if (tags && tags.length > 0) {
      where.tags = {
        [Op.contains]: Array.isArray(tags) ? tags : [tags]
      };
    }

    // Search by name or description
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows } = await models.Program.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Enrollment,
          as: 'enrollments',
          attributes: ['id'],
          required: false
        }
      ],
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      distinct: true
    });

    // Add completion field and mentor count to each program
    const programsWithCompletion = await Promise.all(rows.map(async program => {
      const programJSON = program.toJSON();
      
      // Count unique mentors with an active match in this program.
      const [mentorCount, completionResult] = await Promise.all([
        models.MentorMenteeMatch.count({
          distinct: true,
          col: 'mentor_id',
          where: { status: 'active' },
          include: [{
            model: models.Enrollment,
            as: 'enrollment',
            where: { programId: program.id },
            attributes: [],
            required: true
          }]
        }),
        models.Enrollment.findOne({
          where: {
            programId: program.id,
            status: { [Op.in]: ['matched', 'active', 'in_progress', 'program_completed'] }
          },
          attributes: [
            [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avgProgress']
          ],
          raw: true
        })
      ]);

      const completion = Math.round(parseFloat(completionResult?.avgProgress) || 0);

      return {
        ...programJSON,
        completion,
        _count: {
          enrollments: program.enrollments?.length || 0,
          mentors: mentorCount
        }
      };
    }));

    return {
      programs: programsWithCompletion,
      pagination: {
        totalItems: count,
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit)
      }
    };
  }

  /**
   * Get program by ID
   */
  async getProgramById(programId, userId = null, userRole = null) {
    const program = await models.Program.findByPk(programId, {
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: models.Enrollment,
          as: 'enrollments',
          attributes: ['id', 'menteeId', 'status', 'enrolledAt'],
          required: false
        }
      ]
    });

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Visibility check. Admins and the creator always see it. Everyone else
    // may view it only if it's public+published OR they have a real relationship
    // to it (mentee enrolled / mentor leading or co-mentoring a clan in it, or a
    // legacy active 1:1 match). Private programs never leak via direct id.
    const isPrivileged = userRole === 'admin' || program.createdBy === userId;
    if (!isPrivileged) {
      let allowed = program.status === 'published' && program.visibility === 'public';

      if (!allowed && userId && userRole === 'mentee') {
        const isEnrolled = await models.Enrollment.count({
          where: { menteeId: userId, programId: program.id }
        });
        allowed = isEnrolled > 0;
      }

      if (!allowed && userId && userRole === 'mentor') {
        const [clanAssigned, matchAssigned] = await Promise.all([
          models.ClanMembership.count({
            where: { userId, role: ['lead_mentor', 'co_mentor'], status: 'active' },
            include: [{
              model: models.Clan,
              as: 'clan',
              where: { programId: program.id },
              attributes: [],
              required: true
            }]
          }),
          models.MentorMenteeMatch.count({
            where: { mentorId: userId, status: 'active' },
            include: [{
              model: models.Enrollment,
              as: 'enrollment',
              where: { programId: program.id },
              attributes: [],
              required: true
            }]
          })
        ]);
        allowed = clanAssigned > 0 || matchAssigned > 0;
      }

      if (!allowed) {
        throw new ForbiddenError('You do not have permission to view this program');
      }
    }

    // Count unique mentors and compute average completion in parallel
    const [mentorCount, completionResult] = await Promise.all([
      models.MentorMenteeMatch.count({
        distinct: true,
        col: 'mentor_id',
        where: { status: 'active' },
        include: [{
          model: models.Enrollment,
          as: 'enrollment',
          where: { programId: program.id },
          attributes: [],
          required: true
        }]
      }),
      models.Enrollment.findOne({
        where: {
          programId: program.id,
          status: { [Op.in]: ['matched', 'active', 'in_progress', 'program_completed'] }
        },
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avgProgress']
        ],
        raw: true
      })
    ]);

    const completion = Math.round(parseFloat(completionResult?.avgProgress) || 0);

    // Add completion and counts
    const programJSON = program.toJSON();
    return {
      ...programJSON,
      completion,
      _count: {
        enrollments: program.enrollments?.length || 0,
        mentors: mentorCount
      }
    };
  }

  /**
   * Update program
   */
  async updateProgram(programId, updateData, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions - only creator or admin can update
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this program');
    }

    // Validate dates if provided
    const startDate = updateData.startDate || program.startDate;
    const endDate = updateData.endDate || program.endDate;
    if (startDate && endDate && new Date(startDate) >= new Date(endDate)) {
      throw new ValidationError('End date must be after start date');
    }

    // Handle status change to published
    if (updateData.status === 'published' && program.status !== 'published') {
      updateData.publishedAt = new Date();
    }

    // Handle status change to archived
    if (updateData.status === 'archived' && program.status !== 'archived') {
      updateData.archivedAt = new Date();
    }

    const oldValues = { ...program.toJSON() };
    await program.update(updateData);

    // Create audit log
    await createAuditLog({
      userId,
      action: 'PROGRAM_UPDATED',
      entityType: 'Program',
      entityId: program.id,
      oldValues: {
        name: oldValues.name,
        status: oldValues.status,
        type: oldValues.type
      },
      newValues: {
        name: program.name,
        status: program.status,
        type: program.type
      }
    });
    if (program.status === 'published') {
      const enrollments = await models.Enrollment.findAll({
        where: {
          programId: program.id,
          status: 'active'
        },
        attributes: ['menteeId'],
        limit: 5000
      });

      if (enrollments.length > 0) {
        await notificationOrchestrator.dispatch({
          eventKey: NOTIFICATION_EVENTS.PROGRAM_UPDATED,
          recipients: enrollments.map((e) => ({ userId: e.menteeId })),
          payload: {
            title: 'Program updated',
            message: `"${program.name}" has been updated.`,
            actionUrl: `/mentee/dashboard`,
            actionLabel: 'View Program',
            relatedEntityType: 'program',
            relatedEntityId: program.id,
            emailSubject: 'Pathment: Program update'
          }
        });
      }
    }
    return program;
  }

  /**
   * Delete program (soft delete)
   */
  async deleteProgram(programId, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions - only creator or admin can delete
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this program');
    }

    // Check if program has active enrollments
    const activeEnrollments = await models.Enrollment.count({
      where: {
        programId,
        status: { [Op.in]: ['active', 'matched', 'pending_match'] }
      }
    });

    if (activeEnrollments > 0) {
      throw new ConflictError(
        `Cannot delete program with ${activeEnrollments} active enrollments. Archive it instead.`
      );
    }

    await program.destroy();

    // Create audit log
    await createAuditLog({
      userId,
      action: 'PROGRAM_DELETED',
      entityType: 'Program',
      entityId: program.id,
      oldValues: {
        name: program.name,
        status: program.status
      }
    });

    return { message: 'Program deleted successfully' };
  }

  /**
   * Enroll mentee in program
   */
  async enrollMentee(programId, menteeId) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check if program is published
    if (program.status !== 'published') {
      throw new ValidationError('Cannot enroll in unpublished program');
    }

    // Check if program has reached max enrollments
    if (program.maxEnrollments && program.currentEnrollments >= program.maxEnrollments) {
      throw new ConflictError('Program has reached maximum enrollment capacity');
    }

    // Check if mentee already enrolled
    const existingEnrollment = await models.Enrollment.findOne({
      where: { menteeId, programId }
    });

    if (existingEnrollment) {
      throw new ConflictError('Already enrolled in this program');
    }

    // Check if user has mentee profile
    const menteeProfile = await models.MenteeProfile.findOne({
      where: { userId: menteeId }
    });

    if (!menteeProfile) {
      throw new ValidationError('User must have a mentee profile to enroll');
    }

    // Create enrollment
    const enrollment = await models.Enrollment.create({
      menteeId,
      programId,
      status: 'pending_match',
      enrolledAt: new Date(),
      expectedCompletionDate: program.endDate
    });

    // Create audit log
    await createAuditLog({
      userId: menteeId,
      action: 'PROGRAM_ENROLLED',
      entityType: 'Enrollment',
      entityId: enrollment.id,
      newValues: {
        programId,
        status: 'pending_match'
      }
    });

    return enrollment;
  }

  /**
   * Get program enrollments (admin/creator only)
   */
  async getProgramEnrollments(programId, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to view program enrollments');
    }

    const enrollments = await models.Enrollment.findAll({
      where: { programId },
      include: [
        {
          model: models.User,
          as: 'mentee',
          attributes: ['id', 'firstName', 'lastName', 'email'],
          include: [
            {
              model: models.MenteeProfile,
              as: 'menteeProfile',
              attributes: ['currentLevel', 'totalPoints']
            }
          ]
        }
      ],
      order: [['enrolledAt', 'DESC']]
    });

    return enrollments;
  }

  /**
   * Clone program (create from template)
   */
  async cloneProgram(programId, userId, customizations = {}) {
    const sourceProgram = await models.Program.findByPk(programId);

    if (!sourceProgram) {
      throw new NotFoundError('Source program not found');
    }

    // Create cloned program
    const clonedData = {
      ...sourceProgram.toJSON(),
      id: undefined,
      createdBy: userId,
      clonedFrom: programId,
      name: customizations.name || `${sourceProgram.name} (Copy)`,
      status: 'draft',
      currentEnrollments: 0,
      rating: 0,
      totalReviews: 0,
      publishedAt: null,
      archivedAt: null,
      createdAt: undefined,
      updatedAt: undefined,
      ...customizations
    };

    const clonedProgram = await models.Program.create(clonedData);

    // Create audit log
    await createAuditLog({
      userId,
      action: 'PROGRAM_CLONED',
      entityType: 'Program',
      entityId: clonedProgram.id,
      newValues: {
        name: clonedProgram.name,
        clonedFrom: programId
      }
    });

    return clonedProgram;
  }

  /**
   * Get program statistics (admin/creator only)
   */
  async getProgramStats(programId, userId, userRole) {
    const program = await models.Program.findByPk(programId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    // Check permissions
    if (userRole !== 'admin' && program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to view program statistics');
    }

    const [enrollmentStats, completionStats] = await Promise.all([
      models.Enrollment.findAll({
        where: { programId },
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      }),
      models.Enrollment.findAll({
        where: { 
          programId,
          status: 'program_completed'
        },
        attributes: [
          [sequelize.fn('AVG', sequelize.col('overall_progress_percentage')), 'avgProgress'],
          [sequelize.fn('AVG', sequelize.col('total_points_earned')), 'avgPoints']
        ],
        raw: true
      })
    ]);

    return {
      program: {
        id: program.id,
        name: program.name,
        status: program.status,
        currentEnrollments: program.currentEnrollments,
        maxEnrollments: program.maxEnrollments,
        rating: program.rating,
        totalReviews: program.totalReviews
      },
      enrollments: {
        byStatus: enrollmentStats,
        total: program.currentEnrollments
      },
      completion: {
        averageProgress: completionStats[0]?.avgProgress || 0,
        averagePoints: completionStats[0]?.avgPoints || 0
      }
    };
  }
}

module.exports = new ProgramService();

