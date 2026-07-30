module.exports = (sequelize, DataTypes) => {
  /**
   * RubricSnippet - a reusable piece of grading guidance. Writing a good rubric
   * is the slow part of AI scoring and the same wording gets reused across
   * questions, assessments and future cohorts, so admins save them once and
   * insert them anywhere a rubric is written. Org-wide (admin-authored), and
   * never shown to applicants.
   */
  const RubricSnippet = sequelize.define('RubricSnippet', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    /** How it's listed in the "Insert snippet" picker. */
    title: {
      type: DataTypes.STRING(160),
      allowNull: false
    },
    /** The text inserted into the rubric field. */
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    createdBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by'
    }
  }, {
    tableName: 'rubric_snippets',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['title'] }]
  });

  RubricSnippet.associate = (models) => {
    RubricSnippet.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return RubricSnippet;
};
