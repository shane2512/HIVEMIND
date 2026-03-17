require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { readTopicMessages } = require('./hcs-read');
const { publishToHCS } = require('./hcs-publish');
const { loadRegistryManifests, applyManifest, isManifestMessage, toSequenceNumber } = require('./plumber-load-registry');
const { assemblePipeline } = require('./plumber-assemble');
const { mintPipelineNft } = require('./mint-pipeline-nft');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readState(stateFile) {
  try {
    if (!fs.existsSync(stateFile)) {
      return {
        initializedAt: null,
        lastRegistrySequence: 0,
        lastTaskSequence: 0,
        processedTaskIds: [],
        completionCounts: {},
        mintedPipelineIds: []
      };
    }

    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    return {
      initializedAt: parsed.initializedAt || null,
      lastRegistrySequence: Number(parsed.lastRegistrySequence || 0),
      lastTaskSequence: Number(parsed.lastTaskSequence || 0),
      processedTaskIds: Array.isArray(parsed.processedTaskIds) ? parsed.processedTaskIds : [],
      completionCounts: parsed.completionCounts && typeof parsed.completionCounts === 'object' ? parsed.completionCounts : {},
      mintedPipelineIds: Array.isArray(parsed.mintedPipelineIds) ? parsed.mintedPipelineIds : []
    };
  } catch (_) {
    return {
      initializedAt: null,
      lastRegistrySequence: 0,
      lastTaskSequence: 0,
      processedTaskIds: [],
      completionCounts: {},
      mintedPipelineIds: []
    };
  }
}

function writeState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function getTaskId(msg) {
  return msg && msg.message && msg.message.payload ? msg.message.payload.taskId : null;
}

function isTaskBundle(msg) {
  return msg && msg.message && msg.message.messageType === 'TASK_BUNDLE';
}

function isPipelineComplete(msg) {
  return msg && msg.message && msg.message.messageType === 'PIPELINE_COMPLETE';
}

async function handlePipelineComplete(msg, state) {
  const payload = msg && msg.message ? msg.message.payload || {} : {};
  const pipelineId = payload.pipelineId;
  if (!pipelineId) {
    return;
  }

  const threshold = Number(process.env.PLUMBER_NFT_MINT_THRESHOLD || 10);
  const current = Number(state.completionCounts[pipelineId] || 0) + 1;
  state.completionCounts[pipelineId] = current;

  console.log(`[PLUMBER] Pipeline completion recorded: ${pipelineId} => ${current}`);

  const mintedSet = new Set(state.mintedPipelineIds);
  if (current >= threshold && !mintedSet.has(pipelineId)) {
    try {
      const serial = await mintPipelineNft(pipelineId, {
        pipelineId,
        completionCount: current,
        mintedBy: 'plumber-01',
        mintedAt: new Date().toISOString()
      });
      mintedSet.add(pipelineId);
      state.mintedPipelineIds = Array.from(mintedSet).slice(-2000);
      console.log(`[PLUMBER] Minted pipeline NFT for ${pipelineId} serial=${serial}`);
    } catch (err) {
      console.error(`[PLUMBER] NFT mint failed for ${pipelineId}: ${err.message}`);
    }
  }
}

async function bootstrapRegistry(manifests, state) {
  const loaded = await loadRegistryManifests();
  for (const value of loaded.manifests.values()) {
    manifests.set(value.agentId, value);
  }
  state.lastRegistrySequence = Math.max(state.lastRegistrySequence, loaded.lastSequence);
}

async function bootstrapTaskCursor(state) {
  const taskTopic = process.env.HCS_TASK_TOPIC;
  const processBacklog = String(process.env.PLUMBER_PROCESS_BACKLOG || 'false').toLowerCase() === 'true';
  if (processBacklog) {
    return;
  }

  const latest = await readTopicMessages(taskTopic, { limit: 1 });
  if (latest.length > 0) {
    state.lastTaskSequence = Math.max(state.lastTaskSequence, toSequenceNumber(latest[0]));
  }
}

async function syncRegistry(manifests, state, limit) {
  const registryTopic = process.env.HCS_REGISTRY_TOPIC;
  const messages = await readTopicMessages(registryTopic, { limit });
  const asc = [...messages].sort((a, b) => toSequenceNumber(a) - toSequenceNumber(b));

  for (const msg of asc) {
    const seq = toSequenceNumber(msg);
    if (seq <= state.lastRegistrySequence) {
      continue;
    }
    if (isManifestMessage(msg)) {
      applyManifest(manifests, msg);
      const payload = msg.message.payload;
      console.log(`[PLUMBER] Manifest update: ${payload.agentId} (${payload.inputType} -> ${payload.outputType})`);
    }
    state.lastRegistrySequence = Math.max(state.lastRegistrySequence, seq);
  }
}

async function processTasks(manifests, state, limit) {
  const taskTopic = process.env.HCS_TASK_TOPIC;
  const messages = await readTopicMessages(taskTopic, { limit });
  const asc = [...messages].sort((a, b) => toSequenceNumber(a) - toSequenceNumber(b));
  const processedSet = new Set(state.processedTaskIds);

  for (const msg of asc) {
    const seq = toSequenceNumber(msg);
    if (seq <= state.lastTaskSequence) {
      continue;
    }

    if (!isTaskBundle(msg)) {
      if (isPipelineComplete(msg)) {
        await handlePipelineComplete(msg, state);
      }
      state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
      continue;
    }

    const taskId = getTaskId(msg);
    if (!taskId) {
      state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
      continue;
    }
    if (processedSet.has(taskId)) {
      state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
      continue;
    }

    console.log(`[PLUMBER] Processing TASK_BUNDLE ${taskId}`);

    const result = assemblePipeline(manifests, msg.message);
    await publishToHCS(taskTopic, result.message);

    if (result.ok) {
      console.log(`[PLUMBER] Published PIPELINE_BLUEPRINT for task ${taskId}`);
    } else {
      console.log(`[PLUMBER] Published PIPELINE_FAILED for task ${taskId}`);
    }

    processedSet.add(taskId);
    state.processedTaskIds = Array.from(processedSet).slice(-2000);
    state.lastTaskSequence = Math.max(state.lastTaskSequence, seq);
  }
}

async function startPlumberLoop(custom = {}) {
  const registryTopic = process.env.HCS_REGISTRY_TOPIC;
  const taskTopic = process.env.HCS_TASK_TOPIC;
  if (!registryTopic || !taskTopic) {
    throw new Error('HCS_REGISTRY_TOPIC and HCS_TASK_TOPIC must be set in .env');
  }

  const pollIntervalMs = Number(process.env.PLUMBER_POLL_INTERVAL_MS || 5000);
  const reconnectDelayMs = Number(process.env.PLUMBER_RECONNECT_DELAY_MS || 15000);
  const readLimit = Number(process.env.PLUMBER_READ_LIMIT || 100);
  const stateFile = custom.stateFile || path.join(process.cwd(), '.state', 'plumber-state.json');

  const manifests = new Map();
  const state = readState(stateFile);

  await bootstrapRegistry(manifests, state);

  if (!state.initializedAt) {
    await bootstrapTaskCursor(state);
    state.initializedAt = new Date().toISOString();
  }

  writeState(stateFile, state);
  console.log(`[PLUMBER] Bootstrapped ${manifests.size} manifests from registry`);

  console.log('[PLUMBER] Running plumber loop');
  console.log(`[PLUMBER] Registry topic: ${registryTopic}`);
  console.log(`[PLUMBER] Task topic: ${taskTopic}`);

  while (true) {
    try {
      await syncRegistry(manifests, state, readLimit);
      await processTasks(manifests, state, readLimit);
      writeState(stateFile, state);
      await sleep(pollIntervalMs);
    } catch (err) {
      console.error(`[PLUMBER] Error: ${err.message}`);
      console.error(`[PLUMBER] Reconnecting in ${reconnectDelayMs}ms`);
      await sleep(reconnectDelayMs);
    }
  }
}

if (require.main === module) {
  startPlumberLoop().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  startPlumberLoop
};
