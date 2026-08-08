const messagingService = require('../services/messagingService');
const { successResponse } = require('../utils/responses');
const { catchAsync } = require('../middlewares/errorHandler');
const { emitToConversation, emitToUser } = require('../socket');

const serializeNotification = (notification) => {
  const item = notification?.toJSON ? notification.toJSON() : notification;

  return {
    id: item.id,
    userId: item.userId,
    type: item.type,
    audience: item.audience || 'any',
    title: item.title,
    message: item.message,
    status: item.status,
    actionUrl: item.actionUrl,
    actionLabel: item.actionLabel,
    relatedEntityType: item.relatedEntityType,
    relatedEntityId: item.relatedEntityId,
    readAt: item.readAt,
    sentAt: item.sentAt,
    emailSent: item.emailSent,
    emailSentAt: item.emailSentAt,
    createdAt: item.createdAt
  };
};

exports.getConversations = catchAsync(async (req, res) => {
  const conversations = await messagingService.listConversations(req.user.id, req.query);
  res.status(200).json(successResponse('Conversations fetched successfully', { conversations }));
});

exports.getConversationMessages = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const messages = await messagingService.listMessages(req.user.id, conversationId, req.query);
  res.status(200).json(successResponse('Messages fetched successfully', { messages }));
});

exports.createDirectConversation = catchAsync(async (req, res) => {
  const conversation = await messagingService.createOrGetDirectConversation(req.user.id, req.body.participantId, {
    relatedTaskId: req.body.relatedTaskId,
    relatedEnrollmentId: req.body.relatedEnrollmentId
  });

  res.status(201).json(successResponse('Conversation ready', { conversation }, 201));
});

exports.sendMessage = catchAsync(async (req, res) => {
  const result = await messagingService.sendMessage(req.user.id, req.body);

  emitToConversation(result.conversationId, 'message:new', {
    conversationId: result.conversationId,
    message: result.message
  });

  result.recipientIds.forEach((recipientId) => {
    const notification = result.notifications?.find((item) => item.userId === recipientId);
    if (!notification) {
      return;
    }

    emitToUser(recipientId, 'notification:new', {
      id: notification.id,
      type: notification.type,
      audience: notification.audience || 'any',
      title: notification.title,
      message: notification.message,
      status: notification.status,
      actionUrl: notification.actionUrl,
      actionLabel: notification.actionLabel,
      relatedEntityType: notification.relatedEntityType,
      relatedEntityId: notification.relatedEntityId,
      createdAt: notification.createdAt,
      conversationId: result.conversationId
    });
  });

  res.status(201).json(successResponse('Message sent successfully', {
    message: result.message
  }, 201));
});

exports.markConversationRead = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const result = await messagingService.markConversationRead(req.user.id, conversationId);

  emitToConversation(conversationId, 'conversation:read', {
    conversationId,
    userId: req.user.id,
    updatedCount: result.updatedCount
  });

  // Signal the user's navigation badge to refresh its unread count.
  emitToUser(req.user.id, 'message:unread-count', {});

  res.status(200).json(successResponse('Conversation marked as read', result));
});

exports.archiveConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const result = await messagingService.archiveConversation(req.user.id, conversationId);
  res.status(200).json(successResponse('Conversation archived successfully', result));
});

exports.unarchiveConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const result = await messagingService.unarchiveConversation(req.user.id, conversationId);
  res.status(200).json(successResponse('Conversation unarchived successfully', result));
});

exports.deleteConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const result = await messagingService.deleteConversation(req.user.id, conversationId);
  res.status(200).json(successResponse('Conversation deleted successfully', result));
});

exports.toggleReaction = catchAsync(async (req, res) => {
  const { messageId } = req.params;
  const { emoji } = req.body;
  const result = await messagingService.toggleReaction(req.user.id, messageId, emoji);

  emitToConversation(result.conversationId, 'message:reaction', {
    conversationId: result.conversationId,
    messageId: result.messageId,
    reactions: result.reactions
  });

  res.status(200).json(successResponse('Reaction updated', { messageId: result.messageId, reactions: result.reactions }));
});

exports.getNotifications = catchAsync(async (req, res) => {
  const notifications = await messagingService.listNotifications(req.user.id, req.query);
  const unreadCount = await messagingService.getUnreadNotificationCount(req.user.id);

  res.status(200).json(successResponse('Notifications fetched successfully', {
    notifications: notifications.map(serializeNotification),
    unreadCount
  }));
});

exports.markNotificationRead = catchAsync(async (req, res) => {
  const notification = await messagingService.markNotificationRead(req.user.id, req.params.notificationId);
  const unreadCount = await messagingService.getUnreadNotificationCount(req.user.id);

  emitToUser(req.user.id, 'notification:unread-count', { unreadCount });

  res.status(200).json(successResponse('Notification marked as read', {
    notification: serializeNotification(notification),
    unreadCount
  }));
});

exports.markAllNotificationsRead = catchAsync(async (req, res) => {
  const result = await messagingService.markAllNotificationsRead(req.user.id);

  emitToUser(req.user.id, 'notification:unread-count', { unreadCount: 0 });

  res.status(200).json(successResponse('All notifications marked as read', result));
});

exports.deleteNotification = catchAsync(async (req, res) => {
  await messagingService.deleteNotification(req.user.id, req.params.notificationId);
  const unreadCount = await messagingService.getUnreadNotificationCount(req.user.id);

  emitToUser(req.user.id, 'notification:unread-count', { unreadCount });

  res.status(200).json(successResponse('Notification deleted successfully', {}));
});

exports.searchUsers = catchAsync(async (req, res) => {
  const users = await messagingService.searchUsers(req.user.id, req.query.q, {
    role: req.query.role,
    limit: req.query.limit
  });

  res.status(200).json(successResponse('Users fetched successfully', { users }));
});

module.exports = exports;
