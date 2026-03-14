const Joi = require('joi');

const uuid = Joi.string().uuid().required();

const messagingSchemas = {
  createDirectConversation: Joi.object({
    participantId: uuid,
    relatedTaskId: Joi.string().uuid().optional(),
    relatedEnrollmentId: Joi.string().uuid().optional()
  }),

  listMessagesQuery: Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    before: Joi.date().iso().optional()
  }),

  sendMessage: Joi.object({
    conversationId: uuid,
    messageText: Joi.string().trim().min(1).max(5000).required(),
    subject: Joi.string().trim().max(255).allow('', null).optional(),
    parentMessageId: Joi.string().uuid().optional(),
    relatedTaskId: Joi.string().uuid().optional(),
    relatedEnrollmentId: Joi.string().uuid().optional()
  }),

  markNotificationReadParams: Joi.object({
    notificationId: uuid
  }),

  conversationParams: Joi.object({
    conversationId: uuid
  })
};

module.exports = {
  messagingSchemas
};
