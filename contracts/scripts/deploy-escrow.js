const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const { upsertEnvValues, requireEnv, hederaIdToEvmAddress } = require('../../contracts/utils');

async function main() {
  requireEnv(['PIPE_TOKEN_ID']);

  if (process.env.PIPE_ESCROW_ADDRESS && process.env.PIPE_ESCROW_ADDRESS.trim()) {
    console.log(`[SKIP] PIPE_ESCROW_ADDRESS already set: ${process.env.PIPE_ESCROW_ADDRESS.trim()}`);
    return;
  }

  const timeoutSeconds = Number(process.env.ESCROW_TIMEOUT_SECONDS || '600');
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error('ESCROW_TIMEOUT_SECONDS must be a positive number');
  }

  const pipeTokenAddress = hederaIdToEvmAddress(process.env.PIPE_TOKEN_ID);
  const Escrow = await ethers.getContractFactory('PipeEscrow');
  const escrow = await Escrow.deploy(pipeTokenAddress, BigInt(timeoutSeconds));
  await escrow.waitForDeployment();

  const address = await escrow.getAddress();
  upsertEnvValues({ PIPE_ESCROW_ADDRESS: address });

  console.log(`PIPE_ESCROW_ADDRESS=${address}`);
  console.log(`HashScan: https://hashscan.io/testnet/contract/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });