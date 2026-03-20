require('dotenv').config();
const { getHederaLangchainContext } = require('./utils/hedera-agent');

async function getHederaAgentKitContext() {
  return getHederaLangchainContext();
}

module.exports = {
  getHederaAgentKitContext
};
