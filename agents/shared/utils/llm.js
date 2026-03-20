require('dotenv').config();

let cachedOllamaModule = null;

function getLocalLlmSettings() {
  const rawModel = String(process.env.OLLAMA_MODEL || process.env.PLANNER_MODEL || 'phi3.5').trim();
  const model = rawModel.startsWith('ollama/') ? rawModel.slice('ollama/'.length) : rawModel;
  const baseUrl = String(process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim();
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 25000);

  return {
    provider: 'ollama',
    model: model || 'phi3.5',
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 25000,
    disabled: String(process.env.LLM_REASONING_DISABLED || 'false').toLowerCase() === 'true'
  };
}

async function loadOllamaModule() {
  if (cachedOllamaModule) {
    return cachedOllamaModule;
  }

  const mod = await import('ollama');
  cachedOllamaModule = mod;
  return cachedOllamaModule;
}

async function askLocalText({ systemPrompt, userPrompt, temperature = 0.2, format = null }) {
  const settings = getLocalLlmSettings();
  const started = Date.now();

  if (settings.disabled) {
    return {
      ok: false,
      error: 'LLM reasoning disabled by LLM_REASONING_DISABLED=true',
      content: null,
      meta: {
        source: 'disabled',
        provider: settings.provider,
        model: settings.model,
        elapsedMs: Date.now() - started
      }
    };
  }

  try {
    const { Ollama } = await loadOllamaModule();
    const client = new Ollama({ host: settings.baseUrl });

    const response = await client.chat({
      model: settings.model,
      format: format || undefined,
      options: {
        temperature
      },
      messages: [
        { role: 'system', content: String(systemPrompt || '').trim() },
        { role: 'user', content: String(userPrompt || '').trim() }
      ]
    });

    return {
      ok: true,
      error: null,
      content: response && response.message ? response.message.content : '',
      meta: {
        source: 'ollama',
        provider: settings.provider,
        model: settings.model,
        elapsedMs: Date.now() - started
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: err && err.message ? err.message : String(err),
      content: null,
      meta: {
        source: 'error',
        provider: settings.provider,
        model: settings.model,
        elapsedMs: Date.now() - started
      }
    };
  }
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) {
    throw new Error('Empty LLM output');
  }

  try {
    return JSON.parse(raw);
  } catch (_) {
    // Continue with extraction heuristics.
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return JSON.parse(fenced[1]);
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  }

  throw new Error('No JSON object found in LLM output');
}

async function askLocalJson({ systemPrompt, userPrompt, temperature = 0.1, validator }) {
  const first = await askLocalText({
    systemPrompt,
    userPrompt,
    temperature,
    format: 'json'
  });

  if (!first.ok) {
    return {
      ok: false,
      output: null,
      error: first.error,
      meta: first.meta
    };
  }

  try {
    const parsed = extractJsonObject(first.content);
    if (validator && !validator(parsed)) {
      throw new Error('LLM JSON output failed validation');
    }

    return {
      ok: true,
      output: parsed,
      error: null,
      meta: first.meta
    };
  } catch (parseErr) {
    return {
      ok: false,
      output: null,
      error: parseErr && parseErr.message ? parseErr.message : String(parseErr),
      meta: first.meta
    };
  }
}

module.exports = {
  askLocalText,
  askLocalJson,
  getLocalLlmSettings,
  extractJsonObject
};
