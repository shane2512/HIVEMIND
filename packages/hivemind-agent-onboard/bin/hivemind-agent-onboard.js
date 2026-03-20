#!/usr/bin/env node
/* eslint-disable no-console */

require('dotenv').config();

const crypto = require('crypto');
const readline = require('readline');
const {
  Client,
  PrivateKey,
  TopicMessageSubmitTransaction
} = require('@hashgraph/sdk');

const DEFAULT_MIRROR = 'https://testnet.mirrornode.hedera.com';
const CLI_NAME = 'hivemindregistration';
const REQUIRED_PUBLISH_ENV = ['HEDERA_OPERATOR_ID', 'HEDERA_OPERATOR_KEY', 'HCS_REGISTRY_TOPIC'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function usage() {
  console.log([
    `${CLI_NAME} - HIVE MIND agent onboarding CLI`,
    '',
    'Recommended (small commands):',
    `  ${CLI_NAME} doctor`,
    `  ${CLI_NAME} onboard`,
    `  ${CLI_NAME} onboard --dry-run`,
    '',
    'PowerShell env setup:',
    '  $env:HEDERA_OPERATOR_ID="0.0.YOUR_OPERATOR_ID"',
    '  $env:HEDERA_OPERATOR_KEY="YOUR_OPERATOR_PRIVATE_KEY"',
    '  $env:HCS_REGISTRY_TOPIC="0.0.YOUR_REGISTRY_TOPIC"',
    '  $env:HEDERA_NETWORK="testnet"',
    `  $env:MIRROR_NODE_URL="${DEFAULT_MIRROR}"`,
    '',
    'Commands:',
    `  ${CLI_NAME} onboard       : full end-to-end flow (prompts for missing fields)`,
    `  ${CLI_NAME} step-by-step  : guided interactive flow`,
    `  ${CLI_NAME} register      : publish AGENT_REGISTER`,
    `  ${CLI_NAME} claim         : publish AGENT_CLAIMED`,
    `  ${CLI_NAME} heartbeat     : publish AGENT_HEARTBEAT`,
    `  ${CLI_NAME} manifest      : publish AGENT_MANIFEST`,
    `  ${CLI_NAME} verify        : verify lifecycle on Mirror Node`,
    `  ${CLI_NAME} doctor        : validate env + Hedera + Mirror`,
    `  ${CLI_NAME} env-example   : print .env template`,
    '',
    'Examples:',
    `  ${CLI_NAME} doctor`,
    `  ${CLI_NAME} onboard --agent-id liquidity-03 --wallet-id 0.0.700003 --token-id 0.0.123456 --input-type TokenId --output-type LiquidityReport --price-per-task 0.002 --owner-id owner-03 --dry-run`,
    `  ${CLI_NAME} verify --agent-id liquidity-03`,
    '',
    'Notes:',
    `  - ${CLI_NAME} verify only needs HCS_REGISTRY_TOPIC (and optional MIRROR_NODE_URL).`,
    `  - ${CLI_NAME} register|claim|heartbeat|manifest|onboard require Hedera operator env vars.`,
    `  - Use ${CLI_NAME} env-example to print a reusable .env template.`
  ].join('\n'));
}

function envExample() {
  console.log([
    '# Copy into a .env file or export in shell',
    'HEDERA_OPERATOR_ID=0.0.YOUR_OPERATOR_ID',
    'HEDERA_OPERATOR_KEY=YOUR_OPERATOR_PRIVATE_KEY',
    'HCS_REGISTRY_TOPIC=0.0.YOUR_REGISTRY_TOPIC',
    'HEDERA_NETWORK=testnet',
    `MIRROR_NODE_URL=${DEFAULT_MIRROR}`,
  ].join('\n'));
}

function requireArg(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required flag --${key}`);
  }
  return String(value);
}

function nowIso() {
  return new Date().toISOString();
}

function plusSecondsIso(seconds) {
  return new Date(Date.now() + (Number(seconds) * 1000)).toISOString();
}

function makeNonce() {
  return `nonce-${crypto.randomUUID()}`;
}

function ensurePublishEnv() {
  const missing = REQUIRED_PUBLISH_ENV.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

function getClient() {
  ensurePublishEnv();
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKeyRaw = String(process.env.HEDERA_OPERATOR_KEY || '').trim();

  const network = String(process.env.HEDERA_NETWORK || 'testnet').toLowerCase();
  const client = network === 'mainnet' ? Client.forMainnet() : Client.forTestnet();

  // Match repository behavior: detect ECDSA hex keys explicitly,
  // otherwise let SDK parse the standard key format.
  const operatorKey = operatorKeyRaw.startsWith('0x')
    ? PrivateKey.fromStringECDSA(operatorKeyRaw)
    : PrivateKey.fromString(operatorKeyRaw);

  client.setOperator(operatorId, operatorKey);
  return client;
}

function envelope(messageType, senderId, payload) {
  return {
    ucpVersion: '1.0',
    messageType,
    senderId,
    timestamp: nowIso(),
    payload
  };
}

async function publish(topicId, message) {
  if (!topicId) {
    throw new Error('Missing HCS_REGISTRY_TOPIC or --topic');
  }

  const text = JSON.stringify(message);
  if (text.length > 6000) {
    throw new Error(`Message too large: ${text.length} bytes`);
  }

  const client = getClient();
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(text)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  return {
    txId: tx.transactionId.toString(),
    seq: Number(receipt.topicSequenceNumber || 0)
  };
}

async function runDoctor() {
  const rows = [];
  for (const name of REQUIRED_PUBLISH_ENV) {
    rows.push({ check: `env:${name}`, ok: Boolean(process.env[name]) });
  }

  let clientOk = false;
  try {
    const client = getClient();
    clientOk = Boolean(client);
  } catch (_) {
    clientOk = false;
  }
  rows.push({ check: 'hedera-client-init', ok: clientOk });

  const mirror = String(process.env.MIRROR_NODE_URL || DEFAULT_MIRROR).replace(/\/$/, '');
  const topic = String(process.env.HCS_REGISTRY_TOPIC || '');
  let mirrorOk = false;
  if (topic) {
    try {
      const url = `${mirror}/api/v1/topics/${topic}/messages?limit=1&order=desc`;
      const res = await fetch(url);
      mirrorOk = res.ok;
    } catch (_) {
      mirrorOk = false;
    }
  }
  rows.push({ check: 'mirror-query', ok: mirrorOk });

  const failed = rows.filter((r) => !r.ok);
  console.log(JSON.stringify({
    ok: failed.length === 0,
    checks: rows
  }, null, 2));

  if (failed.length) {
    process.exitCode = 2;
  }
}

function registerMessage(args) {
  const agentId = requireArg(args, 'agent-id');
  const walletId = requireArg(args, 'wallet-id');
  const inputType = requireArg(args, 'input-type');
  const outputType = requireArg(args, 'output-type');
  const tokenId = requireArg(args, 'token-id');
  const ttlSec = Number(args['ttl-sec'] || 600);

  return envelope('AGENT_REGISTER', agentId, {
    agentId,
    name: String(args.name || agentId),
    description: String(args.description || 'External agent registration'),
    walletId,
    tokenId,
    agentType: String(args['agent-type'] || 'WORKER'),
    inputType,
    outputType,
    pricePerTask: String(args['price-per-task'] || '0'),
    version: Number(args.version || 1),
    challenge: {
      nonce: String(args.nonce || makeNonce()),
      issuedAt: nowIso(),
      expiresAt: plusSecondsIso(ttlSec)
    },
    ownershipProof: {
      algorithm: String(args.algorithm || 'ed25519'),
      signature: String(args.signature || 'REQUIRED_FOR_PRODUCTION')
    },
    claim: {
      status: 'pending_claim',
      claimRef: String(args['claim-ref'] || `claim-${agentId}`)
    }
  });
}

function claimMessage(args) {
  const agentId = requireArg(args, 'agent-id');
  const walletId = requireArg(args, 'wallet-id');

  return envelope('AGENT_CLAIMED', String(args['sender-id'] || 'registry-admin-01'), {
    agentId,
    walletId,
    claimRef: String(args['claim-ref'] || `claim-${agentId}`),
    claimedBy: {
      ownerId: String(args['owner-id'] || 'owner-unknown'),
      verificationMethod: String(args['verification-method'] || 'wallet-signature')
    },
    status: 'claimed',
    claimedAt: nowIso()
  });
}

function heartbeatMessage(args) {
  const agentId = requireArg(args, 'agent-id');
  const walletId = requireArg(args, 'wallet-id');
  const ttlSec = Number(args['ttl-sec'] || 600);

  return envelope('AGENT_HEARTBEAT', agentId, {
    agentId,
    walletId,
    status: String(args.status || 'active'),
    lease: {
      ttlSec,
      activeUntil: plusSecondsIso(ttlSec)
    },
    runtime: {
      version: String(args['runtime-version'] || '0.1.0'),
      network: String(process.env.HEDERA_NETWORK || 'testnet')
    }
  });
}

function manifestMessage(args) {
  const agentId = requireArg(args, 'agent-id');
  const walletId = requireArg(args, 'wallet-id');
  const inputType = requireArg(args, 'input-type');
  const outputType = requireArg(args, 'output-type');
  const tokenId = requireArg(args, 'token-id');

  return envelope('AGENT_MANIFEST', agentId, {
    agentId,
    agentType: String(args['agent-type'] || 'WORKER'),
    inputType,
    outputType,
    description: String(args.description || 'External agent capability manifest'),
    pricePerTask: String(args['price-per-task'] || '0'),
    tokenId,
    walletId,
    version: Number(args.version || 1)
  });
}

async function verifyState(args, options = {}) {
  const { setExitCode = true, silent = false } = options;
  const topicId = String(args.topic || process.env.HCS_REGISTRY_TOPIC || '');
  const agentId = requireArg(args, 'agent-id');
  const mirror = String(process.env.MIRROR_NODE_URL || DEFAULT_MIRROR).replace(/\/$/, '');
  const url = `${mirror}/api/v1/topics/${topicId}/messages?limit=200&order=desc`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mirror query failed (${res.status})`);
  }

  const data = await res.json();
  const rows = (data.messages || []).map((m) => {
    let decoded;
    try {
      decoded = JSON.parse(Buffer.from(String(m.message || ''), 'base64').toString('utf8'));
    } catch (_) {
      decoded = null;
    }
    return {
      seq: Number(m.sequence_number || 0),
      type: decoded && decoded.messageType,
      agentId: decoded && decoded.payload && decoded.payload.agentId
    };
  }).filter((r) => r.agentId === agentId);

  const uniqueTypes = new Set(rows.map((r) => r.type));
  const ok = uniqueTypes.has('AGENT_REGISTER')
    && uniqueTypes.has('AGENT_CLAIMED')
    && uniqueTypes.has('AGENT_HEARTBEAT')
    && uniqueTypes.has('AGENT_MANIFEST');

  const result = {
    agentId,
    foundEvents: rows,
    hasAllRequired: ok
  };

  if (!silent) {
    console.log(JSON.stringify(result, null, 2));
  }

  if (!ok && setExitCode) {
    process.exitCode = 2;
  }

  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ask(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(String(answer || '').trim());
    });
  });
}

async function fillMissingArgsInteractively(args) {
  const prompts = [
    ['agent-id', 'Agent ID (e.g. liquidity-02): '],
    ['wallet-id', 'Wallet ID (e.g. 0.0.700002): '],
    ['token-id', 'PIPE token ID (e.g. 0.0.123456): '],
    ['input-type', 'Input type (e.g. TokenId): '],
    ['output-type', 'Output type (e.g. LiquidityReport): '],
    ['price-per-task', 'Price per task (e.g. 0.002): '],
    ['owner-id', 'Owner ID (e.g. owner-123): ']
  ];

  for (const [key, label] of prompts) {
    if (args[key]) continue;
    args[key] = await ask(label);
  }

  if (!args['ttl-sec']) {
    args['ttl-sec'] = '600';
  }
}

async function ensureRequiredArgs(args, keys) {
  const labelByKey = {
    'agent-id': 'Agent ID (e.g. liquidity-02): ',
    'wallet-id': 'Wallet ID (e.g. 0.0.700002): ',
    'token-id': 'PIPE token ID (e.g. 0.0.123456): ',
    'input-type': 'Input type (e.g. TokenId): ',
    'output-type': 'Output type (e.g. LiquidityReport): ',
    'price-per-task': 'Price per task (e.g. 0.002): ',
    'owner-id': 'Owner ID (e.g. owner-123): ',
    'ttl-sec': 'Heartbeat ttl seconds (default 600): '
  };

  for (const key of keys) {
    if (args[key]) continue;
    const label = labelByKey[key] || `${key}: `;
    const value = await ask(label);
    if (value) {
      args[key] = value;
    }
  }

  if (!args['ttl-sec']) {
    args['ttl-sec'] = '600';
  }
}

async function publishAndLog(topicId, message, args) {
  if (args['dry-run']) {
    console.log(`[DryRun] ${message.messageType}`);
    console.log(JSON.stringify(message, null, 2));
    return { txId: 'dry-run', seq: -1 };
  }

  const out = await publish(topicId, message);
  console.log(`[Published] ${message.messageType} seq=${out.seq} tx=${out.txId}`);
  return out;
}

async function runOnboard(args) {
  const topicId = String(args.topic || process.env.HCS_REGISTRY_TOPIC || '');
  const reg = registerMessage(args);
  const claim = claimMessage(args);
  const hb = heartbeatMessage(args);
  const manifest = manifestMessage(args);

  await publishAndLog(topicId, reg, args);
  await publishAndLog(topicId, claim, args);
  await publishAndLog(topicId, hb, args);
  await publishAndLog(topicId, manifest, args);

  if (!args['dry-run']) {
    const verifyTimeoutSec = Number(args['verify-timeout-sec'] || 45);
    const verifyPollMs = Number(args['verify-poll-ms'] || 3000);
    const deadline = Date.now() + (verifyTimeoutSec * 1000);

    let lastResult = null;
    while (Date.now() < deadline) {
      lastResult = await verifyState(args, { setExitCode: false, silent: true });
      if (lastResult.hasAllRequired) {
        console.log('[Verify] All required lifecycle events are indexed on Mirror Node.');
        await verifyState(args, { setExitCode: false, silent: false });
        return;
      }
      await sleep(verifyPollMs);
    }

    console.error(`[Verify] Timed out after ${verifyTimeoutSec}s waiting for all lifecycle events to appear on Mirror Node.`);
    if (lastResult) {
      console.log(JSON.stringify(lastResult, null, 2));
    }
    process.exitCode = 2;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || args.help) {
    usage();
    return;
  }

  if (command === 'env-example') {
    envExample();
    return;
  }

  if (command === 'doctor') {
    await runDoctor();
    return;
  }

  if (command === 'step-by-step') {
    await fillMissingArgsInteractively(args);
    await runOnboard(args);
    return;
  }

  const topicId = String(args.topic || process.env.HCS_REGISTRY_TOPIC || '');

  if (command === 'register') {
    await ensureRequiredArgs(args, ['agent-id', 'wallet-id', 'token-id', 'input-type', 'output-type']);
    await publishAndLog(topicId, registerMessage(args), args);
    return;
  }
  if (command === 'claim') {
    await ensureRequiredArgs(args, ['agent-id', 'wallet-id', 'owner-id']);
    await publishAndLog(topicId, claimMessage(args), args);
    return;
  }
  if (command === 'heartbeat') {
    await ensureRequiredArgs(args, ['agent-id', 'wallet-id', 'ttl-sec']);
    await publishAndLog(topicId, heartbeatMessage(args), args);
    return;
  }
  if (command === 'manifest') {
    await ensureRequiredArgs(args, ['agent-id', 'wallet-id', 'token-id', 'input-type', 'output-type']);
    await publishAndLog(topicId, manifestMessage(args), args);
    return;
  }
  if (command === 'verify') {
    await verifyState(args);
    return;
  }
  if (command === 'onboard') {
    await ensureRequiredArgs(args, [
      'agent-id',
      'wallet-id',
      'token-id',
      'input-type',
      'output-type',
      'price-per-task',
      'owner-id',
      'ttl-sec'
    ]);
    await runOnboard(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((err) => {
  console.error(err.message);
  usage();
  process.exit(1);
});
