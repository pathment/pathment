const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const messagingController = require('../controllers/messagingController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateBody, validateParams, validateQuery } = require('../middlewares/validate');
const { messagingSchemas } = require('../validations/messagingValidation');

router.use(authenticate, authorize(['admin', 'mentor', 'mentee']));

router.get('/users/search', validateQuery(messagingSchemas.searchUsersQuery), messagingController.searchUsers);

router.get('/conversations', messagingController.getConversations);
router.post('/conversations/direct', validateBody(messagingSchemas.createDirectConversation), messagingController.createDirectConversation);
router.get('/conversations/:conversationId/messages', validateParams(messagingSchemas.conversationParams), validateQuery(messagingSchemas.listMessagesQuery), messagingController.getConversationMessages);
router.post('/conversations/:conversationId/read', validateParams(messagingSchemas.conversationParams), messagingController.markConversationRead);
router.post('/conversations/:conversationId/archive', validateParams(messagingSchemas.conversationParams), messagingController.archiveConversation);
router.post('/conversations/:conversationId/unarchive', validateParams(messagingSchemas.conversationParams), messagingController.unarchiveConversation);
router.delete('/conversations/:conversationId', validateParams(messagingSchemas.conversationParams), messagingController.deleteConversation);

router.post('/messages', validateBody(messagingSchemas.sendMessage), messagingController.sendMessage);
router.post('/messages/:messageId/reactions', messagingController.toggleReaction);

router.get('/notifications', messagingController.getNotifications);
// Must be declared BEFORE any '/notifications/:notificationId' route, or Express
// would match 'unread-count' as an id.
router.get('/notifications/unread-count', messagingController.getUnreadNotificationCount);
router.post('/notifications/read-all', messagingController.markAllNotificationsRead);
router.post('/notifications/:notificationId/read', validateParams(messagingSchemas.markNotificationReadParams), messagingController.markNotificationRead);
router.delete('/notifications/:notificationId', validateParams(messagingSchemas.markNotificationReadParams), messagingController.deleteNotification);

// RAG Drafts
router.get('/drafts', messagingController.listPendingDrafts);
router.post('/messages/approve', messagingController.approveDraft);
router.post('/drafts/:draftId/reject', messagingController.rejectDraft);

// RAG Documents
router.get('/mentor/documents', messagingController.getMentorDocuments);
router.post('/mentor/documents', upload.single('file'), messagingController.uploadMentorDocument);
router.delete('/mentor/documents/:documentId', messagingController.deleteMentorDocument);

module.exports = router;
