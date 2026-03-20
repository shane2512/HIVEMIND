require('dotenv').config();
const { spawn } = require('child_process');

const workers = [
  { name: 'wallet-analyst', file: 'agents/wallet-analyst/index.js' },
  { name: 'sentiment', file: 'agents/sentiment/index.js' },
  { name: 'liquidity', file: 'agents/liquidity/index.js' },
  { name: 'risk-scorer', file: 'agents/risk-scorer/index.js' },
  { name: 'report-publisher', file: 'agents/report-publisher/index.js' }
];

const children = [];

function startWorker(worker) {
  const child = spawn(process.execPath, [worker.file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (buf) => {
    process.stdout.write(`[${worker.name}] ${buf.toString()}`);
  });
  child.stderr.on('data', (buf) => {
    process.stderr.write(`[${worker.name}] ${buf.toString()}`);
  });
  child.on('exit', (code) => {
    process.stderr.write(`[${worker.name}] exited with code ${code}\n`);
  });

  children.push(child);
}

for (const worker of workers) {
  startWorker(worker);
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill();
    } catch (_) {
      // no-op
    }
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});
