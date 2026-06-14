module.exports = (sequelize, DataTypes) => {
  /**
   * ClanMemberPermission - per-co-mentor permission exceptions, keyed by
   * (clanId, userId) and INDEPENDENT of how the person became a co-mentor
   * (team membership, accepted cross-clan cover, or an IAM role grant). A
   * co-mentor starts with every default permission; `denied` lists the ones a
   * lead mentor / admin has revoked for them in this clan. No row / empty list
   * = full default access. authzService applies this to any co_mentor@clan
   * assignment, whatever its source.
   */
  const ClanMemberPermission = sequelize.define('ClanMemberPermission', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    clanId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'clan_id'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id'
    },
    denied: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: []
    },
    updatedBy: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'updated_by'
    }
  }, {
    tableName: 'clan_member_permissions',
    underscored: true,
    timestamps: true,
    indexes: [
      { unique: true, fields: ['clan_id', 'user_id'] },
      { fields: ['user_id'] }
    ]
  });

  return ClanMemberPermission;
};
