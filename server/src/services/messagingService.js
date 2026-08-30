const { Op, fn, col } = require('sequelize');
const { models, sequelize } = require('../db');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError
} = require('../utils/errors/errorTypes');
const schedulingService = require('./schedulingService');
const logger = require('../utils/logger');

class MessagingService {
  /**
   * Who a user is allowed to message. Returns `null` for privileged users
   * (admin/mentor) meaning "unrestricted". For a mentee-only user, returns the
   * set of allowed recipient ids = their mentor(s) (matches + clan leads/co) +
   * co-members of every clan they belong to.
   */
  async getAllowedRecipientIds(userId) {
    const user = await models.User.findByPk(userId, { attributes: ['id', 'role', 'capabilities'] });
    if (!user) return [];
    const caps = Array.isArray(user.capabilities) && user.capabilities.length ? user.capabilities : [user.role];
    if (caps.includes('admin') || caps.includes('mentor')) return null; // unrestricted

    const allowed = new Set();
    const mentorIds = await schedulingService.getMenteeMentorIds(userId); // matches + clan lead/co mentors
    mentorIds.forEach((id) => allowed.add(id));

    const myClans = await models.ClanMembership.findAll({ where: { userId, status: 'active' }, attributes: ['clanId'] });
    const clanIds = myClans.map((c) => c.clanId);
    if (clanIds.length) {
      const members = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: clanIds }, status: 'active' }, attributes: ['userId']
      });
      members.forEach((m) => allowed.add(m.userId));
    }
    allowed.delete(userId);
    return [...allowed];
  }
  async findDirectConversationsByKey(directKey, transaction = null) {
    return models.Conversation.findAll({
      where: {
        type: 'direct',
        isArchived: false,
        metadata: {
          directKey
        }
      },
      transaction
    });
  }

  selectCanonicalDirectConversation(conversations) {
    if (!Array.isArray(conversations) || conversations.length === 0) {
      return null;
    }

    return [...conversations].sort((left, right) => {
      const leftLastMessageAt = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : -1;
      const rightLastMessageAt = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : -1;

      if (leftLastMessageAt !== rightLastMessageAt) {
        return rightLastMessageAt - leftLastMessageAt;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    })[0];
  }

  async createOrGetDirectConversation(userId, participantId, options = {}) {
    if (userId === participantId) {
      throw new ValidationError('Cannot create a direct conversation with yourself');
    }

    const participant = await models.User.findByPk(participantId, {
      attributes: ['id', 'status']
    });

    if (!participant || participant.status !== 'active') {
      throw new NotFoundError('Participant not found');
    }

    // A mentee may only start conversations with their mentor(s) + clan members.
    const allowed = await this.getAllowedRecipientIds(userId);
    if (allowed !== null && !allowed.includes(participantId)) {
      throw new ForbiddenError('You can only message your mentor or members of your clan');
    }

    const directKey = [userId, participantId].sort().join(':');

    const conversation = await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        'SELECT pg_advisory_xact_lock(hashtext(:lockKey))',
        {
          replacements: { lockKey: `direct-conversation:${directKey}` },
          transaction
        }
      );

      const existingConversations = await this.findDirectConversationsByKey(directKey, transaction);
      const existingConversation = this.selectCanonicalDirectConversation(existingConversations);
      if (existingConversation) {
        // Rejoining is not the same as never having left. Whoever deleted this
        // conversation gets a fresh joinedAt, which is the floor every read
        // below is filtered by, so the history they removed stays removed. The
        // person who never left keeps theirs: updating both rows in one call
        // was silently wiping the other side's conversation the moment somebody
        // re-opened one they had deleted.
        await models.ConversationParticipant.update({
          leftAt: null,
          isArchived: false,
          joinedAt: new Date(),
          lastReadAt: new Date(),
          lastReadMessageId: null
        }, {
          where: {
            conversationId: existingConversation.id,
            userId: { [Op.in]: [userId, participantId] },
            leftAt: { [Op.ne]: null }
          },
          transaction
        });

        await models.ConversationParticipant.update({
          isArchived: false
        }, {
          where: {
            conversationId: existingConversation.id,
            userId: { [Op.in]: [userId, participantId] },
            leftAt: null
          },
          transaction
        });

        return existingConversation;
      }

      const created = await models.Conversation.create({
        type: 'direct',
        createdBy: userId,
        relatedTaskId: options.relatedTaskId || null,
        relatedEnrollmentId: options.relatedEnrollmentId || null,
        metadata: { directKey }
      }, { transaction });

      await models.ConversationParticipant.bulkCreate([
        {
          conversationId: created.id,
          userId,
          role: 'owner'
        },
        {
          conversationId: created.id,
          userId: participantId,
          role: 'participant'
        }
      ], { transaction });

      return created;
    });

    return this.getConversationByIdForUser(conversation.id, userId);
  }

  async archiveConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await participant.update({ isArchived: true });
    return { archived: true };
  }

  async unarchiveConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await participant.update({ isArchived: false });
    return { archived: false };
  }

  async deleteConversation(userId, conversationId) {
    const participant = await this.assertUserInConversation(userId, conversationId);
    await participant.update({ leftAt: new Date() });
    return { deleted: true };
  }

  async listConversations(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);
    const isArchived = options.archived === 'true' || options.archived === true;

    // Step 1: fetch conversation IDs in stable order using a lightweight join.
    const membershipRows = await models.ConversationParticipant.findAll({
      attributes: ['conversationId', 'joinedAt'],
      where: {
        userId,
        leftAt: null,
        isArchived
      },
      include: [
        {
          model: models.Conversation,
          as: 'conversation',
          attributes: ['id', 'lastMessageAt'],
          where: { isArchived: false },
          required: true
        }
      ],
      // NULLS LAST is not the default. Postgres sorts NULLs first on DESC, so a
      // conversation nobody has written in yet outranked every live thread and
      // the inbox opened on empty rows. A conversation with no messages is the
      // least recent thing there is, not the most.
      order: [
        [
          sequelize.literal(
            '"conversation"."last_message_at" DESC NULLS LAST'
          )
        ],
        ['createdAt', 'DESC']
      ],
      limit,
      subQuery: false
    });

    const orderedConversationIds = [...new Set(
      membershipRows.map((row) => row.conversationId).filter(Boolean)
    )];

    // When this person joined each conversation. Everything they are shown
    // about it - the preview line and the unread badge - is floored by this,
    // so a conversation they deleted and re-opened does not come back carrying
    // its old last message and a badge for messages they chose to remove.
    const joinedAtByConversation = new Map(
      membershipRows.map((row) => [row.conversationId, row.joinedAt ? new Date(row.joinedAt) : null])
    );

    if (orderedConversationIds.length === 0) {
      return [];
    }

    // Step 2: hydrate conversations with participants and latest message.
    const conversations = await models.Conversation.findAll({
      where: {
        id: { [Op.in]: orderedConversationIds },
        isArchived: false
      },
      include: [
        {
          model: models.ConversationParticipant,
          as: 'participants',
          where: {
            leftAt: null
          },
          required: false,
          include: [
            {
              model: models.User,
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
            }
          ]
        },
        {
          model: models.Message,
          as: 'lastMessage',
          attributes: ['id', 'senderId', 'recipientId', 'messageText', 'createdAt', 'isRead']
        }
      ]
    });

    const conversationById = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    );
    const orderedConversations = orderedConversationIds
      .map((conversationId) => conversationById.get(conversationId))
      .filter(Boolean);

    let unreadByConversation = {};
    const unreadRows = await models.Message.findAll({
      attributes: [
        'threadId',
        [fn('COUNT', col('id')), 'count']
      ],
      where: {
        // One branch per conversation rather than a single IN, because each
        // carries its own floor. The list is capped at a hundred and every
        // branch is keyed on the indexed threadId.
        [Op.or]: orderedConversationIds.map((conversationId) => {
          const floor = joinedAtByConversation.get(conversationId);
          return floor
            ? { threadId: conversationId, createdAt: { [Op.gte]: floor } }
            : { threadId: conversationId };
        }),
        recipientId: userId,
        isRead: false
      },
      group: ['thread_id'],
      raw: true
    });

    unreadByConversation = unreadRows.reduce((acc, row) => {
      acc[row.threadId] = Number(row.count);
      return acc;
    }, {});

    // Tag each conversation with the clan(s) its OTHER participants belong to,
    // so the mentor UI can scope the conversation list by clan. One batched
    // ClanMembership query for all counterparts.
    const otherUserIds = new Set();
    for (const conversation of orderedConversations) {
      for (const p of (conversation.participants || [])) {
        if (p.userId && p.userId !== userId) otherUserIds.add(p.userId);
      }
    }
    const clanIdsByUser = new Map();
    if (otherUserIds.size) {
      const memberships = await models.ClanMembership.findAll({
        where: { userId: { [Op.in]: [...otherUserIds] }, status: 'active' },
        attributes: ['userId', 'clanId']
      });
      for (const m of memberships) {
        if (!clanIdsByUser.has(m.userId)) clanIdsByUser.set(m.userId, new Set());
        clanIdsByUser.get(m.userId).add(m.clanId);
      }
    }

    const seenDirectKeys = new Set();

    return orderedConversations.flatMap((conversation) => {
      const json = conversation.toJSON();
      const otherParticipants = (json.participants || []).filter((p) => p.userId !== userId);
      const fallbackDirectKey = otherParticipants
        .map((participant) => participant.userId)
        .concat(userId)
        .filter(Boolean)
        .sort()
        .join(':');
      const directKey = json.type === 'direct'
        ? json.metadata?.directKey || fallbackDirectKey
        : null;

      if (directKey) {
        if (seenDirectKeys.has(directKey)) {
          return [];
        }

        seenDirectKeys.add(directKey);
      }

      // The preview follows the same floor as the thread itself. Without this
      // a re-opened conversation shows a line the person deleted, which is the
      // one place the inbox would contradict what opening it displays.
      const floor = joinedAtByConversation.get(json.id);
      const lastMessage = json.lastMessage
        && (!floor || new Date(json.lastMessage.createdAt) >= floor)
        ? json.lastMessage
        : null;

      return [{
        id: json.id,
        type: json.type,
        relatedTaskId: json.relatedTaskId,
        relatedEnrollmentId: json.relatedEnrollmentId,
        lastMessageAt: json.lastMessageAt,
        unreadCount: unreadByConversation[json.id] || 0,
        participants: otherParticipants.map((p) => ({
          id: p.user?.id,
          firstName: p.user?.firstName,
          lastName: p.user?.lastName,
          email: p.user?.email,
          profilePictureUrl: p.user?.profilePictureUrl,
          role: p.user?.role
        })),
        clanIds: [...new Set(otherParticipants.flatMap((p) => [...(clanIdsByUser.get(p.userId) || [])]))],
        lastMessage
      }];
    });
  }

  async listMessages(userId, conversationId, options = {}) {
    const participant = await this.assertUserInConversation(userId, conversationId);

    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
    const where = { threadId: conversationId };

    // Nothing from before this person joined. For almost everybody joinedAt is
    // the day the conversation started and this changes nothing; it matters for
    // the one who deleted the conversation and later opened it again, who would
    // otherwise be handed back every message they had removed.
    const floor = participant.joinedAt ? new Date(participant.joinedAt) : null;

    if (options.before && floor) {
      where.createdAt = { [Op.lt]: new Date(options.before), [Op.gte]: floor };
    } else if (options.before) {
      where.createdAt = { [Op.lt]: new Date(options.before) };
    } else if (floor) {
      where.createdAt = { [Op.gte]: floor };
    }

    const messages = await models.Message.findAll({
      where,
      include: [
        {
          model: models.User,
          as: 'sender',
          attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
        },
        {
          model: models.MessageAttachment,
          as: 'attachments'
        },
        {
          model: models.MessageReaction,
          as: 'reactions',
          attributes: ['id', 'userId', 'emoji']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });

    return messages.reverse();
  }

  async sendMessage(senderId, payload) {
    return sequelize.transaction(async (transaction) => {
      const { conversationId, messageText, subject, parentMessageId, relatedTaskId, relatedEnrollmentId } = payload;

      // Lock only the conversation row (no joins - FOR UPDATE cannot be applied to nullable side of outer join in PG)
      const conversation = await models.Conversation.findByPk(conversationId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Fetch all participants (even those who have left) to restore them.
      // isArchived is selected because a new message un-archives the thread for
      // everybody but the sender; without it here that check reads undefined on
      // every row and quietly does nothing.
      const participantRows = await models.ConversationParticipant.findAll({
        where: { conversationId },
        attributes: ['id', 'userId', 'leftAt', 'isArchived'],
        transaction
      });

      const participantIds = participantRows.map((p) => p.userId);
      if (!participantIds.includes(senderId)) {
        throw new ForbiddenError('You are not a participant in this conversation');
      }

      // If direct conversation, restore any participant who left. They have to
      // come back or the message would be sent into a conversation they are not
      // in and they would never see it. What they must not get back is the
      // history they deleted, so they return on a fresh joinedAt, which is the
      // floor every read of a conversation is filtered by. Without this, one
      // reply undid somebody's delete and handed them the whole thread again.
      if (conversation.type === 'direct') {
        const leftParticipants = participantRows.filter((p) => p.leftAt !== null);
        if (leftParticipants.length > 0) {
          const now = new Date();
          await models.ConversationParticipant.update({
            leftAt: null,
            isArchived: false,
            joinedAt: now,
            lastReadAt: now,
            lastReadMessageId: null
          }, {
            where: { id: leftParticipants.map((p) => p.id) },
            transaction
          });
        }
      }

      // A new message brings an archived conversation back to the inbox, for
      // everybody except whoever just sent it. Archiving is "I am done with
      // this for now", not "never show me this person again", and the app has
      // always told people it works this way. Only the flag is touched: the
      // history is theirs and they never asked to lose it, which is what makes
      // this different from the restore above.
      const archivedParticipants = participantRows.filter(
        (p) => p.leftAt === null && p.isArchived && p.userId !== senderId
      );
      if (archivedParticipants.length > 0) {
        await models.ConversationParticipant.update(
          { isArchived: false },
          { where: { id: archivedParticipants.map((p) => p.id) }, transaction }
        );
      }

      // Fetch active participants after restoration
      const activeParticipantRows = await models.ConversationParticipant.findAll({
        where: { conversationId, leftAt: null },
        attributes: ['userId'],
        transaction
      });

      const activeParticipantIds = activeParticipantRows.map((p) => p.userId);
      const recipientIds = activeParticipantIds.filter((id) => id !== senderId);
      if (recipientIds.length === 0) {
        throw new ValidationError('Conversation has no recipient');
      }

      // Defense in depth: a mentee can't message into a conversation with someone
      // outside their allowed set (e.g. after a clan/match was removed).
      const allowed = await this.getAllowedRecipientIds(senderId);
      if (allowed !== null && recipientIds.some((id) => !allowed.includes(id))) {
        throw new ForbiddenError('You can only message your mentor or members of your clan');
      }

      const recipientId = recipientIds[0];
      const recipientUsers = await models.User.findAll({
        where: {
          id: {
            [Op.in]: recipientIds
          }
        },
        attributes: ['id', 'role'],
        transaction
      });

      const recipientRoleById = recipientUsers.reduce((acc, user) => {
        acc[user.id] = user.role;
        return acc;
      }, {});

      // If the recipient already has a live socket, the message is delivered the
      // moment it's created (drives the double-gray tick). Otherwise it's marked
      // delivered when they next connect (see socket connect handler).
      let deliveredAt = null;
      try {
        const { isUserOnline } = require('../socket');
        if (recipientIds.some((id) => isUserOnline(id))) deliveredAt = new Date();
      } catch { /* socket not ready */ }

      const message = await models.Message.create({
        senderId,
        recipientId,
        threadId: conversationId,
        parentMessageId: parentMessageId || null,
        subject: subject || null,
        messageText,
        deliveredAt,
        relatedTaskId: relatedTaskId || conversation.relatedTaskId || null,
        relatedEnrollmentId: relatedEnrollmentId || conversation.relatedEnrollmentId || null
      }, { transaction });

      await conversation.update({
        lastMessageId: message.id,
        lastMessageAt: message.createdAt
      }, { transaction });

      const notifications = await Promise.all(recipientIds.map(async (userId) => {
        return models.Notification.create({
          userId,
          type: 'message',
          title: 'New message',
          message: messageText.length > 140 ? `${messageText.slice(0, 140)}...` : messageText,
          actionUrl: `/${recipientRoleById[userId] || 'mentee'}/messages?conversationId=${conversationId}`,
          actionLabel: 'Open Chat',
          relatedEntityType: 'message',
          relatedEntityId: message.id,
          status: 'unread'
        }, { transaction });
      }));

      const createdNotifications = notifications;

      const hydratedMessage = await models.Message.findByPk(message.id, {
        include: [
          {
            model: models.User,
            as: 'sender',
            attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
          },
          {
            model: models.MessageAttachment,
            as: 'attachments'
          }
        ],
        transaction
      });

      // [RAG Core] Fire Orchestrator asynchronously if sender is a mentee
      // (Mentors don't auto-reply to themselves)
      if (recipientRoleById[recipientIds[0]] === 'mentor') {
        const { RagFacade } = require('../features/rag');
        // Fire and forget (do not await)
        RagFacade.handleNewMessage(hydratedMessage).catch(err => {
          logger.error('[RAG] Background orchestrator failed', { error: err.message, stack: err.stack });
        });
      }

      return {
        message: hydratedMessage,
        conversationId,
        recipientIds,
        notifications: createdNotifications
      };
    });
  }

  async markConversationRead(userId, conversationId) {
    await this.assertUserInConversation(userId, conversationId);

    return sequelize.transaction(async (transaction) => {
      const [updatedCount] = await models.Message.update({
        isRead: true,
        readAt: new Date()
      }, {
        where: {
          threadId: conversationId,
          recipientId: userId,
          isRead: false
        },
        transaction
      });

      const lastMessage = await models.Message.findOne({
        where: { threadId: conversationId },
        order: [['createdAt', 'DESC']],
        transaction
      });

      await models.ConversationParticipant.update({
        lastReadAt: new Date(),
        lastReadMessageId: lastMessage?.id || null
      }, {
        where: {
          conversationId,
          userId
        },
        transaction
      });

      await models.Notification.update({
        status: 'read',
        readAt: new Date()
      }, {
        where: {
          userId,
          type: 'message',
          status: 'unread',
          actionUrl: {
            [Op.like]: `%conversationId=${conversationId}%`
          }
        },
        transaction
      });

      return { updatedCount };
    });
  }

  /**
   * Mark every message addressed to this user (across all conversations) as
   * delivered - called when the user connects. Returns the affected messages
   * grouped by sender so the socket layer can flip the senders' ticks live.
   */
  async markDelivered(userId) {
    const pending = await models.Message.findAll({
      where: { recipientId: userId, deliveredAt: null },
      attributes: ['id', 'senderId', 'threadId']
    });
    if (!pending.length) return [];
    const now = new Date();
    await models.Message.update({ deliveredAt: now }, { where: { id: pending.map((m) => m.id) } });
    return pending.map((m) => ({ id: m.id, senderId: m.senderId, conversationId: m.threadId, deliveredAt: now }));
  }

  /**
   * Toggle a user's emoji reaction on a message (one per user - re-acting with a
   * different emoji replaces it; re-acting with the same one removes it). Returns
   * the message's full reaction set + the conversation id for the socket emit.
   */
  async toggleReaction(userId, messageId, emoji) {
    const message = await models.Message.findByPk(messageId, { attributes: ['id', 'threadId'] });
    if (!message) throw new NotFoundError('Message not found');
    await this.assertUserInConversation(userId, message.threadId);

    const clean = String(emoji || '').trim().slice(0, 16);
    if (!clean) throw new ValidationError('An emoji is required');

    const existing = await models.MessageReaction.findOne({ where: { messageId, userId } });
    if (existing) {
      if (existing.emoji === clean) {
        await existing.destroy(); // same emoji → toggle off
      } else {
        await existing.update({ emoji: clean }); // different → replace
      }
    } else {
      await models.MessageReaction.create({ messageId, userId, emoji: clean });
    }

    const reactions = await models.MessageReaction.findAll({
      where: { messageId },
      attributes: ['id', 'userId', 'emoji']
    });
    return { conversationId: message.threadId, messageId, reactions };
  }

  async listNotifications(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 30), 1), 100);
    return models.Notification.findAll({
      attributes: [
        'id',
        'userId',
        'type',
        'audience',
        'title',
        'message',
        'status',
        'actionUrl',
        'actionLabel',
        'relatedEntityType',
        'relatedEntityId',
        'readAt',
        'sentAt',
        'emailSent',
        'emailSentAt',
        'createdAt'
      ],
      where: {
        userId,
        status: {
          [Op.ne]: 'archived'
        }
      },
      order: [['createdAt', 'DESC']],
      limit
    });
  }

  async getUnreadNotificationCount(userId) {
    return models.Notification.count({
      where: {
        userId,
        status: 'unread'
      }
    });
  }

  async markNotificationRead(userId, notificationId) {
    const notification = await models.Notification.findOne({
      attributes: [
        'id',
        'userId',
        'type',
        'audience',
        'title',
        'message',
        'status',
        'actionUrl',
        'actionLabel',
        'relatedEntityType',
        'relatedEntityId',
        'readAt',
        'sentAt',
        'emailSent',
        'emailSentAt',
        'createdAt'
      ],
      where: {
        id: notificationId,
        userId
      }
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    if (notification.status !== 'read') {
      await notification.update({
        status: 'read',
        readAt: new Date()
      });
    }

    return notification;
  }

  async markAllNotificationsRead(userId) {
    const [updatedCount] = await models.Notification.update({
      status: 'read',
      readAt: new Date()
    }, {
      where: {
        userId,
        status: 'unread'
      }
    });

    return { updatedCount };
  }

  async deleteNotification(userId, notificationId) {
    const deleted = await models.Notification.destroy({
      where: {
        id: notificationId,
        userId
      }
    });

    if (!deleted) {
      throw new NotFoundError('Notification not found');
    }

    return { deleted: true };
  }

  async getConversationByIdForUser(conversationId, userId) {
    await this.assertUserInConversation(userId, conversationId);

    const conversation = await models.Conversation.findByPk(conversationId, {
      include: [
        {
          model: models.ConversationParticipant,
          as: 'participants',
          where: { leftAt: null },
          required: false,
          include: [
            {
              model: models.User,
              as: 'user',
              attributes: ['id', 'firstName', 'lastName', 'email', 'profilePictureUrl', 'role']
            }
          ]
        },
        {
          model: models.Message,
          as: 'lastMessage',
          attributes: ['id', 'senderId', 'recipientId', 'messageText', 'createdAt', 'isRead']
        }
      ]
    });

    if (!conversation) return null;
    const json = conversation.toJSON();
    const otherParticipants = (json.participants || []).filter((p) => p.userId !== userId);

    return {
      id: json.id,
      type: json.type,
      relatedTaskId: json.relatedTaskId,
      relatedEnrollmentId: json.relatedEnrollmentId,
      lastMessageAt: json.lastMessageAt,
      unreadCount: 0,
      participants: otherParticipants.map((p) => ({
        id: p.user?.id || p.userId,
        firstName: p.user?.firstName || '',
        lastName: p.user?.lastName || '',
        email: p.user?.email || '',
        profilePictureUrl: p.user?.profilePictureUrl,
        role: p.user?.role || 'mentee'
      })),
      lastMessage: json.lastMessage
    };
  }

  async searchUsers(currentUserId, query = '', options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
    const roleFilter = options.role;

    const where = {
      id: { [Op.ne]: currentUserId },
      status: 'active',
      deletedAt: null
    };

    if (roleFilter && ['admin', 'mentor', 'mentee'].includes(roleFilter)) {
      where.role = roleFilter;
    }

    // Determine the user's clan members
    const myClans = await models.ClanMembership.findAll({
      where: { userId: currentUserId, status: 'active' },
      attributes: ['clanId']
    });
    const myClanIds = myClans.map((c) => c.clanId);

    const allowed = await this.getAllowedRecipientIds(currentUserId);
    if (allowed !== null) {
      if (!allowed.length) return [];
      where.id = { [Op.ne]: currentUserId, [Op.in]: allowed };
    } else if (!query.trim() && myClanIds.length) {
      // Mentor/Admin with a clan: restrict/filter to their clan members when query is empty
      const clanMembers = await models.ClanMembership.findAll({
        where: { clanId: { [Op.in]: myClanIds }, status: 'active' },
        attributes: ['userId']
      });
      const clanUserIds = clanMembers.map((m) => m.userId).filter((id) => id !== currentUserId);
      where.id = { [Op.ne]: currentUserId, [Op.in]: clanUserIds };
    }

    if (query.trim()) {
      const term = `%${query.trim()}%`;
      where[Op.or] = [
        { firstName: { [Op.iLike]: term } },
        { lastName: { [Op.iLike]: term } },
        { email: { [Op.iLike]: term } }
      ];
    }

    const users = await models.User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'profilePictureUrl'],
      where,
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit
    });

    return users.map((u) => u.toJSON());
  }

  async assertUserInConversation(userId, conversationId) {
    const participant = await models.ConversationParticipant.findOne({
      where: {
        userId,
        conversationId,
        leftAt: null
      }
    });

    if (!participant) {
      throw new ForbiddenError('You are not a participant in this conversation');
    }

    return participant;
  }
}

module.exports = new MessagingService();
