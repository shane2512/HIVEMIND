require('dotenv').config();
const path = require('path');
const { startPlumberLoop } = require('../shared/scripts/plumber-loop');

async function main() {
  const stateFile = path.join(__dirname, '.state', 'plumber-state.json');
  await startPlumberLoop({ stateFile });
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
