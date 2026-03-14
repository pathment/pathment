const express = require('express');
const router = express.Router();

const messagingController = require('../controllers/messagingController');
const { authenticate, authorize } = require('../middlewares/auth');
const { validateBody, validateParams, validateQuery } = require('../middlewares/validate');
const { messagingSchemas } = require('../validations/messagingValidation');

router.use(authenticate, authorize(['admin', 'mentor', 'mentee']));

router.get('/conversations', messagingController.getConversations);
router.post('/conversations/direct', validateBody(messagingSchemas.createDirectConversation), messagingController.createDirectConversation);
router.get('/conversations/:conversationId/messages', validateParams(messagingSchemas.conversationParams), validateQuery(messagingSchemas.listMessagesQuery), messagingController.getConversationMessages);
router.post('/conversations/:conversationId/read', validateParams(messagingSchemas.conversationParams), messagingController.markConversationRead);

router.post('/messages', validateBody(messagingSchemas.sendMessage), messagingController.sendMessage);

router.get('/notifications', messagingController.getNotifications);
router.post('/notifications/read-all', messagingController.markAllNotificationsRead);
router.post('/notifications/:notificationId/read', validateParams(messagingSchemas.markNotificationReadParams), messagingController.markNotificationRead);
router.delete('/notifications/:notificationId', validateParams(messagingSchemas.markNotificationReadParams), messagingController.deleteNotification);

module.exports = router;
