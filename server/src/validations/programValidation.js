const Joi = require("joi");

const programValidation = {
  // Create program validation
  createProgram: Joi.object({
    name: Joi.string().min(3).max(255).required().messages({
      "string.empty": "Program name is required",
      "string.min": "Program name must be at least 3 characters",
      "string.max": "Program name cannot exceed 255 characters",
    }),

    description: Joi.string().min(10).required().messages({
      "string.empty": "Program description is required",
      "string.min": "Description must be at least 10 characters",
    }),

    type: Joi.string()
      .valid("internship", "mentorship", "training", "onboarding")
      .required()
      .messages({
        "any.only":
          "Type must be one of: internship, mentorship, training, onboarding",
        "any.required": "Program type is required",
      }),

    status: Joi.string()
      .valid("draft", "published", "archived", "completed")
      .default("draft")
      .messages({
        "any.only":
          "Status must be one of: draft, published, archived, completed",
      }),

    totalDurationWeeks: Joi.number()
      .integer()
      .min(1)
      .max(104)
      .required()
      .messages({
        "number.base": "Total duration must be a number",
        "number.min": "Duration must be at least 1 week",
        "number.max": "Duration cannot exceed 104 weeks (2 years)",
        "any.required": "Total duration is required",
      }),

    estimatedHoursPerWeek: Joi.number()
      .integer()
      .min(1)
      .max(168)
      .optional()
      .messages({
        "number.min": "Hours per week must be at least 1",
        "number.max": "Hours per week cannot exceed 168",
      }),

    startDate: Joi.date().iso().min("now").optional().messages({
      "date.format": "Start date must be in ISO format (YYYY-MM-DD)",
      "date.min": "Start date must be in the future",
    }),

    endDate: Joi.date()
      .iso()
      .min("now")
      .greater(Joi.ref("startDate"))
      .optional()
      .messages({
        "date.min": "End date cannot be in the past",
        "date.format": "End date must be in ISO format (YYYY-MM-DD)",
        "date.greater": "End date must be after start date",
      }),

    maxEnrollments: Joi.number()
      .integer()
      .min(1)
      .optional()
      .allow(null)
      .messages({
        "number.min": "Max enrollments must be at least 1",
      }),

    tags: Joi.array().items(Joi.string().max(50)).max(10).optional().messages({
      "array.max": "Cannot have more than 10 tags",
      "string.max": "Each tag cannot exceed 50 characters",
    }),

    learningOutcomes: Joi.array()
      .items(Joi.string().max(500))
      .max(20)
      .optional()
      .messages({
        "array.max": "Cannot have more than 20 learning outcomes",
        "string.max": "Each outcome cannot exceed 500 characters",
      }),

    prerequisites: Joi.array()
      .items(Joi.string().max(200))
      .max(10)
      .optional()
      .messages({
        "array.max": "Cannot have more than 10 prerequisites",
        "string.max": "Each prerequisite cannot exceed 200 characters",
      }),

    targetAudience: Joi.string().max(1000).optional().allow("", null).messages({
      "string.max": "Target audience cannot exceed 1000 characters",
    }),

    isTemplate: Joi.boolean().default(false).optional(),
  }),

  // Update program validation
  updateProgram: Joi.object({
    name: Joi.string().min(3).max(255).optional().messages({
      "string.min": "Program name must be at least 3 characters",
      "string.max": "Program name cannot exceed 255 characters",
    }),

    description: Joi.string().min(10).optional().messages({
      "string.min": "Description must be at least 10 characters",
    }),

    type: Joi.string()
      .valid("internship", "mentorship", "training", "onboarding")
      .optional()
      .messages({
        "any.only":
          "Type must be one of: internship, mentorship, training, onboarding",
      }),

    status: Joi.string()
      .valid("draft", "published", "archived", "completed")
      .optional()
      .messages({
        "any.only":
          "Status must be one of: draft, published, archived, completed",
      }),

    totalDurationWeeks: Joi.number()
      .integer()
      .min(1)
      .max(104)
      .optional()
      .messages({
        "number.min": "Duration must be at least 1 week",
        "number.max": "Duration cannot exceed 104 weeks",
      }),

    estimatedHoursPerWeek: Joi.number()
      .integer()
      .min(1)
      .max(168)
      .optional()
      .messages({
        "number.min": "Hours per week must be at least 1",
        "number.max": "Hours per week cannot exceed 168",
      }),

    startDate: Joi.date().iso().optional().messages({
      "date.format": "Start date must be in ISO format",
    }),

    endDate: Joi.date().iso().optional().messages({
      "date.format": "End date must be in ISO format",
    }),

    maxEnrollments: Joi.number()
      .integer()
      .min(1)
      .optional()
      .allow(null)
      .messages({
        "number.min": "Max enrollments must be at least 1",
      }),

    tags: Joi.array().items(Joi.string().max(50)).max(10).optional().messages({
      "array.max": "Cannot have more than 10 tags",
    }),

    learningOutcomes: Joi.array()
      .items(Joi.string().max(500))
      .max(20)
      .optional()
      .messages({
        "array.max": "Cannot have more than 20 learning outcomes",
      }),

    prerequisites: Joi.string().max(2000).optional().allow("", null),

    targetAudience: Joi.string().max(1000).optional().allow("", null),

    isTemplate: Joi.boolean().optional(),
  })
    .min(1)
    .messages({
      "object.min": "At least one field must be provided for update",
    }),

  // Clone program validation
  cloneProgram: Joi.object({
    name: Joi.string().min(3).max(255).optional().messages({
      "string.min": "Program name must be at least 3 characters",
      "string.max": "Program name cannot exceed 255 characters",
    }),

    description: Joi.string().min(10).optional(),

    startDate: Joi.date().iso().optional(),

    endDate: Joi.date().iso().optional(),
  }),

  // Get programs filters validation
  getProgramsFilters: Joi.object({
    status: Joi.string()
      .valid("draft", "published", "archived", "completed")
      .optional(),

    type: Joi.string()
      .valid("internship", "mentorship", "training", "onboarding")
      .optional(),

    tags: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .optional(),

    search: Joi.string().max(255).optional(),

    createdBy: Joi.string().uuid().optional(),

    isTemplate: Joi.boolean().optional(),

    page: Joi.number().integer().min(1).default(1).optional(),

    limit: Joi.number().integer().min(1).max(100).default(10).optional(),

    sortBy: Joi.string()
      .valid("createdAt", "name", "rating", "currentEnrollments", "startDate")
      .default("createdAt")
      .optional(),

    sortOrder: Joi.string().valid("ASC", "DESC").default("DESC").optional(),
  }),
};

module.exports = programValidation;
