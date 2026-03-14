const { Op, fn, col } = require('sequelize');
const { models, sequelize } = require('../db');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError
} = require('../utils/errors/errorTypes');

class MessagingService {
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

  async listConversations(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 25), 1), 100);

    // Step 1: fetch conversation IDs in stable order using a lightweight join.
    const membershipRows = await models.ConversationParticipant.findAll({
      attributes: ['conversationId'],
      where: {
        userId,
        leftAt: null,
        isArchived: false
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
      order: [
        [{ model: models.Conversation, as: 'conversation' }, 'lastMessageAt', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit,
      subQuery: false
    });

    const orderedConversationIds = [...new Set(
      membershipRows.map((row) => row.conversationId).filter(Boolean)
    )];

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
            leftAt: null,
            isArchived: false
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
        threadId: { [Op.in]: orderedConversationIds },
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
        lastMessage: json.lastMessage
      }];
    });
  }

  async listMessages(userId, conversationId, options = {}) {
    await this.assertUserInConversation(userId, conversationId);

    const limit = Math.min(Math.max(Number(options.limit || 50), 1), 100);
    const where = { threadId: conversationId };

    if (options.before) {
      where.createdAt = { [Op.lt]: new Date(options.before) };
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

      // Lock only the conversation row (no joins — FOR UPDATE cannot be applied to nullable side of outer join in PG)
      const conversation = await models.Conversation.findByPk(conversationId, {
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!conversation) {
        throw new NotFoundError('Conversation not found');
      }

      // Fetch participants separately within the same transaction
      const participantRows = await models.ConversationParticipant.findAll({
        where: { conversationId, leftAt: null },
        attributes: ['userId'],
        transaction
      });

      const participantIds = participantRows.map((p) => p.userId);
      if (!participantIds.includes(senderId)) {
        throw new ForbiddenError('You are not a participant in this conversation');
      }

      const recipientIds = participantIds.filter((id) => id !== senderId);
      if (recipientIds.length === 0) {
        throw new ValidationError('Conversation has no recipient');
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

      const message = await models.Message.create({
        senderId,
        recipientId,
        threadId: conversationId,
        parentMessageId: parentMessageId || null,
        subject: subject || null,
        messageText,
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

  async listNotifications(userId, options = {}) {
    const limit = Math.min(Math.max(Number(options.limit || 30), 1), 100);
    return models.Notification.findAll({
      attributes: [
        'id',
        'userId',
        'type',
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

    return models.Conversation.findByPk(conversationId, {
      include: [
        {
          model: models.ConversationParticipant,
          as: 'participants',
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
