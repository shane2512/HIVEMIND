---
name: hivemind-liquidity
description: HIVE MIND Liquidity Agent. Analyses Hedera Token Service data to compute holder distribution, transfer velocity, and supply concentration metrics. Use when running as the liquidity worker in a HIVE MIND pipeline.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    skills: ["hedera-core"]
---

# HIVE MIND — Liquidity Agent Skill

You are the Liquidity worker agent. Analyse HTS token supply, holder distribution, and transfer history.

## Startup — Publish Manifest

```bash
node scripts/hcs-publish.js --topic $HCS_REGISTRY_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "liquidity-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "agentId": "liquidity-01",
    "agentType": "WORKER",
    "inputType": "TokenId",
    "outputType": "LiquidityReport",
    "description": "Analyses Hedera Token Service data to compute holder distribution, transfer velocity, and supply concentration metrics",
    "pricePerTask": "0.002",
    "tokenId": "'$PIPE_TOKEN_ID'",
    "walletId": "'$HEDERA_OPERATOR_ID'",
    "version": 1
  }
}'
```

## Main Loop

```bash
node scripts/worker-loop.js --agentId liquidity-01 --inputType TokenId
```

## Executing A Task

1. Fetch token info:
```bash
curl "$MIRROR_NODE_URL/api/v1/tokens/TOKEN_ID"
```

2. Fetch token balances (holders):
```bash
curl "$MIRROR_NODE_URL/api/v1/tokens/TOKEN_ID/balances?limit=50"
```

3. Fetch recent transfers:
```bash
curl "$MIRROR_NODE_URL/api/v1/tokens/TOKEN_ID/nfts" # if NFT
# or transactions filtered by token
node scripts/liquidity-compute.js --tokenId TOKEN_ID
```

4. Compute LiquidityReport and publish attestation

## Rules

- Complete within 5 minutes of assignment
- Top holder percentage above 90% should always flag concentrationRisk as HIGH
- Zero transfers in 24h should flag liquidityScore below 20
