require('dotenv').config();
const { Client, AccountId } = require('@hashgraph/sdk');
const { parsePrivateKey } = require('./key-utils');

function getClient() {
  if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
    throw new Error('HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  }
  const network = (process.env.HEDERA_NETWORK || 'testnet').toLowerCase();
  let client;
  if (network === 'mainnet') {
    client = Client.forMainnet();
  } else if (network === 'previewnet') {
    client = Client.forPreviewnet();
  } else {
    client = Client.forTestnet();
  }

  client.setOperator(
    AccountId.fromString(process.env.HEDERA_OPERATOR_ID),
    parsePrivateKey(process.env.HEDERA_OPERATOR_KEY)
  );
  return client;
}

module.exports = { getClient };
