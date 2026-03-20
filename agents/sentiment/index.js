require('dotenv').config();
const path = require('path');
const { startWorkerLoop } = require('../shared/scripts/worker-loop');

async function main() {
  await startWorkerLoop(
    { agentId: 'sentiment-01', mode: 'sentiment' },
    { stateFile: path.join(__dirname, '.state', 'sentiment-state.json') }
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
