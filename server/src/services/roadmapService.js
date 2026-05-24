const { models } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const groqService = require('./groqService');

class RoadmapService {
  /**
   * Generate AI roadmap for a level
   */
  async generateRoadmap(programId, levelId, userId, additionalInstructions = '') {
    // Get program and level
    const program = await models.Program.findByPk(programId);
    const level = await models.ProgramLevel.findByPk(levelId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (!level || level.programId !== programId) {
      throw new NotFoundError('Level not found in this program');
    }

    // Check permissions
    if (program.createdBy !== userId) {
      // TODO: Add admin check
      throw new ForbiddenError('You do not have permission to generate roadmap');
    }

    // Generate roadmap using OpenAI
    const roadmapData = await groqService.generateRoadmap({
      programName: program.name,
      programDescription: program.description,
      programType: program.type,
      levelName: level.name,
      levelDuration: level.durationWeeks,
      learningOutcomes: level.learningOutcomes,
      prerequisites: level.prerequisites,
      tags: program.tags,
      additionalInstructions
    });

    // Create roadmap
    const roadmap = await models.Roadmap.create({
      programId,
      levelId,
      name: `${level.name} - AI Generated Roadmap`,
      description: `AI-generated learning roadmap for ${level.name} level of ${program.name}`,
      totalWeeks: roadmapData.totalWeeks,
      generatedByAi: true,
      aiModelVersion: groqService.model || 'llama-3.1-8b-instant',
      isBaseRoadmap: true
    });

    // Create weeks and tasks
    for (const weekData of roadmapData.weeks) {
      const week = await models.RoadmapWeek.create({
        roadmapId: roadmap.id,
        weekNumber: weekData.weekNumber,
        title: weekData.title,
        objectives: weekData.objectives || [],
        milestone: weekData.milestone
      });

      if (weekData.tasks && Array.isArray(weekData.tasks)) {
        for (const taskData of weekData.tasks) {
          await models.RoadmapTask.create({
            roadmapWeekId: week.id,
            title: taskData.title,
            description: taskData.description,
            type: taskData.type || 'exercise',
            difficulty: taskData.difficulty || 'medium',
            estimatedHours: taskData.estimatedHours || 5,
            taskOrder: taskData.orderIndex || 1,
            acceptanceCriteria: taskData.acceptanceCriteria || [],
            deliverable: taskData.deliverable || 'Task completion',
            pointsBase: taskData.points || 10 
          });
        }
      }
    }

    return this.getRoadmapById(roadmap.id);
  }

  /**
   * Get roadmap by ID with full details
   */
  async getRoadmapById(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId, {
      include: [
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'description']
        },
        {
          model: models.ProgramLevel,
          as: 'level',
          attributes: ['id', 'name', 'durationWeeks', 'learningOutcomes']
        },
        {
          model: models.RoadmapWeek,
          as: 'weeks',
          include: [
            {
              model: models.RoadmapTask,
              as: 'tasks'
            }
          ],
          order: [['weekNumber', 'ASC']]
        }
      ],
      order: [
        [{ model: models.RoadmapWeek, as: 'weeks' }, 'weekNumber', 'ASC'],
        [
          { model: models.RoadmapWeek, as: 'weeks' },
          { model: models.RoadmapTask, as: 'tasks' },
          'taskOrder',
          'ASC'
        ]
      ]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found');
    }

    return roadmap;
  }

  /**
   * Update roadmap week
   */
  async updateWeek(weekId, data, userId) {
    const week = await models.RoadmapWeek.findByPk(weekId, {
      include: [
        {
          model: models.Roadmap,
          as: 'roadmap',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!week) {
      throw new NotFoundError('Week not found');
    }

    // Check permissions
    if (week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this week');
    }

    await week.update(data);
    return week;
  }

  /**
   * Create task in a week
   */
  async createTask(weekId, data, userId) {
    const week = await models.RoadmapWeek.findByPk(weekId, {
      include: [
        {
          model: models.Roadmap,
          as: 'roadmap',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!week) {
      throw new NotFoundError('Week not found');
    }

    // Check permissions
    if (week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to add tasks');
    }

    const task = await models.RoadmapTask.create({
      ...data,
      roadmapWeekId: weekId,
      taskOrder: data.taskOrder || data.orderIndex || 1,
      deliverable: data.deliverable || 'Complete the assigned task'
    });

    return task;
  }

  /**
   * Update task
   */
  async updateTask(taskId, data, userId) {
    const task = await models.RoadmapTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapWeek,
          as: 'week',
          include: [
            {
              model: models.Roadmap,
              as: 'roadmap',
              include: [{ model: models.Program, as: 'program' }]
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check permissions
    if (task.week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    await task.update(data);
    return task;
  }

  /**
   * Delete task
   */
  async deleteTask(taskId, userId) {
    const task = await models.RoadmapTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapWeek,
          as: 'week',
          include: [
            {
              model: models.Roadmap,
              as: 'roadmap',
              include: [{ model: models.Program, as: 'program' }]
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check permissions
    if (task.week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this task');
    }

    // Delete associated resources, skills, analytics, and assigned tasks
    await models.TaskResource.destroy({ where: { roadmapTaskId: taskId } });
    await models.TaskSkill.destroy({ where: { roadmapTaskId: taskId } });
    await models.TaskAnalytics.destroy({ where: { roadmapTaskId: taskId } });
    await models.AssignedTask.destroy({ where: { roadmapTaskId: taskId } });
    await task.destroy();
    return { message: 'Task deleted successfully' };
  }

  /**
   * Add resource to task
   */
  async addTaskResource(taskId, data, userId) {
    const task = await models.RoadmapTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapWeek,
          as: 'week',
          include: [
            {
              model: models.Roadmap,
              as: 'roadmap',
              include: [{ model: models.Program, as: 'program' }]
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check permissions
    if (task.week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to add resources');
    }

    const resource = await models.TaskResource.create({
      ...data,
      roadmapTaskId: taskId
    });

    return resource;
  }

  /**
   * Get roadmaps for a program
   */
  async getProgramRoadmaps(programId) {
    const roadmaps = await models.Roadmap.findAll({
      where: { programId },
      include: [
        {
          model: models.ProgramLevel,
          as: 'level',
          attributes: ['id', 'name', 'durationWeeks']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return roadmaps;
  }

  /**
   * Get roadmaps for a level
   */
  async getLevelRoadmaps(levelId) {
    const roadmaps = await models.Roadmap.findAll({
      where: { levelId },
      include: [
        {
          model: models.RoadmapWeek,
          as: 'weeks',
          attributes: ['id', 'weekNumber', 'title']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    return roadmaps;
  }

  /**
   * Clone roadmap for adaptation
   */
  async cloneRoadmap(roadmapId, adaptationLevel, userId) {
    const sourceRoadmap = await this.getRoadmapById(roadmapId);

    if (!sourceRoadmap) {
      throw new NotFoundError('Source roadmap not found');
    }

    // Check permissions
    if (sourceRoadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to clone this roadmap');
    }

    // Create cloned roadmap
    const clonedRoadmap = await models.Roadmap.create({
      programId: sourceRoadmap.programId,
      levelId: sourceRoadmap.levelId,
      totalWeeks: sourceRoadmap.totalWeeks,
      generatedBy: 'cloned',
      adaptationLevel,
      basedOnRoadmapId: roadmapId
    });

    // Clone weeks and tasks
    if (sourceRoadmap.weeks) {
      for (const sourceWeek of sourceRoadmap.weeks) {
        const clonedWeek = await models.RoadmapWeek.create({
          roadmapId: clonedRoadmap.id,
          weekNumber: sourceWeek.weekNumber,
          title: sourceWeek.title,
          objectives: sourceWeek.objectives,
          milestone: sourceWeek.milestone
        });

        if (sourceWeek.tasks) {
          for (const sourceTask of sourceWeek.tasks) {
            await models.RoadmapTask.create({
              roadmapWeekId: clonedWeek.id,
              title: sourceTask.title,
              description: sourceTask.description,
              type: sourceTask.type,
              difficulty: sourceTask.difficulty,
              estimatedHours: sourceTask.estimatedHours,
              taskOrder: sourceTask.taskOrder || sourceTask.orderIndex || 1,
              acceptanceCriteria: sourceTask.acceptanceCriteria,
              deliverable: sourceTask.deliverable || 'Complete the assigned task',
              pointsBase: sourceTask.pointsBase || 10
            });
          }
        }
      }
    }

    return this.getRoadmapById(clonedRoadmap.id);
  }

  /**
   * Create manual roadmap (non-AI)
   */
  async createRoadmap(programId, levelId, data, userId) {
    // Get program and level
    const program = await models.Program.findByPk(programId);
    const level = await models.ProgramLevel.findByPk(levelId);

    if (!program) {
      throw new NotFoundError('Program not found');
    }

    if (!level || level.programId !== programId) {
      throw new NotFoundError('Level not found in this program');
    }

    // Check permissions
    if (program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to create roadmap');
    }

    // Create roadmap
    const roadmap = await models.Roadmap.create({
      programId,
      levelId,
      totalWeeks: data.totalWeeks,
      generatedBy: data.generatedBy || 'manual',
      adaptationLevel: 'base'
    });

    // Create weeks and tasks if provided
    if (data.weeks && Array.isArray(data.weeks)) {
      for (const weekData of data.weeks) {
        const week = await models.RoadmapWeek.create({
          roadmapId: roadmap.id,
          weekNumber: weekData.weekNumber,
          title: weekData.title,
          objectives: weekData.objectives || [],
          milestone: weekData.milestone || ''
        });

        if (weekData.tasks && Array.isArray(weekData.tasks)) {
          for (const taskData of weekData.tasks) {
            await models.RoadmapTask.create({
              roadmapWeekId: week.id,
              title: taskData.title,
              description: taskData.description,
              type: taskData.type || 'exercise',
              difficulty: taskData.difficulty || 'medium',
              estimatedHours: taskData.estimatedHours || 5,
              taskOrder: taskData.taskOrder || taskData.orderIndex || 1,
              acceptanceCriteria: taskData.acceptanceCriteria || [],
              deliverable: taskData.deliverable || 'Task completion',
              pointsBase: taskData.pointsBase || taskData.points || 10 
            });
          }
        }
      }
    }

    return this.getRoadmapById(roadmap.id);
  }

  /**
   * Get roadmap for a specific level
   */
  async getLevelRoadmap(programId, levelId) {
    const roadmap = await models.Roadmap.findOne({
      where: { programId, levelId },
      include: [
        {
          model: models.Program,
          as: 'program',
          attributes: ['id', 'name', 'type', 'description']
        },
        {
          model: models.ProgramLevel,
          as: 'level',
          attributes: ['id', 'name', 'durationWeeks', 'learningOutcomes']
        },
        {
          model: models.RoadmapWeek,
          as: 'weeks',
          include: [
            {
              model: models.RoadmapTask,
              as: 'tasks'
            }
          ],
          order: [['weekNumber', 'ASC']]
        }
      ],
      order: [
        [{ model: models.RoadmapWeek, as: 'weeks' }, 'weekNumber', 'ASC'],
        [
          { model: models.RoadmapWeek, as: 'weeks' },
          { model: models.RoadmapTask, as: 'tasks' },
          'taskOrder',
          'ASC'
        ]
      ]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found for this level');
    }

    return roadmap;
  }

  /**
   * Update roadmap
   */
  async updateRoadmap(roadmapId, data, userId, userRole) {
    const roadmap = await models.Roadmap.findByPk(roadmapId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found');
    }

    // Check permissions
    if (userRole !== 'admin' && roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this roadmap');
    }

    await roadmap.update(data);
    return this.getRoadmapById(roadmapId);
  }

  /**
   * Delete roadmap
   */
  async deleteRoadmap(roadmapId, userId, userRole) {
    const roadmap = await models.Roadmap.findByPk(roadmapId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found');
    }

    // Check permissions
    if (userRole !== 'admin' && roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this roadmap');
    }

    // Delete all associated weeks and tasks
    const weeks = await models.RoadmapWeek.findAll({ where: { roadmapId } });
    for (const week of weeks) {
      await models.RoadmapTask.destroy({ where: { roadmapWeekId: week.id } });
      await week.destroy();
    }

    await roadmap.destroy();
    return { message: 'Roadmap deleted successfully' };
  }

  /**
   * Add week to roadmap
   */
  async addWeek(roadmapId, data, userId, userRole) {
    const roadmap = await models.Roadmap.findByPk(roadmapId, {
      include: [{ model: models.Program, as: 'program' }]
    });

    if (!roadmap) {
      throw new NotFoundError('Roadmap not found');
    }

    // Check permissions
    if (userRole !== 'admin' && roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to add weeks');
    }

    const week = await models.RoadmapWeek.create({
      roadmapId,
      ...data
    });

    return week;
  }

  /**
   * Update week
   */
  async updateWeek(weekId, data, userId, userRole) {
    const week = await models.RoadmapWeek.findByPk(weekId, {
      include: [
        {
          model: models.Roadmap,
          as: 'roadmap',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!week) {
      throw new NotFoundError('Week not found');
    }

    // Check permissions
    if (userRole !== 'admin' && week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this week');
    }

    await week.update(data);
    return week;
  }

  /**
   * Delete week
   */
  async deleteWeek(weekId, userId, userRole) {
    const week = await models.RoadmapWeek.findByPk(weekId, {
      include: [
        {
          model: models.Roadmap,
          as: 'roadmap',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!week) {
      throw new NotFoundError('Week not found');
    }

    // Check permissions
    if (userRole !== 'admin' && week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this week');
    }

    // Delete all tasks in this week
    await models.RoadmapTask.destroy({ where: { roadmapWeekId: weekId } });
    await week.destroy();

    return { message: 'Week deleted successfully' };
  }

  /**
   * Add task to week
   */
  async addTask(weekId, data, userId, userRole) {
    const week = await models.RoadmapWeek.findByPk(weekId, {
      include: [
        {
          model: models.Roadmap,
          as: 'roadmap',
          include: [{ model: models.Program, as: 'program' }]
        }
      ]
    });

    if (!week) {
      throw new NotFoundError('Week not found');
    }

    // Check permissions
    if (userRole !== 'admin' && week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to add tasks');
    }

    const task = await models.RoadmapTask.create({
      roadmapWeekId: weekId,
      ...data,
      // Map orderIndex → taskOrder (model field), auto-assign if missing
      taskOrder: data.taskOrder || data.orderIndex ||
        ((await models.RoadmapTask.count({ where: { roadmapWeekId: weekId } })) + 1),
      // deliverable is NOT NULL in the model, provide default if omitted
      deliverable: data.deliverable || 'Complete the assigned task',
    });

    // Add resources if provided
    if (data.resources && Array.isArray(data.resources)) {
      for (const resourceData of data.resources) {
        await models.TaskResource.create({
          roadmapTaskId: task.id,
          ...resourceData
        });
      }
    }

    return task;
  }

  /**
   * Update task
   */
  async updateTask(taskId, data, userId, userRole) {
    const task = await models.RoadmapTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapWeek,
          as: 'week',
          include: [
            {
              model: models.Roadmap,
              as: 'roadmap',
              include: [{ model: models.Program, as: 'program' }]
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check permissions
    if (userRole !== 'admin' && task.week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to update this task');
    }

    await task.update(data);
    return task;
  }

  /**
   * Delete task
   */
  async deleteTask(taskId, userId, userRole) {
    const task = await models.RoadmapTask.findByPk(taskId, {
      include: [
        {
          model: models.RoadmapWeek,
          as: 'week',
          include: [
            {
              model: models.Roadmap,
              as: 'roadmap',
              include: [{ model: models.Program, as: 'program' }]
            }
          ]
        }
      ]
    });

    if (!task) {
      throw new NotFoundError('Task not found');
    }

    // Check permissions
    if (userRole !== 'admin' && task.week.roadmap.program.createdBy !== userId) {
      throw new ForbiddenError('You do not have permission to delete this task');
    }

    // Delete associated resources, skills, analytics, and assigned tasks
    await models.TaskResource.destroy({ where: { roadmapTaskId: taskId } });
    await models.TaskSkill.destroy({ where: { roadmapTaskId: taskId } });
    await models.TaskAnalytics.destroy({ where: { roadmapTaskId: taskId } });
    await models.AssignedTask.destroy({ where: { roadmapTaskId: taskId } });
    await task.destroy();

    return { message: 'Task deleted successfully' };
  }
}

module.exports = new RoadmapService();
