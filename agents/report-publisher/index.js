require('dotenv').config();
const path = require('path');
const { startReportPublisherLoop } = require('../shared/scripts/report-publisher-loop');

async function main() {
  await startReportPublisherLoop({
    stateFile: path.join(__dirname, '.state', 'report-publisher-state.json')
  });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
