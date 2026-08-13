const { embedText, embedTexts } = require('./embeddingService');
const logger = require('../../../utils/logger');

function cosineSim(a, b) {
  const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  
  if (magA === 0 || magB === 0) return 0;
  return dot / (magA * magB);
}

async function scoreGrounding({ draftText, chunks, geminiApiKey }) {
  if (!chunks || !chunks.length) return 0;
  if (draftText === '[ABSTAIN_NO_CONTEXT]') return 0;

  // STRICT GROUNDING: We only evaluate grounding similarity against original mentor documents (facts).
  // conversation_context (questions) and mentor_qa (examples) must NOT count towards grounding.
  const factChunks = chunks.filter(c => !c.source_type || c.source_type === 'mentor_document');
  if (!factChunks.length) {
    return 0; // Not grounded in any factual document
  }

  try {
    // We batch the draft text + chunk contents into one API call to save latency
    const allTexts = [draftText, ...factChunks.map(c => c.content)];
    const embeddings = await embedTexts(allTexts, geminiApiKey);
    
    const draftEmb = embeddings[0];
    const chunkEmbs = embeddings.slice(1);

    // Calculate similarity of draft against EACH factual chunk
    const similarities = chunkEmbs.map(emb => cosineSim(draftEmb, emb));
    
    // We use Math.max to see if the draft is highly grounded in AT LEAST ONE chunk.
    return Math.max(...similarities);
  } catch (err) {
    logger.error('Failed to calculate grounding score', { error: err.message });
    return 0;
  }
}

module.exports = { scoreGrounding, cosineSim };
