const { models } = require('../db');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors/errorTypes');
const openaiService = require('./openaiService');

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
    const roadmapData = await openaiService.generateRoadmap({
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
      totalWeeks: roadmapData.totalWeeks,
      generatedBy: 'ai',
      aiModel: openaiService.model || 'gpt-4',
      adaptationLevel: 'base',
      promptVersion: '1.0'
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
            weekId: week.id,
            title: taskData.title,
            description: taskData.description,
            type: taskData.type || 'exercise',
            difficulty: taskData.difficulty || 'medium',
            estimatedHours: taskData.estimatedHours || 5,
            orderIndex: taskData.orderIndex || 1,
            acceptanceCriteria: taskData.acceptanceCriteria || [],
            deliverable: taskData.deliverable || 'Task completion'
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
          'orderIndex',
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
      weekId
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
      taskId
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
              weekId: clonedWeek.id,
              title: sourceTask.title,
              description: sourceTask.description,
              type: sourceTask.type,
              difficulty: sourceTask.difficulty,
              estimatedHours: sourceTask.estimatedHours,
              orderIndex: sourceTask.orderIndex,
              acceptanceCriteria: sourceTask.acceptanceCriteria,
              deliverable: sourceTask.deliverable
            });
          }
        }
      }
    }

    return this.getRoadmapById(clonedRoadmap.id);
  }
}

module.exports = new RoadmapService();
