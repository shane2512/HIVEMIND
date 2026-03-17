require('dotenv').config();
const { associatePipe } = require('./pipe-transfer');

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const accountIdx = args.indexOf('--account');
      const keyIdx = args.indexOf('--key');

      if (accountIdx === -1 || !args[accountIdx + 1]) {
        console.error('Usage: node pipe-associate.js --account ACCOUNT_ID [--key PRIVATE_KEY]');
        process.exit(1);
      }

      const accountId = args[accountIdx + 1];
      const privateKey = keyIdx !== -1 ? args[keyIdx + 1] : process.env.AGENT_ACCOUNT_PRIVATE_KEY;
      await associatePipe(accountId, privateKey);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}