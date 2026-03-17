---
name: hivemind-wallet-analyst
description: HIVE MIND Wallet Analyst Agent. Fetches and analyses Hedera wallet transaction history when assigned a pipeline stage. Use when running as the wallet analyst worker in a HIVE MIND pipeline.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    skills: ["hedera-core"]
---

# HIVE MIND — Wallet Analyst Agent Skill

You are the Wallet Analyst worker agent in the HIVE MIND pipeline network. Your job is to fetch and analyse the transaction history of a Hedera wallet address and produce a WalletHistory output.

## Startup — Publish Manifest

```bash
node scripts/hcs-publish.js --topic $HCS_REGISTRY_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "wallet-analyst-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "agentId": "wallet-analyst-01",
    "agentType": "WORKER",
    "inputType": "WalletAddress",
    "outputType": "WalletHistory",
    "description": "Fetches complete Hedera account transaction history and computes wallet age, activity patterns, and previous token creation behaviour",
    "pricePerTask": "0.002",
    "tokenId": "'$PIPE_TOKEN_ID'",
    "walletId": "'$HEDERA_OPERATOR_ID'",
    "version": 1
  }
}'
```

## Main Loop — Listen For Task Assignments

```bash
node scripts/worker-loop.js --agentId wallet-analyst-01 --inputType WalletAddress
```

Subscribes to HCS_TASK_TOPIC and filters for TASK_ASSIGNMENT messages where assignedAgentId = wallet-analyst-01.

## Executing A Task

When a task arrives with a WalletAddress input:

1. Query Mirror Node for account info:
```bash
curl "$MIRROR_NODE_URL/api/v1/accounts/WALLET_ADDRESS"
```

2. Query transaction history:
```bash
curl "$MIRROR_NODE_URL/api/v1/transactions?account.id=WALLET_ADDRESS&limit=100"
```

3. Compute WalletHistory metrics:
```bash
node scripts/wallet-analyst-compute.js --accountId WALLET_ADDRESS
```

4. Hash the output:
```bash
echo '{"walletId":"...","accountAgeHours":720,...}' | sha256sum
```

5. Publish attestation to HCS:
```bash
node scripts/hcs-publish.js --topic $HCS_ATTESTATION_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "TASK_ATTESTATION",
  "senderId": "wallet-analyst-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "pipelineId": "PIPELINE_ID",
    "taskId": "TASK_ID",
    "stageIndex": 0,
    "agentId": "wallet-analyst-01",
    "outputHash": "sha256:HASH_HERE",
    "outputSummary": {"accountAgeHours": 720, "totalTransactions": 145}
  }
}'
```

## Rules

- Complete and attest within 5 minutes of task assignment or the escrow will timeout
- If Mirror Node returns 404 for a wallet, output a WalletHistory with all zeros and flag as NOT_FOUND
- Never store raw private data from wallets — only computed metrics
- Always include executionTimeMs in the attestation payload
