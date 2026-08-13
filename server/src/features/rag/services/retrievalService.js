const { sequelize } = require('../../../db');
const { embedText } = require('./embeddingService');
const config = require('../ragConfig');
const logger = require('../../../utils/logger');

/**
 * Retrieves the most relevant chunks using a Hybrid Search approach:
 * 1. Vector Search (Cosine Similarity)
 * 2. Full-Text Search (PostgreSQL Websearch)
 * 3. Reciprocal Rank Fusion (RRF) to combine results
 */
async function retrieveContext({ query, mentorId, menteeId, geminiApiKey }) {
  if (!query || !query.trim()) return [];

  const { vectorLimit, ftsLimit, topK, rrfK, minSimilarity } = config.retrieval;

  try {
    // 1. Vector Search
    const queryEmbedding = await embedText(query, geminiApiKey);
    const vectorQuery = `
      SELECT id, content, visibility, source_type,
             1 - (embedding::vector <=> :vec::vector) AS score
      FROM knowledge_chunks
      WHERE mentor_id = :mentorId
        AND visibility IN ('mentor','program')
        AND source_type IN ('mentor_document', 'conversation_context', 'mentor_qa')
        AND (
          source_type = 'mentor_document'           -- global: all mentees of this mentor
          OR mentee_id = :menteeId                  -- private: only THIS mentee
        )
        AND 1 - (embedding::vector <=> :vec::vector) >= :minSimilarity
      ORDER BY embedding::vector <=> :vec::vector
      LIMIT :limit
    `;

    const [vectorRows] = await sequelize.query(vectorQuery, {
      replacements: {
        vec: `[${queryEmbedding.join(',')}]`,
        mentorId,
        menteeId,
        minSimilarity,
        limit: vectorLimit
      }
    });

    // 2. Full-Text Search
    const ftsQuery = `
      SELECT id, content, visibility, source_type,
             ts_rank(search_vector, websearch_to_tsquery('english', :query)) AS score
      FROM knowledge_chunks
      WHERE mentor_id = :mentorId
        AND visibility IN ('mentor','program')
        AND source_type IN ('mentor_document', 'conversation_context', 'mentor_qa')
        AND (
          source_type = 'mentor_document'
          OR mentee_id = :menteeId
        )
        AND search_vector @@ websearch_to_tsquery('english', :query)
      ORDER BY score DESC
      LIMIT :limit
    `;

    const [ftsRows] = await sequelize.query(ftsQuery, {
      replacements: { query, mentorId, menteeId, limit: ftsLimit }
    });

    // 3. Reciprocal Rank Fusion
    const scores = new Map();

    const mergeIntoRrf = (rows) => {
      rows.forEach(({ id, content }, idx) => {
        const s = scores.get(id) || { id, content, score: 0 };
        s.score += 1 / (rrfK + idx + 1);
        scores.set(id, s);
      });
    };

    mergeIntoRrf(vectorRows);
    mergeIntoRrf(ftsRows);

    // Sort combined scores and return Top-K
    const topResults = [...scores.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    logger.info('Hybrid search completed', {
      query: query.substring(0, 50),
      mentorId,
      returnedCount: topResults.length
    });

    return topResults;
  } catch (err) {
    logger.error('Failed to retrieve context', { error: err.message, query, mentorId });
    // In a resilient RAG system, if retrieval fails, we can return empty context
    // rather than crashing the whole pipeline. The LLM might still answer or abstain.
    return [];
  }
}

module.exports = { retrieveContext };
