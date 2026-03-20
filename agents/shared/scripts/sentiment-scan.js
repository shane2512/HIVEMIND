require('dotenv').config();
const { readTopicMessages } = require('./hcs-read');
const { clamp, parseTimestampToMs } = require('./phase4-utils');
const { askLocalJson } = require('../utils/llm');

function normalizeConfidence(value, fallback = 70) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const scaled = raw <= 1 ? raw * 100 : raw;
  return clamp(Math.round(scaled), 0, 100);
}

function normalizeSignals(values, max = 6) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, max).map((item) => {
    if (typeof item === 'string') return item.slice(0, 120);
    if (item && typeof item === 'object') return JSON.stringify(item).slice(0, 120);
    return String(item).slice(0, 120);
  });
}

async function inferSentimentWithLlm(input) {
  const result = await askLocalJson({
    systemPrompt: [
      'You are a crypto sentiment analyst.',
      'Return only JSON with keys: sentimentScore, sentimentLabel, confidence, keySignals.',
      'sentimentScore must be integer 0-100.',
      'sentimentLabel must be POSITIVE, NEUTRAL, or NEGATIVE.'
    ].join(' '),
    userPrompt: JSON.stringify(input),
    validator: (value) => {
      if (!value || typeof value !== 'object') return false;
      if (!Number.isFinite(Number(value.sentimentScore))) return false;
      const label = String(value.sentimentLabel || '').toUpperCase();
      if (!['POSITIVE', 'NEUTRAL', 'NEGATIVE'].includes(label)) return false;
      return true;
    }
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      meta: result.meta
    };
  }

  return {
    ok: true,
    output: {
      sentimentScore: clamp(Math.round(Number(result.output.sentimentScore)), 0, 100),
      sentimentLabel: String(result.output.sentimentLabel || '').toUpperCase(),
      confidence: normalizeConfidence(result.output.confidence, 70),
      keySignals: normalizeSignals(result.output.keySignals, 6)
    },
    meta: result.meta
  };
}

function getTopics() {
  return [
    process.env.HCS_REGISTRY_TOPIC,
    process.env.HCS_TASK_TOPIC,
    process.env.HCS_ATTESTATION_TOPIC,
    process.env.HCS_REPORT_TOPIC,
    process.env.HCS_BLACKLIST_TOPIC
  ].filter(Boolean);
}

function asText(message) {
  if (typeof message === 'string') {
    return message;
  }
  return JSON.stringify(message);
}

async function scanSentiment(tokenId) {
  if (!tokenId) {
    throw new Error('tokenId is required');
  }

  const topics = getTopics();
  let mentionCount = 0;
  let distinctTopics = 0;
  let positiveHits = 0;
  let negativeHits = 0;
  let firstTs = null;
  let lastTs = null;
  const mentionSamples = [];

  const positiveWords = ['good', 'great', 'buy', 'bull', 'up', 'moon', 'safe'];
  const negativeWords = ['scam', 'rug', 'bad', 'dump', 'fraud', 'hack'];

  for (const topic of topics) {
    const messages = await readTopicMessages(topic, { limit: 120 });
    let topicMentions = 0;

    for (const msg of messages) {
      const text = asText(msg.message).toLowerCase();
      if (!text.includes(tokenId.toLowerCase())) {
        continue;
      }

      mentionCount += 1;
      topicMentions += 1;
      if (mentionSamples.length < 30) {
        mentionSamples.push({
          topic,
          consensusTimestamp: msg.consensusTimestamp,
          text: text.slice(0, 320)
        });
      }
      const tsMs = parseTimestampToMs(msg.consensusTimestamp);
      if (tsMs) {
        if (!firstTs || tsMs < firstTs) firstTs = tsMs;
        if (!lastTs || tsMs > lastTs) lastTs = tsMs;
      }

      for (const word of positiveWords) {
        if (text.includes(word)) positiveHits += 1;
      }
      for (const word of negativeWords) {
        if (text.includes(word)) negativeHits += 1;
      }
    }

    if (topicMentions > 0) {
      distinctTopics += 1;
    }
  }

  const now = Date.now();
  const firstMentionHoursAgo = firstTs ? (now - firstTs) / (1000 * 60 * 60) : null;
  const fallbackScore = clamp(Math.round(50 + (positiveHits * 5) - (negativeHits * 7)), 0, 100);

  let fallbackLabel = 'NEUTRAL';
  if (fallbackScore >= 65) fallbackLabel = 'POSITIVE';
  if (fallbackScore <= 35) fallbackLabel = 'NEGATIVE';

  const llm = await inferSentimentWithLlm({
    tokenId,
    mentionCount,
    distinctTopics,
    firstMentionHoursAgo: firstMentionHoursAgo === null ? null : Number(firstMentionHoursAgo.toFixed(2)),
    positiveHits,
    negativeHits,
    mentionSamples
  });

  const sentimentScore = llm.ok ? llm.output.sentimentScore : fallbackScore;
  const sentimentLabel = llm.ok ? llm.output.sentimentLabel : fallbackLabel;

  return {
    tokenId,
    mentionCount,
    distinctTopics,
    firstMentionHoursAgo: firstMentionHoursAgo === null ? null : Number(firstMentionHoursAgo.toFixed(2)),
    sentimentLabel,
    sentimentScore,
    dataQuality: mentionCount === 0 ? 'NONE' : mentionCount < 3 ? 'LOW' : 'MEDIUM',
    reasoning: {
      source: llm.ok ? 'llm' : 'deterministic-fallback',
      confidence: llm.ok ? llm.output.confidence : 55,
      keySignals: llm.ok ? llm.output.keySignals : ['keyword-heuristics'],
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      error: llm.ok ? null : llm.error
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--token-id');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node sentiment-scan.js --token-id 0.0.x');
    process.exit(1);
  }

  scanSentiment(args[idx + 1])
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  scanSentiment
};
