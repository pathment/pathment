'use strict';

const Joi = require('joi');

/** Shared mentee + mentor criteria types accepted when creating/updating badges. */
const BADGE_CRITERIA_TYPES = [
  'points_milestone',
  'coins_earned',
  'tasks_completed',
  'programs_completed',
  'streak_days',
  'avg_rating',
  'level_reached',
  'skill_mastery',
  'custom',
  // Mentor auto (event-table backed)
  'reviews_given',
  'tasks_approved',
  'meetings_logged',
  'mentees_guided',
  'clans_led',
  'mentor_avg_rating',
];

const criteriaValueCreate = Joi.object({
  threshold: Joi.number().integer().min(0),
  count: Joi.number().integer().min(0),
  days: Joi.number().integer().min(0),
  minRating: Joi.number().min(0),
  minResponses: Joi.number().integer().min(1),
  level: Joi.number().integer().min(1),
  skillId: Joi.string().uuid(),
  minProficiency: Joi.number().min(0),
  targetRole: Joi.string().valid('mentee', 'mentor'),
  relatedRoadmapTaskId: Joi.string().uuid(),
  relatedTaskId: Joi.string().uuid(),
}).unknown(true).required();

const gamificationSchemas = {
  createBadge: Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().required(),
    category: Joi.string().max(50).default('milestone'),
    criteriaType: Joi.string().valid(...BADGE_CRITERIA_TYPES).required(),
    criteriaValue: criteriaValueCreate,
    pointsReward: Joi.number().integer().min(0).default(0),
    isActive: Joi.boolean().default(true),
    isSecret: Joi.boolean().default(false),
    // 0 = workspace, 1 = program, 2 = clan
    earningScope: Joi.number().integer().valid(0, 1, 2).default(0),
    // Absolute CDN URLs or local presets under /badges/*
    iconUrl: Joi.string().uri({ allowRelative: true }).allow('', null).optional(),
  }),

  // criteria/scope/audience frozen after create — omitted from patch schema
  updateBadge: Joi.object({
    name: Joi.string().max(100),
    description: Joi.string(),
    category: Joi.string().max(50),
    criteriaType: Joi.string().valid(...BADGE_CRITERIA_TYPES),
    criteriaValue: Joi.object().unknown(true),
    pointsReward: Joi.number().integer().min(0),
    isActive: Joi.boolean(),
    isSecret: Joi.boolean(),
    iconUrl: Joi.string().uri({ allowRelative: true }).allow('', null),
  }),

  awardBadge: Joi.object({
    userId: Joi.string().uuid().required(),
    badgeId: Joi.string().uuid().required(),
    context: Joi.object({
      programId: Joi.string().uuid().allow(null),
      clanId: Joi.string().uuid().allow(null),
      reason: Joi.string().max(500),
    }).unknown(true).optional(),
  }),
};

module.exports = { gamificationSchemas, BADGE_CRITERIA_TYPES };
