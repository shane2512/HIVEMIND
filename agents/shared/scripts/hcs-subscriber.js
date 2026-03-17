const { TopicMessageQuery } = require('@hashgraph/sdk');
const { getClient } = require('../hedera-client');
const { readTopicMessages } = require('./hcs-read');

function subscribe(topicId, onMessage, _startTime) {
  const client = getClient();
  new TopicMessageQuery()
    .setTopicId(topicId)
    .subscribe(client, null, (msg) => {
      let parsed;
      try {
        parsed = JSON.parse(Buffer.from(msg.contents).toString('utf8'));
      } catch (_) {
        parsed = Buffer.from(msg.contents).toString('utf8');
      }

      if (typeof onMessage === 'function') {
        onMessage(parsed, msg.consensusTimestamp, msg.sequenceNumber);
      }
    });
}

async function getHistory(topicId, limit = 100) {
  return readTopicMessages(topicId, { limit });
}

module.exports = {
  subscribe,
  getHistory
};