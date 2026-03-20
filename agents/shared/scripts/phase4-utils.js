require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { readTopicMessages } = require('./hcs-read');
const { publishToHCS } = require('./hcs-publish');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMirrorNodeUrl() {
  return String(process.env.MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com').replace(/\/$/, '');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror request failed ${res.status}: ${url}`);
  }
  return res.json();
}

function parseTimestampToMs(ts) {
  if (!ts) {
    return 0;
  }
  const s = String(ts);
  const [secStr, nanosStr] = s.split('.');
  const sec = Number(secStr || '0');
  const nanos = Number(nanosStr || '0');
  return sec * 1000 + Math.floor(nanos / 1_000_000);
}

function hoursBetween(aMs, bMs) {
  return (aMs - bMs) / (1000 * 60 * 60);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function sha256Object(value) {
  const text = JSON.stringify(value);
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function readState(stateFile, defaults) {
  try {
    if (!fs.existsSync(stateFile)) {
      return { ...defaults };
    }
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      ...defaults,
      ...parsed
    };
  } catch (_) {
    return { ...defaults };
  }
}

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function toSequence(msg) {
  return Number(msg && msg.sequenceNumber ? msg.sequenceNumber : 0);
}

async function getLatestTopicSequence(topicId) {
  const latest = await readTopicMessages(topicId, { limit: 50 });
  if (!latest.length) {
    return 0;
  }
  return latest.reduce((max, msg) => Math.max(max, toSequence(msg)), 0);
}

async function findTaskBundleByTaskId(taskId, limit = 1500) {
  const taskTopic = process.env.HCS_TASK_TOPIC;
  const messages = await readTopicMessages(taskTopic, { limit });
  return (
    messages.find(
      (m) =>
        m.message &&
        m.message.messageType === 'TASK_BUNDLE' &&
        m.message.payload &&
        m.message.payload.taskId === taskId
    ) || null
  );
}

async function readPipelineAttestations(pipelineId, limit = 400) {
  const topic = process.env.HCS_ATTESTATION_TOPIC;
  const messages = await readTopicMessages(topic, { limit });
  return messages.filter(
    (m) =>
      m.message &&
      m.message.messageType === 'TASK_ATTESTATION' &&
      m.message.payload &&
      m.message.payload.pipelineId === pipelineId
  );
}

async function publishTaskAttestation({ agentId, pipelineId, taskId, stageIndex, outputSummary, executionTimeMs }) {
  const topic = process.env.HCS_ATTESTATION_TOPIC;
  if (!topic) {
    throw new Error('HCS_ATTESTATION_TOPIC missing in .env');
  }

  const outputHash = `sha256:${sha256Object(outputSummary)}`;
  const message = {
    ucpVersion: '1.0',
    messageType: 'TASK_ATTESTATION',
    senderId: agentId,
    timestamp: new Date().toISOString(),
    payload: {
      pipelineId,
      taskId,
      stageIndex,
      agentId,
      outputHash,
      outputSummary,
      executionTimeMs
    }
  };

  await publishToHCS(topic, message);
  return outputHash;
}

module.exports = {
  sleep,
  getMirrorNodeUrl,
  fetchJson,
  parseTimestampToMs,
  hoursBetween,
  clamp,
  sha256Object,
  readState,
  writeState,
  toSequence,
  getLatestTopicSequence,
  findTaskBundleByTaskId,
  readPipelineAttestations,
  publishTaskAttestation
};
