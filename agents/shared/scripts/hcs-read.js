require('dotenv').config();

function getMirrorNodeUrl() {
  return process.env.MIRROR_NODE_URL || process.env.VITE_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';
}

function decodeMirrorMessage(base64) {
  try {
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  } catch (_) {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
}

function chunkKey(rawMsg) {
  const info = rawMsg && rawMsg.chunk_info && rawMsg.chunk_info.initial_transaction_id;
  if (!info) {
    return null;
  }
  return `${info.account_id}|${info.transaction_valid_start}|${info.nonce || 0}|${info.scheduled ? 1 : 0}`;
}

function decodeRawMirrorMessages(rawMessages) {
  const asc = [...rawMessages].sort((a, b) => Number(a.sequence_number || 0) - Number(b.sequence_number || 0));
  const chunks = new Map();
  const decoded = [];

  for (const msg of asc) {
    const chunkInfo = msg.chunk_info;
    const total = Number(chunkInfo && chunkInfo.total ? chunkInfo.total : 1);
    if (total <= 1) {
      decoded.push({
        consensusTimestamp: msg.consensus_timestamp,
        sequenceNumber: msg.sequence_number,
        runningHash: msg.running_hash,
        message: decodeMirrorMessage(msg.message)
      });
      continue;
    }

    const key = chunkKey(msg);
    if (!key) {
      decoded.push({
        consensusTimestamp: msg.consensus_timestamp,
        sequenceNumber: msg.sequence_number,
        runningHash: msg.running_hash,
        message: decodeMirrorMessage(msg.message)
      });
      continue;
    }

    if (!chunks.has(key)) {
      chunks.set(key, {
        total,
        parts: new Map(),
        lastConsensusTimestamp: msg.consensus_timestamp,
        lastSequenceNumber: Number(msg.sequence_number || 0),
        lastRunningHash: msg.running_hash
      });
    }

    const entry = chunks.get(key);
    entry.parts.set(Number(chunkInfo.number || 1), msg.message);
    if (Number(msg.sequence_number || 0) >= entry.lastSequenceNumber) {
      entry.lastConsensusTimestamp = msg.consensus_timestamp;
      entry.lastSequenceNumber = Number(msg.sequence_number || 0);
      entry.lastRunningHash = msg.running_hash;
    }

    if (entry.parts.size === entry.total) {
      const buffers = [];
      for (let i = 1; i <= entry.total; i += 1) {
        const part = entry.parts.get(i);
        if (!part) {
          break;
        }
        buffers.push(Buffer.from(part, 'base64'));
      }

      const full = Buffer.concat(buffers).toString('utf8');
      let parsed;
      try {
        parsed = JSON.parse(full);
      } catch (_) {
        parsed = full;
      }

      decoded.push({
        consensusTimestamp: entry.lastConsensusTimestamp,
        sequenceNumber: entry.lastSequenceNumber,
        runningHash: entry.lastRunningHash,
        message: parsed
      });
      chunks.delete(key);
    }
  }

  decoded.sort((a, b) => Number(b.sequenceNumber || 0) - Number(a.sequenceNumber || 0));
  return decoded;
}

async function readTopicMessages(topicId, { limit = 10, fromTimestamp } = {}) {
  const base = getMirrorNodeUrl();
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('order', 'desc');
  if (fromTimestamp) {
    params.set('timestamp', `gte:${fromTimestamp}`);
  }

  const url = `${base}/api/v1/topics/${topicId}/messages?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror Node request failed (${res.status}): ${url}`);
  }

  const data = await res.json();
  const messages = decodeRawMirrorMessages(data.messages || []);

  return messages;
}

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const topicIdx = args.indexOf('--topic');
      const limitIdx = args.indexOf('--limit');
      const fromIdx = args.indexOf('--from-timestamp');

      if (topicIdx === -1 || !args[topicIdx + 1]) {
        console.error('Usage: node hcs-read.js --topic TOPIC_ID [--limit 10] [--from-timestamp 1234567890.123456789]');
        process.exit(1);
      }

      const topicId = args[topicIdx + 1];
      const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 10;
      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error('Invalid --limit value');
      }

      const fromTimestamp = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
      const messages = await readTopicMessages(topicId, { limit, fromTimestamp });

      console.log(JSON.stringify(messages, null, 2));
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  readTopicMessages
};