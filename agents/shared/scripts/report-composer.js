require('dotenv').config();
const crypto = require('crypto');
const { findTaskBundleByTaskId, readPipelineAttestations } = require('./phase4-utils');
const { askLocalText } = require('../utils/llm');

function buildSummary(risk, wallet, sentiment, liquidity) {
  return `Risk ${risk.riskLabel} (${risk.riskScore}). Wallet age ${wallet.accountAgeHours}h, tx ${wallet.totalTransactions}. ` +
    `Top holder ${liquidity.top1HolderPercent}% with ${liquidity.transferCount24h} transfers/24h. ` +
    `Sentiment ${sentiment.sentimentLabel} (${sentiment.sentimentScore}) from ${sentiment.mentionCount} mentions.`;
}

async function buildSummaryWithLlm(risk, wallet, sentiment, liquidity, trigger) {
  const fallback = buildSummary(risk, wallet, sentiment, liquidity);

  const llm = await askLocalText({
    systemPrompt: [
      'You are a compliance analyst creating concise token risk report summaries.',
      'Return plain text only, no markdown, no JSON, max 3 short sentences.'
    ].join(' '),
    userPrompt: JSON.stringify({
      risk,
      wallet,
      sentiment,
      liquidity,
      trigger
    }),
    temperature: 0.2
  });

  if (!llm.ok || !String(llm.content || '').trim()) {
    return {
      summary: fallback,
      reasoning: {
        source: 'deterministic-fallback',
        model: llm.meta && llm.meta.model ? llm.meta.model : null,
        error: llm.error
      }
    };
  }

  return {
    summary: String(llm.content).replace(/\s+/g, ' ').trim().slice(0, 500),
    reasoning: {
      source: 'llm',
      model: llm.meta && llm.meta.model ? llm.meta.model : null,
      error: null
    }
  };
}

async function composeReport(pipelineId, taskId) {
  const attestations = await readPipelineAttestations(pipelineId, 400);
  const byAgent = new Map();
  for (const att of attestations) {
    const payload = att.message.payload || {};
    if (payload.agentId && payload.outputSummary) {
      byAgent.set(payload.agentId, payload.outputSummary);
    }
  }

  const risk = byAgent.get('risk-scorer-01');
  const wallet = byAgent.get('wallet-analyst-01') || {};
  const sentiment = byAgent.get('sentiment-01') || {};
  const liquidity = byAgent.get('liquidity-01') || {};
  if (!risk) {
    throw new Error(`Missing risk scorer output for pipeline ${pipelineId}`);
  }

  const taskBundleMsg = taskId ? await findTaskBundleByTaskId(taskId, 300) : null;
  const trigger = taskBundleMsg && taskBundleMsg.message && taskBundleMsg.message.payload
    ? taskBundleMsg.message.payload.triggerData || {}
    : {};

  const composed = await buildSummaryWithLlm(risk, wallet, sentiment, liquidity, trigger);

  const reportId = `report-${crypto.randomUUID()}`;
  return {
    ucpVersion: '1.0',
    messageType: 'HIVE_REPORT',
    senderId: 'report-publisher-01',
    timestamp: new Date().toISOString(),
    payload: {
      reportId,
      pipelineId,
      tokenId: risk.tokenId || trigger.tokenId || null,
      tokenName: trigger.tokenName || '',
      generatedAt: new Date().toISOString(),
      riskScore: risk.riskScore,
      riskLabel: risk.riskLabel,
      summary: composed.summary,
      components: {
        walletAnalysis: wallet,
        sentimentAnalysis: sentiment,
        liquidityAnalysis: liquidity
      },
      reasoning: composed.reasoning,
      pipelineCost: '0.013',
      attestationTopicId: process.env.HCS_ATTESTATION_TOPIC,
      accessFee: '0.001'
    }
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--pipeline-id');
  const taskIdx = args.indexOf('--task-id');
  if (idx === -1 || !args[idx + 1]) {
    console.error('Usage: node report-composer.js --pipeline-id PIPELINE_ID [--task-id TASK_ID]');
    process.exit(1);
  }

  composeReport(args[idx + 1], taskIdx !== -1 ? args[taskIdx + 1] : undefined)
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  composeReport
};
