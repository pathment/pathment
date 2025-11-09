module.exports = (sequelize, DataTypes) => {
  const AdaptiveRecommendation = sequelize.define('AdaptiveRecommendation', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    menteeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'mentee_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'enrollment_id'
    },
    recommendationType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'recommendation_type'
    },
    currentRoadmapId: {
      type: DataTypes.UUID,
      field: 'current_roadmap_id'
    },
    recommendedChanges: {
      type: DataTypes.JSONB,
      allowNull: false,
      field: 'recommended_changes'
    },
    reasoning: {
      type: DataTypes.TEXT
    },
    generatedByAi: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'generated_by_ai'
    },
    aiConfidenceScore: {
      type: DataTypes.DECIMAL(5, 2),
      field: 'ai_confidence_score'
    },
    aiModelVersion: {
      type: DataTypes.STRING(50),
      field: 'ai_model_version'
    },
    performanceMetrics: {
      type: DataTypes.JSONB,
      field: 'performance_metrics'
    },
    status: {
      type: DataTypes.STRING(50),
      defaultValue: 'pending'
    },
    reviewedBy: {
      type: DataTypes.UUID,
      field: 'reviewed_by'
    },
    reviewedAt: {
      type: DataTypes.DATE,
      field: 'reviewed_at'
    },
    appliedAt: {
      type: DataTypes.DATE,
      field: 'applied_at'
    }
  }, {
    tableName: 'adaptive_recommendations',
    underscored: true,
    updatedAt: false,
    indexes: [
      { fields: ['mentee_id'] },
      { fields: ['enrollment_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] }
    ]
  });

  AdaptiveRecommendation.associate = (models) => {
    AdaptiveRecommendation.belongsTo(models.User, { foreignKey: 'mentee_id', as: 'mentee' });
    AdaptiveRecommendation.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    AdaptiveRecommendation.belongsTo(models.Roadmap, { foreignKey: 'current_roadmap_id', as: 'currentRoadmap' });
    AdaptiveRecommendation.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
  };

  return AdaptiveRecommendation;
};
