module.exports = (sequelize, DataTypes) => {
  /**
   * FeedbackSnippet - a short, reusable bit of review feedback saved by a mentor
   * so it can be inserted into either review drawer (single or bulk) without
   * retyping. Personal to the mentor who created it.
   */
  const FeedbackSnippet = sequelize.define('FeedbackSnippet', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    mentorId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentor_id'
    },
    // Short human title shown in the Snippets menu.
    label: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    // The feedback text inserted into the drawer's feedback field.
    body: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'feedback_snippets',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['mentor_id'] }
    ]
  });

  FeedbackSnippet.associate = (models) => {
    FeedbackSnippet.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
    models.User.hasMany(FeedbackSnippet, { foreignKey: 'mentor_id', as: 'feedbackSnippets' });
  };

  return FeedbackSnippet;
};
