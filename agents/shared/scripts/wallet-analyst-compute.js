require('dotenv').config();
const {
  getMirrorNodeUrl,
  fetchJson,
  parseTimestampToMs,
  hoursBetween,
  clamp
} = require('./phase4-utils');
const { askLocalJson } = require('../utils/llm');

function normalizeConfidence(value, fallback = 70) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  const scaled = raw <= 1 ? raw * 100 : raw;
  return clamp(Math.round(scaled), 0, 100);
}

function normalizeSignals(values, max = 5) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.slice(0, max).map((item) => {
    if (typeof item === 'string') return item.slice(0, 120);
    if (item && typeof item === 'object') return JSON.stringify(item).slice(0, 120);
    return String(item).slice(0, 120);
  });
}

async function inferWalletRiskWithLlm(input) {
  const result = await askLocalJson({
    systemPrompt: [
      'You are a blockchain wallet risk analyst.',
      'Return only JSON with keys: activityScore, suspiciousPatterns, riskSignals, confidence, analysis.',
      'activityScore must be an integer 0-100 where higher means healthier wallet activity.',
      'suspiciousPatterns must be boolean.',
      'riskSignals must be a short array of strings.'
    ].join(' '),
    userPrompt: JSON.stringify(input),
    validator: (value) => {
      if (!value || typeof value !== 'object') return false;
      if (!Number.isFinite(Number(value.activityScore))) return false;
      if (typeof value.suspiciousPatterns !== 'boolean') return false;
      if (!Array.isArray(value.riskSignals)) return false;
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
      activityScore: clamp(Math.round(Number(result.output.activityScore)), 0, 100),
      suspiciousPatterns: Boolean(result.output.suspiciousPatterns),
      riskSignals: normalizeSignals(result.output.riskSignals, 5),
      confidence: normalizeConfidence(result.output.confidence, 70),
      analysis: String(result.output.analysis || '').slice(0, 400)
    },
    meta: result.meta
  };
}

async function computeWalletHistory(accountId) {
  if (!accountId) {
    throw new Error('accountId is required');
  }

  const base = getMirrorNodeUrl();
  const account = await fetchJson(`${base}/api/v1/accounts/${accountId}`);
  const txData = await fetchJson(`${base}/api/v1/transactions?account.id=${accountId}&limit=100&order=desc`);
  const txs = txData.transactions || [];

  const nowMs = Date.now();
  const createdMs = parseTimestampToMs(account.created_timestamp);
  const accountAgeHours = createdMs ? hoursBetween(nowMs, createdMs) : 0;

  let hbarNetFlow = 0;
  let previousTokenCreations = 0;
  const txSample = [];
  for (const tx of txs) {
    if (tx.name === 'TOKENCREATION') {
      previousTokenCreations += 1;
    }

    txSample.push({
      name: tx.name,
      result: tx.result,
      chargedTxFee: tx.charged_tx_fee,
      consensusTimestamp: tx.consensus_timestamp
    });

    for (const transfer of tx.transfers || []) {
      if (transfer.account === accountId) {
        hbarNetFlow += Number(transfer.amount || 0) / 100000000;
      }
    }
  }

  const totalTransactions = txs.length;
  const fallbackSuspiciousPatterns = previousTokenCreations > 3 || totalTransactions < 3;
  const fallbackActivityScore = clamp(Math.round(totalTransactions * 1.2), 0, 100);

  const llm = await inferWalletRiskWithLlm({
    walletId: accountId,
    accountAgeHours: Number(accountAgeHours.toFixed(2)),
    totalTransactions,
    hbarNetFlow: Number(hbarNetFlow.toFixed(6)),
    previousTokenCreations,
    txSample: txSample.slice(0, 25)
  });

  const activityScore = llm.ok ? llm.output.activityScore : fallbackActivityScore;
  const suspiciousPatterns = llm.ok ? llm.output.suspiciousPatterns : fallbackSuspiciousPatterns;

  return {
    walletId: accountId,
    accountAgeHours: Number(accountAgeHours.toFixed(2)),
    totalTransactions,
    hbarNetFlow: Number(hbarNetFlow.toFixed(6)),
    previousTokenCreations,
    suspiciousPatterns,
    activityScore,
    reasoning: {
      source: llm.ok ? 'llm' : 'deterministic-fallback',
      confidence: llm.ok ? llm.output.confidence : 55,
      riskSignals: llm.ok ? llm.output.riskSignals : ['heuristic-thresholds'],
      analysis: llm.ok ? llm.output.analysis : 'Used deterministic thresholds because LLM inference failed.',
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      error: llm.ok ? null : llm.error
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--account-id');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node wallet-analyst-compute.js --account-id 0.0.x');
    process.exit(1);
  }

  computeWalletHistory(args[idx + 1])
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  computeWalletHistory
};
