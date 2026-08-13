const pdfParse = require('pdf-parse');
const config   = require('../ragConfig');
const logger   = require('../../../utils/logger');

async function extractTextFromBuffer(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text.trim();
  } catch (err) {
    logger.error('Failed to parse PDF buffer', { error: err.message });
    throw new Error('PDF processing failed');
  }
}

function chunkText(text) {
  const { chunkSize, overlap } = config.chunking;
  const chunks = [];
  let start = 0;

  // Extremely simple sliding window logic that avoids over-engineering
  while (start < text.length) {
    const end = start + chunkSize;
    chunks.push(text.slice(start, end));
    start += (chunkSize - overlap);
  }

  // Filter out microscopic tail chunks
  return chunks.filter(c => c.trim().length > 10);
}

module.exports = { extractTextFromBuffer, chunkText };
