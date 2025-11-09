module.exports = (sequelize, DataTypes) => {
  const UserSkill = sequelize.define('UserSkill', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    skillId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'skill_id'
    },
    proficiencyLevel: {
      type: DataTypes.INTEGER,
      validate: { min: 1, max: 100 },
      field: 'proficiency_level'
    },
    yearsOfExperience: {
      type: DataTypes.DECIMAL(3, 1),
      field: 'years_of_experience'
    }
  }, {
    tableName: 'user_skills',
    underscored: true,
    indexes: [
      { unique: true, fields: ['user_id', 'skill_id'] },
      { fields: ['user_id'] },
      { fields: ['skill_id'] }
    ]
  });

  UserSkill.associate = (models) => {
    UserSkill.belongsTo(models.User, { foreignKey: 'user_id' });
    UserSkill.belongsTo(models.Skill, { foreignKey: 'skill_id' });
  };

  return UserSkill;
};
