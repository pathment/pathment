// Model Generator Script
// Run this with: node scripts/generateModels.js

const fs = require('fs');
const path = require('path');

const modelDefinitions = {
  // Programs
  'programs/ProgramLevel': {
    table: 'program_levels',
    fields: {
      id: 'UUID_PK',
      programId: 'UUID_FK:program_id',
      name: 'STRING:100:required',
      levelOrder: 'INTEGER:required',
      durationWeeks: 'INTEGER:required',
      description: 'TEXT',
      learningOutcomes: 'ARRAY_TEXT',
      prerequisites: 'TEXT',
      targetAudience: 'TEXT'
    },
    indexes: [
      ['program_id', 'level_order:unique'],
      ['program_id', 'name:unique'],
      ['program_id']
    ],
    associations: [
      'belongsTo:Program:program_id',
      'hasMany:LevelMentorAssignment:level_id',
      'hasMany:Roadmap:level_id',
      'hasMany:Enrollment:current_level_id'
    ]
  },
  
  'programs/LevelMentorAssignment': {
    table: 'level_mentor_assignments',
    fields: {
      id: 'UUID_PK',
      levelId: 'UUID_FK:level_id',
      mentorId: 'UUID_FK:mentor_id',
      assignedBy: 'UUID_FK:assigned_by',
      isActive: 'BOOLEAN:true',
      assignedAt: 'DATE:now',
      unassignedAt: 'DATE'
    },
    indexes: [
      ['level_id', 'mentor_id:unique'],
      ['level_id'],
      ['mentor_id']
    ],
    associations: [
      'belongsTo:ProgramLevel:level_id',
      'belongsTo:User:mentor_id',
      'belongsTo:User:assigned_by'
    ]
  },
  
  'programs/Roadmap': {
    table: 'roadmaps',
    fields: {
      id: 'UUID_PK',
      programId: 'UUID_FK:program_id',
      levelId: 'UUID_FK:level_id',
      name: 'STRING:255:required',
      description: 'TEXT',
      isBaseRoadmap: 'BOOLEAN:true',
      adaptedFrom: 'UUID_FK:adapted_from',
      generatedByAi: 'BOOLEAN:false',
      aiModelVersion: 'STRING:50',
      generationPrompt: 'TEXT',
      totalWeeks: 'INTEGER',
      totalTasks: 'INTEGER:0',
      estimatedTotalHours: 'INTEGER'
    },
    indexes: [
      ['program_id'],
      ['level_id'],
      ['is_base_roadmap']
    ],
    associations: [
      'belongsTo:Program:program_id',
      'belongsTo:ProgramLevel:level_id',
      'belongsTo:Roadmap:adapted_from',
      'hasMany:RoadmapWeek:roadmap_id'
    ]
  },
  
  'programs/RoadmapWeek': {
    table: 'roadmap_weeks',
    fields: {
      id: 'UUID_PK',
      roadmapId: 'UUID_FK:roadmap_id',
      weekNumber: 'INTEGER:required',
      title: 'STRING:255:required',
      description: 'TEXT',
      objectives: 'ARRAY_TEXT',
      keyConcepts: 'ARRAY_TEXT',
      milestone: 'TEXT',
      estimatedHours: 'INTEGER'
    },
    indexes: [
      ['roadmap_id', 'week_number:unique'],
      ['roadmap_id']
    ],
    associations: [
      'belongsTo:Roadmap:roadmap_id',
      'hasMany:RoadmapTask:roadmap_week_id'
    ]
  },
  
  'tasks/RoadmapTask': {
    table: 'roadmap_tasks',
    fields: {
      id: 'UUID_PK',
      roadmapWeekId: 'UUID_FK:roadmap_week_id',
      title: 'STRING:255:required',
      description: 'TEXT:required',
      type: 'STRING:20:required',
      difficulty: 'STRING:20:required',
      taskOrder: 'INTEGER:required',
      deliverable: 'TEXT:required',
      acceptanceCriteria: 'ARRAY_TEXT',
      estimatedHours: 'INTEGER',
      isMandatory: 'BOOLEAN:true',
      isCustomTask: 'BOOLEAN:false',
      pointsBase: 'INTEGER:10'
    },
    indexes: [
      ['roadmap_week_id', 'task_order:unique'],
      ['roadmap_week_id'],
      ['type'],
      ['difficulty']
    ],
    associations: [
      'belongsTo:RoadmapWeek:roadmap_week_id',
      'hasMany:TaskResource:roadmap_task_id',
      'hasMany:AssignedTask:roadmap_task_id'
    ]
  },
  
  'tasks/TaskResource': {
    table: 'task_resources',
    fields: {
      id: 'UUID_PK',
      roadmapTaskId: 'UUID_FK:roadmap_task_id',
      title: 'STRING:255:required',
      resourceType: 'STRING:50:required',
      url: 'TEXT:required',
      description: 'TEXT',
      isRequired: 'BOOLEAN:false',
      displayOrder: 'INTEGER'
    },
    indexes: [
      ['roadmap_task_id']
    ],
    associations: [
      'belongsTo:RoadmapTask:roadmap_task_id'
    ]
  },
  
  'tasks/TaskSkill': {
    table: 'task_skills',
    fields: {
      id: 'UUID_PK',
      roadmapTaskId: 'UUID_FK:roadmap_task_id',
      skillId: 'UUID_FK:skill_id'
    },
    timestamps: 'created_only',
    indexes: [
      ['roadmap_task_id', 'skill_id:unique'],
      ['roadmap_task_id'],
      ['skill_id']
    ],
    associations: [
      'belongsTo:RoadmapTask:roadmap_task_id',
      'belongsTo:Skill:skill_id'
    ]
  },
  
  'tasks/Enrollment': {
    table: 'enrollments',
    fields: {
      id: 'UUID_PK',
      menteeId: 'UUID_FK:mentee_id',
      programId: 'UUID_FK:program_id',
      currentLevelId: 'UUID_FK:current_level_id',
      status: 'STRING:20:pending_match',
      currentWeek: 'INTEGER:1',
      tasksCompleted: 'INTEGER:0',
      tasksTotal: 'INTEGER:0',
      overallProgressPercentage: 'DECIMAL_5_2:0.00',
      enrolledAt: 'DATE:now',
      startedAt: 'DATE',
      completedAt: 'DATE',
      droppedAt: 'DATE',
      expectedCompletionDate: 'DATEONLY',
      avgTaskRating: 'DECIMAL_3_2',
      totalPointsEarned: 'INTEGER:0'
    },
    indexes: [
      ['mentee_id', 'program_id:unique'],
      ['mentee_id'],
      ['program_id'],
      ['status'],
      ['current_level_id']
    ],
    associations: [
      'belongsTo:User:mentee_id',
      'belongsTo:Program:program_id',
      'belongsTo:ProgramLevel:current_level_id',
      'hasMany:MentorMenteeMatch:enrollment_id',
      'hasMany:AssignedTask:enrollment_id'
    ]
  },
  
  'tasks/MentorMenteeMatch': {
    table: 'mentor_mentee_matches',
    fields: {
      id: 'UUID_PK',
      mentorId: 'UUID_FK:mentor_id',
      menteeId: 'UUID_FK:mentee_id',
      enrollmentId: 'UUID_FK:enrollment_id',
      levelId: 'UUID_FK:level_id',
      matchedBy: 'UUID_FK:matched_by',
      matchScore: 'DECIMAL_5_2',
      matchReason: 'TEXT',
      status: 'STRING:20:active',
      matchedAt: 'DATE:now',
      startedAt: 'DATE',
      endedAt: 'DATE',
      menteeSatisfactionRating: 'DECIMAL_3_2',
      mentorSatisfactionRating: 'DECIMAL_3_2'
    },
    indexes: [
      ['mentor_id'],
      ['mentee_id'],
      ['enrollment_id'],
      ['status'],
      ['level_id']
    ],
    associations: [
      'belongsTo:User:mentor_id',
      'belongsTo:User:mentee_id',
      'belongsTo:Enrollment:enrollment_id',
      'belongsTo:ProgramLevel:level_id',
      'belongsTo:User:matched_by'
    ]
  },
  
  'tasks/AssignedTask': {
    table: 'assigned_tasks',
    fields: {
      id: 'UUID_PK',
      roadmapTaskId: 'UUID_FK:roadmap_task_id',
      menteeId: 'UUID_FK:mentee_id',
      mentorId: 'UUID_FK:mentor_id',
      enrollmentId: 'UUID_FK:enrollment_id',
      status: 'STRING:20:assigned',
      assignedAt: 'DATE:now',
      dueDate: 'DATE',
      startedAt: 'DATE',
      submittedAt: 'DATE',
      completedAt: 'DATE',
      currentSubmissionVersion: 'INTEGER:0',
      revisionCount: 'INTEGER:0',
      timeSpentHours: 'DECIMAL_6_2',
      finalRating: 'DECIMAL_3_2',
      pointsAwarded: 'INTEGER:0',
      isLate: 'BOOLEAN:false',
      isCustomTask: 'BOOLEAN:false'
    },
    indexes: [
      ['mentee_id'],
      ['mentor_id'],
      ['enrollment_id'],
      ['status'],
      ['due_date'],
      ['roadmap_task_id']
    ],
    associations: [
      'belongsTo:RoadmapTask:roadmap_task_id',
      'belongsTo:User:mentee_id',
      'belongsTo:User:mentor_id',
      'belongsTo:Enrollment:enrollment_id',
      'hasMany:TaskSubmission:assigned_task_id',
      'hasMany:TaskFeedback:assigned_task_id'
    ]
  },
  
  'tasks/TaskSubmission': {
    table: 'task_submissions',
    fields: {
      id: 'UUID_PK',
      assignedTaskId: 'UUID_FK:assigned_task_id',
      version: 'INTEGER:required',
      submissionText: 'TEXT:required',
      submissionUrls: 'ARRAY_TEXT',
      submittedAt: 'DATE:now',
      reviewedAt: 'DATE'
    },
    timestamps: false,
    indexes: [
      ['assigned_task_id', 'version:unique'],
      ['assigned_task_id']
    ],
    associations: [
      'belongsTo:AssignedTask:assigned_task_id',
      'hasMany:TaskSubmissionFile:submission_id',
      'hasMany:TaskFeedback:submission_id'
    ]
  },
  
  'tasks/TaskSubmissionFile': {
    table: 'task_submission_files',
    fields: {
      id: 'UUID_PK',
      submissionId: 'UUID_FK:submission_id',
      fileName: 'STRING:255:required',
      fileUrl: 'TEXT:required',
      fileType: 'STRING:50',
      fileSizeBytes: 'BIGINT',
      uploadedAt: 'DATE:now'
    },
    timestamps: false,
    indexes: [
      ['submission_id']
    ],
    associations: [
      'belongsTo:TaskSubmission:submission_id'
    ]
  },
  
  'tasks/TaskFeedback': {
    table: 'task_feedback',
    fields: {
      id: 'UUID_PK',
      assignedTaskId: 'UUID_FK:assigned_task_id',
      submissionId: 'UUID_FK:submission_id',
      mentorId: 'UUID_FK:mentor_id',
      feedbackText: 'TEXT:required',
      rating: 'DECIMAL_3_2:required',
      isApproved: 'BOOLEAN:required',
      revisionNotes: 'TEXT',
      criteriaMet: 'JSONB'
    },
    indexes: [
      ['assigned_task_id'],
      ['submission_id'],
      ['mentor_id']
    ],
    associations: [
      'belongsTo:AssignedTask:assigned_task_id',
      'belongsTo:TaskSubmission:submission_id',
      'belongsTo:User:mentor_id'
    ]
  },
  
  'messaging/Notification': {
    table: 'notifications',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id',
      type: 'STRING:50:required',
      title: 'STRING:255:required',
      message: 'TEXT:required',
      status: 'STRING:20:unread',
      actionUrl: 'TEXT',
      actionLabel: 'STRING:100',
      relatedEntityType: 'STRING:50',
      relatedEntityId: 'UUID',
      readAt: 'DATE',
      sentAt: 'DATE:now',
      emailSent: 'BOOLEAN:false',
      emailSentAt: 'DATE'
    },
    timestamps: 'created_only',
    indexes: [
      ['user_id'],
      ['user_id', 'status'],
      ['type'],
      ['created_at']
    ],
    associations: [
      'belongsTo:User:user_id'
    ]
  },
  
  'messaging/Message': {
    table: 'messages',
    fields: {
      id: 'UUID_PK',
      senderId: 'UUID_FK:sender_id',
      recipientId: 'UUID_FK:recipient_id',
      threadId: 'UUID',
      parentMessageId: 'UUID_FK:parent_message_id',
      subject: 'STRING:255',
      messageText: 'TEXT:required',
      isRead: 'BOOLEAN:false',
      readAt: 'DATE',
      isArchived: 'BOOLEAN:false',
      relatedTaskId: 'UUID_FK:related_task_id',
      relatedEnrollmentId: 'UUID_FK:related_enrollment_id'
    },
    indexes: [
      ['sender_id'],
      ['recipient_id'],
      ['thread_id'],
      ['created_at'],
      ['recipient_id', 'is_read']
    ],
    associations: [
      'belongsTo:User:sender_id',
      'belongsTo:User:recipient_id',
      'belongsTo:Message:parent_message_id',
      'belongsTo:AssignedTask:related_task_id',
      'belongsTo:Enrollment:related_enrollment_id',
      'hasMany:MessageAttachment:message_id'
    ]
  },
  
  'messaging/MessageAttachment': {
    table: 'message_attachments',
    fields: {
      id: 'UUID_PK',
      messageId: 'UUID_FK:message_id',
      fileName: 'STRING:255:required',
      fileUrl: 'TEXT:required',
      fileType: 'STRING:50',
      fileSizeBytes: 'BIGINT',
      uploadedAt: 'DATE:now'
    },
    timestamps: false,
    indexes: [
      ['message_id']
    ],
    associations: [
      'belongsTo:Message:message_id'
    ]
  },
  
  'gamification/Badge': {
    table: 'badges',
    fields: {
      id: 'UUID_PK',
      name: 'STRING:100:required:unique',
      description: 'TEXT:required',
      category: 'STRING:50:required',
      iconUrl: 'TEXT',
      criteriaType: 'STRING:50:required',
      criteriaValue: 'JSONB:required',
      pointsReward: 'INTEGER:0',
      isActive: 'BOOLEAN:true',
      isSecret: 'BOOLEAN:false',
      totalUnlocked: 'INTEGER:0'
    },
    indexes: [
      ['category'],
      ['is_active']
    ],
    associations: [
      'belongsToMany:User:UserBadge:badge_id:user_id'
    ]
  },
  
  'gamification/UserBadge': {
    table: 'user_badges',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id',
      badgeId: 'UUID_FK:badge_id',
      unlockedAt: 'DATE:now',
      unlockContext: 'JSONB',
      isFeatured: 'BOOLEAN:false'
    },
    timestamps: false,
    indexes: [
      ['user_id', 'badge_id:unique'],
      ['user_id'],
      ['badge_id'],
      ['unlocked_at']
    ],
    associations: [
      'belongsTo:User:user_id',
      'belongsTo:Badge:badge_id'
    ]
  },
  
  'gamification/Challenge': {
    table: 'challenges',
    fields: {
      id: 'UUID_PK',
      createdBy: 'UUID_FK:created_by',
      title: 'STRING:255:required',
      description: 'TEXT:required',
      type: 'STRING:20:required',
      requirements: 'JSONB:required',
      eligibilityCriteria: 'JSONB',
      pointsReward: 'INTEGER:required',
      badgeReward: 'UUID_FK:badge_reward',
      startDate: 'DATE:required',
      endDate: 'DATE:required',
      totalParticipants: 'INTEGER:0',
      totalCompleted: 'INTEGER:0',
      isActive: 'BOOLEAN:true'
    },
    indexes: [
      ['type'],
      ['is_active'],
      ['start_date', 'end_date']
    ],
    associations: [
      'belongsTo:User:created_by',
      'belongsTo:Badge:badge_reward'
    ]
  },
  
  'gamification/UserChallenge': {
    table: 'user_challenges',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id',
      challengeId: 'UUID_FK:challenge_id',
      progress: 'JSONB:{}',
      progressPercentage: 'DECIMAL_5_2:0.00',
      isCompleted: 'BOOLEAN:false',
      enrolledAt: 'DATE:now',
      completedAt: 'DATE'
    },
    timestamps: false,
    indexes: [
      ['user_id', 'challenge_id:unique'],
      ['user_id'],
      ['challenge_id'],
      ['is_completed']
    ],
    associations: [
      'belongsTo:User:user_id',
      'belongsTo:Challenge:challenge_id'
    ]
  },
  
  'gamification/PointsHistory': {
    table: 'points_history',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id',
      pointsChange: 'INTEGER:required',
      pointsBefore: 'INTEGER:required',
      pointsAfter: 'INTEGER:required',
      sourceType: 'STRING:50:required',
      sourceId: 'UUID',
      reason: 'TEXT'
    },
    timestamps: 'created_only',
    indexes: [
      ['user_id'],
      ['created_at']
    ],
    associations: [
      'belongsTo:User:user_id'
    ]
  },
  
  'gamification/LeaderboardEntry': {
    table: 'leaderboard_entries',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id',
      programId: 'UUID_FK:program_id',
      rank: 'INTEGER:required',
      points: 'INTEGER:required',
      periodType: 'STRING:20:required',
      periodStart: 'DATEONLY:required',
      periodEnd: 'DATEONLY:required',
      isVisible: 'BOOLEAN:true'
    },
    indexes: [
      ['user_id', 'program_id', 'period_type', 'period_start:unique'],
      ['program_id', 'period_type', 'rank'],
      ['user_id'],
      ['period_type', 'period_start', 'period_end']
    ],
    associations: [
      'belongsTo:User:user_id',
      'belongsTo:Program:program_id'
    ]
  },
  
  'system/UserSettings': {
    table: 'user_settings',
    fields: {
      id: 'UUID_PK',
      userId: 'UUID_FK:user_id:unique',
      emailNotifications: 'JSONB:{"task_assigned":true}',
      pushNotifications: 'JSONB:{"enabled":true}',
      notificationFrequency: 'STRING:20:realtime',
      quietHours: 'JSONB',
      profileVisibility: 'STRING:20:mentors_only',
      showOnLeaderboard: 'BOOLEAN:true',
      leaderboardDisplayName: 'STRING:20:real_name',
      showOnlineStatus: 'BOOLEAN:true',
      theme: 'STRING:20:light',
      language: 'STRING:10:en',
      timezone: 'STRING:50:UTC'
    },
    indexes: [
      ['user_id']
    ],
    associations: [
      'belongsTo:User:user_id'
    ]
  },
  
  'system/FileUpload': {
    table: 'file_uploads',
    fields: {
      id: 'UUID_PK',
      uploadedBy: 'UUID_FK:uploaded_by',
      originalFilename: 'STRING:255:required',
      storedFilename: 'STRING:255:required:unique',
      filePath: 'TEXT:required',
      fileUrl: 'TEXT:required',
      fileType: 'STRING:100',
      fileSizeBytes: 'BIGINT:required',
      mimeType: 'STRING:100',
      entityType: 'STRING:50',
      entityId: 'UUID',
      storageProvider: 'STRING:50:local',
      storageBucket: 'STRING:100',
      uploadedAt: 'DATE:now',
      deletedAt: 'DATE'
    },
    timestamps: false,
    indexes: [
      ['uploaded_by'],
      ['entity_type', 'entity_id'],
      ['uploaded_at']
    ],
    associations: [
      'belongsTo:User:uploaded_by'
    ]
  }
};

console.log('Model generation complete. Run the generated files.');
console.log(`Total models to generate: ${Object.keys(modelDefinitions).length}`);
