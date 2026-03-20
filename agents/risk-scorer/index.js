require('dotenv').config();
const path = require('path');
const { startRiskScorerLoop } = require('../shared/scripts/risk-scorer-loop');

async function main() {
  await startRiskScorerLoop({
    stateFile: path.join(__dirname, '.state', 'risk-scorer-state.json')
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
