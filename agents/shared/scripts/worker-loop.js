require('dotenv').config();
const path = require('path');
const { readTopicMessages } = require('./hcs-read');
const { computeWalletHistory } = require('./wallet-analyst-compute');
const { scanSentiment } = require('./sentiment-scan');
const { computeLiquidityReport } = require('./liquidity-compute');
const {
  sleep,
  readState,
  writeState,
  toSequence,
  getLatestTopicSequence,
  findTaskBundleByTaskId,
  publishTaskAttestation
} = require('./phase4-utils');
const { getHederaAgentKitContext } = require('../hedera-agent-kit');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const agentId = get('--agent-id');
  const mode = get('--mode');
  if (!agentId || !mode) {
    throw new Error('Usage: node worker-loop.js --agent-id AGENT_ID --mode wallet|sentiment|liquidity');
  }
  if (!['wallet', 'sentiment', 'liquidity'].includes(mode)) {
    throw new Error('mode must be wallet, sentiment, or liquidity');
  }

  return { agentId, mode };
}

async function executeMode(mode, taskBundle) {
  const trigger = taskBundle && taskBundle.payload ? taskBundle.payload.triggerData || {} : {};
  if (mode === 'wallet') {
    return computeWalletHistory(trigger.creatorWallet);
  }
  if (mode === 'sentiment') {
    return scanSentiment(trigger.tokenId);
  }
  return computeLiquidityReport(trigger.tokenId);
}

async function startWorkerLoop({ agentId, mode }, custom = {}) {
  const topic = process.env.HCS_TASK_TOPIC;
  if (!topic) {
    throw new Error('HCS_TASK_TOPIC missing in .env');
  }

  const stateFile = custom.stateFile || path.join(process.cwd(), '.state', `${agentId}-state.json`);
  const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000);
  const reconnectDelayMs = Number(process.env.WORKER_RECONNECT_DELAY_MS || 10000);
  const readLimit = Number(process.env.WORKER_READ_LIMIT || 400);
  const taskLookupLimit = Number(process.env.WORKER_TASK_LOOKUP_LIMIT || 1500);
  const processBacklog = String(process.env.WORKER_PROCESS_BACKLOG || 'false').toLowerCase() === 'true';

  const state = readState(stateFile, {
    initializedAt: null,
    lastTaskSequence: 0,
    processedPipelineIds: []
  });

  const hederaKit = await getHederaAgentKitContext();
  if (hederaKit.enabled) {
    console.log(`[${agentId}] Hedera Agent Kit ready (${hederaKit.mode})`);
  } else {
    console.log(`[${agentId}] Hedera Agent Kit unavailable: ${hederaKit.error}`);
  }

  if (!state.initializedAt) {
    if (!processBacklog) {
      state.lastTaskSequence = await getLatestTopicSequence(topic);
    }
    state.initializedAt = new Date().toISOString();
    writeState(stateFile, state);
  }

  console.log(`[${agentId}] Worker loop started mode=${mode}`);

  while (true) {
    try {
      const messages = await readTopicMessages(topic, { limit: readLimit });
      const asc = [...messages].sort((a, b) => toSequence(a) - toSequence(b));
      const processed = new Set(state.processedPipelineIds);

      for (const msg of asc) {
        const seq = toSequence(msg);
        if (seq <= Number(state.lastTaskSequence || 0)) {
          continue;
        }

        if (!msg.message || msg.message.messageType !== 'PIPELINE_BLUEPRINT') {
          state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
          continue;
        }

        const payload = msg.message.payload || {};
        const stage = (payload.stages || []).find((s) => s.agentId === agentId);
        if (!stage) {
          state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
          continue;
        }

        const pipelineId = payload.pipelineId;
        if (!pipelineId || processed.has(pipelineId)) {
          state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
          continue;
        }

        const started = Date.now();
        const taskBundleMsg = await findTaskBundleByTaskId(payload.taskId, taskLookupLimit);
        if (!taskBundleMsg) {
          console.warn(`[${agentId}] Task bundle not found for taskId=${payload.taskId} (lookupLimit=${taskLookupLimit}); skipping pipeline ${pipelineId}`);
          state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
          continue;
        }

        const output = await executeMode(mode, taskBundleMsg.message);
        await publishTaskAttestation({
          agentId,
          pipelineId,
          taskId: payload.taskId,
          stageIndex: Number(stage.stageIndex || 0),
          outputSummary: output,
          executionTimeMs: Date.now() - started
        });

        console.log(`[${agentId}] Attested pipeline ${pipelineId}`);
        processed.add(pipelineId);
        state.processedPipelineIds = Array.from(processed).slice(-2000);
        state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
      }

      writeState(stateFile, state);
      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(`[${agentId}] Error: ${err.message}`);
      await sleep(reconnectDelayMs);
    }
  }
}

if (require.main === module) {
  const input = parseArgs();
  startWorkerLoop(input).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  startWorkerLoop
};
