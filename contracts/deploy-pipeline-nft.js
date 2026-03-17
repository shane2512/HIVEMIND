require('dotenv').config();
const { TokenCreateTransaction, TokenType, TokenSupplyType, AccountId } = require('@hashgraph/sdk');
const { getClient } = require('../agents/shared/hedera-client');
const { upsertEnvValues, requireEnv } = require('./utils');
const { parsePrivateKey } = require('../agents/shared/key-utils');

async function deployPipelineNft() {
  requireEnv(['HEDERA_OPERATOR_ID', 'HEDERA_OPERATOR_KEY']);

  if (process.env.PIPELINE_NFT_TOKEN_ID && process.env.PIPELINE_NFT_TOKEN_ID.trim()) {
    console.log(`[SKIP] PIPELINE_NFT_TOKEN_ID already set: ${process.env.PIPELINE_NFT_TOKEN_ID.trim()}`);
    return process.env.PIPELINE_NFT_TOKEN_ID.trim();
  }

  const client = getClient();
  const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
  const operatorKey = parsePrivateKey(process.env.HEDERA_OPERATOR_KEY);

  const tx = await new TokenCreateTransaction()
    .setTokenName('HIVEMIND Pipeline Certificate')
    .setTokenSymbol('HPCERT')
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0)
    .setTreasuryAccountId(operatorId)
    .setSupplyType(TokenSupplyType.Infinite)
    .setSupplyKey(operatorKey.publicKey)
    .freezeWith(client);

  const signed = await tx.sign(operatorKey);
  const submit = await signed.execute(client);
  const receipt = await submit.getReceipt(client);
  const tokenId = receipt.tokenId.toString();

  upsertEnvValues({ PIPELINE_NFT_TOKEN_ID: tokenId });
  console.log(`PIPELINE_NFT_TOKEN_ID=${tokenId}`);
  console.log(`HashScan: https://hashscan.io/testnet/token/${tokenId}`);
  return tokenId;
}

if (require.main === module) {
  deployPipelineNft()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  deployPipelineNft
};