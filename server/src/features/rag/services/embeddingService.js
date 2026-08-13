const config = require('../ragConfig');
const logger = require('../../../utils/logger');

/**
 * Gemini Embedding Service
 * 
 * Architecture decision: Embeddings are ALWAYS Gemini, regardless of which
 * provider the mentor uses for generation (Groq, OpenAI, etc.). This ensures
 * all vectors in the DB share the same dimensionality (768) and model space.
 *
 * Model: gemini-embedding-001 (supports outputDimensionality via MRL)
 * Default output: 3072 dims → we request 768 to match our pgvector schema.
 */

const BATCH_LIMIT = 50;          // Gemini allows 100, we use 50 for headroom
const RETRY_DELAY_MS = 2000;     // Base delay between batch calls (rate-limit safety)

/**
 * Embed an array of texts, automatically chunked into safe batch sizes.
 * Returns an array of 768-dimensional float arrays, one per input text.
 */
async function embedTexts(texts, apiKey) {
  if (!apiKey) throw new Error('Cannot embed texts without a valid Gemini API Key');
  if (!texts || !texts.length) return [];

  const { model, dimensions } = config.embedding;
  const allEmbeddings = [];

  for (let i = 0; i < texts.length; i += BATCH_LIMIT) {
    const batch = texts.slice(i, i + BATCH_LIMIT);

    // Small delay between batches to avoid rate-limiting on free tier
    if (i > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }

    const response = await fetchBatch(batch, model, dimensions, apiKey);
    allEmbeddings.push(...response);
  }

  return allEmbeddings;
}

/**
 * Single batch call to Gemini batchEmbedContents endpoint.
 */
async function fetchBatch(texts, model, dimensions, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;

  const body = {
    requests: texts.map(text => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      outputDimensionality: dimensions,   // Force 768-dim output via MRL
    }))
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.error('Gemini embedding API failed', { status: response.status, errText });
    throw new Error(`Gemini embedding API failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.embeddings || !Array.isArray(data.embeddings)) {
    throw new Error('Gemini embedding API returned invalid response structure');
  }

  return data.embeddings.map(e => e.values);
}

/**
 * Convenience: embed a single text string.
 */
async function embedText(text, apiKey) {
  const [embedding] = await embedTexts([text], apiKey);
  return embedding;
}

module.exports = { embedTexts, embedText };
