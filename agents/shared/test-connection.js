require('dotenv').config();
const { AccountBalanceQuery } = require('@hashgraph/sdk');
const { getClient } = require('./hedera-client');
const { requireEnv } = require('./env-utils');

async function testConnection() {
  requireEnv(['HEDERA_OPERATOR_ID', 'HEDERA_OPERATOR_KEY']);

  const client = getClient();
  const accountId = process.env.HEDERA_OPERATOR_ID;
  const balance = await new AccountBalanceQuery().setAccountId(accountId).execute(client);
  const hbar = balance.hbars.toString();

  console.log(`Connected to Hedera ${(process.env.HEDERA_NETWORK || 'testnet')} as ${accountId}`);
  console.log(`Balance: ${hbar}`);
  return hbar;
}

if (require.main === module) {
  testConnection()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  testConnection
};