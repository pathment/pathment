module.exports = (sequelize, DataTypes) => {
  const Cohort = sequelize.define('Cohort', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    programId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'program_id'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    // Intake lifecycle. Only an 'open' cohort accepts applications/invites —
    // an off year is simply a program with no open cohort. Nothing breaks.
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'planning',
      validate: {
        isIn: [['planning', 'open', 'closed', 'running', 'completed']]
      }
    },
    capacity: {
      type: DataTypes.INTEGER
    },
    startDate: {
      type: DataTypes.DATEONLY,
      field: 'start_date'
    },
    endDate: {
      type: DataTypes.DATEONLY,
      field: 'end_date'
    },
    // ── Public self-serve intake link ──────────────────────────────────────
    // Shareable slug (`/apply/<slug>`). Only resolves while the cohort is open,
    // public_enabled, and within the optional window/cap below.
    publicSlug: {
      type: DataTypes.STRING(64),
      field: 'public_slug',
      unique: true
    },
    publicEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'public_enabled'
    },
    applyOpensAt: {
      type: DataTypes.DATE,
      field: 'apply_opens_at'
    },
    applyClosesAt: {
      type: DataTypes.DATE,
      field: 'apply_closes_at'
    },
    // Hard cap on how many applications the link will accept (null = unlimited).
    maxApplications: {
      type: DataTypes.INTEGER,
      field: 'max_applications'
    },
    // Extra application form fields the admin configures: [{ key, label, type,
    // required, options? }]. The default name/email/phone are always collected.
    intakeFormSchema: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      field: 'intake_form_schema'
    },
    // Optional assessment an applicant must/may complete before review.
    assessmentId: {
      type: DataTypes.UUID,
      field: 'assessment_id'
    },
    assessmentRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'assessment_required'
    },
    createdBy: {
      type: DataTypes.UUID,
      field: 'created_by'
    }
  }, {
    tableName: 'cohorts',
    underscored: true,
    indexes: [
      { fields: ['program_id'] },
      { fields: ['status'] }
    ]
  });

  Cohort.associate = (models) => {
    Cohort.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    Cohort.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Cohort.belongsTo(models.Assessment, { foreignKey: 'assessment_id', as: 'assessment' });
    Cohort.hasMany(models.Application, { foreignKey: 'cohort_id', as: 'applications' });
  };

  return Cohort;
};
