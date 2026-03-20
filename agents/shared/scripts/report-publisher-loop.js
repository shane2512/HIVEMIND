require('dotenv').config();
const path = require('path');
const { readTopicMessages } = require('./hcs-read');
const { publishToHCS } = require('./hcs-publish');
const {
  sleep,
  readState,
  writeState,
  toSequence,
  getLatestTopicSequence,
  publishTaskAttestation
} = require('./phase4-utils');
const { composeReport } = require('./report-composer');
const { getHederaAgentKitContext } = require('../hedera-agent-kit');

async function startReportPublisherLoop(custom = {}) {
  const attTopic = process.env.HCS_ATTESTATION_TOPIC;
  const reportTopic = process.env.HCS_REPORT_TOPIC;
  const taskTopic = process.env.HCS_TASK_TOPIC;
  if (!attTopic || !reportTopic || !taskTopic) {
    throw new Error('HCS_ATTESTATION_TOPIC, HCS_REPORT_TOPIC, and HCS_TASK_TOPIC are required');
  }

  const stateFile = custom.stateFile || path.join(process.cwd(), '.state', 'report-publisher-state.json');
  const pollIntervalMs = Number(process.env.REPORT_POLL_INTERVAL_MS || 5000);
  const reconnectDelayMs = Number(process.env.REPORT_RECONNECT_DELAY_MS || 10000);
  const readLimit = Number(process.env.REPORT_READ_LIMIT || 220);
  const processBacklog = String(process.env.REPORT_PROCESS_BACKLOG || 'false').toLowerCase() === 'true';

  const state = readState(stateFile, {
    initializedAt: null,
    lastAttSequence: 0,
    processedPipelineIds: []
  });

  const hederaKit = await getHederaAgentKitContext();
  if (hederaKit.enabled) {
    console.log('[report-publisher-01] Hedera Agent Kit ready (AUTONOMOUS)');
  } else {
    console.log(`[report-publisher-01] Hedera Agent Kit unavailable: ${hederaKit.error}`);
  }

  if (!state.initializedAt) {
    if (!processBacklog) {
      state.lastAttSequence = await getLatestTopicSequence(attTopic);
    }
    state.initializedAt = new Date().toISOString();
    writeState(stateFile, state);
  }

  while (true) {
    try {
      const messages = await readTopicMessages(attTopic, { limit: readLimit });
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

        const p = msg.message.payload || {};
        if (p.agentId !== 'risk-scorer-01' || !p.pipelineId) {
          state.lastAttSequence = Math.max(state.lastAttSequence, seq);
          continue;
        }

        if (processed.has(p.pipelineId)) {
          state.lastAttSequence = Math.max(state.lastAttSequence, seq);
          continue;
        }

        const started = Date.now();
        const report = await composeReport(p.pipelineId, p.taskId);
        await publishToHCS(reportTopic, report);

        await publishTaskAttestation({
          agentId: 'report-publisher-01',
          pipelineId: p.pipelineId,
          taskId: p.taskId,
          stageIndex: 2,
          outputSummary: {
            reportId: report.payload.reportId,
            riskScore: report.payload.riskScore,
            riskLabel: report.payload.riskLabel
          },
          executionTimeMs: Date.now() - started
        });

        await publishToHCS(taskTopic, {
          ucpVersion: '1.0',
          messageType: 'PIPELINE_COMPLETE',
          senderId: 'report-publisher-01',
          timestamp: new Date().toISOString(),
          payload: {
            pipelineId: p.pipelineId,
            taskId: p.taskId,
            allAttestationsVerified: true,
            totalPipeSettled: '0.013',
            nftMinted: false,
            nftMintThreshold: Number(process.env.PLUMBER_NFT_MINT_THRESHOLD || 10)
          }
        });

        console.log(`[report-publisher-01] Published report for ${p.pipelineId}`);
        processed.add(p.pipelineId);
        state.processedPipelineIds = Array.from(processed).slice(-2000);
        state.lastAttSequence = Math.max(state.lastAttSequence, seq);
      }

      writeState(stateFile, state);
      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(`[report-publisher-01] Error: ${err.message}`);
      await sleep(reconnectDelayMs);
    }
  }
}

if (require.main === module) {
  startReportPublisherLoop().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  startReportPublisherLoop
};
