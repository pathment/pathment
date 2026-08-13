const messagingService = require('../services/messagingService');
const { RagFacade } = require('../features/rag');
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

  const msgPayload = { conversationId: result.conversationId, message: result.message };
  emitToConversation(result.conversationId, 'message:new', msgPayload);

  result.recipientIds.forEach((recipientId) => {
    // Direct delivery via user room — guaranteed even if recipient hasn't joined the conversation room yet
    emitToUser(recipientId, 'message:new', msgPayload);

    const notification = result.notifications?.find((item) => item.userId === recipientId);
    if (!notification) return;

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

/**
 * Just the badge number.
 *
 * The bell polls this constantly. Without it the only way to learn the count was
 * GET /notifications, which returns thirty full notification objects — every
 * poll paid for a page of data to read one integer off it. On a phone that was
 * the most expensive request in the app, and the least useful.
 */
exports.getUnreadNotificationCount = catchAsync(async (req, res) => {
  const unreadCount = await messagingService.getUnreadNotificationCount(req.user.id);

  res.status(200).json(successResponse('Unread count fetched successfully', { unreadCount }));
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

// ---------------------------------------------------------------------------
// RAG & Draft Controllers
// ---------------------------------------------------------------------------

exports.listPendingDrafts = catchAsync(async (req, res) => {
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can access drafts' });
  }
  const drafts = await RagFacade.listPendingDrafts(req.user.id);
  res.status(200).json(successResponse('Drafts fetched successfully', { drafts }));
});

exports.approveDraft = catchAsync(async (req, res) => {
  const { draftId, finalText } = req.body;
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can approve drafts' });
  }

  if (!draftId) {
    return res.status(400).json({ success: false, message: 'draftId is required' });
  }

  const text = (finalText || '').trim();
  if (!text) {
    return res.status(400).json({ success: false, message: 'Message text cannot be empty' });
  }

  // Step 1: Prepare approval — creates the learning history record.
  // Does NOT mark the draft approved yet; that happens after send succeeds.
  const { originalMessage } = await RagFacade.approveDraft(draftId, req.user.id, text);

  // Step 2: Resolve the conversation from the original message.
  const conversationId = originalMessage?.threadId;
  if (!conversationId) {
    return res.status(422).json({ success: false, message: 'Could not determine conversation for this draft' });
  }

  // Step 3: Send the message. If this throws, the draft stays 'pending'
  // and can be retried — no inconsistent approved-but-unsent state.
  const result = await messagingService.sendMessage(req.user.id, {
    conversationId,
    messageText: text,
  });

  // Step 4: Message sent successfully — now mark draft approved and emit.
  await RagFacade.markDraftApproved(draftId, req.user.id);

  const msgPayload = { conversationId: result.conversationId, message: result.message };
  emitToConversation(result.conversationId, 'message:new', msgPayload);

  // Direct delivery to each recipient's user room — mentee gets it even if
  // their socket hasn't joined the conversation room yet.
  result.recipientIds.forEach((recipientId) => {
    emitToUser(recipientId, 'message:new', msgPayload);
  });

  // Let all mentor sessions remove this draft from their panel in real time.
  emitToUser(req.user.id, 'ai_draft:approved', { draftId, conversationId: result.conversationId });

  res.status(200).json(successResponse('Draft approved and message sent', { message: result.message }));
});

exports.rejectDraft = catchAsync(async (req, res) => {
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can reject drafts' });
  }
  const { draftId } = req.params;
  await RagFacade.rejectDraft(draftId, req.user.id);
  res.status(200).json(successResponse('Draft rejected', {}));
});

exports.getMentorDocuments = catchAsync(async (req, res) => {
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can manage documents' });
  }
  const documents = await RagFacade.getMentorDocuments(req.user.id);
  res.status(200).json(successResponse('Documents fetched successfully', { documents }));
});

exports.uploadMentorDocument = catchAsync(async (req, res) => {
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can upload documents' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  if (req.file.mimetype !== 'application/pdf') {
    return res.status(400).json({ success: false, message: 'Only PDF files are supported' });
  }

  // visibility is validated and sanitised inside ragService.ingestDocument()
  const job = await RagFacade.ingestDocument(
    req.user.id,
    req.file.buffer,
    req.file.originalname,
    req.body.visibility
  );

  res.status(201).json(successResponse('Document queued for ingestion', { document: job }, 201));
});

exports.deleteMentorDocument = catchAsync(async (req, res) => {
  if (req.user.role !== 'mentor') {
    return res.status(403).json({ success: false, message: 'Only mentors can manage documents' });
  }
  const { documentId } = req.params;
  await RagFacade.deleteMentorDocument(documentId, req.user.id);
  res.status(200).json(successResponse('Document deleted', {}));
});

module.exports = exports;
