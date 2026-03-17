require('dotenv').config();
const { publishToHCS } = require('../agents/shared/scripts/hcs-publish');

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const pipelineId = get('--pipeline-id');
  const taskId = get('--task-id');
  const count = Number(get('--count') || '1');

  if (!pipelineId) {
    throw new Error('Usage: node publish-pipeline-complete.js --pipeline-id PIPELINE_ID [--task-id TASK_ID] [--count 1]');
  }
  if (!Number.isFinite(count) || count <= 0 || count > 100) {
    throw new Error('--count must be a number between 1 and 100');
  }

  return { pipelineId, taskId, count };
}

async function publishPipelineComplete({ pipelineId, taskId, count }) {
  const topic = process.env.HCS_TASK_TOPIC;
  if (!topic) {
    throw new Error('HCS_TASK_TOPIC is missing in .env');
  }

  for (let i = 1; i <= count; i += 1) {
    const message = {
      ucpVersion: '1.0',
      messageType: 'PIPELINE_COMPLETE',
      senderId: 'phase3-complete-test',
      timestamp: new Date().toISOString(),
      payload: {
        pipelineId,
        ...(taskId ? { taskId } : {}),
        completionCount: i,
        allAttestationsVerified: true,
        totalPipeSettled: '0.013',
        nftMintThreshold: Number(process.env.PLUMBER_NFT_MINT_THRESHOLD || 10)
      }
    };

    await publishToHCS(topic, message);
  }

  console.log(`Published ${count} PIPELINE_COMPLETE messages for ${pipelineId}`);
}

if (require.main === module) {
  const input = parseArgs();
  publishPipelineComplete(input).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  publishPipelineComplete
};
