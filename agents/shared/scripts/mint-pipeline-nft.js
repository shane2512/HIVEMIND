require('dotenv').config();
const { TokenMintTransaction } = require('@hashgraph/sdk');
const { getClient } = require('../hedera-client');

async function mintPipelineNft(pipelineId, metadata) {
  if (!process.env.PIPELINE_NFT_TOKEN_ID) {
    throw new Error('PIPELINE_NFT_TOKEN_ID is not set');
  }
  if (!pipelineId) {
    throw new Error('pipelineId is required');
  }

  const payload = metadata || { pipelineId, mintedAt: new Date().toISOString() };
  const buf = Buffer.from(JSON.stringify(payload), 'utf8');

  const client = getClient();
  const tx = await new TokenMintTransaction()
    .setTokenId(process.env.PIPELINE_NFT_TOKEN_ID)
    .addMetadata(buf)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const serial = receipt.serials && receipt.serials[0] ? receipt.serials[0].toString() : 'unknown';
  console.log(`Minted pipeline NFT serial: ${serial}`);
  return serial;
}

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const pipelineIdx = args.indexOf('--pipeline-id');
      const metadataIdx = args.indexOf('--metadata');
      if (pipelineIdx === -1 || !args[pipelineIdx + 1]) {
        console.error('Usage: node mint-pipeline-nft.js --pipeline-id PIPELINE_ID [--metadata JSON]');
        process.exit(1);
      }

      const metadata = metadataIdx !== -1 ? JSON.parse(args[metadataIdx + 1]) : undefined;
      await mintPipelineNft(args[pipelineIdx + 1], metadata);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  mintPipelineNft
};