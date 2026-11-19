'use strict';

/**
 * A mentee can arrange their own day — and nobody else's.
 *
 * Every schedule route was gated on `authorize(['mentor','admin'])`, the legacy
 * account-role array, so a mentee had exactly one endpoint (`GET /schedules/me`)
 * and could not change anything on a plan that was handed to them. The fix is
 * not a wider role array; it is `schedule.plan`, which a mentee holds at SELF
 * scope and a mentor at CLAN scope, resolved against one resource.
 *
 * These tests are mostly about what a mentee may NOT do, because that is where
 * a permission earns its keep.
 */

const { models } = require('../../src/db');
const board = require('../../src/services/scheduleBoardService');
const submissionService = require('../../src/services/submissionService');
const clanService = require('../../src/services/clanService');
const {
  cleanDb, createAdmin, createMentor, createMentee, createProgram,
} = require('../helpers/seed');

describe('the day planner', () => {
  let admin, mentor, outsiderMentor, mentee, stranger, program, clan, schedule;

  const LOCKED = 'slot-standup';
  const OPEN = 'slot-deep';

  beforeEach(async () => {
    await cleanDb();
    admin = await createAdmin({ email: 'plan-admin@test.com' });
    mentor = await createMentor({ email: 'plan-mentor@test.com' });
    outsiderMentor = await createMentor({ email: 'plan-outsider@test.com' });
    mentee = await createMentee({ email: 'plan-mentee@test.com' });
    stranger = await createMentee({ email: 'plan-stranger@test.com' });

    program = await createProgram({ createdBy: admin.id });
    clan = await models.Clan.create({
      programId: program.id, name: 'Planner clan', kind: 'cohort',
      leadMentorId: mentor.id, createdBy: admin.id,
    });
    await clanService.addMember(clan.id, { userId: mentor.id, role: 'lead_mentor' });
    await clanService.addMember(clan.id, { userId: mentee.id, role: 'mentee' });

    schedule = await models.MenteeSchedule.create({
      menteeId: mentee.id,
      clanId: clan.id,
      assignedBy: mentor.id,
      schedule: [
        // Written the way the existing feature writes them: no `owner`, no
        // `locked`. They must read as mentor-owned and unlocked.
        { id: OPEN, label: 'Deep work', time: '10:00', days: 'everyday', kind: 'empty' },
        { id: LOCKED, label: 'Standup', time: '09:00', days: 'everyday', kind: 'empty', locked: true },
      ],
    });
  });

  const slotOf = (b, id) => b.slots.find((s) => s.id === id);

  describe('reading the board', () => {
    it('gives the mentee their own day', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(b.slots.map((s) => s.label)).toEqual(['Standup', 'Deep work']); // sorted by time
      expect(b.viewer.isOwnerMentee).toBe(true);
      expect(b.viewer.canAssign).toBe(false);
    });

    it('reads a slot written before ownership existed as the mentor’s, unlocked', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const open = slotOf(b, OPEN);
      expect(open.owner).toBe('mentor');
      expect(open.locked).toBe(false);
      expect(open.rights.canRetime).toBe(true);
      expect(open.rights.canRemove).toBe(false);
    });

    it('refuses a mentee looking at somebody else’s day', async () => {
      await expect(board.board(mentee.id, { clanId: clan.id }, stranger))
        .rejects.toThrow(/cannot change this plan/i);
    });

    it('refuses a mentor with no claim on this mentee', async () => {
      await expect(board.board(mentee.id, { clanId: clan.id }, outsiderMentor))
        .rejects.toThrow(/cannot change this plan/i);
    });

    it('lets this clan’s mentor plan for them', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentor);
      expect(b.viewer.canAssign).toBe(true);
      expect(slotOf(b, LOCKED).rights.canRetime).toBe(true);
    });

    it('never lets anyone assign from the mentee portal, whatever else they are', async () => {
      // Someone who is a mentor (or admin) as well as a mentee: in the mentee
      // portal they wear the mentee hat, so no "assign work" there.
      const { runWithRequestContext, getRequestContext } = require('../../src/utils/auditContext');
      const inPortal = (portalRole, fn) => runWithRequestContext({ ...getRequestContext(), portalRole }, fn);

      const asMentee = await inPortal('mentee', () => board.board(mentee.id, { clanId: clan.id }, mentor));
      expect(asMentee.viewer.canAssign).toBe(false);
      await expect(inPortal('mentee', () => board.addItem(mentee.id, OPEN, { title: 'Ship it', kind: 'review' }, mentor, clan.id)))
        .rejects.toThrow();

      const asMentor = await inPortal('mentor', () => board.board(mentee.id, { clanId: clan.id }, mentor));
      expect(asMentor.viewer.canAssign).toBe(true);
    });
  });

  describe('items', () => {
    it('lets the mentee add a personal item, which nobody has to approve', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read chapter 3' }, mentee, clan.id);
      expect(item.kind).toBe('personal');

      const row = await models.AssignedTask.findByPk(item.id);
      expect(row.selfAssigned).toBe(true);
      // `mentor_id` is NOT NULL and means "who set this" — for their own item,
      // that is the mentee. `self_assigned` is what keeps it out of the queue.
      expect(row.mentorId).toBe(mentee.id);
      expect(row.scheduleSlotId).toBe(OPEN);
    });

    /**
     * The reason `self_assigned` exists at all. A mentee's own to-do must never
     * land in a mentor's queue, or the queue stops being read.
     */
    it('refuses to let a mentee set work for review', async () => {
      await expect(
        board.addItem(mentee.id, OPEN, { title: 'Grade me', kind: 'review' }, mentee, clan.id),
      ).rejects.toThrow(/Only a mentor can set work/i);
    });

    it('lets the mentor set work for review in the same block', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Ship the API', kind: 'review' }, mentor, clan.id);
      expect(item.kind).toBe('review');
      const row = await models.AssignedTask.findByPk(item.id);
      expect(row.selfAssigned).toBe(false);
      expect(row.mentorId).toBe(mentor.id);
    });

    it('ticks a personal item straight off', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read chapter 3' }, mentee, clan.id);
      const done = await board.completeItem(item.id, mentee);
      expect(done.status).toBe('completed');
    });

    /**
     * Ticking is not submitting. Work for review goes to the mentor through the
     * flow that already exists, so a tick on the plan and a submission from the
     * task page produce the same record rather than two disagreeing ones.
     */
    it('refuses to tick work that belongs to the mentor', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Ship the API', kind: 'review' }, mentor, clan.id);
      await expect(board.completeItem(item.id, mentee)).rejects.toThrow(/submit your work/i);
    });

    it('refuses to let a personal item be submitted for review', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read chapter 3' }, mentee, clan.id);
      await expect(
        submissionService.submitTaskWithFiles(item.id, mentee.id, { submissionText: 'done' }, []),
      ).rejects.toThrow(/tick it off on your plan/i);
    });

    it('moves an item between blocks, and off the day', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read chapter 3' }, mentee, clan.id);
      await board.moveItem(item.id, LOCKED, mentee, clan.id);
      expect((await models.AssignedTask.findByPk(item.id)).scheduleSlotId).toBe(LOCKED);

      await board.moveItem(item.id, null, mentee, clan.id);
      expect((await models.AssignedTask.findByPk(item.id)).scheduleSlotId).toBeNull();

      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(b.unplanned.map((i) => i.title)).toContain('Read chapter 3');
    });

    it('lets the mentee put their own work into a block the mentor locked', async () => {
      // Locking protects the block's shape, not what you bring to it.
      const item = await board.addItem(mentee.id, LOCKED, { title: 'My standup notes' }, mentee, clan.id);
      expect(item.kind).toBe('personal');
    });
  });

  describe('blocks', () => {
    it('refuses to retime a block the mentor locked', async () => {
      await expect(
        board.updateSlot(mentee.id, LOCKED, { time: '11:00' }, mentee, clan.id),
      ).rejects.toThrow(/locked this block/i);
    });

    it('lets the mentee retime an unlocked block, and marks it as theirs now', async () => {
      await board.updateSlot(mentee.id, OPEN, { time: '14:00' }, mentee, clan.id);
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const open = slotOf(b, OPEN);
      expect(open.time).toBe('14:00');
      // The mark that lets "apply to all" skip somebody who made it their own.
      expect(open.editedByMentee).toBe(true);
    });

    it('does not mark a block when the mentor is the one changing it', async () => {
      await board.updateSlot(mentee.id, OPEN, { time: '14:00' }, mentor, clan.id);
      const b = await board.board(mentee.id, { clanId: clan.id }, mentor);
      expect(slotOf(b, OPEN).editedByMentee).toBe(false);
    });

    it('refuses to let a mentee lock a block', async () => {
      await expect(
        board.updateSlot(mentee.id, OPEN, { locked: true }, mentee, clan.id),
      ).rejects.toThrow(/Only a mentor can lock/i);
    });

    it('gives a mentee their own block, which is theirs to remove', async () => {
      const slot = await board.addSlot(mentee.id, { label: 'My study block', time: '20:00' }, mentee, clan.id);
      expect(slot.owner).toBe('mentee');

      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const mine = slotOf(b, slot.id);
      expect(mine.rights.canRemove).toBe(true);
      expect(mine.rights.canRetime).toBe(true);
    });

    it('refuses to let a mentee delete a block their mentor gave them', async () => {
      await expect(board.removeSlot(mentee.id, OPEN, mentee, clan.id))
        .rejects.toThrow(/came from your mentor/i);
    });

    /** Deleting a block must not take the work in it down as well. */
    it('returns a removed block’s items to unplanned rather than deleting them', async () => {
      const slot = await board.addSlot(mentee.id, { label: 'My study block', time: '20:00' }, mentee, clan.id);
      const item = await board.addItem(mentee.id, slot.id, { title: 'Revise SQL' }, mentee, clan.id);
      await board.removeSlot(mentee.id, slot.id, mentee, clan.id);

      const row = await models.AssignedTask.findByPk(item.id);
      expect(row).not.toBeNull();
      expect(row.scheduleSlotId).toBeNull();

      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(b.unplanned.map((i) => i.title)).toContain('Revise SQL');
    });

    it('a mentor can remove a block they own', async () => {
      await expect(board.removeSlot(mentee.id, OPEN, mentor, clan.id)).resolves.toBeTruthy();
    });
  });

  /**
   * A roadmap block points at roadmaps; the slot is recorded on
   * `RoadmapProgress.slot`, never on the task. Read naively, every piece of
   * roadmap work a mentee has fell into "not on the day yet" while the block
   * governing it sat empty.
   */
  describe('roadmap blocks', () => {
    const ROADMAP_SLOT = 'slot-roadmap';
    let roadmap, step, roadmapTask;

    beforeEach(async () => {
      roadmap = await models.Roadmap.create({
        programId: program.id, createdBy: admin.id, name: 'Backend track',
        description: 'Backend', totalTasks: 10,
      });
      step = await models.RoadmapTask.create({
        roadmapId: roadmap.id, title: 'Step 1 · Request scoping', description: 'x',
        type: 'project', taskOrder: 1, deliverable: 'PR', estimatedHours: 3, difficulty: 'medium',
      });
      roadmapTask = await models.AssignedTask.create({
        organizationId: clan.organizationId, clanId: clan.id, menteeId: mentee.id,
        mentorId: mentor.id, roadmapTaskId: step.id, status: 'in_progress', assignedAt: new Date(),
      });
      await models.RoadmapProgress.create({
        roadmapId: roadmap.id, menteeId: mentee.id, clanId: clan.id,
        currentStep: 4, completed: false, slot: ROADMAP_SLOT,
      });

      schedule.schedule = [
        ...schedule.schedule,
        {
          id: ROADMAP_SLOT, label: 'Track time', time: '14:00', days: 'everyday',
          kind: 'roadmap', roadmapChain: [roadmap.id],
        },
      ];
      schedule.changed('schedule', true);
      await schedule.save();
    });

    it('puts roadmap work in the block that governs it, not in unplanned', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const block = slotOf(b, ROADMAP_SLOT);
      expect(block.items.map((i) => i.id)).toContain(roadmapTask.id);
      expect(b.unplanned.map((i) => i.id)).not.toContain(roadmapTask.id);
    });

    it('marks it as being there because of its roadmap', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const item = slotOf(b, ROADMAP_SLOT).items.find((i) => i.id === roadmapTask.id);
      expect(item.fromRoadmapSlot).toBe(true);
    });

    it('carries the chain’s live progress so the block is not just a label', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const [chain] = slotOf(b, ROADMAP_SLOT).chainDetails;
      expect(chain).toMatchObject({
        name: 'Backend track', started: true, completed: false, currentStep: 4, totalSteps: 10, percent: 40,
      });
    });

    /** Moving one somewhere else is a decision, and it has to stick. */
    it('lets an explicit move beat the roadmap mapping', async () => {
      await board.moveItem(roadmapTask.id, OPEN, mentee, clan.id);
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(slotOf(b, OPEN).items.map((i) => i.id)).toContain(roadmapTask.id);
      expect(slotOf(b, ROADMAP_SLOT).items.map((i) => i.id)).not.toContain(roadmapTask.id);
      // ...and it is no longer "here because of its roadmap".
      const moved = slotOf(b, OPEN).items.find((i) => i.id === roadmapTask.id);
      expect(moved.fromRoadmapSlot).toBe(false);
    });

    it('leaves roadmap work with no block of its own in unplanned', async () => {
      const other = await models.Roadmap.create({
        programId: program.id, createdBy: admin.id, name: 'Unscheduled track',
        description: 'y', totalTasks: 3,
      });
      const otherStep = await models.RoadmapTask.create({
        roadmapId: other.id, title: 'Loose step', description: 'x',
        type: 'project', taskOrder: 1, deliverable: 'PR', estimatedHours: 1, difficulty: 'easy',
      });
      const loose = await models.AssignedTask.create({
        organizationId: clan.organizationId, clanId: clan.id, menteeId: mentee.id,
        mentorId: mentor.id, roadmapTaskId: otherStep.id, status: 'assigned', assignedAt: new Date(),
      });

      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(b.unplanned.map((i) => i.id)).toContain(loose.id);
    });

    it('gives a plain block no chain details at all', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(slotOf(b, OPEN).chainDetails).toBeNull();
    });
  });

  /**
   * The board offered a control the write then refused.
   *
   * `mentee_schedules.clan_id` is nullable and most rows in the wild have no
   * clan — the older flows never set one. `board` resolved the viewer's grant
   * against the clan in the REQUEST and rendered a lock button; every write
   * resolved it against the ROW's clan, which was null, where a clan-scoped
   * grant covers nothing. A lead mentor clicked lock on their own clan's mentee
   * and got "Only a mentor can lock a block".
   */
  describe('a schedule row with no clan of its own', () => {
    beforeEach(async () => {
      await schedule.update({ clanId: null });
    });

    /**
     * A legacy row must be ADOPTED, never bypassed.
     *
     * The failure this guards is quieter than a thrown error and worse: the
     * two paths that create a block (`addSlot`, `applyTemplate`) do not refuse
     * when the lookup misses the row — they make a new one. So a mentee with a
     * clanless row got a SECOND row stamped with the clan, their existing
     * blocks stayed behind in the orphaned one, and the planner showed a day
     * that had quietly lost everything on it. Nothing threw, so nothing said
     * so.
     */
    it('adds to the clanless row instead of starting a second one', async () => {
      const before = await models.MenteeSchedule.count({ where: { menteeId: mentee.id } });
      expect(before).toBe(1);

      await board.addSlot(mentee.id, { label: 'Evening review', time: '18:00' }, mentor, clan.id);

      const after = await models.MenteeSchedule.count({ where: { menteeId: mentee.id } });
      expect(after).toBe(1);

      // ...and the new block is on the row that already had the others.
      const row = await models.MenteeSchedule.findOne({ where: { menteeId: mentee.id } });
      expect(row.clanId).toBeNull();
      const labels = (row.schedule || []).map((slot) => slot.label);
      expect(labels).toContain('Evening review');
      expect(labels).toContain('Deep work');
    });

    it('still lets the clan’s mentor lock a block', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentor);
      expect(slotOf(b, OPEN).rights.canLock).toBe(true);

      // The part that used to throw.
      const slot = await board.updateSlot(mentee.id, OPEN, { locked: true }, mentor, clan.id);
      expect(slot.locked).toBe(true);
    });

    it('offers and allows exactly the same things', async () => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentor);
      const rights = slotOf(b, OPEN).rights;
      expect(rights.canRetime).toBe(true);
      expect(rights.canRemove).toBe(true);
      await expect(board.updateSlot(mentee.id, OPEN, { time: '11:00' }, mentor, clan.id)).resolves.toBeTruthy();
      await expect(board.removeSlot(mentee.id, OPEN, mentor, clan.id)).resolves.toBeTruthy();
    });

    it('lets the mentor set work for review there', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Ship the auth PR', kind: 'review' }, mentor, clan.id);
      expect(item.kind).toBe('review');
    });

    /**
     * The clan has to land ON the task, not just on the request that made it.
     *
     * Stamping the row's null clan put a mentor's review work outside every
     * clan-scoped read — it never reached the clan's approvals queue — and made
     * the next write resolve the mentor's clan-scoped grant against nothing.
     */
    it('stamps the clan the mentor is acting in onto the work', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Ship the auth PR', kind: 'review' }, mentor, clan.id);
      const row = await models.AssignedTask.findByPk(item.id);
      expect(row.clanId).toBe(clan.id);
    });

    /**
     * A task that already carries no clan — anything created before the stamp
     * above, and every item a mentee writes on a clanless row — is still
     * reachable, because the actor's clan answers for it.
     */
    it('lets the mentor tick a clanless item when they say which clan they are in', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read the brief' }, mentee, clan.id);
      await models.AssignedTask.update({ clanId: null }, { where: { id: item.id } });

      await expect(board.completeItem(item.id, mentor, true)).rejects.toThrow(/cannot change this plan/i);
      await expect(board.completeItem(item.id, mentor, true, clan.id)).resolves.toMatchObject({ status: 'completed' });
    });

    it('still refuses an outsider who names the clan', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Read the brief' }, mentee, clan.id);
      await models.AssignedTask.update({ clanId: null }, { where: { id: item.id } });
      await expect(
        board.completeItem(item.id, outsiderMentor, true, clan.id),
      ).rejects.toThrow(/cannot change this plan/i);
    });

    /** The looseness must not leak: a stranger is still a stranger. */
    it('does not let an unrelated mentor in through the gap', async () => {
      await expect(
        board.updateSlot(mentee.id, OPEN, { locked: true }, outsiderMentor, clan.id),
      ).rejects.toThrow(/cannot change this plan/i);
    });
  });

  /**
   * The next occurrence is written at the moment one is finished, so a repeat
   * works with no scheduler alive and a series nobody keeps up with stops by
   * itself rather than piling up untouched copies.
   */
  describe('items that repeat', () => {
    const everyWeekday = { freq: 'weekly', days: [1, 2, 3, 4, 5] };

    const setMenteeZone = async (timezone) => {
      const existing = await models.UserSettings.findOne({ where: { userId: mentee.id } });
      if (existing) await existing.update({ timezone });
      else await models.UserSettings.create({ userId: mentee.id, timezone });
    };

    const openItemsIn = async (slotId) => {
      const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
      return b.slots.find((x) => x.id === slotId).items;
    };

    it('creates the next one when a personal item is ticked', async () => {
      const item = await board.addItem(
        mentee.id, OPEN,
        { title: 'Post on LinkedIn', repeat: { freq: 'weekly', days: [3] }, dueDate: '2026-10-14' },
        mentee, clan.id,
      );
      const result = await board.completeItem(item.id, mentee);
      expect(result.nextOccurrence).toBe('2026-10-21');

      // It lands in the same block, open, carrying the rule forward.
      const next = await models.AssignedTask.findOne({
        where: { menteeId: mentee.id, status: 'assigned', scheduleSlotId: OPEN },
      });
      expect(next.titleOverride).toBe('Post on LinkedIn');
      expect(next.repeatRule).toMatchObject({ freq: 'weekly', days: [3] });
      expect(next.selfAssigned).toBe(true);
    });

    /**
     * The rule moves to the successor, which is what makes a second tick — a
     * retry, a double-click, a reopened item — unable to produce a duplicate.
     */
    it('does not produce a second copy when the same item is finished twice', async () => {
      const item = await board.addItem(
        mentee.id, OPEN, { title: 'Daily review', repeat: { freq: 'daily' }, dueDate: '2026-10-14' },
        mentee, clan.id,
      );
      await board.completeItem(item.id, mentee);
      await board.completeItem(item.id, mentee, false);
      await board.completeItem(item.id, mentee);

      const copies = await models.AssignedTask.count({
        where: { menteeId: mentee.id, titleOverride: 'Daily review', status: { [require('sequelize').Op.ne]: 'completed' } },
      });
      expect(copies).toBe(1);
    });

    it('leaves a one-off item alone', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Just once' }, mentee, clan.id);
      const result = await board.completeItem(item.id, mentee);
      expect(result.nextOccurrence).toBeNull();

      // It stays in its block for the rest of the day — that is what lets the
      // ring reach full — but nothing new is created behind it.
      const items = await openItemsIn(OPEN);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ id: item.id, status: 'completed' });
    });

    it('stops the series once it runs past its end date', async () => {
      const item = await board.addItem(
        mentee.id, OPEN,
        { title: 'Short series', repeat: { freq: 'daily', until: '2026-10-14' }, dueDate: '2026-10-14' },
        mentee, clan.id,
      );
      const result = await board.completeItem(item.id, mentee);
      expect(result.nextOccurrence).toBeNull();
    });

    /**
     * A repeat that lands on weekdays must not put Monday's copy on the
     * Saturday board. The successor is written the moment one is finished, so
     * it exists days before it is due — real, but not yet today's work.
     */
    /** The mentee's day, which is UTC unless their settings say otherwise. */
    const todayForMentee = () => new Date().toISOString().slice(0, 10);

    it('keeps the next occurrence off the board until its day arrives', async () => {
      const today = todayForMentee();
      const item = await board.addItem(
        mentee.id, OPEN,
        { title: 'Post on LinkedIn', repeat: { freq: 'weekly', days: [3] }, dueDate: today },
        mentee, clan.id,
      );
      const { nextOccurrence: next } = await board.completeItem(item.id, mentee);
      expect(next > today).toBe(true);

      // The successor exists...
      const successor = await models.AssignedTask.findOne({
        where: { menteeId: mentee.id, status: 'assigned', titleOverride: 'Post on LinkedIn' },
      });
      expect(successor.occurrenceDate).toBe(next);

      // ...and today's block shows only the one that was finished today.
      const items = await openItemsIn(OPEN);
      expect(items.map((i) => i.id)).toEqual([item.id]);
    });

    it('shows an occurrence whose day has arrived, however late', async () => {
      const item = await board.addItem(
        mentee.id, OPEN, { title: 'Yesterday’s rep', repeat: { freq: 'daily' } }, mentee, clan.id,
      );
      await models.AssignedTask.update(
        { occurrenceDate: '2020-01-01' }, { where: { id: item.id } },
      );
      const items = await openItemsIn(OPEN);
      expect(items.map((i) => i.id)).toContain(item.id);
    });

    /**
     * A day-only deadline is the END of that day, in the mentee's own zone.
     * Storing the day key straight into `due_date` made every occurrence born
     * overdue — midnight at the START of the day it was for.
     */
    it('makes a deadline the end of its day in the mentee’s zone', async () => {
      await setMenteeZone('Asia/Karachi');
      const item = await board.addItem(
        mentee.id, OPEN, { title: 'Ship it', kind: 'review', dueDate: '2026-11-04' }, mentor, clan.id,
      );
      const row = await models.AssignedTask.findByPk(item.id);
      // End of the 4th in Karachi (UTC+5) is 18:59 UTC on the 4th — not
      // midnight at the start of it, which is what made every occurrence
      // arrive already overdue.
      expect(row.dueDate.toISOString()).toBe('2026-11-04T18:59:00.000Z');
    });

    it('gives a rolled-forward occurrence the same end-of-day deadline', async () => {
      await setMenteeZone('Asia/Karachi');
      const today = todayForMentee();
      const item = await board.addItem(
        mentee.id, OPEN, { title: 'Daily rep', repeat: { freq: 'daily' }, dueDate: today }, mentee, clan.id,
      );
      const { nextOccurrence: next } = await board.completeItem(item.id, mentee);

      const successor = await models.AssignedTask.findOne({
        where: { menteeId: mentee.id, status: 'assigned', titleOverride: 'Daily rep' },
      });
      expect(successor.occurrenceDate).toBe(next);
      expect(successor.dueDate.toISOString()).toMatch(/T18:59:00\.000Z$/);
    });

    /**
     * A daily habit the mentee has already done must not wait on how fast
     * their mentor reviews it, so the roll-forward happens at SUBMISSION — the
     * same reason the roadmap advances there.
     */
    it('rolls a repeating review item forward when it is submitted', async () => {
      const today = todayForMentee();
      const item = await board.addItem(
        mentee.id, OPEN,
        { title: 'Daily standup post', kind: 'review', repeat: { freq: 'daily' }, dueDate: today },
        mentor, clan.id,
      );
      await submissionService.submitTaskWithFiles(item.id, mentee.id, { submissionText: 'posted' }, []);

      const successor = await models.AssignedTask.findOne({
        where: {
          menteeId: mentee.id,
          titleOverride: 'Daily standup post',
          id: { [require('sequelize').Op.ne]: item.id },
        },
      });
      expect(successor).toBeTruthy();
      expect(successor.status).toBe('assigned');
      expect(successor.selfAssigned).toBe(false);
      // The rule moved on, so the approval hook that follows is a no-op.
      expect((await models.AssignedTask.findByPk(item.id)).repeatRule).toBeNull();
    });

    it('turns a repeat on and off after the fact', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Standup note' }, mentee, clan.id);
      const on = await board.setItemRepeat(item.id, everyWeekday, mentee);
      expect(on.repeat).toMatchObject({ freq: 'weekly', days: [1, 2, 3, 4, 5] });

      const off = await board.setItemRepeat(item.id, null, mentee);
      expect(off.repeat).toBeNull();
    });

    it('refuses a frequency it cannot honour', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Hourly?' }, mentee, clan.id);
      await expect(board.setItemRepeat(item.id, { freq: 'hourly' }, mentee))
        .rejects.toThrow(/daily, weekly, monthly or yearly/i);
    });

    it('does not let a stranger set a repeat on somebody else’s item', async () => {
      const item = await board.addItem(mentee.id, OPEN, { title: 'Mine' }, mentee, clan.id);
      await expect(board.setItemRepeat(item.id, everyWeekday, stranger))
        .rejects.toThrow(/cannot change this plan/i);
    });

    it('sends the rule and a readable label down with the board', async () => {
      await board.addItem(
        mentee.id, OPEN, { title: 'Weekday ritual', repeat: everyWeekday }, mentee, clan.id,
      );
      const [item] = await openItemsIn(OPEN);
      expect(item.repeat).toMatchObject({ freq: 'weekly' });
      expect(item.repeatLabel).toBe('Every weekday');
    });

    /**
     * Ticking never finishes work for review, so a mentor-set repeat must roll
     * forward on APPROVAL instead — see submissionService.
     */
    it('will not roll a reviewable repeat forward from a tick', async () => {
      const item = await board.addItem(
        mentee.id, OPEN, { title: 'Weekly reflection', kind: 'review', repeat: { freq: 'weekly' } },
        mentor, clan.id,
      );
      await expect(board.completeItem(item.id, mentee)).rejects.toThrow(/submit your work/i);
    });
  });

  describe('the clan-review strip', () => {
    it('counts what is planned and what is finished, per block', async () => {
      const a = await board.addItem(mentee.id, OPEN, { title: 'One' }, mentee, clan.id);
      await board.addItem(mentee.id, OPEN, { title: 'Two' }, mentee, clan.id);
      await board.completeItem(a.id, mentee);

      const strip = await board.strip(mentee.id, clan.id, mentor);
      const open = strip.blocks.find((b) => b.id === OPEN);
      expect(open).toMatchObject({ total: 2, done: 1 });
    });

    it('is refused to a mentor outside the clan', async () => {
      await expect(board.strip(mentee.id, clan.id, outsiderMentor)).rejects.toThrow(/cannot change this plan/i);
    });

    it('gives the whole clan row its plan progress at once, leaving out who the mentor cannot see', async () => {
      const a = await board.addItem(mentee.id, OPEN, { title: 'One' }, mentee, clan.id);
      await board.addItem(mentee.id, OPEN, { title: 'Two' }, mentee, clan.id);
      await board.completeItem(a.id, mentee);

      const progress = await board.stripsMany([mentee.id, stranger.id], clan.id, mentor);
      expect(progress[mentee.id]).toEqual({ hasPlan: true, total: 2, done: 1 });
      expect(progress[stranger.id]).toBeUndefined();
    });
  });

  describe('sitting out a block for one day', () => {
    it('hides a mentor’s block for today and brings it back on its own', async () => {
      await board.hideSlotToday(mentee.id, OPEN, mentee, clan.id);
      const hidden = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(hidden.slots.map((s) => s.id)).not.toContain(OPEN);

      // The row still holds it — hiding is not deleting, and tomorrow's key
      // will no longer match.
      await schedule.reload();
      const stored = schedule.schedule.find((s) => s.id === OPEN);
      expect(stored).toBeTruthy();
      expect(stored.hiddenOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      await board.hideSlotToday(mentee.id, OPEN, mentee, clan.id, false);
      const back = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(back.slots.map((s) => s.id)).toContain(OPEN);
    });

    it('refuses to hide a block the mentee owns — they can just remove it', async () => {
      const slot = await board.addSlot(mentee.id, { label: 'Mine', time: '21:00' }, mentee, clan.id);
      await expect(board.hideSlotToday(mentee.id, slot.id, mentee, clan.id))
        .rejects.toThrow(/yours to change/i);
    });
  });

  describe('choosing a template', () => {
    let offered, priv;

    beforeEach(async () => {
      offered = await models.ScheduleTemplate.create({
        name: 'Evening study', source: 'org', menteeSelectable: true, createdBy: admin.id,
        blocks: [{ label: 'Evening study', time: '19:00' }, { label: 'Wind down', time: '22:00' }],
      });
      priv = await models.ScheduleTemplate.create({
        name: 'Programme shape', source: 'org', menteeSelectable: false, createdBy: admin.id,
        blocks: [{ label: 'Cohort block', time: '12:00' }],
      });
    });

    it('offers only what an admin published to mentees', async () => {
      const list = await board.selectableTemplates(mentee.id, mentee, clan.id);
      expect(list.map((t) => t.name)).toEqual(['Evening study']);
    });

    it('refuses a template that was not offered', async () => {
      await expect(board.applyTemplate(mentee.id, priv.id, mentee, clan.id))
        .rejects.toThrow(/not available to choose/i);
    });

    /**
     * The rule that makes self-service safe: taking a template ADDS to the day.
     * It can never remove or overwrite a block a mentor set.
     */
    it('merges into the day and leaves the mentor’s blocks untouched', async () => {
      const before = await board.board(mentee.id, { clanId: clan.id }, mentee);
      const result = await board.applyTemplate(mentee.id, offered.id, mentee, clan.id);
      expect(result.added).toBe(2);

      const after = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(after.slots.length).toBe(before.slots.length + 2);
      // The mentor's blocks are still there, still theirs, still locked.
      expect(after.slots.find((s) => s.id === LOCKED).locked).toBe(true);
      expect(after.slots.find((s) => s.id === OPEN).owner).toBe('mentor');
      // What the mentee chose is theirs, so "apply to all" will skip it.
      expect(after.slots.find((s) => s.label === 'Evening study').owner).toBe('mentee');
    });

    it('does not duplicate a block the day already has', async () => {
      await board.applyTemplate(mentee.id, offered.id, mentee, clan.id);
      const second = await board.applyTemplate(mentee.id, offered.id, mentee, clan.id);
      expect(second.added).toBe(0);

      const after = await board.board(mentee.id, { clanId: clan.id }, mentee);
      expect(after.slots.filter((s) => s.label === 'Evening study').length).toBe(1);
    });
  });

  it('leaves a mentee with no schedule row with an empty, usable day', async () => {
    await schedule.destroy();
    const b = await board.board(mentee.id, { clanId: clan.id }, mentee);
    expect(b.hasSchedule).toBe(false);
    expect(b.slots).toEqual([]);

    // ...and adding a block creates the row rather than failing.
    const slot = await board.addSlot(mentee.id, { label: 'Morning', time: '08:00' }, mentee, clan.id);
    expect(slot.owner).toBe('mentee');
  });
});
