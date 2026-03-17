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
  const messages = (data.messages || []).map((msg) => ({
    consensusTimestamp: msg.consensus_timestamp,
    sequenceNumber: msg.sequence_number,
    runningHash: msg.running_hash,
    message: decodeMirrorMessage(msg.message)
  }));

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