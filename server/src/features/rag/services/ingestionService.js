const crypto = require('crypto');
const { sequelize, models: { KnowledgeChunk, RagIngestionJob } } = require('../../../db');
const { chunkText }  = require('./chunkingService');
const { embedTexts } = require('./embeddingService');
const logger = require('../../../utils/logger');

/**
 * Enqueues a document for background processing.
 * Using a transaction is recommended so this commits alongside the MentorDocument row.
 */
async function enqueueDocument({ mentorId, sourceType, sourceId, text, fileName = null, visibility = 'mentor' }, transaction = null) {
  return await RagIngestionJob.create({
    mentorId,
    sourceType,
    sourceId,
    text,
    fileName,
    visibility
  }, { transaction });
}

/**
 * Process a single ingestion job: chunk text, get embeddings, and store them.
 * This is executed by the background worker.
 */
async function processJob(job, geminiApiKey) {
  const chunks = chunkText(job.text);
  
  if (chunks.length === 0) {
    logger.warn('Job text produced 0 chunks (too small/empty). Marking complete.', { jobId: job.id });
    await job.update({ status: 'completed' });
    return;
  }

  // Get vectors (768 dimensions) from Gemini
  const embeddings = await embedTexts(chunks, geminiApiKey);

  // We use a transaction because if we fail halfway, we don't want partial chunks.
  const t = await sequelize.transaction();
  try {
    // 1. Delete old chunks if this is a re-ingestion of the same document
    await KnowledgeChunk.destroy({ 
      where: { sourceId: job.sourceId, sourceType: job.sourceType },
      transaction: t
    });

    // 2. Insert new chunks
    for (let i = 0; i < chunks.length; i++) {
      const contentHash = crypto.createHash('sha256').update(chunks[i]).digest('hex');
      
      await KnowledgeChunk.create({
        mentorId:    job.mentorId,
        sourceType:  job.sourceType,
        sourceId:    job.sourceId,
        chunkIndex:  i,
        contentHash,
        content:     chunks[i],
        // Cast array to string formatted as `[1.1, 2.2, ...]` for pgvector
        embedding:   `[${embeddings[i].join(',')}]`,
        visibility:  job.visibility,
      }, { transaction: t });
    }

    // 3. Mark job complete
    await job.update({ status: 'completed' }, { transaction: t });
    await t.commit();
    
    logger.info('Ingestion job processed successfully', { jobId: job.id, chunks: chunks.length });
  } catch (err) {
    await t.rollback();
    logger.error('Failed to process ingestion job', { jobId: job.id, error: err.message });
    throw err;
  }
}

module.exports = { enqueueDocument, processJob };
