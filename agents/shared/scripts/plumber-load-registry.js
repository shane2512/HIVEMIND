require('dotenv').config();
const { readTopicMessages } = require('./hcs-read');

function toSequenceNumber(message) {
  return Number(message.sequenceNumber || 0);
}

function readPayload(msg) {
  return msg && msg.message && msg.message.payload ? msg.message.payload : null;
}

function isManifestMessage(msg) {
  return msg && msg.message && msg.message.messageType === 'AGENT_MANIFEST';
}

function applyManifest(map, msg) {
  const payload = readPayload(msg);
  if (!payload || !payload.agentId) {
    return;
  }

  map.set(payload.agentId, {
    agentId: payload.agentId,
    agentType: payload.agentType,
    inputType: payload.inputType,
    outputType: payload.outputType,
    pricePerTask: String(payload.pricePerTask || '0'),
    description: payload.description || '',
    walletId: payload.walletId || '',
    version: payload.version || 1,
    lastSeenSequence: toSequenceNumber(msg),
    lastSeenTimestamp: msg.consensusTimestamp || null
  });
}

async function loadRegistryManifests(options = {}) {
  const topicId = process.env.HCS_REGISTRY_TOPIC;
  if (!topicId) {
    throw new Error('HCS_REGISTRY_TOPIC is not set in .env');
  }

  const limit = Number(options.limit || process.env.PLUMBER_REGISTRY_READ_LIMIT || 200);
  const messages = await readTopicMessages(topicId, { limit });
  const asc = [...messages].sort((a, b) => toSequenceNumber(a) - toSequenceNumber(b));

  const manifests = new Map();
  let lastSequence = 0;
  for (const msg of asc) {
    lastSequence = Math.max(lastSequence, toSequenceNumber(msg));
    if (!isManifestMessage(msg)) {
      continue;
    }
    applyManifest(manifests, msg);
  }

  return {
    topicId,
    manifests,
    lastSequence,
    messagesRead: asc.length
  };
}

if (require.main === module) {
  loadRegistryManifests()
    .then((result) => {
      const list = Array.from(result.manifests.values());
      console.log(JSON.stringify({
        topicId: result.topicId,
        messagesRead: result.messagesRead,
        manifestCount: list.length,
        manifests: list
      }, null, 2));
    })
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  loadRegistryManifests,
  applyManifest,
  isManifestMessage,
  toSequenceNumber
};
