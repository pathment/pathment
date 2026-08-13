module.exports = {
  embedding: {
    model:      process.env.RAG_EMBEDDING_MODEL      || 'gemini-embedding-001',
    dimensions: parseInt(process.env.RAG_EMBEDDING_DIMENSIONS || '768', 10),
    batchSize:  parseInt(process.env.RAG_EMBEDDING_BATCH_SIZE || '50', 10),
  },
  chunking: {
    chunkSize:  parseInt(process.env.RAG_CHUNK_SIZE    || '250', 10),
    overlap:    parseInt(process.env.RAG_CHUNK_OVERLAP || '50', 10),
  },
  retrieval: {
    vectorLimit:       50,
    ftsLimit:          50,
    topK:              10,
    rrfK:              60,
    conversationTurns: 5,
    minSimilarity:     parseFloat(process.env.RAG_MIN_SIMILARITY || '0.70'),
  },
  thresholds: {
    autoReply:   parseFloat(process.env.RAG_AUTO_REPLY_THRESHOLD || '0.85'),
    draftReview: parseFloat(process.env.RAG_DRAFT_THRESHOLD      || '0.60'),
  },
  generation: {
    temperature: 0.7,
  },
};
