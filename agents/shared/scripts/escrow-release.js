require('dotenv').config();
const { ethers } = require('ethers');
const { getWallet } = require('../evm-client');
const { hederaIdToEvmAddress } = require('../hedera-id');

const ESCROW_ABI = [
  'function releasePayment(string pipelineId, address agentWallet) external'
];

function maybeToAddress(idOrAddress) {
  if (String(idOrAddress).startsWith('0.0.')) {
    return hederaIdToEvmAddress(idOrAddress);
  }
  return idOrAddress;
}

async function releaseEscrowPayment(pipelineId, agentWallet) {
  if (!process.env.PIPE_ESCROW_ADDRESS) {
    throw new Error('PIPE_ESCROW_ADDRESS is not set');
  }
  if (!pipelineId || !agentWallet) {
    throw new Error('pipelineId and agentWallet are required');
  }

  const wallet = getWallet();
  const escrow = new ethers.Contract(process.env.PIPE_ESCROW_ADDRESS, ESCROW_ABI, wallet);
  const tx = await escrow.releasePayment(pipelineId, maybeToAddress(agentWallet));
  const receipt = await tx.wait();
  console.log(`Escrow payment released: ${receipt.hash}`);
  return receipt;
}

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const pipelineIdx = args.indexOf('--pipeline-id');
      const agentIdx = args.indexOf('--agent');
      if (pipelineIdx === -1 || agentIdx === -1) {
        console.error('Usage: node escrow-release.js --pipeline-id PIPELINE_ID --agent AGENT_WALLET');
        process.exit(1);
      }

      await releaseEscrowPayment(args[pipelineIdx + 1], args[agentIdx + 1]);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  releaseEscrowPayment
};