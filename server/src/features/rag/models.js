const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MentorStyleProfile = sequelize.define('MentorStyleProfile', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, unique: true, field: 'mentor_id' },
    tone: { type: DataTypes.JSONB, defaultValue: { brevity: 0.5, formality: 0.5 } },
    vocabPrefs: { type: DataTypes.JSONB, defaultValue: {}, field: 'vocab_prefs' },
    phrasePatterns: { type: DataTypes.JSONB, defaultValue: [], field: 'phrase_patterns' },
    styleExamples: { type: DataTypes.JSONB, defaultValue: [], field: 'style_examples' },
    autoReplyEnabled: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'auto_reply_enabled' },
    autoReplyLimit: { type: DataTypes.INTEGER, defaultValue: 100, field: 'auto_reply_limit' },
    autoReplyCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'auto_reply_count' },
  }, { tableName: 'mentor_style_profiles', underscored: true });

  MentorStyleProfile.associate = function(models) {
    MentorStyleProfile.belongsTo(models.User, { foreignKey: 'mentorId', as: 'mentor' });
    models.User.hasOne(MentorStyleProfile, { foreignKey: 'mentorId', as: 'styleProfile' });
  };

  const KnowledgeChunk = sequelize.define('KnowledgeChunk', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId: { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    // NULL for mentor_document (shared across all mentees)
    // Set for mentor_qa + conversation_context (isolated per mentee)
    menteeId: { type: DataTypes.UUID, allowNull: true, field: 'mentee_id' },
    sourceType: { type: DataTypes.STRING(50), field: 'source_type' }, // 'mentor_document' | 'mentor_qa' | 'conversation_context'
    sourceId: { type: DataTypes.UUID, field: 'source_id' },
    chunkIndex: { type: DataTypes.INTEGER, defaultValue: 0, field: 'chunk_index' },
    contentHash: { type: DataTypes.CHAR(64), field: 'content_hash' },
    content: { type: DataTypes.TEXT, allowNull: false },
    embedding: { type: DataTypes.TEXT }, // stored as '[0.1,0.2,...]' cast to vector in raw queries
    visibility: { type: DataTypes.STRING(20), defaultValue: 'mentor' },
  }, { tableName: 'knowledge_chunks', underscored: true });

  const RagIngestionJob = sequelize.define('RagIngestionJob', {
    id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    mentorId:   { type: DataTypes.UUID, allowNull: false, field: 'mentor_id' },
    sourceType: { type: DataTypes.STRING(50), field: 'source_type' },
    sourceId:   { type: DataTypes.UUID, field: 'source_id' },
    text:       { type: DataTypes.TEXT, allowNull: false },
    fileName:   { type: DataTypes.STRING(255), allowNull: true, field: 'file_name' },
    visibility: { type: DataTypes.STRING(20), defaultValue: 'mentor' },
    status:     { type: DataTypes.STRING(20), defaultValue: 'pending' },
    attempts:   { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'rag_ingestion_jobs', underscored: true });

  const MessageDraft = sequelize.define('MessageDraft', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    messageId: { type: DataTypes.UUID, field: 'message_id' },
    mentorId: { type: DataTypes.UUID, field: 'mentor_id' },
    menteeId: { type: DataTypes.UUID, field: 'mentee_id' },
    draftContent: { type: DataTypes.TEXT, field: 'draft_content' },
    confidenceScore: { type: DataTypes.FLOAT, field: 'confidence_score' },
    retrievedChunkIds: { type: DataTypes.JSONB, defaultValue: [], field: 'retrieved_chunk_ids' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
  }, { tableName: 'message_drafts', underscored: true });

  const MentorEditHistory = sequelize.define('MentorEditHistory', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    draftId: { type: DataTypes.UUID, field: 'draft_id' },
    mentorId: { type: DataTypes.UUID, field: 'mentor_id' },
    originalContent: { type: DataTypes.TEXT, field: 'original_content' },
    finalContent: { type: DataTypes.TEXT, field: 'final_content' },
    editDistance: { type: DataTypes.INTEGER, field: 'edit_distance' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'mentor_edit_histories', underscored: true });

  return { MentorStyleProfile, KnowledgeChunk, RagIngestionJob, MessageDraft, MentorEditHistory };
};
