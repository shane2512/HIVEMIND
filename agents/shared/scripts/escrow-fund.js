require('dotenv').config();
const { ethers } = require('ethers');
const { getWallet } = require('../evm-client');
const { hederaIdToEvmAddress, pipeAmountToTinyUnits } = require('../hedera-id');

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)'
];

const ESCROW_ABI = [
  'function fund(string pipelineId, address[] agentWallets, uint256[] agentFees, address plumberWallet, uint256 plumberFee) external'
];

function maybeToAddress(idOrAddress) {
  if (!idOrAddress) {
    throw new Error('Missing address');
  }

  if (String(idOrAddress).startsWith('0.0.')) {
    return hederaIdToEvmAddress(idOrAddress);
  }
  return idOrAddress;
}

function tokenIdToAddress() {
  if (!process.env.PIPE_TOKEN_ID) {
    throw new Error('PIPE_TOKEN_ID is not set');
  }
  return maybeToAddress(process.env.PIPE_TOKEN_ID);
}

async function fundEscrow(pipelineId, agents, plumber) {
  if (!process.env.PIPE_ESCROW_ADDRESS) {
    throw new Error('PIPE_ESCROW_ADDRESS is not set');
  }
  if (!pipelineId) {
    throw new Error('Missing pipeline ID');
  }
  if (!Array.isArray(agents) || agents.length === 0) {
    throw new Error('Agents array is required');
  }
  if (!plumber || !plumber.walletId || !plumber.fee) {
    throw new Error('Plumber walletId and fee are required');
  }

  const wallet = getWallet();
  const escrow = new ethers.Contract(process.env.PIPE_ESCROW_ADDRESS, ESCROW_ABI, wallet);
  const token = new ethers.Contract(tokenIdToAddress(), ERC20_ABI, wallet);

  const agentWallets = agents.map((a) => maybeToAddress(a.walletId || a.wallet || a.address));
  const agentFees = agents.map((a) => pipeAmountToTinyUnits(a.fee || a.amount));
  const plumberWallet = maybeToAddress(plumber.walletId || plumber.wallet || plumber.address);
  const plumberFee = pipeAmountToTinyUnits(plumber.fee || plumber.amount);

  const total = agentFees.reduce((acc, n) => acc + n, 0n) + plumberFee;
  const approveTx = await token.approve(process.env.PIPE_ESCROW_ADDRESS, total);
  await approveTx.wait();

  const tx = await escrow.fund(pipelineId, agentWallets, agentFees, plumberWallet, plumberFee);
  const receipt = await tx.wait();
  console.log(`Escrow funded for ${pipelineId}: ${receipt.hash}`);
  return receipt;
}

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const pipelineIdx = args.indexOf('--pipeline-id');
      const agentsIdx = args.indexOf('--agents');
      const plumberIdx = args.indexOf('--plumber');

      if (pipelineIdx === -1 || agentsIdx === -1 || plumberIdx === -1) {
        console.error('Usage: node escrow-fund.js --pipeline-id PIPELINE_ID --agents JSON_ARRAY --plumber JSON_OBJECT');
        process.exit(1);
      }

      const pipelineId = args[pipelineIdx + 1];
      const agents = JSON.parse(args[agentsIdx + 1]);
      const plumber = JSON.parse(args[plumberIdx + 1]);
      await fundEscrow(pipelineId, agents, plumber);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  fundEscrow
};