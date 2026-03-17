require('dotenv').config();
const { TopicCreateTransaction } = require('@hashgraph/sdk');
const { getClient } = require('./hedera-client');
const { upsertEnvValues, requireEnv } = require('./env-utils');

const TOPIC_KEYS = [
  { key: 'HCS_REGISTRY_TOPIC', memo: 'HIVEMIND Agent Registry' },
  { key: 'HCS_TASK_TOPIC', memo: 'HIVEMIND Task Coordination' },
  { key: 'HCS_ATTESTATION_TOPIC', memo: 'HIVEMIND Task Attestations' },
  { key: 'HCS_REPORT_TOPIC', memo: 'HIVEMIND Intelligence Reports' },
  { key: 'HCS_BLACKLIST_TOPIC', memo: 'HIVEMIND Blacklist Entries' }
];

async function createTopic(client, memo) {
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).execute(client);
  const receipt = await tx.getReceipt(client);
  return receipt.topicId.toString();
}

async function setupTopics() {
  requireEnv(['HEDERA_OPERATOR_ID', 'HEDERA_OPERATOR_KEY']);
  const client = getClient();
  const result = {};

  for (const topic of TOPIC_KEYS) {
    const existing = process.env[topic.key];
    if (existing && String(existing).trim()) {
      result[topic.key] = existing.trim();
      console.log(`[SKIP] ${topic.key} already set: ${existing.trim()}`);
      continue;
    }

    const topicId = await createTopic(client, topic.memo);
    result[topic.key] = topicId;
    console.log(`[CREATE] ${topic.key}=${topicId}`);
  }

  upsertEnvValues(result);
  console.log('Topic setup complete. .env updated.');
  return result;
}

if (require.main === module) {
  setupTopics()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  setupTopics
};