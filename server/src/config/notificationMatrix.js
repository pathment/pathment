const NOTIFICATION_EVENTS = {
  TASK_SUBMITTED: 'task_submitted',
  SUBMISSION_REVIEWED: 'submission_reviewed',
  FEEDBACK_SENT: 'feedback_sent',
  TASK_ASSIGNED: 'task_assigned',
  TASK_DEADLINE_APPROACHING: 'task_deadline_approaching',
  CHAT_MESSAGE_NEW: 'chat_message_new',
  MENTEE_ENROLLED: 'mentee_enrolled',
  MENTOR_ASSIGNED: 'mentor_assigned',
  PROGRAM_UPDATED: 'program_updated',
  SUBMISSION_DEADLINE_PASSED: 'submission_deadline_passed',
  ACCOUNT_CREATED_WELCOME: 'account_created_welcome',
  PASSWORD_RESET: 'password_reset',
  WEEKLY_PROGRESS_REPORT: 'weekly_progress_report',
  EXTENSION_REQUESTED: 'extension_requested',
EXTENSION_HANDLED: 'extension_handled'
};

const NOTIFICATION_MATRIX = {
  [NOTIFICATION_EVENTS.TASK_SUBMITTED]: {
    type: 'task',
    preferenceKey: 'task_submitted',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.SUBMISSION_REVIEWED]: {
    type: 'feedback',
    preferenceKey: 'submission_reviewed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.FEEDBACK_SENT]: {
    type: 'feedback',
    preferenceKey: 'feedback_sent',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.TASK_ASSIGNED]: {
    type: 'task',
    preferenceKey: 'task_assigned',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.TASK_DEADLINE_APPROACHING]: {
    type: 'task',
    preferenceKey: 'deadline_approaching',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.CHAT_MESSAGE_NEW]: {
    type: 'message',
    preferenceKey: 'message_received',
    channels: { inApp: true, email: false, chat: true }
  },
  [NOTIFICATION_EVENTS.MENTEE_ENROLLED]: {
    type: 'system',
    preferenceKey: 'enrollment_updates',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTOR_ASSIGNED]: {
    type: 'system',
    preferenceKey: 'mentor_assignment',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROGRAM_UPDATED]: {
    type: 'system',
    preferenceKey: 'program_updates',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.SUBMISSION_DEADLINE_PASSED]: {
    type: 'task',
    preferenceKey: 'deadline_passed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.ACCOUNT_CREATED_WELCOME]: {
    type: 'system',
    preferenceKey: 'account_welcome',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PASSWORD_RESET]: {
    type: 'system',
    preferenceKey: 'password_reset',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.WEEKLY_PROGRESS_REPORT]: {
    type: 'system',
    preferenceKey: 'weekly_progress_report',
    channels: { inApp: false, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.EXTENSION_REQUESTED]: {
  type: 'task',
  preferenceKey: 'extension_requested',
  channels: { inApp: true, email: true, chat: false }
},
[NOTIFICATION_EVENTS.EXTENSION_HANDLED]: {
  type: 'task',
  preferenceKey: 'extension_handled',
  channels: { inApp: true, email: true, chat: false }
}
};

module.exports = {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MATRIX
};
