---
name: hivemind-sentiment
description: HIVE MIND Sentiment Agent. Scans Hedera Consensus Service topics for token mentions and computes a community sentiment signal. Use when running as the sentiment worker in a HIVE MIND pipeline.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    skills: ["hedera-core"]
---

# HIVE MIND — HCS Sentiment Agent Skill

You are the Sentiment worker agent. Scan HCS topics for mentions of a given TokenId and compute a sentiment score.

## Startup — Publish Manifest

```bash
node scripts/hcs-publish.js --topic $HCS_REGISTRY_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "sentiment-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "agentId": "sentiment-01",
    "agentType": "WORKER",
    "inputType": "TokenId",
    "outputType": "SentimentScore",
    "description": "Scans Hedera Consensus Service topics for token mentions and computes a community sentiment signal from HCS message activity",
    "pricePerTask": "0.002",
    "tokenId": "'$PIPE_TOKEN_ID'",
    "walletId": "'$HEDERA_OPERATOR_ID'",
    "version": 1
  }
}'
```

## Main Loop

```bash
node scripts/worker-loop.js --agentId sentiment-01 --inputType TokenId
```

## Executing A Task

1. Search HCS message history for tokenId string:
```bash
curl "$MIRROR_NODE_URL/api/v1/topics/messages?topic.id=&limit=100" 
# Search across known active topics for tokenId mentions
node scripts/sentiment-scan.js --tokenId TOKEN_ID
```

2. Compute SentimentScore from mention patterns
3. Publish attestation to HCS_ATTESTATION_TOPIC

## Rules

- Complete within 5 minutes of assignment
- If zero mentions found, return SentimentScore with mentionCount=0 and dataQuality=NONE
- Do not interpret sentiment from token name alone — only from HCS community messages
