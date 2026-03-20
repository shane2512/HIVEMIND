require('dotenv').config();

const { getClient } = require('../hedera-client');
const { getLocalLlmSettings } = require('./llm');

let cachedContextPromise = null;

function toText(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return JSON.stringify(item);
      })
      .join('\n');
  }
  if (content && typeof content.text === 'string') {
    return content.text;
  }
  return JSON.stringify(content || '');
}

async function buildLangchainContext() {
  const settings = getLocalLlmSettings();

  const [hak, langchain, ollamaModule, langgraph] = await Promise.all([
    import('hedera-agent-kit'),
    import('langchain'),
    import('@langchain/ollama'),
    import('@langchain/langgraph')
  ]);

  const client = getClient();
  const toolkit = new hak.HederaLangchainToolkit({
    client,
    configuration: {
      tools: [],
      plugins: [],
      context: {
        mode: hak.AgentMode.AUTONOMOUS
      }
    }
  });

  const tools = toolkit.getTools();
  const model = new ollamaModule.ChatOllama({
    model: settings.model,
    baseUrl: settings.baseUrl,
    temperature: 0.1
  });

  const agent = langchain.createAgent({
    model,
    tools,
    systemPrompt: 'You are a Hedera operations assistant. Use tools only when they are necessary.',
    checkpointer: new langgraph.MemorySaver()
  });

  return {
    enabled: true,
    source: 'hedera-agent-kit/langchain',
    mode: 'AUTONOMOUS',
    toolkit,
    toolCount: tools.length,
    invoke: async ({ prompt, threadId = 'hivemind-hedera' }) => {
      const response = await agent.invoke(
        { messages: [{ role: 'user', content: String(prompt || '') }] },
        { configurable: { thread_id: threadId } }
      );

      const messages = Array.isArray(response && response.messages) ? response.messages : [];
      const last = messages.length ? messages[messages.length - 1] : null;
      return {
        raw: response,
        text: last ? toText(last.content) : ''
      };
    }
  };
}

async function buildMcpFallbackContext(err) {
  const hak = await import('hedera-agent-kit');
  const client = getClient();

  const toolkit = new hak.HederaMCPToolkit({
    client,
    configuration: {
      tools: [],
      plugins: [],
      context: {
        mode: hak.AgentMode.AUTONOMOUS
      }
    }
  });

  return {
    enabled: true,
    source: 'hedera-agent-kit/mcp-fallback',
    mode: 'AUTONOMOUS',
    toolkit,
    toolCount: 0,
    warning: err && err.message ? err.message : String(err),
    invoke: async () => ({
      raw: null,
      text: ''
    })
  };
}

async function getHederaLangchainContext() {
  if (!cachedContextPromise) {
    cachedContextPromise = (async () => {
      try {
        return await buildLangchainContext();
      } catch (err) {
        try {
          return await buildMcpFallbackContext(err);
        } catch (fallbackErr) {
          return {
            enabled: false,
            source: 'hedera-agent-kit',
            error: fallbackErr && fallbackErr.message ? fallbackErr.message : String(fallbackErr),
            warning: err && err.message ? err.message : String(err)
          };
        }
      }
    })();
  }

  return cachedContextPromise;
}

module.exports = {
  getHederaLangchainContext
};
