require('dotenv').config();

const { readTopicMessages } = require('../agents/shared/scripts/hcs-read');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const tokenId = get('--token-id');
  if (!tokenId) {
    throw new Error('Usage: node scripts/verify-phase5.js --token-id 0.0.x [--tx-id 0.0.x@seconds.nanos] [--timeout-sec 180]');
  }

  const txId = get('--tx-id');
  const timeoutSec = Number(get('--timeout-sec') || 180);
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error('Invalid --timeout-sec value');
  }

  return { tokenId, txId, timeoutSec };
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`${name} is required in .env`);
  }
  return String(v).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toMsFromIso(ts) {
  const n = Date.parse(String(ts || ''));
  return Number.isFinite(n) ? n : 0;
}

function parseConsensusTsToMs(ts) {
  if (!ts) return 0;
  const [sec, nanos] = String(ts).split('.');
  const s = Number(sec || '0');
  const ns = Number(nanos || '0');
  return (s * 1000) + Math.floor(ns / 1_000_000);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror request failed ${res.status}: ${url}`);
  }
  return res.json();
}

async function getTxConsensusTimestampMs(txId) {
  const base = String(process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com').replace(/\/$/, '');

  const candidates = [
    `${base}/api/v1/transactions/${encodeURIComponent(txId)}`,
    `${base}/api/v1/transactions?transaction.id=${encodeURIComponent(txId)}&limit=1&order=desc`
  ];

  for (const url of candidates) {
    try {
      const json = await fetchJson(url);
      const tx = Array.isArray(json.transactions) && json.transactions.length ? json.transactions[0] : null;
      const ts = tx && tx.consensus_timestamp ? tx.consensus_timestamp : null;
      const ms = parseConsensusTsToMs(ts);
      if (ms > 0) {
        return {
          consensusTimestamp: ts,
          ms,
          source: url
        };
      }
    } catch (_) {
      // Try the next endpoint.
    }
  }

  return null;
}

async function getTokenCreatedTimestampMs(tokenId) {
  const base = String(process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com').replace(/\/$/, '');
  const url = `${base}/api/v1/tokens/${encodeURIComponent(tokenId)}`;

  try {
    const json = await fetchJson(url);
    const created = json && json.created_timestamp ? json.created_timestamp : null;
    const ms = parseConsensusTsToMs(created);
    if (ms > 0) {
      return {
        createdTimestamp: created,
        ms,
        source: url
      };
    }
  } catch (_) {
    // Keep null; caller will handle missing value.
  }

  return null;
}

function findTaskBundleForToken(taskMessages, tokenId) {
  return taskMessages.find((m) => {
    const msg = m.message || {};
    const payload = msg.payload || {};
    const triggerData = payload.triggerData || {};
    return msg.messageType === 'TASK_BUNDLE' && triggerData.tokenId === tokenId;
  }) || null;
}

function findBlueprintForTask(taskMessages, taskId) {
  return taskMessages.find((m) => {
    const msg = m.message || {};
    const payload = msg.payload || {};
    return msg.messageType === 'PIPELINE_BLUEPRINT' && payload.taskId === taskId;
  }) || null;
}

function findPipelineComplete(taskMessages, pipelineId) {
  return taskMessages.find((m) => {
    const msg = m.message || {};
    const payload = msg.payload || {};
    return msg.messageType === 'PIPELINE_COMPLETE' && payload.pipelineId === pipelineId;
  }) || null;
}

function findReportForPipeline(reportMessages, pipelineId) {
  return reportMessages.find((m) => {
    const msg = m.message || {};
    const payload = msg.payload || {};
    return msg.messageType === 'HIVE_REPORT' && payload.pipelineId === pipelineId;
  }) || null;
}

function getAttestationsForPipeline(attMessages, pipelineId) {
  return attMessages.filter((m) => {
    const msg = m.message || {};
    const payload = msg.payload || {};
    return msg.messageType === 'TASK_ATTESTATION' && payload.pipelineId === pipelineId;
  });
}

function computeMetrics(txInfo, tokenInfo, taskBundle, blueprint, report, complete, attestations) {
  const bundleTs = toMsFromIso(taskBundle.message.timestamp);
  const blueprintTs = toMsFromIso(blueprint.message.timestamp);
  const reportTs = toMsFromIso(report.message.timestamp);
  const completeTs = toMsFromIso(complete.message.timestamp);

  const byAgent = new Map();
  for (const a of attestations) {
    const p = a.message.payload || {};
    byAgent.set(p.agentId, toMsFromIso(a.message.timestamp));
  }

  const requiredAgents = [
    'wallet-analyst-01',
    'sentiment-01',
    'liquidity-01',
    'risk-scorer-01',
    'report-publisher-01'
  ];

  const watcherBaseMs = txInfo && txInfo.ms ? txInfo.ms : (tokenInfo && tokenInfo.ms ? tokenInfo.ms : null);

  return {
    watcherDetectLatencyMs: watcherBaseMs ? bundleTs - watcherBaseMs : null,
    plumberAssemblyLatencyMs: blueprintTs - bundleTs,
    reportLatencyFromBundleMs: reportTs - bundleTs,
    completeLatencyFromBundleMs: completeTs - bundleTs,
    attestationTimestampsByAgent: requiredAgents.reduce((acc, id) => {
      acc[id] = byAgent.get(id) || null;
      return acc;
    }, {}),
    settlement: {
      source: 'PIPELINE_COMPLETE payload',
      totalPipeSettled: (complete.message.payload || {}).totalPipeSettled || null,
      allAttestationsVerified: (complete.message.payload || {}).allAttestationsVerified === true
    }
  };
}

async function verifyPhase5({ tokenId, txId, timeoutSec = 180 }) {
  if (!tokenId) {
    throw new Error('verifyPhase5 requires tokenId');
  }
  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error('verifyPhase5 timeoutSec must be a positive number');
  }

  const taskTopic = requiredEnv('HCS_TASK_TOPIC');
  const attTopic = requiredEnv('HCS_ATTESTATION_TOPIC');
  const reportTopic = requiredEnv('HCS_REPORT_TOPIC');

  const startedAt = Date.now();
  const deadline = startedAt + (timeoutSec * 1000);
  let lastTransientError = null;

  const txInfo = txId ? await getTxConsensusTimestampMs(txId) : null;
  const tokenInfo = await getTokenCreatedTimestampMs(tokenId);

  while (Date.now() < deadline) {
    let taskMessages;
    let attMessages;
    let reportMessages;

    try {
      [taskMessages, attMessages, reportMessages] = await Promise.all([
        readTopicMessages(taskTopic, { limit: 400 }),
        readTopicMessages(attTopic, { limit: 500 }),
        readTopicMessages(reportTopic, { limit: 300 })
      ]);
    } catch (err) {
      lastTransientError = err && err.message ? err.message : String(err);
      await sleep(2000);
      continue;
    }

    const taskBundle = findTaskBundleForToken(taskMessages, tokenId);
    if (!taskBundle) {
      await sleep(3000);
      continue;
    }

    const taskId = (taskBundle.message.payload || {}).taskId;
    if (!taskId) {
      await sleep(3000);
      continue;
    }

    const blueprint = findBlueprintForTask(taskMessages, taskId);
    if (!blueprint) {
      await sleep(3000);
      continue;
    }

    const pipelineId = (blueprint.message.payload || {}).pipelineId;
    if (!pipelineId) {
      await sleep(3000);
      continue;
    }

    const attestations = getAttestationsForPipeline(attMessages, pipelineId);
    const agents = new Set(attestations.map((m) => ((m.message || {}).payload || {}).agentId));
    const fullAttestationChain = (
      agents.has('wallet-analyst-01') &&
      agents.has('sentiment-01') &&
      agents.has('liquidity-01') &&
      agents.has('risk-scorer-01') &&
      agents.has('report-publisher-01')
    );

    const report = findReportForPipeline(reportMessages, pipelineId);
    const complete = findPipelineComplete(taskMessages, pipelineId);

    if (!fullAttestationChain || !report || !complete) {
      await sleep(3000);
      continue;
    }

    const metrics = computeMetrics(txInfo, tokenInfo, taskBundle, blueprint, report, complete, attestations);

    const out = {
      ok: true,
      observedAt: new Date().toISOString(),
      tokenId,
      txId: txId || null,
      txConsensusTimestamp: txInfo ? txInfo.consensusTimestamp : null,
      tokenCreatedTimestamp: tokenInfo ? tokenInfo.createdTimestamp : null,
      taskId,
      pipelineId,
      planner: (blueprint.message.payload || {}).planner || null,
      stages: (blueprint.message.payload || {}).stages || [],
      metrics,
      evidence: {
        taskBundleSequence: taskBundle.sequenceNumber,
        blueprintSequence: blueprint.sequenceNumber,
        reportSequence: report.sequenceNumber,
        pipelineCompleteSequence: complete.sequenceNumber,
        attestationCount: attestations.length
      }
    };

    return out;
  }

  return {
    ok: false,
    tokenId,
    txId: txId || null,
    error: `Timeout waiting for full pipeline chain within ${timeoutSec}s`,
    lastTransientError
  };
}

async function main() {
  const { tokenId, txId, timeoutSec } = parseArgs();
  const result = await verifyPhase5({ tokenId, txId, timeoutSec });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  verifyPhase5
};
