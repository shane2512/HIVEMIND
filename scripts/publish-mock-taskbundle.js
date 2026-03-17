require('dotenv').config();
const crypto = require('crypto');
const { publishToHCS } = require('../agents/shared/scripts/hcs-publish');

async function publishMockTaskBundle() {
  const taskTopic = process.env.HCS_TASK_TOPIC;
  if (!taskTopic) {
    throw new Error('HCS_TASK_TOPIC is missing in .env');
  }

  const tokenId = process.env.MOCK_TASK_TOKEN_ID || process.env.PIPE_TOKEN_ID || '0.0.0';
  const creatorWallet = process.env.MOCK_TASK_CREATOR_WALLET || process.env.HEDERA_OPERATOR_ID;

  if (!creatorWallet) {
    throw new Error('HEDERA_OPERATOR_ID is missing in .env and MOCK_TASK_CREATOR_WALLET is not set');
  }

  const message = {
    ucpVersion: '1.0',
    messageType: 'TASK_BUNDLE',
    senderId: 'phase3-test',
    timestamp: new Date().toISOString(),
    payload: {
      taskId: `task-${crypto.randomUUID()}`,
      triggerType: 'MANUAL_TEST',
      triggerData: {
        tokenId,
        tokenName: 'Phase3 Mock Token',
        tokenSymbol: 'P3T',
        creatorWallet,
        createdAt: new Date().toISOString()
      },
      requiredInputType: 'WalletAddress+TokenId',
      requiredOutputType: 'HCSPublication',
      maxBudget: '0.020'
    }
  };

  await publishToHCS(taskTopic, message);
  console.log(`Published mock TASK_BUNDLE to ${taskTopic}`);
}

if (require.main === module) {
  publishMockTaskBundle().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  publishMockTaskBundle
};
