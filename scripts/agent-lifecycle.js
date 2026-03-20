require('dotenv').config();

const { randomUUID } = require('crypto');
const { publishToHCS } = require('../agents/shared/scripts/hcs-publish');

function nowIso() {
  return new Date().toISOString();
}

function plusSecondsIso(seconds) {
  return new Date(Date.now() + (Number(seconds) * 1000)).toISOString();
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function required(args, key) {
  const value = args[key];
  if (!value) {
    throw new Error(`Missing required argument --${key}`);
  }
  return value;
}

function toEnvelope(messageType, senderId, payload) {
  return {
    ucpVersion: '1.0',
    messageType,
    senderId,
    timestamp: nowIso(),
    payload
  };
}

function buildRegister(args) {
  const agentId = required(args, 'agent-id');
  const walletId = required(args, 'wallet-id');
  const inputType = required(args, 'input-type');
  const outputType = required(args, 'output-type');
  const tokenId = required(args, 'token-id');
  const pricePerTask = args['price-per-task'] || '0';
  const agentType = args['agent-type'] || 'WORKER';
  const version = Number(args.version || 1);
  const ttlSec = Number(args['ttl-sec'] || 600);
  const nonce = args.nonce || `nonce-${randomUUID()}`;

  return toEnvelope('AGENT_REGISTER', agentId, {
    agentId,
    name: args.name || agentId,
    description: args.description || 'External agent registration',
    walletId,
    tokenId,
    agentType,
    inputType,
    outputType,
    pricePerTask,
    version,
    challenge: {
      nonce,
      issuedAt: nowIso(),
      expiresAt: plusSecondsIso(ttlSec)
    },
    ownershipProof: {
      algorithm: args.algorithm || 'ed25519',
      signature: args.signature || 'REQUIRED_FOR_PRODUCTION'
    },
    claim: {
      status: 'pending_claim',
      claimRef: args['claim-ref'] || `claim-${agentId}`
    }
  });
}

function buildClaimed(args) {
  const agentId = required(args, 'agent-id');
  const walletId = required(args, 'wallet-id');
  const senderId = args['sender-id'] || 'registry-admin-01';

  return toEnvelope('AGENT_CLAIMED', senderId, {
    agentId,
    walletId,
    claimRef: args['claim-ref'] || `claim-${agentId}`,
    claimedBy: {
      ownerId: args['owner-id'] || 'owner-unknown',
      verificationMethod: args['verification-method'] || 'wallet-signature'
    },
    status: 'claimed',
    claimedAt: nowIso()
  });
}

function buildHeartbeat(args) {
  const agentId = required(args, 'agent-id');
  const walletId = required(args, 'wallet-id');
  const ttlSec = Number(args['ttl-sec'] || 600);

  return toEnvelope('AGENT_HEARTBEAT', agentId, {
    agentId,
    walletId,
    status: args.status || 'active',
    lease: {
      ttlSec,
      activeUntil: plusSecondsIso(ttlSec)
    },
    runtime: {
      version: args['runtime-version'] || '0.1.0',
      network: args.network || 'hedera-testnet'
    }
  });
}

function buildRevoked(args) {
  const agentId = required(args, 'agent-id');
  const walletId = required(args, 'wallet-id');
  const senderId = args['sender-id'] || 'registry-admin-01';

  return toEnvelope('AGENT_REVOKED', senderId, {
    agentId,
    walletId,
    status: 'revoked',
    reason: args.reason || 'manual-revocation',
    effectiveAt: nowIso()
  });
}

function buildMessage(args) {
  const action = required(args, 'action');
  if (action === 'register') return buildRegister(args);
  if (action === 'claimed') return buildClaimed(args);
  if (action === 'heartbeat') return buildHeartbeat(args);
  if (action === 'revoked') return buildRevoked(args);
  throw new Error('Invalid --action. Use register|claimed|heartbeat|revoked');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const topicId = args.topic || process.env.HCS_REGISTRY_TOPIC;
  if (!topicId) {
    throw new Error('Missing --topic and HCS_REGISTRY_TOPIC is not set');
  }

  const message = buildMessage(args);
  await publishToHCS(topicId, message);
  console.log(`[Lifecycle] Published ${message.messageType} for ${message.payload.agentId}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err.message);
      console.error('Usage: node scripts/agent-lifecycle.js --action register|claimed|heartbeat|revoked --agent-id AGENT --wallet-id 0.0.X [options]');
      process.exit(1);
    });
}

module.exports = {
  buildMessage
};