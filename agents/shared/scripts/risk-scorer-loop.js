require('dotenv').config();
const path = require('path');
const { readTopicMessages } = require('./hcs-read');
const {
  sleep,
  readState,
  writeState,
  toSequence,
  getLatestTopicSequence,
  publishTaskAttestation,
  readPipelineAttestations,
  clamp
} = require('./phase4-utils');
const { getHederaAgentKitContext } = require('../hedera-agent-kit');
const { askLocalJson } = require('../utils/llm');

function normalizeConfidence(value, fallback = 70) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return fallback;
  const scaled = raw <= 1 ? raw * 100 : raw;
  return clamp(Math.round(scaled), 0, 100);
}

async function buildRiskScore(wallet, sentiment, liquidity, pipelineId) {
  const walletRisk = wallet.suspiciousPatterns ? 80 : clamp(100 - Number(wallet.activityScore || 0), 0, 100);
  const sentimentRisk = clamp(100 - Number(sentiment.sentimentScore || 50), 0, 100);
  const liquidityRisk = clamp(100 - Number(liquidity.liquidityScore || 50), 0, 100);

  const fallbackScore = Math.round((walletRisk * 0.4) + (liquidityRisk * 0.4) + (sentimentRisk * 0.2));
  let fallbackLabel = 'LOW';
  if (fallbackScore >= 81) fallbackLabel = 'CRITICAL';
  else if (fallbackScore >= 61) fallbackLabel = 'HIGH';
  else if (fallbackScore >= 31) fallbackLabel = 'MODERATE';

  const llm = await askLocalJson({
    systemPrompt: [
      'You are a token risk scoring model.',
      'Return only JSON with keys: riskScore, riskLabel, recommendation, confidence, rationale, componentOverrides.',
      'riskScore must be integer 0-100.',
      'riskLabel must be LOW, MODERATE, HIGH, or CRITICAL.',
      'recommendation must be CAUTION or MONITOR.'
    ].join(' '),
    userPrompt: JSON.stringify({
      pipelineId,
      wallet,
      sentiment,
      liquidity,
      baseline: {
        walletRisk,
        sentimentRisk,
        liquidityRisk,
        riskScore: fallbackScore,
        riskLabel: fallbackLabel
      }
    }),
    validator: (value) => {
      if (!value || typeof value !== 'object') return false;
      if (!Number.isFinite(Number(value.riskScore))) return false;
      const label = String(value.riskLabel || '').toUpperCase();
      if (!['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].includes(label)) return false;
      const rec = String(value.recommendation || '').toUpperCase();
      if (!['CAUTION', 'MONITOR'].includes(rec)) return false;
      return true;
    }
  });

  const riskScore = llm.ok ? clamp(Math.round(Number(llm.output.riskScore)), 0, 100) : clamp(fallbackScore, 0, 100);
  const riskLabel = llm.ok ? String(llm.output.riskLabel || '').toUpperCase() : fallbackLabel;
  const recommendation = llm.ok ? String(llm.output.recommendation || '').toUpperCase() : (riskScore >= 61 ? 'CAUTION' : 'MONITOR');

  return {
    pipelineId,
    tokenId: sentiment.tokenId || liquidity.tokenId || null,
    riskScore,
    riskLabel,
    components: {
      walletRisk: llm.ok && llm.output.componentOverrides && Number.isFinite(Number(llm.output.componentOverrides.walletRisk))
        ? clamp(Math.round(Number(llm.output.componentOverrides.walletRisk)), 0, 100)
        : walletRisk,
      liquidityRisk: llm.ok && llm.output.componentOverrides && Number.isFinite(Number(llm.output.componentOverrides.liquidityRisk))
        ? clamp(Math.round(Number(llm.output.componentOverrides.liquidityRisk)), 0, 100)
        : liquidityRisk,
      sentimentRisk: llm.ok && llm.output.componentOverrides && Number.isFinite(Number(llm.output.componentOverrides.sentimentRisk))
        ? clamp(Math.round(Number(llm.output.componentOverrides.sentimentRisk)), 0, 100)
        : sentimentRisk
    },
    recommendation,
    reasoning: {
      source: llm.ok ? 'llm' : 'deterministic-fallback',
      confidence: llm.ok ? normalizeConfidence(llm.output.confidence, 70) : 55,
      rationale: llm.ok ? String(llm.output.rationale || '').slice(0, 500) : 'Weighted deterministic formula fallback.',
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      error: llm.ok ? null : llm.error
    }
  };
}

async function startRiskScorerLoop(custom = {}) {
  const topic = process.env.HCS_ATTESTATION_TOPIC;
  if (!topic) {
    throw new Error('HCS_ATTESTATION_TOPIC missing in .env');
  }

  const stateFile = custom.stateFile || path.join(process.cwd(), '.state', 'risk-scorer-state.json');
  const pollIntervalMs = Number(process.env.RISK_POLL_INTERVAL_MS || 5000);
  const reconnectDelayMs = Number(process.env.RISK_RECONNECT_DELAY_MS || 10000);
  const readLimit = Number(process.env.RISK_READ_LIMIT || 200);
  const processBacklog = String(process.env.RISK_PROCESS_BACKLOG || 'false').toLowerCase() === 'true';

  const state = readState(stateFile, {
    initializedAt: null,
    lastAttSequence: 0,
    processedPipelineIds: []
  });

  const hederaKit = await getHederaAgentKitContext();
  if (hederaKit.enabled) {
    console.log('[risk-scorer-01] Hedera Agent Kit ready (AUTONOMOUS)');
  } else {
    console.log(`[risk-scorer-01] Hedera Agent Kit unavailable: ${hederaKit.error}`);
  }

  if (!state.initializedAt) {
    if (!processBacklog) {
      state.lastAttSequence = await getLatestTopicSequence(topic);
    }
    state.initializedAt = new Date().toISOString();
    writeState(stateFile, state);
  }

  while (true) {
    try {
      const messages = await readTopicMessages(topic, { limit: readLimit });
      const asc = [...messages].sort((a, b) => toSequence(a) - toSequence(b));
      const processed = new Set(state.processedPipelineIds);

      for (const msg of asc) {
        const seq = toSequence(msg);
        if (seq <= Number(state.lastAttSequence || 0)) {
          continue;
        }

        if (!msg.message || msg.message.messageType !== 'TASK_ATTESTATION') {
          state.lastAttSequence = Math.max(state.lastAttSequence, seq);
          continue;
        }

        const payload = msg.message.payload || {};
        const pipelineId = payload.pipelineId;
        if (!pipelineId || processed.has(pipelineId)) {
          state.lastAttSequence = Math.max(state.lastAttSequence, seq);
          continue;
        }

        const attestations = await readPipelineAttestations(pipelineId, 300);
        const byAgent = new Map();
        for (const att of attestations) {
          const p = att.message.payload || {};
          if (!p.agentId || !p.outputSummary) continue;
          byAgent.set(p.agentId, p.outputSummary);
        }

        const wallet = byAgent.get('wallet-analyst-01');
        const sentiment = byAgent.get('sentiment-01');
        const liquidity = byAgent.get('liquidity-01');
        if (!wallet || !sentiment || !liquidity) {
          state.lastAttSequence = Math.max(state.lastAttSequence, seq);
          continue;
        }

        const started = Date.now();
        const output = await buildRiskScore(wallet, sentiment, liquidity, pipelineId);
        await publishTaskAttestation({
          agentId: 'risk-scorer-01',
          pipelineId,
          taskId: payload.taskId,
          stageIndex: 1,
          outputSummary: output,
          executionTimeMs: Date.now() - started
        });

        console.log(`[risk-scorer-01] Attested pipeline ${pipelineId} risk=${output.riskScore}`);
        processed.add(pipelineId);
        state.processedPipelineIds = Array.from(processed).slice(-2000);
        state.lastAttSequence = Math.max(state.lastAttSequence, seq);
      }

      writeState(stateFile, state);
      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(`[risk-scorer-01] Error: ${err.message}`);
      await sleep(reconnectDelayMs);
    }
  }
}

if (require.main === module) {
  startRiskScorerLoop().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  startRiskScorerLoop,
  buildRiskScore
};
