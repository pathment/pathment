const { Op } = require('sequelize');
const { models, sequelize } = require('../db');
const { NotFoundError, ForbiddenError, ValidationError } = require('../utils/errors/errorTypes');
const { deleteFromCloudinary, extractPublicId } = require('../utils/cloudinaryUpload');
const { discussionWindow } = require('../utils/discussionWindow');
const logger = require('../utils/logger');
const cohortService = require('./cohortService');
const authzService = require('./authzService');
const cohortReviewService = require('./cohortReviewService');
const clanLifecycleService = require('./clanLifecycleService');

/** Task statuses that still point at a group; a finished task keeps its record. */
const OPEN_TASK_STATUSES = ['assigned', 'not_started', 'in_progress', 'revision_needed'];

const cleanText = (value, max) => String(value || '').trim().slice(0, max);
// A scenario is written in the rich text editor. Its limit counts what a reader
// sees, as the client's counter does (SCENARIO_MAX_CHARS there); the HTML cap
// only stops a page of empty formatting.
const SCENARIO_MAX_CHARS = 5000;
const SCENARIO_HTML_MAX = 20000;

/** The words of a scenario, as the client's stripHtml reads them. */
const visibleText = (html) => String(html || '')
  .replace(/<\/(p|div|li|h[1-6]|br)>/gi, ' ')
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();

/** A scenario to store, or null for none; too long is refused, never cut short. */
function cleanScenario(prompt) {
  const html = String(prompt || '').trim();
  const words = visibleText(html);
  if (!words) return null;
  if (words.length > SCENARIO_MAX_CHARS) {
    throw new ValidationError(`The scenario can be at most ${SCENARIO_MAX_CHARS.toLocaleString('en-US')} characters; it has ${words.length.toLocaleString('en-US')}.`);
  }
  if (html.length > SCENARIO_HTML_MAX) throw new ValidationError('The scenario has too much formatting to save. Simplify it and try again.');
  return html;
}

/**
 * The schedule fields of a group. 'none' is one window between two instants,
 * both required, so every group closes and its tasks have a real due date;
 * 'weekly' is the ReviewSchedule shape.
 */
function normalizeSchedule(input = {}) {
  const repeat = input.repeat === 'weekly' ? 'weekly' : 'none';
  if (repeat === 'none') {
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (!startsAt || !endsAt) throw new ValidationError('Choose when the discussion starts and ends');
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new ValidationError('That is not a valid date and time');
    }
    if (endsAt <= startsAt) throw new ValidationError('The end time must be after the start time');
    if (endsAt <= new Date()) throw new ValidationError('The end time must be in the future');
    return {
      repeat, startsAt, endsAt, dayOfWeek: null, timeLocal: null, durationMinutes: null, timezone: null, startsOn: null, endsOn: null,
    };
  }

  const dayOfWeek = Number(input.dayOfWeek);
  const durationMinutes = Number(input.durationMinutes);
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw new ValidationError('Choose the day of the week');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.timeLocal || ''))) {
    throw new ValidationError('Choose a start time');
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) {
    throw new ValidationError('The duration must be between 5 minutes and 24 hours');
  }
  if (!input.timezone) throw new ValidationError('A timezone is required');
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateOnly.test(String(input.startsOn || ''))) throw new ValidationError('Choose the first date');
  if (input.endsOn && !dateOnly.test(String(input.endsOn))) throw new ValidationError('That is not a valid end date');
  if (input.endsOn && input.endsOn < input.startsOn) {
    throw new ValidationError('The last date cannot be before the first date');
  }
  return {
    repeat,
    startsAt: null,
    endsAt: null,
    dayOfWeek,
    timeLocal: input.timeLocal,
    durationMinutes,
    timezone: String(input.timezone).slice(0, 64),
    startsOn: input.startsOn,
    endsOn: input.endsOn || null,
  };
}

/**
 * Group discussions: a scenario, the groups discussing it, and how much each
 * member is contributing.
 *
 * The chat itself is not here. A group owns one 'group' conversation, and
 * messages go through messagingService like any other, which asks this service
 * only one question: `assertCanPost`.
 */
class GroupDiscussionService {
  // ── access ───────────────────────────────────────────────────────────────

  async _mentorGroup(mentorId, groupId) {
    const group = await models.DiscussionGroup.findByPk(groupId, {
      include: [{ model: models.DiscussionScenario, as: 'scenario' }],
    });
    if (!group) throw new NotFoundError('Group discussion not found');
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (!clanIds.includes(group.clanId)) throw new ForbiddenError('You do not mentor this clan');
    return group;
  }

  async _mentorScenario(mentorId, scenarioId) {
    const scenario = await models.DiscussionScenario.findByPk(scenarioId);
    if (!scenario) throw new NotFoundError('Scenario not found');
    const clanIds = await authzService.mentoredClanIds(mentorId);
    if (!clanIds.includes(scenario.clanId)) throw new ForbiddenError('You do not mentor this clan');
    return scenario;
  }

  /**
   * Any mentor of the clan can open a group, not only the one who made it, so
   * they join its chat the first time they do. Otherwise a co-mentor could not
   * read the messages or answer in them.
   */
  async _ensureMentorInChat(group, mentorId) {
    if (!group.conversationId) return;
    await this._seat(group, mentorId, 'owner');
  }

  /**
   * Everybody reads the whole discussion, including somebody added late, so
   * they join from the conversation's first moment rather than today.
   */
  async _seat(group, userId, role, transaction = null) {
    const conversation = await models.Conversation.findByPk(group.conversationId, { transaction });
    const existing = await models.ConversationParticipant.findOne({
      where: { conversationId: group.conversationId, userId }, transaction,
    });
    if (existing) {
      if (existing.leftAt) await existing.update({ leftAt: null, role }, { transaction });
      return existing;
    }
    return models.ConversationParticipant.create({
      conversationId: group.conversationId, userId, role, joinedAt: conversation.createdAt,
    }, { transaction });
  }

  // ── what messagingService asks ───────────────────────────────────────────

  /** Whether this person may post in this group's conversation right now. */
  async assertCanPost(conversationId, userId, transaction = null) {
    const group = await models.DiscussionGroup.findOne({ where: { conversationId }, transaction });
    if (!group) throw new NotFoundError('Group discussion not found');
    const participant = await models.ConversationParticipant.findOne({
      where: { conversationId, userId, leftAt: null }, transaction,
    });
    if (!participant) throw new ForbiddenError('You are not part of this discussion');
    if (participant.role === 'owner') return group;

    const { state } = discussionWindow(group);
    if (state === 'ended') throw new ValidationError('This discussion has ended, so the chat is frozen');
    if (state === 'upcoming') throw new ValidationError('This discussion is not open yet');
    return group;
  }

  // ── scenarios ────────────────────────────────────────────────────────────

  async createScenario(mentorId, { clanId, title, prompt } = {}) {
    const resolvedClanId = await cohortReviewService._resolveClanId(mentorId, clanId);
    await clanLifecycleService.assertClanWritable(resolvedClanId);
    const cleanTitle = cleanText(title, 200);
    if (!cleanTitle) throw new ValidationError('Give the scenario a title');
    return models.DiscussionScenario.create({
      clanId: resolvedClanId, title: cleanTitle, prompt: cleanScenario(prompt), createdBy: mentorId,
    });
  }

  async updateScenario(mentorId, scenarioId, { title, prompt } = {}) {
    const scenario = await this._mentorScenario(mentorId, scenarioId);
    await clanLifecycleService.assertClanWritable(scenario.clanId);
    if (title !== undefined) {
      const cleanTitle = cleanText(title, 200);
      if (!cleanTitle) throw new ValidationError('Give the scenario a title');
      scenario.title = cleanTitle;
    }
    if (prompt !== undefined) scenario.prompt = cleanScenario(prompt);
    await scenario.save();
    return scenario;
  }

  /** Takes its groups with it, each deleted properly, chat included. */
  async deleteScenario(mentorId, scenarioId) {
    const scenario = await this._mentorScenario(mentorId, scenarioId);
    await clanLifecycleService.assertClanWritable(scenario.clanId);
    const groups = await models.DiscussionGroup.findAll({ where: { scenarioId } });
    for (const group of groups) {
      // eslint-disable-next-line no-await-in-loop
      await this._destroyGroup(group);
    }
    await scenario.destroy();
    return { deleted: true };
  }

  /** Every scenario of the clan with its groups: the mentor's main list. */
  async listForMentor(mentorId, clanId) {
    const resolvedClanId = await cohortReviewService._resolveClanId(mentorId, clanId);
    const scenarios = await models.DiscussionScenario.findAll({
      where: { clanId: resolvedClanId },
      include: [{ model: models.DiscussionGroup, as: 'groups', required: false }],
      order: [['created_at', 'DESC'], [{ model: models.DiscussionGroup, as: 'groups' }, 'created_at', 'ASC']],
    });
    const conversationIds = scenarios
      .flatMap((s) => s.groups.map((g) => g.conversationId))
      .filter(Boolean);
    const [memberCounts, messageCounts] = await Promise.all([
      this._countByConversation(models.ConversationParticipant, 'conversationId', conversationIds, { leftAt: null, role: 'participant' }),
      this._countByConversation(models.Message, 'threadId', conversationIds),
    ]);
    return {
      clanId: resolvedClanId,
      scenarios: scenarios.map((s) => ({
        ...s.toJSON(),
        groups: s.groups.map((g) => ({
          ...g.toJSON(),
          ...discussionWindow(g),
          memberCount: memberCounts.get(g.conversationId) || 0,
          messageCount: messageCounts.get(g.conversationId) || 0,
        })),
      })),
    };
  }

  async _countByConversation(model, key, conversationIds, where = {}) {
    if (!conversationIds.length) return new Map();
    const rows = await model.findAll({
      attributes: [key, [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { [key]: { [Op.in]: conversationIds }, ...where },
      group: [model.rawAttributes[key].field],
      raw: true,
    });
    return new Map(rows.map((row) => [row[key], Number(row.count)]));
  }

  // ── groups ───────────────────────────────────────────────────────────────

  /**
   * Everybody in the clan by default; the mentor narrows it from there. A
   * mentee can be in any number of groups, so nothing here looks at others.
   */
  async createGroup(mentorId, { scenarioId, name, menteeIds, schedule } = {}) {
    const scenario = await this._mentorScenario(mentorId, scenarioId);
    await clanLifecycleService.assertClanWritable(scenario.clanId);
    const cleanName = cleanText(name, 150);
    if (!cleanName) throw new ValidationError('Give the group a name');
    const scheduleFields = normalizeSchedule(schedule);

    const clanMenteeIds = await cohortService.resolveMenteeIdsForClan(scenario.clanId);
    const members = menteeIds === undefined ? clanMenteeIds : this._validMembers(menteeIds, clanMenteeIds);
    if (!members.length) throw new ValidationError('Add at least one mentee');

    const group = await sequelize.transaction(async (transaction) => {
      const conversation = await models.Conversation.create({
        type: 'group', createdBy: mentorId, metadata: { kind: 'group_discussion' },
      }, { transaction });
      const created = await models.DiscussionGroup.create({
        clanId: scenario.clanId,
        scenarioId: scenario.id,
        conversationId: conversation.id,
        name: cleanName,
        createdBy: mentorId,
        ...scheduleFields,
      }, { transaction });
      await conversation.update({ metadata: { kind: 'group_discussion', groupId: created.id } }, { transaction });
      await models.ConversationParticipant.bulkCreate(
        [
          { conversationId: conversation.id, userId: mentorId, role: 'owner', joinedAt: conversation.createdAt },
          ...members.map((userId) => ({
            conversationId: conversation.id, userId, role: 'participant', joinedAt: conversation.createdAt,
          })),
        ],
        { transaction },
      );
      return created;
    });
    const tasks = await this._assignTasks(mentorId, group, members);
    return { ...await this.getForMentor(mentorId, group.id), tasks };
  }

  /**
   * Everyone added to a group from its page is assigned the Group Discussion
   * task, the same way Assign Task does it: through the same bulk assign, so
   * the title, due date, notification and seat all match. Someone who already
   * holds this group's task keeps it and is not given a second. An ended group
   * takes no new task, as Assign Task refuses one too.
   *
   * Seating has happened by now, so a task that cannot be made (a mentee with
   * no enrollment, say) is reported back rather than undoing the add.
   */
  async _assignTasks(mentorId, group, menteeIds) {
    const none = { assigned: 0, failed: [] };
    if (!menteeIds.length || discussionWindow(group).state === 'ended') return none;
    const holders = await models.AssignedTask.findAll({
      where: { discussionGroupId: group.id, menteeId: { [Op.in]: menteeIds } },
      attributes: ['menteeId'],
    });
    const held = new Set(holders.map((task) => task.menteeId));
    const ids = menteeIds.filter((id) => !held.has(id));
    if (!ids.length) return none;

    const scenario = group.scenario || await models.DiscussionScenario.findByPk(group.scenarioId, { attributes: ['title'] });
    // Due the day the discussion ends. A group made before its dates were
    // required may have no end: then the day it opens, or the usual default if
    // that is past. createCustomTask never lets the due date fall earlier.
    const { opensAt, closesAt } = discussionWindow(group);
    const at = closesAt || opensAt;
    const dueDate = at && new Date(at) > new Date() ? new Date(at).toISOString().slice(0, 10) : undefined;

    const { results, assigned } = await require('./taskService').bulkCreateCustomTasks({
      menteeIds: ids,
      clanId: group.clanId,
      title: `Discuss: ${scenario?.title || group.name}`,
      description: '',
      type: 'group_discussion',
      discussionGroupId: group.id,
      dueDate,
    }, mentorId);
    return {
      assigned,
      failed: results.filter((row) => !row.ok).map((row) => ({ menteeId: row.menteeId, error: row.error })),
    };
  }

  _validMembers(menteeIds, clanMenteeIds) {
    const ids = [...new Set(Array.isArray(menteeIds) ? menteeIds.filter(Boolean) : [])];
    const allowed = new Set(clanMenteeIds);
    if (ids.some((id) => !allowed.has(id))) throw new ValidationError('Only a mentee of this clan can join this group');
    return ids;
  }

  async updateGroup(mentorId, groupId, { name, schedule } = {}) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    if (name !== undefined) {
      const cleanName = cleanText(name, 150);
      if (!cleanName) throw new ValidationError('Give the group a name');
      group.name = cleanName;
    }
    if (schedule !== undefined) Object.assign(group, normalizeSchedule(schedule));
    await group.save();
    return this.getForMentor(mentorId, group.id);
  }

  async addMembers(mentorId, groupId, menteeIds) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const clanMenteeIds = await cohortService.resolveMenteeIdsForClan(group.clanId);
    const ids = this._validMembers(menteeIds, clanMenteeIds);
    if (!ids.length) throw new ValidationError('Choose at least one mentee');
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await this._seat(group, id, 'participant');
    }
    const tasks = await this._assignTasks(mentorId, group, ids);
    return { ...await this.getForMentor(mentorId, group.id), tasks };
  }

  /**
   * They leave the chat. Their messages stay, because the others replied to
   * them. An open task goes back to being a plain task: it cannot keep sending
   * them to a discussion they are no longer in.
   */
  async removeMember(mentorId, groupId, menteeId) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    const [updated] = await models.ConversationParticipant.update(
      { leftAt: new Date() },
      { where: { conversationId: group.conversationId, userId: menteeId, role: 'participant', leftAt: null } },
    );
    if (!updated) throw new NotFoundError('That mentee is not in this group');
    await models.AssignedTask.update(
      { discussionGroupId: null },
      { where: { discussionGroupId: group.id, menteeId, status: { [Op.in]: OPEN_TASK_STATUSES } } },
    );
    return this.getForMentor(mentorId, group.id);
  }

  /**
   * The mentee opened this group's chat: their Group Discussion task for it
   * starts, through the same status change as the Start button, so the task
   * reads "in progress" and offers Submit. A group that has not opened yet
   * starts nothing, as nobody can take part in it yet.
   */
  async startTasksOnOpen(conversationId, userId) {
    const group = await models.DiscussionGroup.findOne({ where: { conversationId } });
    if (!group || discussionWindow(group).state === 'upcoming') return;
    const tasks = await models.AssignedTask.findAll({
      where: { discussionGroupId: group.id, menteeId: userId, status: { [Op.in]: ['assigned', 'not_started'] } },
      attributes: ['id'],
    });
    const taskService = require('./taskService');
    for (const task of tasks) {
      // eslint-disable-next-line no-await-in-loop
      await taskService.updateTaskStatus(task.id, userId, 'mentee', 'in_progress');
    }
  }

  /** A task assigned from a group puts the mentee in it, even if removed earlier. */
  async seatForTask(group, menteeId, transaction = null) {
    return this._seat(group, menteeId, 'participant', transaction);
  }

  /** The group a Group Discussion task may link: not ended, in the task's clan. */
  async groupForTask(groupId, clanId) {
    const group = await models.DiscussionGroup.findByPk(groupId);
    if (!group) throw new NotFoundError('That group discussion no longer exists');
    if (group.clanId !== clanId) throw new ValidationError('That group discussion belongs to a different clan');
    if (discussionWindow(group).state === 'ended') throw new ValidationError('That group discussion has already ended');
    return group;
  }

  /** The mentor's right after the end: remove the group and everything said in it. */
  async deleteGroup(mentorId, groupId) {
    const group = await this._mentorGroup(mentorId, groupId);
    await clanLifecycleService.assertClanWritable(group.clanId);
    await this._destroyGroup(group);
    return { deleted: true };
  }

  /** The conversation tables do not cascade, so every layer is removed by hand. */
  async _destroyGroup(group) {
    const conversationId = group.conversationId;
    const files = await sequelize.transaction(async (transaction) => {
      if (!conversationId) {
        await group.destroy({ transaction });
        return [];
      }
      const messages = await models.Message.findAll({
        where: { threadId: conversationId }, attributes: ['id'], raw: true, transaction,
      });
      const messageIds = messages.map((m) => m.id);
      const attachments = messageIds.length
        ? await models.MessageAttachment.findAll({ where: { messageId: { [Op.in]: messageIds } }, transaction })
        : [];
      await models.Conversation.update({ lastMessageId: null }, { where: { id: conversationId }, transaction });
      await group.destroy({ transaction });
      if (messageIds.length) {
        await models.MessageAttachment.destroy({ where: { messageId: { [Op.in]: messageIds } }, force: true, transaction });
        await models.MessageReaction.destroy({ where: { messageId: { [Op.in]: messageIds } }, force: true, transaction });
        await models.Notification.destroy({
          where: { relatedEntityType: 'message', relatedEntityId: { [Op.in]: messageIds } }, transaction,
        });
      }
      await models.ConversationParticipant.destroy({ where: { conversationId }, force: true, transaction });
      await models.Message.destroy({ where: { threadId: conversationId }, force: true, transaction });
      await models.Conversation.destroy({ where: { id: conversationId }, force: true, transaction });
      return attachments.map((a) => ({ url: a.fileUrl, type: a.fileType }));
    });

    // After the commit, and best-effort: a file left on Cloudinary is tidiness,
    // not a reason to keep a discussion the mentor asked to delete.
    for (const file of files) {
      const publicId = extractPublicId(file.url);
      if (!publicId) continue;
      const resourceType = String(file.type || '').startsWith('image/') ? 'image' : 'video';
      deleteFromCloudinary(publicId, resourceType)
        .catch((error) => logger.warn('Discussion file could not be removed', { message: error.message }));
    }
  }

  // ── reading a group ──────────────────────────────────────────────────────

  async getForMentor(mentorId, groupId) {
    const group = await this._mentorGroup(mentorId, groupId);
    await this._ensureMentorInChat(group, mentorId);
    return {
      ...group.toJSON(),
      ...discussionWindow(group),
      members: await this.contribution(group),
    };
  }

  /**
   * Who is contributing, from what the chat already records. Message counts
   * show activity, not quality, so this ranks nobody: a member is marked against
   * the group's own average, which also means it needs no setting to tune.
   */
  async contribution(group) {
    const members = await models.ConversationParticipant.findAll({
      where: { conversationId: group.conversationId, role: 'participant', leftAt: null },
      include: [{
        model: models.User,
        as: 'user',
        attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'],
      }],
    });
    const memberIds = members.map((m) => m.userId);
    if (!memberIds.length) return [];

    const [messageRows, fileRows, tasks] = await Promise.all([
      models.Message.findAll({
        attributes: [
          'senderId',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('MAX', sequelize.col('created_at')), 'lastAt'],
        ],
        where: { threadId: group.conversationId, senderId: { [Op.in]: memberIds } },
        group: ['sender_id'],
        raw: true,
      }),
      models.MessageAttachment.findAll({
        attributes: [
          [sequelize.col('message.sender_id'), 'senderId'],
          [sequelize.fn('COUNT', sequelize.col('MessageAttachment.id')), 'count'],
        ],
        include: [{
          model: models.Message,
          as: 'message',
          attributes: [],
          required: true,
          where: { threadId: group.conversationId, senderId: { [Op.in]: memberIds } },
        }],
        group: [sequelize.col('message.sender_id')],
        raw: true,
      }),
      models.AssignedTask.findAll({
        where: { discussionGroupId: group.id, menteeId: { [Op.in]: memberIds } },
        attributes: ['id', 'menteeId', 'status', 'dueDate'],
      }),
    ]);

    const byMember = new Map(messageRows.map((row) => [row.senderId, row]));
    const filesByMember = new Map(fileRows.map((row) => [row.senderId, Number(row.count)]));
    const taskByMember = new Map(tasks.map((task) => [task.menteeId, task]));
    const total = messageRows.reduce((sum, row) => sum + Number(row.count), 0);
    const average = total / memberIds.length;

    return members.map((member) => {
      const row = byMember.get(member.userId);
      const messageCount = row ? Number(row.count) : 0;
      let activity = 'not_joined';
      if (messageCount > 0) activity = messageCount >= average ? 'more_active' : 'less_active';
      else if (member.lastReadAt) activity = 'read_only';
      const task = taskByMember.get(member.userId);
      return {
        userId: member.userId,
        firstName: member.user?.firstName || '',
        lastName: member.user?.lastName || '',
        profilePictureUrl: member.user?.profilePictureUrl || null,
        messageCount,
        fileCount: filesByMember.get(member.userId) || 0,
        lastMessageAt: row?.lastAt || null,
        lastReadAt: member.lastReadAt || null,
        activity,
        task: task ? { id: task.id, status: task.status, dueDate: task.dueDate } : null,
      };
    }).sort((a, b) => b.messageCount - a.messageCount);
  }

  /**
   * How one mentee took part, for the mentor reviewing their Group Discussion
   * task. Built on `contribution`, so the counts are the ones the group page
   * shows, plus what kind of things they posted and when. Null when the task
   * is no longer linked to a group (the mentee was removed from it).
   */
  async participationForTask(mentorId, taskId) {
    const task = await models.AssignedTask.findByPk(taskId, { attributes: ['id', 'menteeId', 'discussionGroupId'] });
    if (!task) throw new NotFoundError('Task not found');
    if (!task.discussionGroupId) return null;
    const group = await this._mentorGroup(mentorId, task.discussionGroupId);
    const members = await this.contribution(group);
    const member = members.find((m) => m.userId === task.menteeId) || null;
    const mine = { threadId: group.conversationId, senderId: task.menteeId };

    const [attachments, textCount, reactionsReceived, messages] = await Promise.all([
      models.MessageAttachment.findAll({
        attributes: ['fileType'],
        include: [{ model: models.Message, as: 'message', attributes: [], required: true, where: mine }],
        raw: true,
      }),
      models.Message.count({ where: { ...mine, messageText: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } } }),
      models.MessageReaction.count({
        include: [{ model: models.Message, as: 'message', attributes: [], required: true, where: mine }],
      }),
      // When they posted, for the activity chart; the browser buckets by its own day.
      models.Message.findAll({ attributes: ['createdAt'], where: mine, order: [['createdAt', 'ASC']], limit: 2000, raw: true }),
    ]);
    const kinds = { voice: 0, image: 0, video: 0, file: 0 };
    for (const { fileType } of attachments) {
      const type = String(fileType || '');
      if (type.startsWith('audio/')) kinds.voice += 1;
      else if (type.startsWith('image/')) kinds.image += 1;
      else if (type.startsWith('video/')) kinds.video += 1;
      else kinds.file += 1;
    }

    const counts = members.map((m) => m.messageCount);
    const total = counts.reduce((sum, n) => sum + n, 0);
    const own = member?.messageCount || 0;
    return {
      group: {
        id: group.id,
        name: group.name,
        conversationId: group.conversationId,
        scenarioTitle: group.scenario?.title || null,
        ...discussionWindow(group),
      },
      member: {
        messageCount: own,
        textCount,
        voiceCount: kinds.voice,
        imageCount: kinds.image,
        videoCount: kinds.video,
        fileCount: kinds.file,
        reactionsReceived,
        firstMessageAt: messages[0]?.createdAt || null,
        lastMessageAt: member?.lastMessageAt || null,
        lastReadAt: member?.lastReadAt || null,
        activity: member?.activity || 'not_joined',
      },
      groupStats: {
        memberCount: members.length,
        totalMessages: total,
        averageMessages: members.length ? total / members.length : 0,
        maxMessages: counts.length ? Math.max(...counts) : 0,
        // Ties share a place: one more than the number who posted more.
        rank: member ? counts.filter((n) => n > own).length + 1 : null,
      },
      messageTimes: messages.map((m) => m.createdAt),
    };
  }

  /**
   * The mentee's own Group Discussion task for each of these groups, newest
   * first, so the chat can offer Submit work with the same form as the task
   * list. Cancelled tasks are left out: there is nothing to submit to them.
   */
  async _myTasks(userId, groupIds) {
    if (!groupIds.length) return new Map();
    const tasks = await models.AssignedTask.findAll({
      where: { menteeId: userId, discussionGroupId: { [Op.in]: groupIds }, status: { [Op.ne]: 'cancelled' } },
      attributes: ['id', 'status', 'discussionGroupId', 'isCustomTask', 'typeOverride', 'titleOverride', 'deliverableOverride', 'acceptanceCriteriaOverride', 'createdAt'],
      include: [{ model: models.RoadmapTask, as: 'roadmapTask', attributes: ['title', 'type', 'deliverable', 'acceptanceCriteria'] }],
      order: [['createdAt', 'DESC']],
    });
    const byGroup = new Map();
    for (const task of tasks) {
      if (byGroup.has(task.discussionGroupId)) continue;
      const rt = task.roadmapTask || {};
      const criteria = task.acceptanceCriteriaOverride;
      byGroup.set(task.discussionGroupId, {
        id: task.id,
        status: task.status,
        title: task.titleOverride ?? rt.title ?? 'Group discussion',
        type: task.typeOverride ?? rt.type ?? 'group_discussion',
        isCustomTask: task.isCustomTask,
        deliverable: task.deliverableOverride ?? rt.deliverable ?? null,
        acceptanceCriteria: Array.isArray(criteria) && criteria.length ? criteria : (rt.acceptanceCriteria || []),
      });
    }
    return byGroup;
  }

  /** What a mentee sees about one group; their own contribution, nobody else's. */
  _forMentee(group, participant, ownMessages, myTask = null) {
    return {
      id: group.id,
      name: group.name,
      clanId: group.clanId,
      clanName: group.clan?.name || null,
      conversationId: group.conversationId,
      repeat: group.repeat,
      dayOfWeek: group.dayOfWeek,
      timeLocal: group.timeLocal,
      durationMinutes: group.durationMinutes,
      timezone: group.timezone,
      scenario: group.scenario ? { id: group.scenario.id, title: group.scenario.title, prompt: group.scenario.prompt } : null,
      ...discussionWindow(group),
      myMessageCount: ownMessages,
      lastReadAt: participant.lastReadAt || null,
      myTask,
    };
  }

  async listForMentee(userId) {
    const rows = await models.ConversationParticipant.findAll({
      where: { userId, leftAt: null, role: 'participant' },
      include: [{ model: models.Conversation, as: 'conversation', attributes: ['id'], required: true, where: { type: 'group' } }],
    });
    if (!rows.length) return [];
    const participantByConversation = new Map(rows.map((row) => [row.conversationId, row]));
    const conversationIds = [...participantByConversation.keys()];
    const groups = await models.DiscussionGroup.findAll({
      where: { conversationId: { [Op.in]: conversationIds } },
      include: [
        { model: models.DiscussionScenario, as: 'scenario' },
        { model: models.Clan, as: 'clan', attributes: ['name'] },
      ],
      order: [['created_at', 'DESC']],
    });
    const [counts, tasks] = await Promise.all([
      this._countByConversation(models.Message, 'threadId', conversationIds, { senderId: userId }),
      this._myTasks(userId, groups.map((group) => group.id)),
    ]);
    return groups.map((group) => this._forMentee(
      group,
      participantByConversation.get(group.conversationId),
      counts.get(group.conversationId) || 0,
      tasks.get(group.id) || null,
    ));
  }

  async getForMentee(userId, groupId) {
    const group = await models.DiscussionGroup.findByPk(groupId, {
      include: [
        { model: models.DiscussionScenario, as: 'scenario' },
        { model: models.Clan, as: 'clan', attributes: ['name'] },
      ],
    });
    if (!group) throw new NotFoundError('Group discussion not found');
    const participant = await models.ConversationParticipant.findOne({
      where: { conversationId: group.conversationId, userId, leftAt: null },
    });
    if (!participant) throw new ForbiddenError('You are not part of this discussion');
    const [own, tasks] = await Promise.all([
      models.Message.count({ where: { threadId: group.conversationId, senderId: userId } }),
      this._myTasks(userId, [group.id]),
    ]);
    return this._forMentee(group, participant, own, tasks.get(group.id) || null);
  }

  /**
   * Everyone in a group's chat, for anyone in it: names and photos only, so a
   * mentee sees who they are talking with and nothing more about them.
   */
  async membersFor(userId, groupId) {
    const group = await models.DiscussionGroup.findByPk(groupId, { attributes: ['id', 'conversationId'] });
    if (!group?.conversationId) throw new NotFoundError('Group discussion not found');
    const seats = await models.ConversationParticipant.findAll({
      where: { conversationId: group.conversationId, leftAt: null },
      include: [{ model: models.User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'profilePictureUrl'] }],
    });
    if (!seats.some((seat) => seat.userId === userId)) throw new ForbiddenError('You are not part of this discussion');
    return seats
      .map((seat) => ({
        userId: seat.userId,
        firstName: seat.user?.firstName || '',
        lastName: seat.user?.lastName || '',
        profilePictureUrl: seat.user?.profilePictureUrl || null,
        role: seat.role === 'owner' ? 'mentor' : 'mentee',
      }))
      // Mentors first, then by name, as a member list reads.
      .sort((a, b) => (a.role === b.role
        ? `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
        : a.role === 'mentor' ? -1 : 1));
  }
}

module.exports = new GroupDiscussionService();
