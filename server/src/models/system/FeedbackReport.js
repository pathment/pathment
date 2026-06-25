module.exports = (sequelize, DataTypes) => {
  /**
   * FeedbackReport - in-app feedback / bug report submitted by any user. Admins
   * triage it through a status and reply with a resolution note (shown back to
   * the reporter, who is notified on every status change).
   */
  const FeedbackReport = sequelize.define('FeedbackReport', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    reporterId: { type: DataTypes.UUID, allowNull: false, field: 'reporter_id' },
    reporterRole: { type: DataTypes.STRING(20), allowNull: true, field: 'reporter_role' },
    type: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'bug',
      validate: { isIn: [['bug', 'suggestion', 'other']] },
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open',
      validate: { isIn: [['open', 'in_review', 'planned', 'fixed', 'added', 'declined']] },
    },
    priority: {
      type: DataTypes.STRING(10), allowNull: false, defaultValue: 'normal',
      validate: { isIn: [['low', 'normal', 'high']] },
    },
    pageUrl: { type: DataTypes.STRING(500), allowNull: true, field: 'page_url' },
    userAgent: { type: DataTypes.STRING(500), allowNull: true, field: 'user_agent' },
    attachmentUrl: { type: DataTypes.TEXT, allowNull: true, field: 'attachment_url' },
    attachmentType: { type: DataTypes.STRING(20), allowNull: true, field: 'attachment_type' },
    attachmentName: { type: DataTypes.STRING(255), allowNull: true, field: 'attachment_name' },
    resolutionNote: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_note' },
    handledBy: { type: DataTypes.UUID, allowNull: true, field: 'handled_by' },
    handledAt: { type: DataTypes.DATE, allowNull: true, field: 'handled_at' },
  }, {
    tableName: 'feedback_reports',
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ['status'] }, { fields: ['reporter_id'] }, { fields: ['type'] }],
  });

  FeedbackReport.associate = (models) => {
    FeedbackReport.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
    FeedbackReport.belongsTo(models.User, { foreignKey: 'handled_by', as: 'handler' });
  };

  return FeedbackReport;
};
