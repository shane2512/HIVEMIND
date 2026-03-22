require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const AGENTS = [
  { name: 'watcher', file: 'agents/watcher/index.js' },
  { name: 'plumber', file: 'agents/plumber/index.js' },
  { name: 'wallet-analyst', file: 'agents/wallet-analyst/index.js' },
  { name: 'sentiment', file: 'agents/sentiment/index.js' },
  { name: 'liquidity', file: 'agents/liquidity/index.js' },
  { name: 'risk-scorer', file: 'agents/risk-scorer/index.js' },
  { name: 'report-publisher', file: 'agents/report-publisher/index.js' }
];

const children = [];

function pipeWithPrefix(stream, prefix, writer) {
  stream.on('data', (buf) => {
    const lines = String(buf)
      .split(/\r?\n/)
      .filter((line) => line.length);
    for (const line of lines) {
      writer(`[${prefix}] ${line}\n`);
    }
  });
}

function startAgent(agent) {
  const child = spawn(process.execPath, [agent.file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  pipeWithPrefix(child.stdout, agent.name, (msg) => process.stdout.write(msg));
  pipeWithPrefix(child.stderr, agent.name, (msg) => process.stderr.write(msg));

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    process.stderr.write(`[${agent.name}] exited with ${reason}\n`);
  });

  children.push(child);
}

function startUi() {
  const uiCwd = path.join(process.cwd(), 'ui');
  if (!fs.existsSync(uiCwd)) {
    throw new Error(`UI folder not found at ${uiCwd}`);
  }

  const child = spawn('npm run dev', {
    cwd: uiCwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  pipeWithPrefix(child.stdout, 'ui', (msg) => process.stdout.write(msg));
  pipeWithPrefix(child.stderr, 'ui', (msg) => process.stderr.write(msg));

  child.on('exit', (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    process.stderr.write(`[ui] exited with ${reason}\n`);
  });

  children.push(child);
}

function shutdown() {
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch (_) {
      // no-op
    }
  }
}

process.on('SIGINT', () => {
  process.stdout.write('\n[runner] Shutting down all processes...\n');
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stdout.write('\n[runner] Shutting down all processes...\n');
  shutdown();
  process.exit(0);
});

for (const agent of AGENTS) {
  startAgent(agent);
}
startUi();

process.stdout.write('[runner] Started 7 agents + UI. Press Ctrl+C to stop all.\n');
