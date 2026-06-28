module.exports = (sequelize, DataTypes) => {
  const Application = sequelize.define('Application', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    cohortId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'cohort_id'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: { isEmail: true }
    },
    firstName: {
      type: DataTypes.STRING(120),
      field: 'first_name'
    },
    lastName: {
      type: DataTypes.STRING(120),
      field: 'last_name'
    },
    phone: {
      type: DataTypes.STRING(40)
    },
    // The program the applicant asked for (free text from intake) - used for
    // triage. Actual placement comes from the cohort's program on accept.
    programPreference: {
      type: DataTypes.STRING(255),
      field: 'program_preference'
    },
    // The level the applicant selected (key into the cohort's `levels`). Drives
    // which assessment pool they're assigned from. null when the cohort has no levels.
    level: {
      type: DataTypes.STRING(40)
    },
    // The assessment randomly assigned to this applicant from the matching pool.
    // Stored so a returning applicant always sees the SAME assessment (stable).
    assignedAssessmentId: {
      type: DataTypes.UUID,
      field: 'assigned_assessment_id'
    },
    // Where this record came from. Importer sets 'import'; manual add 'manual'.
    source: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'import',
      validate: {
        isIn: [['google_form', 'manual', 'import', 'api', 'public_link']]
      }
    },
    // Review pipeline stage.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      validate: {
        isIn: [['pending', 'assessment_sent', 'under_review', 'accepted', 'rejected', 'waitlisted', 'withdrawn']]
      }
    },
    assessmentScore: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'assessment_score'
    },
    reviewerNotes: {
      type: DataTypes.TEXT,
      field: 'reviewer_notes'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      field: 'reviewed_by'
    },
    decidedAt: {
      type: DataTypes.DATE,
      field: 'decided_at'
    },
    // The invite issued when the application is accepted.
    inviteId: {
      type: DataTypes.UUID,
      field: 'invite_id'
    },
    // The user account, once the applicant registers from their invite.
    userId: {
      type: DataTypes.UUID,
      field: 'user_id'
    },
    // The full, schema-free intake answers - survives the form changing year to
    // year. Operational fields are normalized onto MenteeProfile at accept time.
    responses: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    // Magic-link token (SHA256) so a not-yet-registered applicant can return to
    // track status / take the assessment without an account.
    accessTokenHash: {
      type: DataTypes.STRING(255),
      field: 'access_token_hash'
    },
    accessTokenExpiresAt: {
      type: DataTypes.DATE,
      field: 'access_token_expires_at'
    },
    assessmentSubmittedAt: {
      type: DataTypes.DATE,
      field: 'assessment_submitted_at'
    }
  }, {
    tableName: 'applications',
    underscored: true,
    indexes: [
      { fields: ['cohort_id'] },
      { fields: ['email'] },
      { fields: ['status'] },
      { fields: ['cohort_id', 'email'], unique: true },
      { fields: ['invite_id'] },
      { fields: ['user_id'] },
      // Applicant magic-link auth looks up by token hash on every access.
      { fields: ['access_token_hash'] }
    ]
  });

  Application.associate = (models) => {
    Application.belongsTo(models.Cohort, { foreignKey: 'cohort_id', as: 'cohort' });
    Application.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
    Application.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Application.belongsTo(models.RegistrationInvite, { foreignKey: 'invite_id', as: 'invite' });
    Application.belongsTo(models.Assessment, { foreignKey: 'assigned_assessment_id', as: 'assignedAssessment' });
    Application.hasMany(models.AssessmentSubmission, { foreignKey: 'application_id', as: 'assessmentSubmissions' });
  };

  return Application;
};
