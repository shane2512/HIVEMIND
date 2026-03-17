require('dotenv').config();
const { TransferTransaction, TokenAssociateTransaction, AccountId, PrivateKey } = require('@hashgraph/sdk');
const { getClient } = require('../hedera-client');
const { requireEnv } = require('../env-utils');

const PIPE_DECIMALS = Number(process.env.PIPE_TOKEN_DECIMALS || '6');

function getMirrorNodeUrl() {
  return process.env.MIRROR_NODE_URL || process.env.VITE_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com';
}

function toRawUnits(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return Math.round(n * Math.pow(10, PIPE_DECIMALS));
}

async function transferPipe(toAccountId, amount) {
  requireEnv(['PIPE_TOKEN_ID', 'HEDERA_OPERATOR_ID']);
  const client = getClient();
  const rawAmount = toRawUnits(amount);
  const tokenId = process.env.PIPE_TOKEN_ID;

  const tx = await new TransferTransaction()
    .addTokenTransfer(tokenId, process.env.HEDERA_OPERATOR_ID, -rawAmount)
    .addTokenTransfer(tokenId, toAccountId, rawAmount)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  console.log(`[HTS] Transferred ${amount} PIPE to ${toAccountId} | tx: ${tx.transactionId.toString()}`);
  return receipt;
}

async function associatePipe(accountId, accountPrivateKey) {
  requireEnv(['PIPE_TOKEN_ID']);
  const client = getClient();
  let tx = await new TokenAssociateTransaction()
    .setAccountId(accountId)
    .setTokenIds([process.env.PIPE_TOKEN_ID])
    .freezeWith(client);

  const privateKey = accountPrivateKey ? PrivateKey.fromString(accountPrivateKey) : null;
  if (privateKey) {
    tx = await tx.sign(privateKey);
  }

  const submit = await tx.execute(client);
  await submit.getReceipt(client);
  console.log(`[HTS] Associated PIPE token with ${accountId}`);
}

async function getPipeBalance(accountId) {
  requireEnv(['PIPE_TOKEN_ID']);
  const url = `${getMirrorNodeUrl()}/api/v1/accounts/${accountId}/tokens?token.id=${process.env.PIPE_TOKEN_ID}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror node request failed (${res.status})`);
  }
  const data = await res.json();
  const token = (data.tokens || []).find(t => t.token_id === process.env.PIPE_TOKEN_ID);
  return token ? parseInt(token.balance) / Math.pow(10, PIPE_DECIMALS) : 0;
}

// CLI usage: node pipe-transfer.js --to 0.0.XXXXX --amount 0.002
if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const toIdx = args.indexOf('--to');
      const amtIdx = args.indexOf('--amount');
      if (toIdx === -1 || amtIdx === -1 || !args[toIdx + 1] || !args[amtIdx + 1]) {
        console.error('Usage: node pipe-transfer.js --to ACCOUNT_ID --amount AMOUNT');
        process.exit(1);
      }

      await transferPipe(args[toIdx + 1], args[amtIdx + 1]);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = { transferPipe, associatePipe, getPipeBalance };
