module.exports = (sequelize, DataTypes) => {
  const FileUpload = sequelize.define('FileUpload', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    uploadedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'uploaded_by'
    },
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'file_name'
    },
    originalName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'original_name'
    },
    fileType: {
      type: DataTypes.STRING(100),
      field: 'file_type'
    },
    mimeType: {
      type: DataTypes.STRING(100),
      field: 'mime_type'
    },
    fileSizeBytes: {
      type: DataTypes.BIGINT,
      allowNull: false,
      field: 'file_size_bytes'
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'file_url'
    },
    storagePath: {
      type: DataTypes.STRING(500),
      field: 'storage_path'
    },
    storageProvider: {
      type: DataTypes.STRING(50),
      defaultValue: 'local',
      field: 'storage_provider'
    },
    relatedEntityType: {
      type: DataTypes.STRING(50),
      field: 'related_entity_type'
    },
    relatedEntityId: {
      type: DataTypes.UUID,
      field: 'related_entity_id'
    },
    isPublic: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_public'
    },
    checksum: {
      type: DataTypes.STRING(64)
    }
  }, {
    tableName: 'file_uploads',
    underscored: true,
    indexes: [
      { fields: ['uploaded_by'] },
      { fields: ['related_entity_type', 'related_entity_id'] },
      { fields: ['created_at'] }
    ]
  });

  FileUpload.associate = (models) => {
    FileUpload.belongsTo(models.User, { foreignKey: 'uploaded_by', as: 'uploader' });
  };

  return FileUpload;
};
