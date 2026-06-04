module.exports = (sequelize, DataTypes) => {
  const ProgramReview = sequelize.define('ProgramReview', {
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
    reviewerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'reviewer_id'
    },
    enrollmentId: {
      type: DataTypes.UUID,
      field: 'enrollment_id'
    },
    mentorId: {
      type: DataTypes.UUID,
      field: 'mentor_id'
    },
    rating: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: false,
      validate: { min: 0, max: 5 }
    },
    reviewText: {
      type: DataTypes.TEXT,
      field: 'review_text'
    },
    contentQualityRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'content_quality_rating'
    },
    mentorQualityRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'mentor_quality_rating'
    },
    difficultyRating: {
      type: DataTypes.DECIMAL(3, 2),
      field: 'difficulty_rating'
    },
    dimensions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {}
    },
    wouldRecommend: {
      type: DataTypes.BOOLEAN,
      field: 'would_recommend'
    }
  }, {
    tableName: 'program_reviews',
    underscored: true,
    indexes: [
      { unique: true, fields: ['program_id', 'reviewer_id'] },
      { fields: ['program_id'] },
      { fields: ['reviewer_id'] },
      { fields: ['mentor_id'] }
    ]
  });

  ProgramReview.associate = (models) => {
    ProgramReview.belongsTo(models.Program, { foreignKey: 'program_id', as: 'program' });
    ProgramReview.belongsTo(models.User, { foreignKey: 'reviewer_id', as: 'reviewer' });
    ProgramReview.belongsTo(models.Enrollment, { foreignKey: 'enrollment_id', as: 'enrollment' });
    ProgramReview.belongsTo(models.User, { foreignKey: 'mentor_id', as: 'mentor' });
  };

  return ProgramReview;
};
