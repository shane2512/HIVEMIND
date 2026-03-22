require('dotenv').config();
const http = require('http');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 10000);

const AGENTS = [
  { name: 'watcher', file: 'agents/watcher/index.js' },
  { name: 'plumber', file: 'agents/plumber/index.js' },
  { name: 'wallet-analyst', file: 'agents/wallet-analyst/index.js' },
  { name: 'sentiment', file: 'agents/sentiment/index.js' },
  { name: 'liquidity', file: 'agents/liquidity/index.js' },
  { name: 'risk-scorer', file: 'agents/risk-scorer/index.js' },
  { name: 'report-publisher', file: 'agents/report-publisher/index.js' }
];

const children = new Map();
const startedAt = Date.now();

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

  const state = {
    name: agent.name,
    pid: child.pid,
    status: 'running',
    startedAt: new Date().toISOString(),
    exitCode: null,
    exitSignal: null
  };

  children.set(agent.name, { child, state });

  child.on('exit', (code, signal) => {
    state.status = 'exited';
    state.exitCode = code;
    state.exitSignal = signal;
    process.stderr.write(`[${agent.name}] exited (code=${code}, signal=${signal || 'none'})\n`);
  });
}

function collectStatus() {
  const agents = [];
  for (const { state } of children.values()) {
    agents.push(state);
  }

  const running = agents.filter((a) => a.status === 'running').length;
  return {
    ok: running > 0,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    runningAgents: running,
    totalAgents: AGENTS.length,
    agents
  };
}

function shutdown() {
  for (const { child } of children.values()) {
    try {
      child.kill('SIGTERM');
    } catch (_) {
      // no-op
    }
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/healthz' || req.url === '/') {
    const status = collectStatus();
    const body = JSON.stringify(status, null, 2);
    res.writeHead(status.ok ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(body);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`[render] health server listening on :${PORT}\n`);
  for (const agent of AGENTS) {
    startAgent(agent);
  }
  process.stdout.write('[render] started all agents\n');
});

process.on('SIGINT', () => {
  process.stdout.write('\n[render] shutting down...\n');
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.stdout.write('\n[render] shutting down...\n');
  shutdown();
  process.exit(0);
});
