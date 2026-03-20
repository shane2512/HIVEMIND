require('dotenv').config();
const {
  getMirrorNodeUrl,
  fetchJson,
  parseTimestampToMs,
  clamp
} = require('./phase4-utils');
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

async function inferLiquidityWithLlm(input) {
  const result = await askLocalJson({
    systemPrompt: [
      'You are an HTS token liquidity risk analyst.',
      'Return only JSON with keys: concentrationRisk, liquidityScore, confidence, keySignals.',
      'concentrationRisk must be LOW, MODERATE, or HIGH.',
      'liquidityScore must be integer 0-100 where higher means healthier liquidity.'
    ].join(' '),
    userPrompt: JSON.stringify(input),
    validator: (value) => {
      if (!value || typeof value !== 'object') return false;
      if (!Number.isFinite(Number(value.liquidityScore))) return false;
      const risk = String(value.concentrationRisk || '').toUpperCase();
      if (!['LOW', 'MODERATE', 'HIGH'].includes(risk)) return false;
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
      concentrationRisk: String(result.output.concentrationRisk || '').toUpperCase(),
      liquidityScore: clamp(Math.round(Number(result.output.liquidityScore)), 0, 100),
      confidence: normalizeConfidence(result.output.confidence, 70),
      keySignals: normalizeSignals(result.output.keySignals, 6)
    },
    meta: result.meta
  };
}

async function computeLiquidityReport(tokenId) {
  if (!tokenId) {
    throw new Error('tokenId is required');
  }

  const base = getMirrorNodeUrl();
  const token = await fetchJson(`${base}/api/v1/tokens/${tokenId}`);
  const balancesData = await fetchJson(`${base}/api/v1/tokens/${tokenId}/balances?limit=100`);
  const balances = balancesData.balances || [];

  const totalSupply = Number(token.total_supply || 0);
  const holderCount = balances.length;
  const topBalance = balances.reduce((max, b) => Math.max(max, Number(b.balance || 0)), 0);
  const top1HolderPercent = totalSupply > 0 ? (topBalance / totalSupply) * 100 : 0;

  let transferCount24h = 0;
  try {
    const txData = await fetchJson(`${base}/api/v1/transactions?token.id=${tokenId}&limit=100&order=desc`);
    const txs = txData.transactions || [];
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    transferCount24h = txs.filter((tx) => parseTimestampToMs(tx.consensus_timestamp) >= cutoff).length;
  } catch (_) {
    transferCount24h = 0;
  }

  let fallbackConcentrationRisk = 'LOW';
  if (top1HolderPercent >= 90) fallbackConcentrationRisk = 'HIGH';
  else if (top1HolderPercent >= 65) fallbackConcentrationRisk = 'MODERATE';

  const fallbackLiquidityScore = clamp(
    Math.round(100 - (top1HolderPercent * 0.7) + Math.min(transferCount24h, 20) * 2),
    0,
    100
  );

  const llm = await inferLiquidityWithLlm({
    tokenId,
    totalSupply,
    holderCount,
    top1HolderPercent: Number(top1HolderPercent.toFixed(2)),
    transferCount24h,
    treasuryAccountId: token.treasury_account_id || null,
    tokenType: token.type || null
  });

  let concentrationRisk = llm.ok ? llm.output.concentrationRisk : fallbackConcentrationRisk;
  let liquidityScore = llm.ok ? llm.output.liquidityScore : fallbackLiquidityScore;

  // Guardrails: extreme concentration cannot be reported as healthy liquidity.
  if (top1HolderPercent >= 90) {
    concentrationRisk = 'HIGH';
    liquidityScore = Math.min(liquidityScore, 45);
  } else if (top1HolderPercent >= 65) {
    if (concentrationRisk === 'LOW') {
      concentrationRisk = 'MODERATE';
    }
    liquidityScore = Math.min(liquidityScore, 70);
  }

  return {
    tokenId,
    totalSupply: String(token.total_supply || '0'),
    holderCount,
    top1HolderPercent: Number(top1HolderPercent.toFixed(2)),
    transferCount24h,
    concentrationRisk,
    liquidityScore,
    reasoning: {
      source: llm.ok ? 'llm' : 'deterministic-fallback',
      confidence: llm.ok ? llm.output.confidence : 55,
      keySignals: llm.ok ? llm.output.keySignals : ['holder-concentration-heuristics'],
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      error: llm.ok ? null : llm.error
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--token-id');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node liquidity-compute.js --token-id 0.0.x');
    process.exit(1);
  }

  computeLiquidityReport(args[idx + 1])
    .then((out) => console.log(JSON.stringify(out, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  computeLiquidityReport
};
