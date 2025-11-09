module.exports = (sequelize, DataTypes) => {
  const Skill = sequelize.define('Skill', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    category: {
      type: DataTypes.STRING(50)
    },
    description: {
      type: DataTypes.TEXT
    }
  }, {
    tableName: 'skills',
    underscored: true,
    timestamps: true,
    updatedAt: false
  });

  Skill.associate = (models) => {
    Skill.belongsToMany(models.User, {
      through: models.UserSkill,
      foreignKey: 'skill_id',
      otherKey: 'user_id',
      as: 'users'
    });
  };

  return Skill;
};
