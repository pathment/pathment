'use strict';

const Joi = require('joi');
const { APP_TYPES, INTEGRATION_KEYS } = require('../config/externalApps');

// Absolute CDN URLs or local presets under /apps/*
const iconUrl = Joi.string().uri({ allowRelative: true }).max(500).allow('', null);

const integrationKey = Joi.string().valid(...INTEGRATION_KEYS).allow(null, '');

// Provider hosts: absolute http(s) only — the server calls these.
const serviceUrl = Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(500).allow('', null);

const externalAppSchemas = {
  idParam: Joi.object({
    id: Joi.string().uuid().required(),
  }),

  // Field names depend on the integration; the service requires each declared one.
  connect: Joi.object({
    credentials: Joi.object().pattern(Joi.string().max(40), Joi.string().max(500)).max(10).required(),
  }),

  listQuery: Joi.object({
    search: Joi.string().trim().max(120).optional().allow(''),
    type: Joi.string().valid(...APP_TYPES).optional().allow(null, ''),
  }),

  createApp: Joi.object({
    name: Joi.string().trim().max(120).required(),
    type: Joi.string().valid(...APP_TYPES).required(),
    description: Joi.string().trim().max(2000).allow('', null).optional(),
    iconUrl: iconUrl.optional(),
    integrationKey: integrationKey.optional(),
    backendUrl: serviceUrl.optional(),
    frontendUrl: serviceUrl.optional(),
    isActive: Joi.boolean().default(true),
  }),

  updateApp: Joi.object({
    name: Joi.string().trim().max(120),
    type: Joi.string().valid(...APP_TYPES),
    description: Joi.string().trim().max(2000).allow('', null),
    iconUrl,
    integrationKey,
    backendUrl: serviceUrl,
    frontendUrl: serviceUrl,
    isActive: Joi.boolean(),
  }).min(1),
};

module.exports = { externalAppSchemas };
