require('dotenv').config();
const { getPipeBalance } = require('./pipe-transfer');

if (require.main === module) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      const accountIdx = args.indexOf('--account');
      if (accountIdx === -1 || !args[accountIdx + 1]) {
        console.error('Usage: node pipe-balance.js --account ACCOUNT_ID');
        process.exit(1);
      }

      const accountId = args[accountIdx + 1];
      const balance = await getPipeBalance(accountId);
      console.log(balance);
      process.exit(0);
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}