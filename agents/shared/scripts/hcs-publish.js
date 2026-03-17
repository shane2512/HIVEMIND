require('dotenv').config();
const fs = require('fs');
const { TopicMessageSubmitTransaction } = require('@hashgraph/sdk');
const { getClient } = require('../hedera-client');
const { validateUCPMessage } = require('../ucp-schema');
const { requireEnv } = require('../env-utils');

async function publishToHCS(topicId, message) {
  requireEnv(['HEDERA_OPERATOR_ID', 'HEDERA_OPERATOR_KEY']);
  if (!topicId) {
    throw new Error('Missing topic ID');
  }

  const client = getClient();
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

  if (messageStr.length > 6000) {
    throw new Error(`HCS message too large: ${messageStr.length} bytes (max 6000)`);
  }

  const parsed = JSON.parse(messageStr);
  validateUCPMessage(parsed);

  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(messageStr)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`[HCS] Published to ${topicId} | tx: ${tx.transactionId.toString()} | seq: ${receipt.topicSequenceNumber} | type: ${parsed.messageType}`);
  return receipt;
}

// CLI usage: node hcs-publish.js --topic 0.0.XXXXX --message '{...}'
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const topicIdx = args.indexOf('--topic');
    const msgIdx = args.indexOf('--message');
    const msgFileIdx = args.indexOf('--message-file');

    if (topicIdx === -1 || !args[topicIdx + 1]) {
      console.error('Usage: node hcs-publish.js --topic TOPIC_ID [--message JSON | --message-file path.json]');
      process.exit(1);
    }

    const topicId = args[topicIdx + 1];
    let message;
    if (msgIdx !== -1 && args[msgIdx + 1]) {
      message = args[msgIdx + 1];
    } else if (msgFileIdx !== -1 && args[msgFileIdx + 1]) {
      const filePath = args[msgFileIdx + 1];
      message = fs.readFileSync(filePath, 'utf8');
    }

    if (!message) {
      console.error('Usage: node hcs-publish.js --topic TOPIC_ID [--message JSON | --message-file path.json]');
      process.exit(1);
    }

    publishToHCS(topicId, message)
      .then(() => process.exit(0))
      .catch(err => { console.error(err.message); process.exit(1); });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { publishToHCS };
