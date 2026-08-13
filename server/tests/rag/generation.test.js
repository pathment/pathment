const { generate } = require('../../src/features/rag/services/generationService');

// Mock fetch for Gemini and Anthropic
global.fetch = jest.fn();

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => {
    return {
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'mocked-openai-response' } }]
          })
        }
      }
    };
  });
});

describe('generationService.js Provider Matrix', () => {
  const system = 'System prompt';
  const user = 'User prompt';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('[OpenAI Route] Should route OpenAI, Groq, OpenRouter via OpenAI SDK', async () => {
    const providers = [
      { provider: 'openai', baseURL: 'https://api.openai.com/v1' },
      { provider: 'groq', baseURL: 'https://api.groq.com/openai/v1' },
      { provider: 'openrouter', baseURL: 'https://openrouter.ai/api/v1' }
    ];

    for (const p of providers) {
      const resp = await generate({
        system,
        user,
        generationConfig: {
          provider: p.provider,
          apiKey: 'fake-key',
          baseURL: p.baseURL
        }
      });
      expect(resp).toBe('mocked-openai-response');
    }
  });

  it('[Anthropic Route] Should route Anthropic via fetch', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ content: [{ text: 'mocked-anthropic-response' }] })
    });

    const resp = await generate({
      system,
      user,
      generationConfig: {
        provider: 'anthropic',
        apiKey: 'fake-key',
        baseURL: 'https://api.anthropic.com/v1'
      }
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'fake-key' })
      })
    );
    expect(resp).toBe('mocked-anthropic-response');
  });

  it('[Gemini Route] Should route Gemini via fetch', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'mocked-gemini-response' }] } }] })
    });

    const resp = await generate({
      system,
      user,
      generationConfig: {
        provider: 'gemini',
        apiKey: 'fake-key',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-flash'
      }
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=fake-key',
      expect.objectContaining({ method: 'POST' })
    );
    expect(resp).toBe('mocked-gemini-response');
  });

  it('[Validation] Should reject unknown providers', async () => {
    await expect(generate({
      system,
      user,
      generationConfig: {
        provider: 'unknown-provider',
        apiKey: 'fake-key',
        baseURL: 'https://unknown.com'
      }
    })).rejects.toThrow('Unknown provider: unknown-provider');
  });

  it('[Validation] Should reject missing api key', async () => {
    await expect(generate({
      system,
      user,
      generationConfig: {
        provider: 'groq'
      }
    })).rejects.toThrow('Cannot generate text without a valid generation API Key');
  });

  it('[Security] Should enforce safe base URLs and prevent SSRF', async () => {
    const resp = await generate({
      system,
      user,
      generationConfig: {
        provider: 'groq',
        apiKey: 'fake-key',
        baseURL: 'http://malicious.internal.network/proxy' // attacker attempts to proxy
      }
    });
    // the service should fallback to the safe groq url, not the malicious one
    // our mocked openai client will return 'mocked-openai-response' if successful
    expect(resp).toBe('mocked-openai-response');
    
    // verify the openai constructor was called with the safe URL
    const OpenAI = require('openai');
    expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://api.groq.com/openai/v1'
    }));
  });

  it('[Defensive Parsing] Should throw on invalid JSON structure for Gemini', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unexpected: 'structure' })
    });

    await expect(generate({
      system,
      user,
      generationConfig: {
        provider: 'gemini',
        apiKey: 'fake-key',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-1.5-flash'
      }
    })).rejects.toThrow('Invalid Gemini response structure');
  });
});
