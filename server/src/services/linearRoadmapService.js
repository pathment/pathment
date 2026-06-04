const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const notificationOrchestrator = require('./notificationOrchestrator');
const { NOTIFICATION_EVENTS } = require('../config/notificationMatrix');

/**
 * linearRoadmapService — the new design's linear roadmap flow for mentors:
 * author / import / assign roadmaps as an ordered list of steps, with
 * per-mentee progress and auto-advance on approval. Kept separate from the
 * legacy week-based roadmapService so the admin curriculum flow is untouched.
 *
 * A roadmap's steps are RoadmapTasks linked directly via roadmap_id, ordered
 * by task_order. Org roadmaps (source='org', published) are importable; mentors
 * own 'local' roadmaps.
 */

const ACTIVE_ENROLLMENT_STATUSES = ['active', 'matched', 'approved', 'pending_completion', 'level_completed'];

class LinearRoadmapService {
  async getSteps(roadmapId) {
    return models.RoadmapTask.findAll({
      where: { roadmapId },
      order: [['taskOrder', 'ASC']],
      attributes: ['id', 'title', 'description', 'type', 'difficulty', 'taskOrder', 'deliverable', 'acceptanceCriteria', 'estimatedHours', 'pointsBase', 'effort', 'dueOffsetDays']
    });
  }

  async withSteps(roadmap) {
    const steps = await this.getSteps(roadmap.id);
    const json = roadmap.toJSON ? roadmap.toJSON() : roadmap;
    return { ...json, steps };
  }

  /** Mentor's own local roadmaps + the org library they can import. */
  async listForMentor(mentorId) {
    const [local, org] = await Promise.all([
      models.Roadmap.findAll({ where: { source: 'local', ownerMentorId: mentorId }, order: [['created_at', 'DESC']] }),
      models.Roadmap.findAll({ where: { source: 'org', published: true }, order: [['created_at', 'DESC']] })
    ]);
    const [localWithSteps, orgWithSteps] = await Promise.all([
      Promise.all(local.map((r) => this.withSteps(r))),
      Promise.all(org.map((r) => this.withSteps(r)))
    ]);
    return { local: localWithSteps, org: orgWithSteps };
  }

  async getRoadmap(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    return this.withSteps(roadmap);
  }

  _stepToTask(step, roadmapId, order) {
    return {
      roadmapId,
      title: step.title,
      description: step.description || step.brief || step.title,
      type: step.type || 'project',
      difficulty: step.difficulty || 'medium',
      taskOrder: order,
      deliverable: step.deliverable || step.title,
      acceptanceCriteria: Array.isArray(step.criteria) ? step.criteria : (step.acceptanceCriteria || []),
      estimatedHours: step.estimatedHours || null,
      effort: ['xs', 's', 'm', 'l'].includes(step.effort) ? step.effort : null,
      dueOffsetDays: Number.isFinite(Number(step.dueOffsetDays)) && step.dueOffsetDays !== null && step.dueOffsetDays !== '' ? Number(step.dueOffsetDays) : null,
      isMandatory: true,
      isCustomTask: false,
      pointsBase: step.pointsBase || 10
    };
  }

  async createRoadmap(mentorId, data) {
    const { name, programId, description, skillTags, steps } = data;
    if (!name || !programId) throw new ValidationError('name and programId are required');
    if (!Array.isArray(steps) || steps.length === 0) throw new ValidationError('At least one step is required');

    return sequelize.transaction(async (transaction) => {
      const roadmap = await models.Roadmap.create({
        programId,
        name,
        description: description || null,
        source: 'local',
        published: false,
        ownerMentorId: mentorId,
        skillTags: Array.isArray(skillTags) ? skillTags : [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, roadmap.id, i)),
        { transaction }
      );

      return roadmap;
    }).then((roadmap) => this.getRoadmap(roadmap.id));
  }

  async _assertOwnedLocal(roadmapId, mentorId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    if (roadmap.source !== 'local' || roadmap.ownerMentorId !== mentorId) {
      throw new ForbiddenError('You can only edit your own roadmaps');
    }
    return roadmap;
  }

  async updateRoadmapMeta(mentorId, roadmapId, updates) {
    const roadmap = await this._assertOwnedLocal(roadmapId, mentorId);
    ['name', 'description', 'skillTags'].forEach((k) => {
      if (updates[k] !== undefined) roadmap[k] = updates[k];
    });
    await roadmap.save();
    return this.getRoadmap(roadmapId);
  }

  async addStep(mentorId, roadmapId, step) {
    await this._assertOwnedLocal(roadmapId, mentorId);
    const max = await models.RoadmapTask.max('taskOrder', { where: { roadmapId } });
    const order = (Number.isFinite(max) ? max : -1) + 1;
    await models.RoadmapTask.create(this._stepToTask(step, roadmapId, order));
    return this.getRoadmap(roadmapId);
  }

  async removeStep(mentorId, roadmapId, stepId) {
    await this._assertOwnedLocal(roadmapId, mentorId);
    const assignedCount = await models.AssignedTask.count({ where: { roadmapTaskId: stepId } });
    if (assignedCount > 0) {
      throw new ValidationError('This step has already been assigned to a mentee and cannot be removed');
    }
    await models.RoadmapTask.destroy({ where: { id: stepId, roadmapId } });
    return this.getRoadmap(roadmapId);
  }

  /** Import an org roadmap into a mentor-owned local copy (deep copy of steps). */
  async importOrgRoadmap(mentorId, orgRoadmapId) {
    const org = await models.Roadmap.findByPk(orgRoadmapId);
    if (!org || org.source !== 'org') throw new NotFoundError('Org roadmap not found');
    const steps = await this.getSteps(orgRoadmapId);

    return sequelize.transaction(async (transaction) => {
      const copy = await models.Roadmap.create({
        programId: org.programId,
        name: org.name,
        description: org.description,
        source: 'local',
        published: false,
        importedFrom: org.id,
        ownerMentorId: mentorId,
        skillTags: org.skillTags || [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, copy.id, i)),
        { transaction }
      );

      return copy;
    }).then((copy) => this.getRoadmap(copy.id));
  }

  // ── Admin org-roadmap authoring ───────────────────────────────────────────
  // Admins author the shared org library (source='org'); mentors import + assign.
  async listOrgRoadmaps() {
    const roadmaps = await models.Roadmap.findAll({ where: { source: 'org' }, order: [['created_at', 'DESC']] });
    return Promise.all(roadmaps.map((r) => this.withSteps(r)));
  }

  async createOrgRoadmap(adminId, data) {
    const { name, programId, description, skillTags, steps, published } = data;
    if (!name || !programId) throw new ValidationError('name and programId are required');
    if (!Array.isArray(steps) || steps.length === 0) throw new ValidationError('At least one step is required');

    return sequelize.transaction(async (transaction) => {
      const roadmap = await models.Roadmap.create({
        programId,
        name,
        description: description || null,
        source: 'org',
        published: published !== false,
        ownerMentorId: null,
        skillTags: Array.isArray(skillTags) ? skillTags : [],
        isBaseRoadmap: false,
        totalTasks: steps.length
      }, { transaction });

      await models.RoadmapTask.bulkCreate(
        steps.map((s, i) => this._stepToTask(s, roadmap.id, i)),
        { transaction }
      );
      return roadmap;
    }).then((roadmap) => this.getRoadmap(roadmap.id));
  }

  async _assertOrg(roadmapId) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    if (!roadmap) throw new NotFoundError('Roadmap not found');
    if (roadmap.source !== 'org') throw new ForbiddenError('Not an org roadmap');
    return roadmap;
  }

  async updateOrgMeta(roadmapId, updates) {
    const roadmap = await this._assertOrg(roadmapId);
    ['name', 'description', 'skillTags', 'published'].forEach((k) => {
      if (updates[k] !== undefined) roadmap[k] = updates[k];
    });
    await roadmap.save();
    return this.getRoadmap(roadmapId);
  }

  async addOrgStep(roadmapId, step) {
    await this._assertOrg(roadmapId);
    const max = await models.RoadmapTask.max('taskOrder', { where: { roadmapId } });
    const order = (Number.isFinite(max) ? max : -1) + 1;
    await models.RoadmapTask.create(this._stepToTask(step, roadmapId, order));
    return this.getRoadmap(roadmapId);
  }

  async removeOrgStep(roadmapId, stepId) {
    await this._assertOrg(roadmapId);
    await models.RoadmapTask.destroy({ where: { id: stepId, roadmapId } });
    return this.getRoadmap(roadmapId);
  }

  async deleteOrgRoadmap(roadmapId) {
    await this._assertOrg(roadmapId);
    // Org roadmaps are templates; mentors import a copy, so deleting the org
    // source doesn't touch imported local copies or assigned work.
    await models.RoadmapTask.destroy({ where: { roadmapId } });
    await models.Roadmap.destroy({ where: { id: roadmapId } });
    return { deleted: true };
  }

  // ── Mentee progress view ──────────────────────────────────────────────────
  /** A mentee's active/complete roadmaps with step X/N progress for their UI. */
  async getMenteeRoadmaps(menteeId) {
    const progresses = await models.RoadmapProgress.findAll({ where: { menteeId }, order: [['created_at', 'DESC']] });
    const out = [];
    for (const p of progresses) {
      const roadmap = await models.Roadmap.findByPk(p.roadmapId, { attributes: ['id', 'name', 'description', 'skillTags'] });
      if (!roadmap) continue;
      const steps = await this.getSteps(p.roadmapId);
      const total = steps.length;
      const currentStep = Math.min(p.currentStep, total);
      out.push({
        roadmapId: roadmap.id,
        name: roadmap.name,
        description: roadmap.description,
        skillTags: roadmap.skillTags || [],
        currentStep,
        totalSteps: total,
        completed: !!p.completed,
        percent: total > 0 ? Math.round((currentStep / total) * 100) : 0,
        currentStepTitle: !p.completed && steps[currentStep] ? steps[currentStep].title : null,
        steps: steps.map((s, i) => ({ id: s.id, title: s.title, type: s.type, done: i < currentStep, current: !p.completed && i === currentStep }))
      });
    }
    return out;
  }

  async _activeEnrollment(menteeId) {
    const enrollments = await models.Enrollment.findAll({ where: { menteeId } });
    return enrollments.find((e) => ACTIVE_ENROLLMENT_STATUSES.includes(e.status))
      || [...enrollments].sort((a, b) => new Date(b.enrolledAt || 0) - new Date(a.enrolledAt || 0))[0]
      || null;
  }

  async _assignStep(step, menteeId, mentorId, enrollmentId) {
    const existing = await models.AssignedTask.findOne({ where: { roadmapTaskId: step.id, menteeId } });
    if (existing) return existing;
    const due = new Date();
    const offset = Number.isFinite(Number(step.dueOffsetDays)) && step.dueOffsetDays != null ? Number(step.dueOffsetDays) : 7;
    due.setDate(due.getDate() + offset);
    const assigned = await models.AssignedTask.create({
      roadmapTaskId: step.id,
      menteeId,
      mentorId,
      enrollmentId,
      status: 'assigned',
      assignedAt: new Date(),
      dueDate: due,
      isCustomTask: false
    });

    // Notify the mentee (roadmap-assigned tasks notify just like custom ones).
    notificationOrchestrator.dispatch({
      eventKey: NOTIFICATION_EVENTS.TASK_ASSIGNED,
      recipients: [{ userId: menteeId }],
      payload: {
        title: 'New task assigned',
        message: `A new task "${step.title || 'Task'}" was added to your roadmap.`,
        actionUrl: `/mentee/tasks/${assigned.id}`,
        actionLabel: 'Open Task',
        relatedEntityType: 'assigned_task',
        relatedEntityId: assigned.id,
        emailSubject: 'Pathment: New task assigned'
      },
      dedupe: { relatedEntityType: 'task_assigned', relatedEntityId: assigned.id }
    }).catch((e) => console.error('[Roadmap] assign notification failed:', e.message));

    return assigned;
  }

  /** Assign a roadmap to a mentee starting at a given step, and assign that step. */
  async assignToMentee(mentorId, roadmapId, menteeId, startStep = 0, slot = null) {
    const roadmap = await models.Roadmap.findByPk(roadmapId);
    const steps = await this.getSteps(roadmapId);
    if (!steps.length) throw new ValidationError('This roadmap has no steps to assign');
    const idx = Math.max(0, Math.min(startStep, steps.length - 1));

    let enrollment = await this._activeEnrollment(menteeId);
    if (!enrollment) {
      // Self-heal: a clan-placed mentee may not have an enrollment yet. Create
      // one in the roadmap's program rather than failing the assignment.
      if (!roadmap?.programId) throw new ValidationError('Mentee has no enrollment to attach this work to');
      enrollment = await models.Enrollment.create({
        menteeId, programId: roadmap.programId, status: 'active', enrolledAt: new Date()
      });
    }

    return sequelize.transaction(async (transaction) => {
      let progress = await models.RoadmapProgress.findOne({ where: { roadmapId, menteeId }, transaction });
      if (progress) {
        progress.currentStep = idx;
        progress.completed = false;
        progress.enrollmentId = enrollment.id;
        if (slot) progress.slot = slot;
        await progress.save({ transaction });
      } else {
        progress = await models.RoadmapProgress.create({
          roadmapId, menteeId, enrollmentId: enrollment.id, currentStep: idx, completed: false, slot: slot || null
        }, { transaction });
      }
      return progress;
    }).then(async (progress) => {
      // Assign the starting step (outside the txn is fine; idempotent).
      await this._assignStep(steps[idx], menteeId, mentorId, enrollment.id);
      return progress;
    });
  }

  /**
   * Chain advance: after a roadmap completes, if it sits in one of the mentee's
   * schedule slots (a roadmapChain) and there's a next roadmap, auto-start it.
   * Returns the next roadmap id, or null if no chain continuation.
   */
  async _advanceChain(menteeId, completedRoadmapId, prevAssignment) {
    if (!models.MenteeSchedule) return null;
    const ms = await models.MenteeSchedule.findOne({ where: { menteeId } });
    if (!ms || !Array.isArray(ms.schedule)) return null;
    const slot = ms.schedule.find((s) => s.kind === 'roadmap' && Array.isArray(s.roadmapChain) && s.roadmapChain.includes(completedRoadmapId));
    if (!slot) return null;
    const i = slot.roadmapChain.indexOf(completedRoadmapId);
    const nextId = slot.roadmapChain[i + 1];
    if (!nextId) return null;

    const steps = await this.getSteps(nextId);
    if (!steps.length) return null;
    const enrollment = await this._activeEnrollment(menteeId);

    let existing = await models.RoadmapProgress.findOne({ where: { roadmapId: nextId, menteeId } });
    if (existing && !existing.completed) return null; // already active — don't disturb
    if (existing) {
      existing.currentStep = 0; existing.completed = false; existing.slot = slot.id;
      if (enrollment) existing.enrollmentId = enrollment.id;
      await existing.save();
    } else {
      await models.RoadmapProgress.create({ roadmapId: nextId, menteeId, enrollmentId: enrollment?.id || null, currentStep: 0, slot: slot.id, completed: false });
    }
    if (steps[0] && enrollment && prevAssignment) {
      await this._assignStep(steps[0], menteeId, prevAssignment.mentorId, enrollment.id);
    }
    return nextId;
  }

  /** Start the head roadmap of a slot's chain (used when a roadmap slot is filled). */
  async startChainHead(mentorId, menteeId, slotId, roadmapChain) {
    if (!Array.isArray(roadmapChain) || !roadmapChain.length) return null;
    const headId = roadmapChain[0];
    const existing = await models.RoadmapProgress.findOne({ where: { roadmapId: headId, menteeId } });
    if (existing) return null; // already started
    return this.assignToMentee(mentorId, headId, menteeId, 0, slotId);
  }

  async bulkAssign(mentorId, roadmapId, menteeIds = [], startStep = 0) {
    const results = [];
    for (const menteeId of menteeIds) {
      try {
        await this.assignToMentee(mentorId, roadmapId, menteeId, startStep);
        results.push({ menteeId, ok: true });
      } catch (error) {
        results.push({ menteeId, ok: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Auto-advance on approval: when a roadmap-linked task is approved, advance
   * the mentee's progress and assign the next step. Safe to call always — it
   * no-ops for tasks that aren't part of a tracked roadmap.
   */
  async advanceOnApproval(menteeId, roadmapTaskId) {
    const task = await models.RoadmapTask.findByPk(roadmapTaskId, { attributes: ['id', 'roadmapId'] });
    if (!task || !task.roadmapId) return null;

    const progress = await models.RoadmapProgress.findOne({ where: { roadmapId: task.roadmapId, menteeId } });
    if (!progress) return null;

    const steps = await this.getSteps(task.roadmapId);
    const currentIdx = steps.findIndex((s) => s.id === roadmapTaskId);
    if (currentIdx === -1) return null;

    // Mentor of the completed assignment — reused for the next step / chained roadmap.
    const prevAssignment = await models.AssignedTask.findOne({
      where: { roadmapTaskId, menteeId },
      attributes: ['mentorId', 'enrollmentId']
    });

    const nextIdx = currentIdx + 1;
    if (nextIdx >= steps.length) {
      progress.currentStep = steps.length;
      progress.completed = true;
      await progress.save();
      const chainedTo = await this._advanceChain(menteeId, task.roadmapId, prevAssignment);
      return chainedTo ? { completed: true, chainedTo } : { completed: true };
    }

    progress.currentStep = nextIdx;
    await progress.save();

    // Assign the next step using the same mentor as the completed assignment.
    if (prevAssignment) {
      await this._assignStep(steps[nextIdx], menteeId, prevAssignment.mentorId, prevAssignment.enrollmentId);
    }
    return { advancedTo: nextIdx };
  }
}

module.exports = new LinearRoadmapService();
