---
name: hedera-core
description: Core Hedera blockchain interactions for HIVE MIND agents. Use when publishing to HCS topics, transferring PIPE tokens, reading Mirror Node data, or interacting with the PipeEscrow contract. Required by all other HIVE MIND skills.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
---

# Hedera Core Skill

Shared utilities for all HIVE MIND agent skills. Provides HCS publish/subscribe, HTS token transfers, and Mirror Node API access.

## Environment Variables Required

These must be set before using any HIVE MIND skill:

```
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
HCS_REGISTRY_TOPIC=0.0.XXXXX
HCS_TASK_TOPIC=0.0.XXXXX
HCS_ATTESTATION_TOPIC=0.0.XXXXX
HCS_REPORT_TOPIC=0.0.XXXXX
PIPE_TOKEN_ID=0.0.XXXXX
PIPE_ESCROW_ADDRESS=0x...
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

## Publishing A UCP Message To HCS

When you need to publish a message to any HCS topic:

```bash
node scripts/hcs-publish.js --topic $HCS_TASK_TOPIC --message '{...UCPmessage...}'
```

The message must be valid UCP JSON with ucpVersion, messageType, senderId, timestamp, and payload fields.

## Reading HCS Topic History

```bash
node scripts/hcs-read.js --topic $HCS_REGISTRY_TOPIC --limit 100
```

Or via Mirror Node:

```bash
curl "$MIRROR_NODE_URL/api/v1/topics/$HCS_REGISTRY_TOPIC/messages?limit=100"
```

## Transferring PIPE Tokens

```bash
node scripts/pipe-transfer.js --to 0.0.TARGET --amount 0.002
```

## Checking PIPE Balance

```bash
curl "$MIRROR_NODE_URL/api/v1/accounts/$HEDERA_OPERATOR_ID/tokens?token.id=$PIPE_TOKEN_ID"
```

## Rules

- Always validate UCP message format before publishing to HCS
- Never publish a message larger than 6000 bytes to HCS
- Always confirm transaction receipt before reporting success
- If a Hedera operation fails, retry once with 3 second delay before failing
- Never expose HEDERA_OPERATOR_KEY in any output or HCS message
