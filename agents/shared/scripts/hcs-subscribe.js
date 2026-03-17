require('dotenv').config();
const { TopicMessageQuery, Timestamp } = require('@hashgraph/sdk');
const { getClient } = require('../hedera-client');

function subscribeToTopic(topicId, { fromTimestamp } = {}) {
  const client = getClient();
  const query = new TopicMessageQuery().setTopicId(topicId);

  if (fromTimestamp) {
    const sec = Number(fromTimestamp);
    if (!Number.isFinite(sec) || sec < 0) {
      throw new Error('Invalid --from-timestamp. Use a unix seconds value.');
    }
    query.setStartTime(Timestamp.fromDate(new Date(sec * 1000)));
  }

  query.subscribe(client, null, (msg) => {
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(msg.contents).toString('utf8'));
    } catch (_) {
      decoded = Buffer.from(msg.contents).toString('utf8');
    }

    const out = {
      topicId,
      consensusTimestamp: msg.consensusTimestamp.toString(),
      sequenceNumber: msg.sequenceNumber,
      message: decoded
    };

    console.log(JSON.stringify(out));
  });
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const topicIdx = args.indexOf('--topic');
    const fromIdx = args.indexOf('--from-timestamp');

    if (topicIdx === -1 || !args[topicIdx + 1]) {
      console.error('Usage: node hcs-subscribe.js --topic TOPIC_ID [--from-timestamp 1710000000]');
      process.exit(1);
    }

    const topicId = args[topicIdx + 1];
    const fromTimestamp = fromIdx !== -1 ? args[fromIdx + 1] : undefined;
    subscribeToTopic(topicId, { fromTimestamp });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = {
  subscribeToTopic
};