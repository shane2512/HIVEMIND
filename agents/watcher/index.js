require('dotenv').config();
const path = require('path');
const { startWatcherLoop } = require('../shared/scripts/watcher-loop');

async function main() {
  const stateFile = path.join(__dirname, '.state', 'watcher-state.json');
  await startWatcherLoop({ stateFile });
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  main
};
