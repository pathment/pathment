module.exports = (sequelize, DataTypes) => {
  const Application = sequelize.define('Application', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    organizationId: { type: DataTypes.UUID, allowNull: false, field: 'organization_id' },
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
    // The level this applicant is TREATED as, and the one that drives which
    // assessment pool they're assigned from and which pool work reaches them.
    // Starts as the level they picked; the automatic review overwrites it with
    // the level the rules landed on. null when the cohort has no levels.
    level: {
      type: DataTypes.STRING(40)
    },
    // The level the APPLICANT picked on the form, kept untouched by the review.
    // The review reads their own pick as evidence (the base track is locked, and
    // someone who applied above base falls through rather than being dropped), so
    // it must never be fed back its own previous answer: that made a re-review
    // land on a different level each run, swapping the candidate's level-targeted
    // work and emailing them about every level in turn.
    selfSelectedLevel: {
      type: DataTypes.STRING(40),
      field: 'self_selected_level'
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
        // 'removed': taken out of the intake by an admin (see applicationRemovalService).
        isIn: [['pending', 'assessment_sent', 'under_review', 'accepted', 'rejected', 'waitlisted', 'withdrawn', 'removed']]
      }
    },
    assessmentScore: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'assessment_score'
    },
    // Where `level` came from: the applicant's own pick, the automatic review,
    // or an admin. The level decides which assessment they sit, so a score is
    // only readable next to how the level was arrived at.
    levelSource: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'level_source',
      validate: { isIn: [['self', 'ai', 'admin']] }
    },
    // A human accepted the level. Confirmation is what lets the level drive
    // placement and level-based work; it deliberately does NOT gate the paper,
    // or a public form would stall until an admin was at their desk.
    levelConfirmedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'level_confirmed_at'
    },
    levelConfirmedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'level_confirmed_by'
    },
    // An admin moved the level after the paper was already sat, so the score
    // belongs to a paper written for a different level. Raised for a human
    // rather than silently re-papering someone who has finished.
    levelChangedAfterAssessment: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'level_changed_after_assessment'
    },
    // Level the rules landed on from evidence (may differ from the applicant's
    // self-selected `level`), plus the per-criterion proof behind it.
    recommendedLevel: {
      type: DataTypes.STRING(40),
      allowNull: true,
      field: 'recommended_level'
    },
    levelEvidence: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'level_evidence'
    },
    reviewerNotes: {
      type: DataTypes.TEXT,
      field: 'reviewer_notes'
    },
    // The reason surfaced to the APPLICANT on a decision (e.g. why rejected).
    // Separate from reviewer_notes, which stays internal.
    decisionReason: {
      type: DataTypes.TEXT,
      field: 'decision_reason'
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
    },
    // The assessment pipeline, step by step (see applicationStage).
    assessmentInvitedAt: {
      type: DataTypes.DATE,
      field: 'assessment_invited_at'
    },
    assessmentInviteCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'assessment_invite_count'
    },
    linkOpenedAt: {
      type: DataTypes.DATE,
      field: 'link_opened_at'
    },
    assessmentStartedAt: {
      type: DataTypes.DATE,
      field: 'assessment_started_at'
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
