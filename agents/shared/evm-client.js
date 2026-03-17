require('dotenv').config();
const { ethers } = require('ethers');

function getRpcUrl() {
  return process.env.HEDERA_JSON_RPC_URL || 'https://testnet.hashio.io/api';
}

function getWallet() {
  const privateKey = process.env.HEDERA_EVM_PRIVATE_KEY;
  if (!privateKey || !privateKey.trim()) {
    throw new Error('HEDERA_EVM_PRIVATE_KEY must be set in .env');
  }

  const provider = new ethers.JsonRpcProvider(getRpcUrl(), {
    chainId: 296,
    name: 'hedera_testnet'
  });

  return new ethers.Wallet(privateKey, provider);
}

module.exports = {
  getWallet
};