require('dotenv').config();
const { AccountId, TokenCreateTransaction, TokenType, TokenSupplyType } = require('@hashgraph/sdk');
const { getClient } = require('../agents/shared/hedera-client');

async function createTestToken() {
  const client = getClient();
  const now = Date.now().toString().slice(-6);
  const name = `Watcher Test ${now}`;
  const symbol = `WT${now.slice(-3)}`;
  const treasury = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);

  const tx = await new TokenCreateTransaction()
    .setTokenName(name)
    .setTokenSymbol(symbol)
    .setTokenType(TokenType.FungibleCommon)
    .setTreasuryAccountId(treasury)
    .setDecimals(2)
    .setInitialSupply(10000)
    .setSupplyType(TokenSupplyType.Infinite)
    .freezeWith(client)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const tokenId = receipt.tokenId && receipt.tokenId.toString();

  if (!tokenId) {
    throw new Error('Token creation succeeded but token ID missing in receipt');
  }

  console.log(`Created test token: ${tokenId}`);
  console.log(`Name: ${name}`);
  console.log(`Symbol: ${symbol}`);
  console.log(`Transaction ID: ${tx.transactionId.toString()}`);
}

if (require.main === module) {
  createTestToken().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  createTestToken
};
