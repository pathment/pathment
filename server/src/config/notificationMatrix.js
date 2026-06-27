const NOTIFICATION_EVENTS = {
  TASK_SUBMITTED: 'task_submitted',
  SUBMISSION_REVIEWED: 'submission_reviewed',
  FEEDBACK_SENT: 'feedback_sent',
  TASK_ASSIGNED: 'task_assigned',
  ROADMAP_ADVANCED: 'roadmap_advanced',
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
EXTENSION_HANDLED: 'extension_handled',
  MENTOR_NUDGE: 'mentor_nudge',
  COMMUNITY_MENTION: 'community_mention',
  COMMUNITY_REPLY: 'community_reply',
  COMMUNITY_KUDOS: 'community_kudos',
  COMMUNITY_ANSWER_ACCEPTED: 'community_answer_accepted',
  COMPLETION_READY_FOR_SIGNOFF: 'completion_ready_for_signoff',
  PROGRAM_COMPLETED: 'program_completed',
  MENTOR_FEEDBACK_REQUESTED: 'mentor_feedback_requested',
  MEETING_CANCELLED: 'meeting_cancelled',
  MEETING_BOOKED: 'meeting_booked',
  CROSS_CLAN_ASSIGNED: 'cross_clan_assigned',
  NEW_MENTEE_IN_CLAN: 'new_mentee_in_clan',
  PROMOTION_NOMINATED: 'promotion_nominated',
  REVIEW_UNLOCK_REQUESTED: 'review_unlock_requested',
  REVIEW_UNLOCK_HANDLED: 'review_unlock_handled',
  MENTEE_PAUSE_SUGGESTED: 'mentee_pause_suggested',
  MENTEE_REENGAGE: 'mentee_reengage',
  MENTEE_RETURNED: 'mentee_returned',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
  FEEDBACK_STATUS_UPDATED: 'feedback_status_updated',
  // Admissions intake (admin-facing)
  APPLICATION_RECEIVED: 'application_received',
  APPLICATION_CAPACITY_REACHED: 'application_capacity_reached'
};

const NOTIFICATION_MATRIX = {
  // New applicant landed — in-app only (can be frequent; no email spam).
  [NOTIFICATION_EVENTS.APPLICATION_RECEIVED]: {
    type: 'intake',
    preferenceKey: 'application_received',
    channels: { inApp: true, email: false, chat: false }
  },
  // Cohort hit its application cap — admins should decide to raise it or close.
  [NOTIFICATION_EVENTS.APPLICATION_CAPACITY_REACHED]: {
    type: 'intake',
    preferenceKey: 'application_capacity_reached',
    channels: { inApp: true, email: true, chat: false }
  },
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
  [NOTIFICATION_EVENTS.ROADMAP_ADVANCED]: {
    type: 'task',
    preferenceKey: 'task_assigned',
    channels: { inApp: true, email: false, chat: false }
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
  // Cohort-review deletion lock: admins get notified of unlock requests; mentors
  // get the approve/decline outcome. New preferenceKeys default to on.
  [NOTIFICATION_EVENTS.REVIEW_UNLOCK_REQUESTED]: {
    type: 'system',
    preferenceKey: 'review_unlock_requested',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.REVIEW_UNLOCK_HANDLED]: {
    type: 'system',
    preferenceKey: 'review_unlock_handled',
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
},
  [NOTIFICATION_EVENTS.MENTOR_NUDGE]: {
    type: 'system',
    preferenceKey: 'mentor_nudge',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_MENTION]: {
    type: 'message',
    preferenceKey: 'community_mention',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_REPLY]: {
    type: 'message',
    preferenceKey: 'community_reply',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_KUDOS]: {
    type: 'message',
    preferenceKey: 'community_kudos',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMMUNITY_ANSWER_ACCEPTED]: {
    type: 'system',
    preferenceKey: 'community_answer_accepted',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.COMPLETION_READY_FOR_SIGNOFF]: {
    type: 'milestone',
    preferenceKey: 'completion_ready_for_signoff',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROGRAM_COMPLETED]: {
    type: 'milestone',
    preferenceKey: 'program_completed',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MENTOR_FEEDBACK_REQUESTED]: {
    type: 'feedback',
    preferenceKey: 'mentor_feedback_requested',
    channels: { inApp: true, email: false, chat: false }
  },
  [NOTIFICATION_EVENTS.MEETING_CANCELLED]: {
    type: 'system',
    preferenceKey: 'meeting_cancelled',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.MEETING_BOOKED]: {
    type: 'system',
    preferenceKey: 'meeting_booked',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.CROSS_CLAN_ASSIGNED]: {
    type: 'system',
    preferenceKey: 'cross_clan_assigned',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.NEW_MENTEE_IN_CLAN]: {
    type: 'system',
    preferenceKey: 'new_mentee_in_clan',
    channels: { inApp: true, email: true, chat: false }
  },
  [NOTIFICATION_EVENTS.PROMOTION_NOMINATED]: {
    type: 'system',
    preferenceKey: 'promotion_nominated',
    channels: { inApp: true, email: true, chat: false }
  },
  // A mentee looks inactive and is suggested for pausing (to the mentor).
  [NOTIFICATION_EVENTS.MENTEE_PAUSE_SUGGESTED]: {
    type: 'system',
    preferenceKey: 'mentee_pause_suggested',
    channels: { inApp: true, email: false, chat: false }
  },
  // Win-back reminder to a paused mentee (in-app + email, the Zomato model).
  [NOTIFICATION_EVENTS.MENTEE_REENGAGE]: {
    type: 'system',
    preferenceKey: 'mentee_reengage',
    channels: { inApp: true, email: true, chat: false }
  },
  // A paused mentee re-engaged and is back to active (to the mentor).
  [NOTIFICATION_EVENTS.MENTEE_RETURNED]: {
    type: 'system',
    preferenceKey: 'mentee_returned',
    channels: { inApp: true, email: true, chat: false }
  },
  // A new feedback/bug report was submitted (to admins, in-app only).
  [NOTIFICATION_EVENTS.FEEDBACK_SUBMITTED]: {
    type: 'system',
    preferenceKey: 'feedback_submitted',
    channels: { inApp: true, email: false, chat: false }
  },
  // A reporter's feedback changed status (to the reporter, in-app + email).
  [NOTIFICATION_EVENTS.FEEDBACK_STATUS_UPDATED]: {
    type: 'system',
    preferenceKey: 'feedback_status_updated',
    channels: { inApp: true, email: true, chat: false }
  }
};

/**
 * User-facing email notification categories - the emailable, NON-transactional
 * events a person can toggle in Settings. Each `key` is the preferenceKey the
 * orchestrator checks in `emailNotifications`. (Transactional mail - password
 * reset, account welcome - is intentionally excluded; it always sends.)
 */
const EMAIL_PREFERENCE_CATEGORIES = [
  { group: 'Tasks', key: 'task_assigned', label: 'A task is assigned to me' },
  { group: 'Tasks', key: 'task_submitted', label: 'A mentee submits a task' },
  { group: 'Tasks', key: 'deadline_approaching', label: 'A task deadline is approaching' },
  { group: 'Tasks', key: 'deadline_passed', label: 'A task deadline has passed' },
  { group: 'Tasks', key: 'extension_requested', label: 'An extension is requested' },
  { group: 'Tasks', key: 'extension_handled', label: 'My extension request is handled' },
  { group: 'Feedback', key: 'submission_reviewed', label: 'My submission is reviewed' },
  { group: 'Feedback', key: 'feedback_sent', label: 'I receive feedback' },
  { group: 'Program', key: 'enrollment_updates', label: 'Enrollment updates' },
  { group: 'Program', key: 'mentor_assignment', label: 'A mentor is assigned' },
  { group: 'Program', key: 'program_updates', label: 'Program updates' },
  { group: 'Program', key: 'meeting_booked', label: 'A 1:1 is booked' },
  { group: 'Program', key: 'meeting_cancelled', label: 'A 1:1 is cancelled' },
  { group: 'Program', key: 'cross_clan_assigned', label: 'I\'m asked to cover or help another clan' },
  { group: 'Program', key: 'new_mentee_in_clan', label: 'A new mentee joins my clan' },
  { group: 'Program', key: 'promotion_nominated', label: 'A mentee is nominated for promotion (admins)' },
  { group: 'Milestones', key: 'completion_ready_for_signoff', label: 'Completion is ready for sign-off' },
  { group: 'Milestones', key: 'program_completed', label: 'A program is completed' },
  { group: 'Digests', key: 'weekly_progress_report', label: 'Weekly progress report' },
  { group: 'Program', key: 'mentee_returned', label: 'A paused mentee returns to my clan' },
  { group: 'Program', key: 'mentee_reengage', label: 'Reminders to come back when I\'m paused' },
  { group: 'Program', key: 'feedback_status_updated', label: 'Updates on my feedback / bug reports' }
];

module.exports = {
  NOTIFICATION_EVENTS,
  NOTIFICATION_MATRIX,
  EMAIL_PREFERENCE_CATEGORIES
};
