/**
 * Consolidated Certificate Models
 *
 * Defines CertificateTemplate and CertificateInstance together in one file.
 */
module.exports = (sequelize, DataTypes) => {
  // 1. CertificateTemplate Model (Design Blueprint)
  const CertificateTemplate = sequelize.define('CertificateTemplate', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    bgImageUrl: { type: DataTypes.TEXT, field: 'bg_image_url' },
    logoUrl: { type: DataTypes.TEXT, field: 'logo_url' },
    logoConfig: { type: DataTypes.JSONB, field: 'logo_config' },
    config: { type: DataTypes.JSONB, allowNull: false },
    criteria: { type: DataTypes.JSONB },
    createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
    programId: { type: DataTypes.UUID, allowNull: false, field: 'program_id' },
    status: { type: DataTypes.STRING(20), defaultValue: 'active' },
    aiEvaluation: { type: DataTypes.JSONB, field: 'ai_evaluation' },
    aiEvaluationRanAt: { type: DataTypes.DATE, field: 'ai_evaluation_ran_at' }
  }, { tableName: 'certificate_templates', underscored: true });

  CertificateTemplate.associate = function(models) {
    if (models.User) {
      CertificateTemplate.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
    }
    if (models.Program) {
      CertificateTemplate.belongsTo(models.Program, { foreignKey: 'programId', as: 'program' });
    }
  };

  // 2. CertificateInstance Model (Issued Credential)
  const CertificateInstance = sequelize.define('CertificateInstance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    templateId: { type: DataTypes.UUID, allowNull: false, field: 'template_id' },
    menteeId: { type: DataTypes.UUID, allowNull: false, field: 'mentee_id' },
    mentorId: { type: DataTypes.UUID, field: 'mentor_id' },
    issuedBy: { type: DataTypes.UUID, allowNull: false, field: 'issued_by' },
    pdfUrl: { type: DataTypes.TEXT, field: 'pdf_url' },
    imageUrl: { type: DataTypes.TEXT, field: 'image_url' },
    tier: { type: DataTypes.STRING(50), defaultValue: 'participation' },
    metadata: { type: DataTypes.JSONB }
  }, { tableName: 'certificate_instances', underscored: true });

  CertificateInstance.associate = function(models) {
    if (models.CertificateTemplate) {
      CertificateInstance.belongsTo(models.CertificateTemplate, { foreignKey: 'templateId', as: 'template' });
    }
    if (models.User) {
      CertificateInstance.belongsTo(models.User, { foreignKey: 'menteeId', as: 'mentee' });
      CertificateInstance.belongsTo(models.User, { foreignKey: 'mentorId', as: 'mentor' });
      CertificateInstance.belongsTo(models.User, { foreignKey: 'issuedBy', as: 'issuer' });
    }
  };

  return [CertificateTemplate, CertificateInstance];
};
