module.exports = (sequelize, DataTypes) => {
  /**
   * SuppressedEmail - addresses we must NOT send to. Populated by the Resend
   * webhook on hard bounce / complaint (and manually by admins). The email
   * worker checks this before every send: repeatedly mailing dead addresses is
   * what gets a whole sending domain throttled or blocklisted, so suppression
   * protects deliverability for everyone else.
   */
  const SuppressedEmail = sequelize.define('SuppressedEmail', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    reason: { type: DataTypes.STRING(20), allowNull: false }, // 'bounce' | 'complaint' | 'manual'
    detail: { type: DataTypes.TEXT, allowNull: true },
    source: { type: DataTypes.STRING(20), allowNull: true }, // 'resend_webhook' | 'admin'
  }, {
    tableName: 'suppressed_emails',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['email'] }],
  });

  return SuppressedEmail;
};
