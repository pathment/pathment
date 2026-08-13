const crypto = require('crypto');
const { sequelize, models: { KnowledgeChunk } } = require('../../../db');
const { embedText } = require('./embeddingService');
const logger = require('../../../utils/logger');

/**
 * Saves the mentee's question as a lightweight conversation context chunk.
 *
 * WHY store the QUESTION, not the answer:
 *   - Questions are pure "what this mentee cares about" signals (no factual risk)
 *   - Future retrieval will surface "this mentee has discussed proposals, pages, GSoC"
 *     as context — without contaminating RAG with specific answers that could be
 *     wrong for a different situation (e.g., "15-20 pages" being retrieved for "26 pages")
 *
 * SOURCE TYPE: 'conversation_context' (distinct from 'mentor_document')
 * VISIBILITY:  'mentor' (only surfaced in that mentor's RAG)
 */
async function saveConversationContext({ mentorId, menteeId, conversationId, messageId, queryText, geminiApiKey }) {
  if (!queryText || queryText.trim().length < 5) return;   // Skip trivially short messages
  if (!geminiApiKey) return;                                // No key → skip silently

  try {
    const normalized = queryText.trim();
    const contentHash = crypto.createHash('sha256').update(`${mentorId}:${normalized}`).digest('hex');

    // Deduplicate — skip if exact same text already stored for this mentor
    const existing = await KnowledgeChunk.findOne({ where: { mentorId, contentHash, sourceType: 'conversation_context' } });
    if (existing) return;

    const embedding = await embedText(normalized, geminiApiKey);

    await KnowledgeChunk.create({
      mentorId,
      menteeId,     // ← per-mentee isolation: only retrieved for THIS mentee
      sourceType:  'conversation_context',
      sourceId:    messageId || conversationId,
      chunkIndex:  0,
      contentHash,
      content:     normalized,   // clean text, no mentee prefix needed (menteeId column handles isolation)
      embedding:   `[${embedding.join(',')}]`,
      visibility:  'mentor',
    });

    logger.info('[ContextService] Saved conversation context chunk', { mentorId, menteeId, chars: normalized.length });
  } catch (err) {
    // Non-fatal — context save failure should NOT block the main RAG pipeline
    logger.warn('[ContextService] Failed to save conversation context (non-fatal)', { error: err.message, mentorId });
  }
}

module.exports = { saveConversationContext };
