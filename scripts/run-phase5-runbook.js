require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { createTestToken } = require('./create-test-token');
const { verifyPhase5 } = require('./verify-phase5');
const { publishToHCS } = require('../agents/shared/scripts/hcs-publish');

const AGENTS = [
  { name: 'watcher', file: 'agents/watcher/index.js' },
  { name: 'plumber', file: 'agents/plumber/index.js' },
  { name: 'wallet-analyst', file: 'agents/wallet-analyst/index.js' },
  { name: 'sentiment', file: 'agents/sentiment/index.js' },
  { name: 'liquidity', file: 'agents/liquidity/index.js' },
  { name: 'risk-scorer', file: 'agents/risk-scorer/index.js' },
  { name: 'report-publisher', file: 'agents/report-publisher/index.js' }
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag, fallback) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
  };
  const has = (flag) => args.includes(flag);

  const timeoutSec = Number(get('--timeout-sec', '240'));
  const bootWaitMs = Number(get('--boot-wait-ms', '5000'));
  const tokenDelayMs = Number(get('--token-delay-ms', '2500'));
  const outputDir = get('--output-dir', 'artifacts/runs');

  if (!Number.isFinite(timeoutSec) || timeoutSec <= 0) {
    throw new Error('Invalid --timeout-sec value');
  }
  if (!Number.isFinite(bootWaitMs) || bootWaitMs < 0) {
    throw new Error('Invalid --boot-wait-ms value');
  }
  if (!Number.isFinite(tokenDelayMs) || tokenDelayMs < 0) {
    throw new Error('Invalid --token-delay-ms value');
  }

  return {
    timeoutSec,
    bootWaitMs,
    tokenDelayMs,
    outputDir,
    reuseRuntime: has('--reuse-runtime'),
    keepRuntime: has('--keep-runtime'),
    withWatcher: has('--with-watcher'),
    preserveState: has('--preserve-state')
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timestampLabel() {
  const d = new Date();
  const pad = (v) => String(v).padStart(2, '0');
  return [
    d.getUTCFullYear(),
    pad(d.getUTCMonth() + 1),
    pad(d.getUTCDate())
  ].join('') + '-' + [
    pad(d.getUTCHours()),
    pad(d.getUTCMinutes()),
    pad(d.getUTCSeconds())
  ].join('');
}

function startAgent(agent) {
  const child = spawn(process.execPath, [agent.file], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (buf) => {
    process.stdout.write(`[${agent.name}] ${buf.toString()}`);
  });
  child.stderr.on('data', (buf) => {
    process.stderr.write(`[${agent.name}] ${buf.toString()}`);
  });
  child.on('exit', (code) => {
    process.stderr.write(`[${agent.name}] exited with code ${code}\n`);
  });

  return child;
}

function stopChildren(children) {
  for (const child of children) {
    try {
      child.kill();
    } catch (_) {
      // no-op
    }
  }
}

function resetAgentState(agentName) {
  const stateDir = path.join(process.cwd(), 'agents', agentName, '.state');
  if (!fs.existsSync(stateDir)) {
    return;
  }
  fs.rmSync(stateDir, { recursive: true, force: true });
}

function buildSeedTaskBundle(created) {
  return {
    ucpVersion: '1.0',
    messageType: 'TASK_BUNDLE',
    senderId: 'watcher-01',
    timestamp: new Date().toISOString(),
    payload: {
      taskId: `task-runbook-${Date.now()}`,
      triggerType: 'HTS_TOKEN_CREATED',
      triggerData: {
        tokenId: created.tokenId,
        tokenName: created.name || '',
        tokenSymbol: created.symbol || '',
        creatorWallet: process.env.HEDERA_OPERATOR_ID || null,
        createdAt: new Date().toISOString(),
        source: 'phase5-runbook'
      },
      requiredInputType: 'WalletAddress+TokenId',
      requiredOutputType: 'HCSPublication',
      maxBudget: '0.020'
    }
  };
}

async function main() {
  const args = parseArgs();
  const children = [];
  let startedRuntime = false;

  const shutdown = () => {
    if (startedRuntime && !args.keepRuntime) {
      stopChildren(children);
    }
  };

  process.on('SIGINT', () => {
    shutdown();
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    shutdown();
    process.exit(143);
  });

  try {
    const agents = args.withWatcher
      ? AGENTS
      : AGENTS.filter((agent) => agent.name !== 'watcher');

    if (!args.reuseRuntime) {
      if (!args.preserveState) {
        for (const agent of agents) {
          resetAgentState(agent.name);
        }
        console.log('[RUNBOOK] Cleared agent state for fresh run (use --preserve-state to keep cursors)');
      }

      for (const agent of agents) {
        children.push(startAgent(agent));
      }
      startedRuntime = true;
      console.log(`[RUNBOOK] Started ${agents.length} agent processes${args.withWatcher ? ' (watcher included)' : ' (watcher skipped)'}`);
      if (args.bootWaitMs > 0) {
        console.log(`[RUNBOOK] Waiting ${args.bootWaitMs}ms for runtime warm-up`);
        await sleep(args.bootWaitMs);
      }
    } else {
      console.log('[RUNBOOK] Reusing existing runtime (--reuse-runtime)');
    }

    const created = await createTestToken();
    console.log(`[RUNBOOK] Created token ${created.tokenId} (tx=${created.txId})`);

    const taskTopic = process.env.HCS_TASK_TOPIC;
    if (!taskTopic) {
      throw new Error('HCS_TASK_TOPIC is required in .env');
    }

    const seedTaskBundle = buildSeedTaskBundle(created);
    await publishToHCS(taskTopic, seedTaskBundle);
    console.log(`[RUNBOOK] Seeded TASK_BUNDLE ${seedTaskBundle.payload.taskId} for token ${created.tokenId}`);

    if (args.tokenDelayMs > 0) {
      await sleep(args.tokenDelayMs);
    }

    const verifyResult = await verifyPhase5({
      tokenId: created.tokenId,
      txId: created.txId,
      timeoutSec: args.timeoutSec
    });

    const runId = `run-${timestampLabel()}`;
    const runDir = path.resolve(process.cwd(), args.outputDir, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const runMeta = {
      runId,
      generatedAt: new Date().toISOString(),
      created,
      options: {
        timeoutSec: args.timeoutSec,
        bootWaitMs: args.bootWaitMs,
        tokenDelayMs: args.tokenDelayMs,
        reuseRuntime: args.reuseRuntime,
        keepRuntime: args.keepRuntime,
        withWatcher: args.withWatcher,
        preserveState: args.preserveState
      },
      verify: verifyResult
    };

    fs.writeFileSync(path.join(runDir, 'phase5-verify.json'), `${JSON.stringify(verifyResult, null, 2)}\n`, 'utf8');
    fs.writeFileSync(path.join(runDir, 'runbook-meta.json'), `${JSON.stringify(runMeta, null, 2)}\n`, 'utf8');

    console.log(`[RUNBOOK] Wrote evidence to ${runDir}`);
    console.log(JSON.stringify(runMeta, null, 2));

    if (!verifyResult.ok) {
      process.exitCode = 1;
    }
  } finally {
    shutdown();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[RUNBOOK] ${err.message}`);
    process.exit(1);
  });
}
