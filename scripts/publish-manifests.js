require('dotenv').config();
const { publishToHCS } = require('../agents/shared/scripts/hcs-publish');

function now() {
  return new Date().toISOString();
}

function manifestPayloads() {
  const tokenId = process.env.PIPE_TOKEN_ID;
  const walletId = process.env.HEDERA_OPERATOR_ID;

  return [
    {
      senderId: 'watcher-01',
      payload: {
        agentId: 'watcher-01',
        agentType: 'WATCHER',
        inputType: 'HTSEventStream',
        outputType: 'TaskBundle',
        description: 'Monitors Hedera Token Service for new token creations and evaluates them for analysis worthiness',
        pricePerTask: '0.001',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'plumber-01',
      payload: {
        agentId: 'plumber-01',
        agentType: 'COORDINATOR',
        inputType: 'AgentManifest+TaskBundle',
        outputType: 'PipelineBlueprint',
        description: 'Reads agent capability manifests and assembles optimal processing pipelines based on input/output type compatibility',
        pricePerTask: '0',
        routingFeePercent: '8',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'wallet-analyst-01',
      payload: {
        agentId: 'wallet-analyst-01',
        agentType: 'WORKER',
        inputType: 'WalletAddress',
        outputType: 'WalletHistory',
        description: 'Fetches complete Hedera account transaction history and computes wallet age, activity patterns, and previous token creation behaviour',
        pricePerTask: '0.002',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'sentiment-01',
      payload: {
        agentId: 'sentiment-01',
        agentType: 'WORKER',
        inputType: 'TokenId',
        outputType: 'SentimentScore',
        description: 'Scans Hedera Consensus Service topics for token mentions and computes a community sentiment signal from HCS message activity',
        pricePerTask: '0.002',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'liquidity-01',
      payload: {
        agentId: 'liquidity-01',
        agentType: 'WORKER',
        inputType: 'TokenId',
        outputType: 'LiquidityReport',
        description: 'Analyses Hedera Token Service data to compute holder distribution, transfer velocity, and supply concentration metrics',
        pricePerTask: '0.002',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'risk-scorer-01',
      payload: {
        agentId: 'risk-scorer-01',
        agentType: 'WORKER',
        inputType: 'WalletHistory+SentimentScore+LiquidityReport',
        outputType: 'RiskScore',
        description: 'Combines wallet history, HCS sentiment, and liquidity data into a weighted composite risk score for a Hedera token',
        pricePerTask: '0.004',
        tokenId,
        walletId,
        version: 1
      }
    },
    {
      senderId: 'report-publisher-01',
      payload: {
        agentId: 'report-publisher-01',
        agentType: 'WORKER',
        inputType: 'RiskScore+AllInputs',
        outputType: 'HCSPublication',
        description: 'Composes a structured intelligence report from all pipeline outputs and publishes it to the Hedera Consensus Service for downstream agent consumption',
        pricePerTask: '0.002',
        tokenId,
        walletId,
        version: 1
      }
    }
  ];
}

async function publishAllManifests() {
  if (!process.env.HCS_REGISTRY_TOPIC) {
    throw new Error('HCS_REGISTRY_TOPIC is missing in .env');
  }

  const manifests = manifestPayloads();
  for (const item of manifests) {
    const message = {
      ucpVersion: '1.0',
      messageType: 'AGENT_MANIFEST',
      senderId: item.senderId,
      timestamp: now(),
      payload: item.payload
    };

    await publishToHCS(process.env.HCS_REGISTRY_TOPIC, message);
  }

  console.log('Published 7 AGENT_MANIFEST messages to HCS_REGISTRY_TOPIC');
}

if (require.main === module) {
  publishAllManifests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}

module.exports = {
  publishAllManifests
};