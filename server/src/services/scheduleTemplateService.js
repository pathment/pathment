const { Op } = require('sequelize');
const { models } = require('../db');
const { NotFoundError, ValidationError } = require('../utils/errors/errorTypes');
const linearRoadmapService = require('./linearRoadmapService');

/**
 * scheduleTemplateService - reusable day-shape templates + per-mentee filled
 * schedules. A template's blocks (pure structure) seed a mentee's slots on
 * assignment; each slot is then filled (roadmap chain / recurring / empty).
 */

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'slot';

class ScheduleTemplateService {
  // ── Templates ─────────────────────────────────────────────────────────────
  async listForMentor(mentorId) {
    const [local, org] = await Promise.all([
      models.ScheduleTemplate.findAll({ where: { source: 'mentor', ownerMentorId: mentorId }, order: [['created_at', 'DESC']] }),
      models.ScheduleTemplate.findAll({ where: { source: 'org' }, order: [['created_at', 'DESC']] })
    ]);
    return { local, org };
  }

  async createTemplate(mentorId, { name, description, blocks }) {
    if (!name || !name.trim()) throw new ValidationError('name is required');
    return models.ScheduleTemplate.create({
      name: name.trim(),
      description: description || null,
      source: 'mentor',
      ownerMentorId: mentorId,
      blocks: this._normalizeBlocks(blocks),
      createdBy: mentorId
    });
  }

  async updateTemplate(mentorId, id, updates) {
    const t = await models.ScheduleTemplate.findByPk(id);
    if (!t) throw new NotFoundError('Template not found');
    if (t.source !== 'mentor' || t.ownerMentorId !== mentorId) throw new ValidationError('You can only edit your own templates');
    if (updates.name !== undefined) t.name = updates.name;
    if (updates.description !== undefined) t.description = updates.description;
    if (updates.blocks !== undefined) t.blocks = this._normalizeBlocks(updates.blocks);
    await t.save();
    return t;
  }

  async deleteTemplate(mentorId, id) {
    const t = await models.ScheduleTemplate.findByPk(id);
    if (!t) throw new NotFoundError('Template not found');
    if (t.source !== 'mentor' || t.ownerMentorId !== mentorId) throw new ValidationError('You can only delete your own templates');
    await t.destroy();
    return { deleted: true };
  }

  // ── Admin org templates (the shared library mentors import) ────────────────
  async listOrgTemplates() {
    return models.ScheduleTemplate.findAll({ where: { source: 'org' }, order: [['created_at', 'DESC']] });
  }

  async createOrgTemplate(adminId, { name, description, blocks }) {
    if (!name || !name.trim()) throw new ValidationError('name is required');
    return models.ScheduleTemplate.create({
      name: name.trim(),
      description: description || null,
      source: 'org',
      ownerMentorId: null,
      blocks: this._normalizeBlocks(blocks),
      createdBy: adminId
    });
  }

  async updateOrgTemplate(id, updates) {
    const t = await models.ScheduleTemplate.findByPk(id);
    if (!t || t.source !== 'org') throw new NotFoundError('Org template not found');
    if (updates.name !== undefined) t.name = updates.name;
    if (updates.description !== undefined) t.description = updates.description;
    if (updates.blocks !== undefined) t.blocks = this._normalizeBlocks(updates.blocks);
    await t.save();
    return t;
  }

  async deleteOrgTemplate(id) {
    const t = await models.ScheduleTemplate.findByPk(id);
    if (!t || t.source !== 'org') throw new NotFoundError('Org template not found');
    await t.destroy();
    return { deleted: true };
  }

  /** Import an org template into a mentor-owned copy. */
  async importTemplate(mentorId, orgId) {
    const org = await models.ScheduleTemplate.findByPk(orgId);
    if (!org || org.source !== 'org') throw new NotFoundError('Org template not found');
    return models.ScheduleTemplate.create({
      name: org.name,
      description: org.description,
      source: 'mentor',
      ownerMentorId: mentorId,
      blocks: org.blocks || [],
      createdBy: mentorId
    });
  }

  _normalizeBlocks(blocks) {
    if (!Array.isArray(blocks)) return [];
    // Ids must be UNIQUE within a template: two blocks labelled the same slug to
    // the same id, which collides as a React key AND makes the mentee's daily-log
    // check-off toggle both at once. Suffix repeats to keep each block distinct.
    const seen = new Set();
    return blocks.map((b, i) => {
      let id = b.id || slug(b.label) || `block-${i}`;
      if (seen.has(id)) { let n = 2; while (seen.has(`${id}-${n}`)) n += 1; id = `${id}-${n}`; }
      seen.add(id);
      return {
        id,
        label: b.label || `Block ${i + 1}`,
        time: b.time || 'Flexible',
        days: ['everyday', 'weekdays', 'weekends'].includes(b.days) ? b.days : 'everyday',
        bookable: !!b.bookable
      };
    });
  }

  // ── Assignment + per-mentee schedule ───────────────────────────────────────
  async assignToMentees(templateId, menteeIds, assignedBy) {
    const t = await models.ScheduleTemplate.findByPk(templateId);
    if (!t) throw new NotFoundError('Template not found');
    if (!Array.isArray(menteeIds) || !menteeIds.length) throw new ValidationError('menteeIds required');

    // blocks → empty SlotConfig[]
    const slots = (t.blocks || []).map((b) => ({
      id: b.id,
      label: b.label,
      time: b.time,
      days: b.days || 'everyday',
      kind: 'empty',
      roadmapChain: [],
      recurring: null,
      bookable: !!b.bookable
    }));

    const results = [];
    for (const menteeId of menteeIds) {
      let ms = await models.MenteeSchedule.findOne({ where: { menteeId } });
      if (ms) {
        ms.templateId = templateId;
        ms.schedule = slots;
        ms.assignedBy = assignedBy;
        ms.assignedAt = new Date();
        await ms.save();
      } else {
        ms = await models.MenteeSchedule.create({ menteeId, templateId, schedule: slots, assignedBy });
      }
      results.push({ menteeId, ok: true });
    }
    return results;
  }

  async getMenteeSchedule(menteeId) {
    const ms = await models.MenteeSchedule.findOne({
      where: { menteeId },
      include: [{ model: models.ScheduleTemplate, as: 'template', attributes: ['id', 'name'] }]
    });
    if (!ms) return null;
    const schedule = await this._enrichSchedule(menteeId, Array.isArray(ms.schedule) ? ms.schedule : []);
    return { templateId: ms.templateId, templateName: ms.template?.name || null, schedule };
  }

  /**
   * Attach live roadmap info to each roadmap slot: every roadmap in the chain
   * gets its name + this mentee's actual progress (started? how many steps done?).
   * This is what powers the read-only "this mentee's week" views (mentor + admin)
   * AND lets the Fill editor warn "already started" instead of silently no-op'ing.
   * Read-only enrichment under `chainDetails` — the editor's own fields are untouched.
   */
  async _enrichSchedule(menteeId, schedule) {
    const ids = new Set();
    schedule.forEach((s) => { if (s.kind === 'roadmap') (s.roadmapChain || []).forEach((r) => r && ids.add(r)); });
    if (!ids.size) return schedule.map((s) => ({ ...s }));

    const idList = [...ids];
    const [roadmaps, progresses] = await Promise.all([
      models.Roadmap.findAll({ where: { id: { [Op.in]: idList } }, attributes: ['id', 'name', 'totalTasks'] }),
      models.RoadmapProgress.findAll({ where: { roadmapId: { [Op.in]: idList }, menteeId } }),
    ]);
    const nameById = new Map(roadmaps.map((r) => [r.id, r.name]));
    const totalById = new Map(roadmaps.map((r) => [r.id, r.totalTasks || 0]));
    const progById = new Map(progresses.map((p) => [p.roadmapId, p]));

    return schedule.map((s) => {
      if (s.kind !== 'roadmap' || !Array.isArray(s.roadmapChain) || !s.roadmapChain.length) return { ...s };
      const chainDetails = s.roadmapChain.map((rid) => {
        const p = progById.get(rid);
        const total = totalById.get(rid) || 0;
        const current = p ? Math.min(p.currentStep || 0, total) : 0;
        return {
          id: rid,
          name: nameById.get(rid) || 'Roadmap',
          started: !!p,
          completed: !!(p && p.completed),
          currentStep: current,
          totalSteps: total,
          percent: total > 0 ? Math.round((current / total) * 100) : 0,
        };
      });
      return { ...s, chainDetails };
    });
  }

  /** Fill/clear one slot: kind 'roadmap' (roadmapChain) | 'recurring' (recurring) | 'empty'. */
  async updateSlot(menteeId, slotId, patch, mentorId = null) {
    const ms = await models.MenteeSchedule.findOne({ where: { menteeId } });
    if (!ms) throw new NotFoundError('Mentee has no schedule assigned');
    const schedule = Array.isArray(ms.schedule) ? ms.schedule : [];
    const idx = schedule.findIndex((s) => s.id === slotId);
    if (idx === -1) throw new NotFoundError('Slot not found');

    const slot = { ...schedule[idx] };
    const kind = patch.kind;
    if (kind && !['roadmap', 'recurring', 'empty'].includes(kind)) throw new ValidationError('Invalid slot kind');
    if (kind) slot.kind = kind;

    if (slot.kind === 'roadmap') {
      slot.roadmapChain = Array.isArray(patch.roadmapChain) ? patch.roadmapChain : (slot.roadmapChain || []);
      // Which step of the FIRST roadmap to start the mentee at (skip known steps).
      slot.startStep = Number.isInteger(patch.startStep) ? Math.max(0, patch.startStep) : (slot.startStep || 0);
      slot.recurring = null;
    } else if (slot.kind === 'recurring') {
      slot.recurring = patch.recurring || slot.recurring || null;
      slot.roadmapChain = [];
    } else if (slot.kind === 'empty') {
      slot.roadmapChain = [];
      slot.recurring = null;
    }
    if (patch.bookable !== undefined) slot.bookable = !!patch.bookable;

    schedule[idx] = slot;
    ms.schedule = schedule;
    ms.changed('schedule', true);
    await ms.save();

    // Filling a roadmap slot kicks off the chain's first roadmap (non-fatal if the
    // mentee can't be assigned yet - e.g. no enrollment).
    let chainStarted = null;
    if (slot.kind === 'roadmap' && mentorId && Array.isArray(slot.roadmapChain) && slot.roadmapChain.length) {
      try {
        const started = await linearRoadmapService.startChainHead(mentorId, menteeId, slot.id, slot.roadmapChain, slot.startStep || 0);
        if (started) chainStarted = slot.roadmapChain[0];
      } catch (_) { /* slot config still saved; start is best-effort */ }
    }
    return { ...slot, chainStarted };
  }

  /**
   * Apply one slot's config (kind + roadmapChain/recurring) to EVERY mentee this
   * mentor assigned the schedule to, for the matching slot id. The "40 students"
   * shortcut: configure a block once, push it to all, then tweak individuals.
   * Returns { applied } (how many mentee schedules had the slot).
   */
  async applySlotToAll(mentorId, slotId, patch) {
    const schedules = await models.MenteeSchedule.findAll({ where: { assignedBy: mentorId } });
    let applied = 0;
    for (const ms of schedules) {
      const sched = Array.isArray(ms.schedule) ? ms.schedule : [];
      if (!sched.some((s) => s.id === slotId)) continue;
      await this.updateSlot(ms.menteeId, slotId, patch, mentorId); // reuse single-slot logic (incl. chain start)
      applied += 1;
    }
    return { applied };
  }
}

module.exports = new ScheduleTemplateService();
