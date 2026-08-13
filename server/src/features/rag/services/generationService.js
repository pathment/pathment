// Multi-provider generation service (OpenAI, Groq, OpenRouter, Anthropic, Gemini)
const crypto = require('crypto');
const OpenAI = require('openai');
const config = require('../ragConfig');
const logger = require('../../../utils/logger');

// Known safe provider endpoints to prevent SSRF/malicious routing
const SAFE_BASE_URLS = {
  groq: 'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1'
};

const _openaiClients = new Map();

function getOpenAIClient(apiKey, baseURL) {
  // Hash the API key to prevent keeping raw secrets as memory keys
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const key = `${baseURL}:${hash}`;
  
  if (!_openaiClients.has(key)) {
    _openaiClients.set(key, new OpenAI({ apiKey, baseURL }));
  }
  return _openaiClients.get(key);
}

function validateBaseUrl(provider, url) {
  if (provider === 'custom') {
    if (!url || !url.startsWith('https://')) throw new Error('Custom providers require a valid HTTPS base URL');
    return url;
  }
  
  const expectedUrl = SAFE_BASE_URLS[provider];
  if (!expectedUrl) throw new Error(`Unknown provider: ${provider}`);
  
  // Strict matching to prevent SSRF or malicious proxying
  if (!url || !url.startsWith(expectedUrl)) {
    logger.warn(`BaseURL mismatch for provider ${provider}. Falling back to safe default.`, { provided: url, expected: expectedUrl });
    return expectedUrl;
  }
  
  return url;
}

/**
 * Calls the selected LLM provider to generate the final RAG response.
 * @param {Object} params
 * @param {string} params.system - The system prompt
 * @param {string} params.user - The user prompt
 * @param {Object} params.generationConfig - Extracted from aiConnectionService.resolveActiveConfig
 */
async function generate({ system, user, generationConfig }) {
  if (!generationConfig || !generationConfig.apiKey) {
    throw new Error('Cannot generate text without a valid generation API Key');
  }

  const { provider, apiKey } = generationConfig;
  const baseURL = validateBaseUrl(provider, generationConfig.baseURL);
  
  // Explicitly require a model. It's either provided by the user or safely injected by aiConnectionService.
  const model = generationConfig.model;
  if (!model) {
    throw new Error(`No model specified for provider '${provider}'. Please update your AI Connection settings.`);
  }
  
  const temperature = config.generation.temperature;

  try {
    if (['openai', 'groq', 'openrouter', 'custom'].includes(provider)) {
      const client = getOpenAIClient(apiKey, baseURL);
      const resp = await client.chat.completions.create({
        model,
        temperature,
        messages: [
          { role: 'system', content: system },
          { role: 'user',   content: user   },
        ],
      });
      
      if (!resp?.choices?.[0]?.message?.content) {
        throw new Error('Invalid OpenAI-compatible response structure');
      }
      return resp.choices[0].message.content.trim();
    } 
    
    else if (provider === 'anthropic') {
      const resp = await fetch(`${baseURL.replace(/\/$/, '')}/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          temperature,
          system,
          messages: [{ role: 'user', content: user }]
        })
      });
      
      if (!resp.ok) throw new Error(`Anthropic Error: ${await resp.text()}`);
      
      const data = await resp.json();
      if (!data?.content?.[0]?.text) {
        throw new Error('Invalid Anthropic response structure');
      }
      
      return data.content[0].text.trim();
    } 
    
    else if (provider === 'gemini') {
      const resp = await fetch(`${baseURL.replace(/\/$/, '')}/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: user }] }],
          generationConfig: { temperature }
        })
      });

      if (!resp.ok) throw new Error(`Gemini Error: ${await resp.text()}`);
      
      const data = await resp.json();
      const extractedText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (typeof extractedText !== 'string') {
        throw new Error('Invalid Gemini response structure');
      }
      
      return extractedText.trim();
    }
    
    else {
      throw new Error(`Unsupported generation provider: ${provider}`);
    }

  } catch (err) {
    logger.error(`LLM generation failed on ${provider}`, { error: err.message, model });
    throw new Error(`LLM Generation failed: ${err.message}`);
  }
}

module.exports = { generate };
