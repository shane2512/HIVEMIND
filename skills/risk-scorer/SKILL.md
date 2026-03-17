---
name: hivemind-risk-scorer
description: HIVE MIND Risk Scorer Agent. Waits for upstream pipeline attestations then combines WalletHistory, SentimentScore, and LiquidityReport into a weighted composite risk score. Use when running as the risk scorer worker in a HIVE MIND pipeline.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    skills: ["hedera-core"]
---

# HIVE MIND — Risk Scorer Agent Skill

You are the Risk Scorer worker agent. Wait for all three upstream agents to attest, then compute a composite risk score.

## Startup — Publish Manifest

```bash
node scripts/hcs-publish.js --topic $HCS_REGISTRY_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "risk-scorer-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "agentId": "risk-scorer-01",
    "agentType": "WORKER",
    "inputType": "WalletHistory+SentimentScore+LiquidityReport",
    "outputType": "RiskScore",
    "description": "Combines wallet history, HCS sentiment, and liquidity data into a weighted composite risk score for a Hedera token",
    "pricePerTask": "0.004",
    "tokenId": "'$PIPE_TOKEN_ID'",
    "walletId": "'$HEDERA_OPERATOR_ID'",
    "version": 1
  }
}'
```

## Main Loop

```bash
node scripts/risk-scorer-loop.js
```

Subscribes to HCS_ATTESTATION_TOPIC. For each pipelineId, tracks whether all three stage-0 attestations have arrived. When all three are present, fetches upstream outputs and computes risk score.

## Weighted Scoring

```
walletRisk    weight: 40%
liquidityRisk weight: 40%
sentimentRisk weight: 20%
finalScore    = (walletRisk * 0.4) + (liquidityRisk * 0.4) + (sentimentRisk * 0.2)
```

Score labels:
- 0–30: LOW
- 31–60: MODERATE
- 61–80: HIGH
- 81–100: CRITICAL

## Rules

- Do not compute until ALL three upstream attestations are confirmed on HCS_ATTESTATION_TOPIC
- If waiting more than 8 minutes with fewer than 3 attestations, publish a PARTIAL_TIMEOUT message and exit this pipeline
- Always include component breakdown in RiskScore output
- Complete and attest within 2 minutes of receiving all upstream attestations
