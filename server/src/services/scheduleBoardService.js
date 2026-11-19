const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const authz = require('./authzService');
const { PERMISSIONS } = require('../config/permissions');
const { NotFoundError, ValidationError, ForbiddenError } = require('../utils/errors/errorTypes');
const clanLifecycleService = require('./clanLifecycleService');
const { todayInZone, endOfDayInZone } = require('../utils/timezone');
const { normalizeRepeat, nextOccurrence, describeRepeat } = require('../utils/repeatRule');
const { listMenteeClans, clanScopedWhere } = require('./menteeClanScope');
const logger = require('../utils/logger');

/**
 * A day as blocks that hold things.
 *
 * A schedule slot used to be a RULE ("make a discussion task every Monday") or
 * a POINTER ("work through these roadmaps"). It was never "here are the three
 * things in this block today", which is why nothing could be dragged into a
 * block, out of one, or ticked off: there was no "in".
 *
 * Nothing new is stored to fix that. `assigned_tasks.schedule_slot_id` already
 * existed and was already indexed — only the recurring materializer wrote it,
 * and nothing read it. So:
 *
 *   what is in this block   → one indexed read
 *   move it to another      → one column write
 *   mark it done            → the task lifecycle that already exists
 *
 * An item on a plan is an ordinary task, so submissions, mentor feedback,
 * points and the daily progress log keep working with no second system to
 * disagree with the first.
 *
 * ── Who may change what ────────────────────────────────────────────────────
 * Every slot carries `owner` and `locked`. Slots written before this shipped
 * have neither, and are read as mentor-owned and unlocked, which is what they
 * were.
 *
 *   mentor-owned, unlocked  mentee fills it, moves it, renames it (marked as
 *                           changed, so "apply to all" leaves it alone)
 *   mentor-owned, locked    mentee fills it and nothing else — the standup
 *                           stays at 09:00
 *   mentee-owned            the mentee's own time; a mentor can see it and
 *                           never overwrites it
 *
 * Locking protects a block's SHAPE, not its contents. What you bring to the
 * standup is always yours.
 */

/** Slots written before ownership existed were mentor-owned and unlocked. */
function normalizeSlot(slot, index) {
  return {
    ...slot,
    id: slot.id || `slot-${index}`,
    owner: slot.owner === 'mentee' ? 'mentee' : 'mentor',
    locked: slot.locked === true,
    editedByMentee: slot.editedByMentee === true,
    hiddenOn: slot.hiddenOn || null,
  };
}

/** What this actor may do to this slot, decided once and sent to the client. */
function slotRights(slot, { isOwnerMentee, canAssign }) {
  const mentorSide = canAssign;
  const mine = slot.owner === 'mentee' && isOwnerMentee;
  return {
    // Anyone who can see the plan can put work in a block, locked or not.
    canAddItems: true,
    canRetime: mentorSide || mine || !slot.locked,
    canRemove: mentorSide || mine,
    canLock: mentorSide,
    // You cannot delete a block you were given, but you can sit out one day of
    // it. The mentor's intent survives; today's reality is respected.
    canHide: !mentorSide && !mine,
  };
}

const ACTIVE_STATUSES = ['assigned', 'in_progress', 'submitted', 'revision_needed'];

/**
 * A day's plan has to show what you FINISHED today, not only what is left.
 *
 * Reading active statuses alone made a ticked item disappear from its block the
 * moment it was ticked, so "2 of 3 done" was unreachable — the total shrank
 * with every tick and the ring never filled. Finished work stays in its block
 * for the rest of the day and drops off tomorrow, which is what makes the count
 * mean "today" rather than "ever".
 *
 * Only items that are IN a block get this. Unplanned stays a list of things
 * still to do, not an archive of everything ever completed.
 */
const PLANNED_STATUSES = [...ACTIVE_STATUSES, 'completed'];

class ScheduleBoardService {
  /**
   * One resource covers both readings of "may you plan this day".
   *
   * A mentee holds `schedule.plan` at self scope, so `userId` admits them. A
   * mentor holds it at clan scope, so `clanId` admits them. Passing both means
   * neither needs a special case, and an admin's org grant covers everything.
   */
  async _assertCanPlan(actor, menteeId, clanId) {
    const resource = { userId: menteeId, clanId: clanId || null };
    if (await authz.can(actor, PERMISSIONS.SCHEDULE_PLAN, resource)) return;
    throw new ForbiddenError('You cannot change this plan');
  }

  /**
   * May this person set work in a plan, wearing the hat they have on now?
   *
   * In the mentee portal, nobody assigns: someone who is also a mentor or an
   * admin is, right there, a mentee looking at their own day, and gets a
   * mentee's planner (personal items, no "assign work"). They assign from the
   * mentor or admin portal.
   */
  async _canAssign(actor, clanId) {
    if (require('../utils/auditContext').getRequestContext().portalRole === 'mentee') return false;
    return authz.can(actor, PERMISSIONS.SCHEDULE_ASSIGN, { clanId: clanId || null });
  }

  /**
   * The clan this action happens in.
   *
   * A `mentee_schedules` row may carry no clan at all — the older flows created
   * them that way, and most of the seeded ones are null. That made the planner
   * tell a mentor one thing and then refuse them: `board` resolved their grant
   * against the clan in the REQUEST and rendered a lock button, while every
   * write resolved it against the ROW's clan, which was null, where a
   * clan-scoped grant reaches nothing. The mentor got "Only a mentor can lock a
   * block" on their own clan's mentee.
   *
   * One answer for both: the row's clan when it has one, otherwise the clan the
   * viewer is acting in.
   */
  _effectiveClan(row, requestedClanId) {
    return row?.clanId || requestedClanId || null;
  }

  /**
   * Midnight at the start of the mentee's today, in their own zone.
   *
   * Their day is the unit this screen counts in, so a mentee eight hours ahead
   * must not watch this morning's work fall off the plan because a server in
   * another zone has already turned the page.
   */
  async _zoneOf(menteeId) {
    const settings = await models.UserSettings.findOne({
      where: { userId: menteeId }, attributes: ['timezone'],
    });
    return settings?.timezone || 'UTC';
  }

  async _todayKey(menteeId) {
    return todayInZone(await this._zoneOf(menteeId));
  }

  /**
   * A day key becomes a deadline at the END of that day, in the mentee's zone.
   *
   * The planner used to store the day key straight into `due_date`, which
   * Postgres reads as midnight at the START of it — so every item a mentor set
   * for today, and every occurrence a repeat rolled forward, was already
   * overdue the moment it appeared. The rest of the product has always used
   * `endOfDayInZone` for a day-only deadline; this now does too.
   */
  async _dueAtEndOfDay(menteeId, dayKey) {
    if (!dayKey) return null;
    const key = String(dayKey).slice(0, 10);
    return endOfDayInZone(key, await this._zoneOf(menteeId)) || new Date(`${key}T23:59:59Z`);
  }

  async _startOfToday(menteeId) {
    return new Date(`${await this._todayKey(menteeId)}T00:00:00Z`);
  }

  /**
   * This mentee's schedule row FOR THIS CLAN.
   *
   * It used to fall back to "any row this mentee has" when the clan had none,
   * which is how a mentee moved into a standing clan opened their new day and
   * found the previous clan's blocks in it — and, because the task query below
   * keyed off this row's clan, the previous clan's tasks too.
   *
   * A clan with no schedule row has an empty day. That is the truth, and an
   * empty day is a far better answer than somebody else's.
   *
   * `clanScopedWhere` keeps the one legacy case working: rows written before
   * schedules were per-clan carry no clan at all, and are adopted only when
   * they cannot belong anywhere else — a single membership, into a cohort clan.
   */
  async _scheduleRow(menteeId, clanId, membershipCount) {
    // Resolve the count when the caller has not already paid for it.
    //
    // This argument used to default to 0, which quietly means "this mentee is
    // in more than one clan" and so switches clanScopedWhere to the strict
    // branch that cannot see a legacy clanless row. Only `board` passed it, so
    // every OTHER path was reading the strict way: the planner rendered a
    // legacy row and then refused to let anybody change it, and the two
    // block-creating paths below did something worse than refuse — not finding
    // the row, they made a SECOND one, splitting a mentee's day between an
    // orphaned clanless row and a new clan-stamped one.
    //
    // A default that is wrong in the common case is not a default. The count
    // is resolved here when it is not supplied, so omitting it costs one
    // indexed query rather than correctness.
    const count = membershipCount ?? (await listMenteeClans(menteeId)).length;
    const where = clanScopedWhere({ menteeId }, clanId, count);
    return models.MenteeSchedule.findOne({ where, order: [['assignedAt', 'DESC']] });
  }

  /**
   * Which clan this board is about.
   *
   * Explicit wins; a mentee who is only in one clan needs no header. When it
   * genuinely cannot be told (several clans, nothing stated) the answer is the
   * row's clan, and failing that no narrowing — the behaviour before per-clan
   * boards existed, kept so an older client does not start getting errors.
   */
  async _resolveBoardClan(menteeId, requestedClanId, memberships) {
    if (requestedClanId) {
      const held = memberships.some((m) => m.clanId === requestedClanId);
      if (held) return requestedClanId;
      // A mentor planning for a mentee is scoped by `_assertCanPlan`, not by
      // the mentee's own memberships, so an unmatched clan is still honoured.
      return requestedClanId;
    }
    if (memberships.length === 1) return memberships[0].clanId;
    return null;
  }

  /**
   * The whole board in two queries: the schedule row, and every task that is
   * either in one of its blocks or waiting to be put in one.
   */
  async board(menteeId, { clanId = null } = {}, actor) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const canAssign = await this._canAssign(actor, clanId);
    const isOwnerMentee = String(actor.id) === String(menteeId);

    // Resolve the clan once and use it for BOTH reads below. The task query
    // used to scope by the schedule ROW's clan, so a clan with no row (or a
    // legacy row with a null clan) applied no clan filter at all and the day
    // filled with every task the mentee had ever been given, in any clan.
    const memberships = await listMenteeClans(menteeId);
    const scopeClanId = await this._resolveBoardClan(menteeId, clanId, memberships);
    const row = await this._scheduleRow(menteeId, scopeClanId, memberships.length);
    // Sorted on READ, not just on write. Slots created before the planner were
    // stored in whatever order they were authored, and a day that lists 18:00
    // above 09:00 is simply wrong however it got that way.
    const todayKey = await this._todayKey(menteeId);
    const slots = (Array.isArray(row?.schedule) ? row.schedule : [])
      .map(normalizeSlot)
      // Hidden only for the day it was hidden on. A mentee skipping standup
      // because they are travelling should not have to undo it tomorrow, and a
      // mentor's block must come back by itself — that is the difference
      // between hiding and deleting.
      .filter((slot) => slot.hiddenOn !== todayKey)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));

    const slotIds = slots.map((s) => s.id);
    const startOfToday = await this._startOfToday(menteeId);
    const tasks = await models.AssignedTask.findAll({
      /**
       * Every OR group lives inside the one AND so that the clan filter, which
       * contributes its own OR for legacy unscoped rows, cannot collide with
       * them. (Two `[Op.or]` keys on one object silently keep the last.)
       */
      where: {
        ...clanScopedWhere({ menteeId }, scopeClanId, memberships.length),
        [Op.and]: [
          /**
           * A repeat that lands on weekdays must not put Monday's copy on the
           * Saturday board. The next occurrence is written the moment one is
           * finished, so it exists days before it is due — real, but not yet
           * today's work.
           *
           * Anything already due stays, however late: an occurrence nobody did
           * is exactly what the mentee needs to still see.
           */
          {
            [Op.or]: [
              { occurrenceDate: null },
              { occurrenceDate: { [Op.lte]: todayKey } },
            ],
          },
          {
            [Op.or]: [
              // In a block: everything still open, plus whatever finished today.
              {
                scheduleSlotId: { [Op.in]: slotIds.length ? slotIds : ['__none__'] },
                [Op.or]: [
                  { status: { [Op.in]: ACTIVE_STATUSES } },
                  { status: 'completed', completedAt: { [Op.gte]: startOfToday } },
                ],
              },
              // Waiting to be planned: open work only.
              { scheduleSlotId: null, status: { [Op.in]: ACTIVE_STATUSES } },
            ],
          },
        ],
      },
      attributes: [
        'id', 'scheduleSlotId', 'status', 'dueDate', 'selfAssigned', 'isCustomTask',
        'titleOverride', 'pointsBase', 'occurrenceDate', 'repeatRule',
      ],
      include: [{
        model: models.RoadmapTask, as: 'roadmapTask', required: false,
        attributes: ['id', 'title', 'type', 'estimatedHours', 'difficulty', 'roadmapId'],
      }],
      order: [['dueDate', 'ASC'], ['createdAt', 'ASC']],
    });

    const shape = (t, { derived = false } = {}) => ({
      id: t.id,
      /**
       * Here because its roadmap is, not because anyone put it here. The
       * planner says so, since moving it is then a different kind of act: it
       * detaches the task from the roadmap's block for good.
       */
      fromRoadmapSlot: derived,
      title: t.titleOverride || t.roadmapTask?.title || 'Untitled',
      type: t.roadmapTask?.type || 'custom',
      status: t.status,
      dueDate: t.dueDate,
      estimatedHours: t.roadmapTask?.estimatedHours ?? null,
      // The one distinction a mentee actually feels: does ticking this finish
      // it, or does it go to my mentor?
      kind: t.selfAssigned ? 'personal' : 'review',
      points: t.selfAssigned ? 0 : (t.pointsBase ?? null),
      repeat: t.repeatRule || null,
      repeatLabel: describeRepeat(t.repeatRule),
      /** The day this instance is for — null when it is not one of a series. */
      occurrenceDate: t.occurrenceDate || null,
    });

    /**
     * Which block a roadmap task belongs to.
     *
     * A roadmap slot does not own tasks the way a plain block does — it points
     * at roadmaps, and `linearRoadmapService` records the slot on
     * `RoadmapProgress.slot`, never on the task. So the task's own
     * `schedule_slot_id` is null and, read naively, every piece of roadmap work
     * a mentee has fell into "not on the day yet" while the block meant to
     * govern it sat there looking empty — the worst of both readings.
     *
     * A roadmap task belongs to the block because its ROADMAP does. An explicit
     * `schedule_slot_id` still wins: that means somebody deliberately moved this
     * one somewhere else, and a derived rule must not drag it back.
     */
    const slotByRoadmap = new Map();
    for (const slot of slots) {
      if (slot.kind !== 'roadmap') continue;
      for (const roadmapId of (Array.isArray(slot.roadmapChain) ? slot.roadmapChain : [])) {
        if (roadmapId && !slotByRoadmap.has(roadmapId)) slotByRoadmap.set(roadmapId, slot.id);
      }
    }

    const bySlot = new Map(slots.map((s) => [s.id, []]));
    const unplanned = [];
    for (const task of tasks) {
      const explicit = task.scheduleSlotId && bySlot.has(task.scheduleSlotId) ? task.scheduleSlotId : null;
      const derived = !task.scheduleSlotId && task.roadmapTask?.roadmapId
        ? slotByRoadmap.get(task.roadmapTask.roadmapId) || null
        : null;
      const target = explicit || derived;
      (target ? bySlot.get(target) : unplanned).push(shape(task, { derived: !!derived }));
    }

    /**
     * Live progress per roadmap in a chain, from the service that already owns
     * that read — the mentor's read-only week view uses exactly this, so a
     * roadmap block cannot say one thing here and another there.
     */
    const enriched = slots.some((s) => s.kind === 'roadmap')
      ? await require('./scheduleTemplateService')._enrichSchedule(menteeId, slots)
      : slots;
    const chainById = new Map(enriched.map((s) => [s.id, s.chainDetails || null]));

    const withItems = slots.map((slot) => {
      const items = bySlot.get(slot.id) || [];
      return {
        ...slot,
        items,
        done: items.filter((i) => i.status === 'completed').length,
        chainDetails: chainById.get(slot.id) || null,
        rights: slotRights(slot, { isOwnerMentee, canAssign }),
      };
    });

    return {
      menteeId,
      clanId: row?.clanId ?? scopeClanId ?? null,
      hasSchedule: !!row,
      templateId: row?.templateId ?? null,
      timezone: row?.timezone ?? null,
      slots: withItems,
      unplanned,
      viewer: { isOwnerMentee, canAssign },
    };
  }

  /** Locate a slot and the row holding it, or say so clearly. */
  async _locate(menteeId, slotId, clanId) {
    const row = await this._scheduleRow(menteeId, clanId);
    if (!row) throw new NotFoundError('This mentee has no schedule yet');
    const slots = (Array.isArray(row.schedule) ? row.schedule : []).map(normalizeSlot);
    const index = slots.findIndex((s) => s.id === slotId);
    if (index === -1) throw new NotFoundError('Block not found');
    return { row, slots, index, slot: slots[index] };
  }

  async _save(row, slots) {
    row.schedule = slots;
    row.changed('schedule', true);
    await row.save();
  }

  /**
   * Put a new item in a block.
   *
   * `kind: 'personal'` is the mentee's own — it finishes on a tick, earns
   * nothing and never reaches the mentor's approvals queue. Anything else is
   * ordinary work for review, and only somebody who can assign may create it.
   */
  async addItem(menteeId, slotId, { title, kind = 'personal', dueDate = null, repeat = null }, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const text = String(title || '').trim();
    if (!text) throw new ValidationError('Give the item a name');
    if (text.length > 200) throw new ValidationError('Keep the name under 200 characters');

    const { row, slots, index } = await this._locate(menteeId, slotId, clanId);
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    // A due date arrives as a day key ('YYYY-MM-DD'); it becomes an instant at
    // the end of that day in the mentee's zone, like every other deadline.
    const dayKey = dueDate ? String(dueDate).slice(0, 10) : null;
    const due = await this._dueAtEndOfDay(menteeId, dayKey);

    const personal = kind !== 'review';
    // Throws on a frequency we cannot honour, so a bad rule is refused at the
    // door rather than stored and discovered later by the spawner.
    const repeatRule = normalizeRepeat(repeat);
    if (!personal && !(await this._canAssign(actor, this._effectiveClan(row, clanId)))) {
      throw new ForbiddenError('Only a mentor can set work for review. Add it as a personal item instead.');
    }

    const created = await sequelize.transaction(async (transaction) => {
      // `assigned_tasks.roadmap_task_id` is NOT NULL, so a one-off needs a
      // roadmap task behind it. `roadmap_id` is nullable, so it belongs to no
      // roadmap — the same shape `isCustomTask` has always used.
      const roadmapTask = await models.RoadmapTask.create({
        title: text,
        description: personal ? 'Added by the mentee to their own plan.' : 'Set by a mentor.',
        type: 'custom',
        difficulty: 'medium',
        taskOrder: 0,
        deliverable: personal ? 'No submission needed' : 'Complete the assigned task',
        acceptanceCriteria: [],
        estimatedHours: 1,
        isMandatory: false,
        isCustomTask: true,
      }, { transaction });

      return models.AssignedTask.create({
        organizationId: row.organizationId || undefined,
        menteeId,
        /**
         * `mentor_id` is NOT NULL, and a personal item genuinely has no mentor
         * — so it records the person who set it, which for their own item is
         * the mentee. That also reads correctly everywhere else:
         * `authzService.canActOnTask` admits on `task.mentorId === userId`, so
         * a mentee can act on the item they wrote. `self_assigned` is what says
         * "not for review"; this column only ever said who set it.
         */
        mentorId: personal ? menteeId : actor.id,
        /**
         * The clan this was set IN, not only the one stamped on the schedule
         * row — which is null on most of them. Stamping null here put a
         * mentor's review work outside every clan-scoped read: it never
         * reached the clan's approvals queue, and the mentor could not even
         * tick the item they had just written, because the next write
         * resolved their clan-scoped grant against a null clan.
         */
        clanId: this._effectiveClan(row, clanId),
        roadmapTaskId: roadmapTask.id,
        scheduleSlotId: slots[index].id,
        status: 'assigned',
        assignedAt: new Date(),
        dueDate: due,
        isCustomTask: true,
        selfAssigned: personal,
        titleOverride: text,
        repeatRule,
        /**
         * The day this instance is FOR. A repeat needs one to count from, or
         * the first "next" would be measured from whenever it happened to be
         * finished rather than from the day it was set for.
         *
         * A repeat with no day given starts today — in the mentee's zone, so
         * "every day" means their day.
         */
        occurrenceDate: dayKey || (repeatRule ? await this._todayKey(menteeId) : null),
      }, { transaction });
    });

    await this._markEdited(row, slots, index, actor, menteeId);
    return { id: created.id, title: text, kind: personal ? 'personal' : 'review', status: 'assigned' };
  }

  /**
   * A mentee changing a mentor's block leaves a mark on it.
   *
   * That mark is what makes "apply to all" safe to keep: a mentor pushing one
   * block to a whole roster can skip the people who have already made it their
   * own, instead of silently flattening their day.
   */
  async _markEdited(row, slots, index, actor, menteeId) {
    const slot = slots[index];
    if (slot.owner !== 'mentor') return;
    if (String(actor.id) !== String(menteeId)) return;
    if (slot.editedByMentee) return;
    slots[index] = { ...slot, editedByMentee: true };
    await this._save(row, slots);
  }

  /** Move one item into a block, or out of the day entirely (`slotId: null`). */
  async moveItem(taskId, slotId, actor, clanId = null) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Item not found');
    await this._assertCanPlan(actor, task.menteeId, task.clanId || clanId);
    if (task.clanId) await clanLifecycleService.assertClanWritable(task.clanId);

    if (slotId === null || slotId === undefined || slotId === '') {
      await task.update({ scheduleSlotId: null });
      return { id: task.id, scheduleSlotId: null };
    }

    const { row, slots, index } = await this._locate(task.menteeId, slotId, task.clanId || clanId);
    await task.update({ scheduleSlotId: slots[index].id });
    await this._markEdited(row, slots, index, actor, task.menteeId);
    return { id: task.id, scheduleSlotId: slots[index].id };
  }

  /**
   * Tick an item off.
   *
   * A personal item finishes here, because there is nobody waiting on it. Work
   * for review deliberately does NOT: it goes to the mentor through the
   * submission flow that already exists, so a tick on a plan and a submission
   * from the task page are the same event and produce the same record.
   */
  async completeItem(taskId, actor, done = true, clanId = null) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Item not found');
    // The task's own clan when it has one, otherwise the clan the actor is
    // acting in — the same rule `_effectiveClan` states for slots. A
    // clan-scoped grant reaches nothing when this resolves to null, which is
    // how a mentor was told they could not change a plan they had just set.
    await this._assertCanPlan(actor, task.menteeId, task.clanId || clanId);
    if (task.clanId) await clanLifecycleService.assertClanWritable(task.clanId);

    if (!task.selfAssigned) {
      throw new ValidationError(
        'This one goes to your mentor. Open it and submit your work — ticking it off would not tell them anything.',
      );
    }
    await task.update(done
      ? { status: 'completed', completedAt: new Date() }
      : { status: 'assigned', completedAt: null });

    // Ticking a repeating item is what produces the next one.
    const next = done ? await this.spawnNextOccurrence(task) : null;
    return { id: task.id, status: task.status, nextOccurrence: next?.occurrenceDate ?? null };
  }

  /** A block of the mentee's own, or one a mentor adds to their day. */
  async addSlot(menteeId, { label, time }, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const name = String(label || '').trim();
    if (!name) throw new ValidationError('Give the block a name');
    if (!/^\d{2}:\d{2}$/.test(String(time || ''))) throw new ValidationError('Use a time like 09:00');

    let row = await this._scheduleRow(menteeId, clanId);
    if (!row) {
      row = await models.MenteeSchedule.create({
        menteeId, clanId: clanId || null, schedule: [], assignedBy: actor.id,
      });
    }
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    const mentorSide = await this._canAssign(actor, this._effectiveClan(row, clanId));
    const byMentee = String(actor.id) === String(menteeId);
    const slots = (Array.isArray(row.schedule) ? row.schedule : []).map(normalizeSlot);
    const slot = {
      id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: name,
      time,
      days: 'everyday',
      kind: 'empty',
      // A mentee's own block, unless a mentor made it for them.
      owner: byMentee && !mentorSide ? 'mentee' : (byMentee ? 'mentee' : 'mentor'),
      locked: false,
      editedByMentee: false,
    };
    slots.push(slot);
    slots.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    await this._save(row, slots);
    return slot;
  }

  /** Rename or retime a block, or (mentor only) lock it. */
  async updateSlot(menteeId, slotId, patch, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const { row, slots, index, slot } = await this._locate(menteeId, slotId, clanId);
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    const canAssign = await this._canAssign(actor, this._effectiveClan(row, clanId));
    const rights = slotRights(slot, { isOwnerMentee: String(actor.id) === String(menteeId), canAssign });

    const next = { ...slot };
    if (patch.label !== undefined || patch.time !== undefined) {
      if (!rights.canRetime) {
        throw new ForbiddenError('Your mentor locked this block. You can still put your own work in it.');
      }
      if (patch.label !== undefined) {
        const name = String(patch.label).trim();
        if (!name) throw new ValidationError('Give the block a name');
        next.label = name;
      }
      if (patch.time !== undefined) {
        if (!/^\d{2}:\d{2}$/.test(String(patch.time))) throw new ValidationError('Use a time like 09:00');
        next.time = patch.time;
      }
    }
    if (patch.locked !== undefined) {
      if (!rights.canLock) throw new ForbiddenError('Only a mentor can lock a block');
      next.locked = !!patch.locked;
    }

    if (next.owner === 'mentor' && String(actor.id) === String(menteeId)) next.editedByMentee = true;
    slots[index] = next;
    slots.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    await this._save(row, slots);
    return next;
  }

  /**
   * Remove a block.
   *
   * A mentee may remove their own and never a mentor's — a block they were
   * given is somebody else's intent, and deleting it loses information that
   * tomorrow still needs. Whatever was inside goes back to unplanned rather
   * than disappearing with the block.
   */
  async removeSlot(menteeId, slotId, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const { row, slots, index, slot } = await this._locate(menteeId, slotId, clanId);
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    const canAssign = await this._canAssign(actor, this._effectiveClan(row, clanId));
    const rights = slotRights(slot, { isOwnerMentee: String(actor.id) === String(menteeId), canAssign });
    if (!rights.canRemove) {
      throw new ForbiddenError('This block came from your mentor. You can empty it, but not delete it.');
    }

    await models.AssignedTask.update(
      { scheduleSlotId: null },
      { where: { menteeId, scheduleSlotId: slot.id } },
    );
    slots.splice(index, 1);
    await this._save(row, slots);
    return { removed: slot.id };
  }

  /**
   * Turn a repeat on, change it, or switch it off, on an item already on a plan.
   *
   * Separate from editing the item because this is the only property that
   * changes what happens AFTER it is finished, and people reach for it long
   * after they first wrote the thing down.
   */
  async setItemRepeat(taskId, repeat, actor, clanId = null) {
    const task = await models.AssignedTask.findByPk(taskId);
    if (!task) throw new NotFoundError('Item not found');
    await this._assertCanPlan(actor, task.menteeId, task.clanId || clanId);
    if (task.clanId) await clanLifecycleService.assertClanWritable(task.clanId);

    let rule;
    try {
      rule = normalizeRepeat(repeat);
    } catch (error) {
      throw new ValidationError(error.message);
    }
    await task.update({
      repeatRule: rule,
      occurrenceDate: rule
        ? (task.occurrenceDate || (task.dueDate ? String(task.dueDate).slice(0, 10) : null))
        : task.occurrenceDate,
    });
    return { id: task.id, repeat: rule };
  }

  /**
   * Write the next occurrence of a repeating item, once this one is finished.
   *
   * Called at the moment of completion rather than by a scheduler, so a repeat
   * works whether or not a worker is alive, and a series nobody keeps up with
   * stops instead of accumulating weeks of untouched copies.
   *
   * The rule MOVES to the successor. That is what makes this safe to call more
   * than once: the finished task no longer repeats, so re-ticking it, a retried
   * request, or an approval processed twice cannot produce a second copy. The
   * explicit sibling check below covers the remaining race.
   *
   * Never throws. A repeat that failed to roll forward is a missing row; a
   * completion that failed because of it would be a lost tick.
   */
  async spawnNextOccurrence(task) {
    try {
      const rule = task.repeatRule;
      if (!rule) return null;

      // Count from the day this instance was FOR. Falling back to its deadline
      // would be wrong the moment a deadline is an end-of-day instant in a zone
      // ahead of UTC, so the mentee's own today is the last resort.
      const from = task.occurrenceDate
        ? String(task.occurrenceDate).slice(0, 10)
        : await this._todayKey(task.menteeId);
      const next = nextOccurrence(rule, from);
      // The series has run out; let the rule die with this task.
      if (!next) { await task.update({ repeatRule: null }); return null; }

      // Somebody may already have rolled it forward — a double approval, a
      // retried request. One open sibling on the same work is enough.
      const existing = await models.AssignedTask.findOne({
        where: {
          // Never the one being rolled forward. It is still open at this point
          // when the roll happens at submission — 'submitted' is an active
          // status — so without this it would match itself, decide the work was
          // already done and quietly end the series.
          id: { [Op.ne]: task.id },
          menteeId: task.menteeId,
          roadmapTaskId: task.roadmapTaskId,
          status: { [Op.in]: ACTIVE_STATUSES },
          scheduleSlotId: task.scheduleSlotId || null,
        },
      });
      if (existing) { await task.update({ repeatRule: null }); return existing; }

      const created = await models.AssignedTask.create({
        organizationId: task.organizationId,
        menteeId: task.menteeId,
        mentorId: task.mentorId,
        clanId: task.clanId,
        roadmapTaskId: task.roadmapTaskId,
        scheduleSlotId: task.scheduleSlotId,
        status: 'assigned',
        assignedAt: new Date(),
        occurrenceDate: next,
        // End of ITS day in the mentee's zone — not midnight at the start of
        // it, which made every rolled-forward occurrence born overdue.
        dueDate: await this._dueAtEndOfDay(task.menteeId, next),
        isCustomTask: task.isCustomTask,
        selfAssigned: task.selfAssigned,
        titleOverride: task.titleOverride,
        pointsBase: task.pointsBase,
        repeatRule: rule,
      });
      // Hand the rule on, so this one is finished for good.
      await task.update({ repeatRule: null });
      logger.info('[plan] repeated item rolled forward', {
        menteeId: task.menteeId, from, next, slot: task.scheduleSlotId,
      });
      return created;
    } catch (error) {
      logger.warn(`[plan] could not roll a repeat forward: ${error.message}`);
      return null;
    }
  }

  /**
   * Sit out one day of a block somebody else set.
   *
   * The honest alternative to letting a mentee delete a mentor's block. Nothing
   * is lost: the block returns tomorrow on its own, and the mentor can still see
   * it was skipped. Hiding your own block makes no sense — remove it.
   */
  async hideSlotToday(menteeId, slotId, actor, clanId = null, hide = true) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const { row, slots, index, slot } = await this._locate(menteeId, slotId, clanId);
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    const canAssign = await this._canAssign(actor, this._effectiveClan(row, clanId));
    const rights = slotRights(slot, { isOwnerMentee: String(actor.id) === String(menteeId), canAssign });
    if (!rights.canHide) {
      throw new ValidationError('This block is yours to change — remove or retime it instead of hiding it.');
    }

    slots[index] = { ...slot, hiddenOn: hide ? await this._todayKey(menteeId) : null };
    await this._save(row, slots);
    return { id: slot.id, hiddenOn: slots[index].hiddenOn };
  }

  /**
   * Day-shapes this mentee may take for themselves.
   *
   * Only org templates an admin has offered. A mentor's private templates and
   * the programme's own shape stay out of it.
   */
  async selectableTemplates(menteeId, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const rows = await models.ScheduleTemplate.findAll({
      where: { source: 'org', menteeSelectable: true },
      attributes: ['id', 'name', 'description', 'blocks'],
      order: [['name', 'ASC']],
    });
    return rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      blocks: (Array.isArray(t.blocks) ? t.blocks : []).map((b) => ({ label: b.label, time: b.time })),
    }));
  }

  /**
   * Take a template, without losing the day you already have.
   *
   * This MERGES. A block already sitting at that time is left exactly as it is,
   * so choosing a template can never overwrite something a mentor set — the
   * worst it can do is add blocks the mentee then removes. Everything it adds
   * is theirs, so a later "apply to all" from a mentor leaves it alone too.
   */
  async applyTemplate(menteeId, templateId, actor, clanId = null) {
    await this._assertCanPlan(actor, menteeId, clanId);
    const template = await models.ScheduleTemplate.findOne({
      where: { id: templateId, source: 'org', menteeSelectable: true },
    });
    if (!template) throw new NotFoundError('That template is not available to choose');

    let row = await this._scheduleRow(menteeId, clanId);
    if (!row) {
      row = await models.MenteeSchedule.create({
        menteeId, clanId: clanId || null, schedule: [], assignedBy: actor.id,
      });
    }
    if (row.clanId) await clanLifecycleService.assertClanWritable(row.clanId);

    const slots = (Array.isArray(row.schedule) ? row.schedule : []).map(normalizeSlot);
    const taken = new Set(slots.map((s) => `${s.time}|${String(s.label || '').toLowerCase()}`));
    const added = [];
    for (const block of (Array.isArray(template.blocks) ? template.blocks : [])) {
      const label = String(block.label || '').trim();
      const time = String(block.time || '').trim();
      if (!label || !/^\d{2}:\d{2}$/.test(time)) continue;
      if (taken.has(`${time}|${label.toLowerCase()}`)) continue;
      const slot = {
        id: `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label, time, days: 'everyday', kind: 'empty',
        owner: 'mentee', locked: false, editedByMentee: false, hiddenOn: null,
      };
      slots.push(slot);
      taken.add(`${time}|${label.toLowerCase()}`);
      added.push(slot);
    }
    slots.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    await this._save(row, slots);
    return { added: added.length, skipped: (template.blocks || []).length - added.length, templateId };
  }

  /**
   * The compact read for clan review: today's blocks and how far through them
   * this mentee is. Deliberately not the board — review is a stepping-through
   * flow and does not need a second planner inside it.
   */
  async strip(menteeId, clanId, actor) {
    const board = await this.board(menteeId, { clanId }, actor);
    return {
      hasSchedule: board.hasSchedule,
      blocks: board.slots.map((s) => ({
        id: s.id, time: s.time, label: s.label,
        total: s.items.length, done: s.done,
      })),
      unplanned: board.unplanned.length,
    };
  }

  /**
   * How far through today's plan each of these mentees is, in one call.
   *
   * Drives the progress ring on every face in clan review's mentee row, so a
   * mentor can see who is behind before opening anyone. Built from the same
   * board each mentee's own card reads, so the ring and the card can never
   * disagree. A mentee this actor may not plan for is simply left out.
   */
  async stripsMany(menteeIds, clanId, actor) {
    let ids = [...new Set((Array.isArray(menteeIds) ? menteeIds : []).map(String))].slice(0, 200);
    /*
     * Only mentees who are really in the clan (or, with no clan, in one this
     * actor staffs). The per-mentee read trusts the clan it is handed, which
     * is fine for one card a mentor opened from their own row, but a batch
     * of arbitrary ids must not become a way to read anyone's day.
     */
    if (actor?.role !== 'admin') {
      let clanIds = clanId ? [clanId] : null;
      if (!clanIds) {
        const staffed = await models.ClanMembership.findAll({
          where: { userId: actor.id, role: { [Op.ne]: 'mentee' }, status: 'active' }, attributes: ['clanId'],
        });
        clanIds = staffed.map((m) => m.clanId);
      }
      const members = await models.ClanMembership.findAll({
        where: { clanId: clanIds, userId: ids, role: 'mentee' }, attributes: ['userId'],
      });
      const allowed = new Set(members.map((m) => String(m.userId)));
      ids = ids.filter((id) => allowed.has(id));
    }
    const out = {};
    const CONCURRENCY = 6;
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      await Promise.all(ids.slice(i, i + CONCURRENCY).map(async (menteeId) => {
        try {
          const board = await this.board(menteeId, { clanId }, actor);
          const total = board.slots.reduce((n, s) => n + s.items.length, 0);
          const done = board.slots.reduce((n, s) => n + s.done, 0);
          out[menteeId] = { hasPlan: board.slots.length > 0, total, done };
        } catch (error) {
          if (!(error instanceof ForbiddenError) && !(error instanceof NotFoundError)) {
            logger.warn(`plan progress for ${menteeId} failed: ${error.message}`);
          }
        }
      }));
    }
    return out;
  }
}

module.exports = new ScheduleBoardService();
