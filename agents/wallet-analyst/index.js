require('dotenv').config();
const path = require('path');
const { startWorkerLoop } = require('../shared/scripts/worker-loop');

async function main() {
  await startWorkerLoop(
    { agentId: 'wallet-analyst-01', mode: 'wallet' },
    { stateFile: path.join(__dirname, '.state', 'wallet-analyst-state.json') }
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
