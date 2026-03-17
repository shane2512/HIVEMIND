---
name: hivemind-report-publisher
description: HIVE MIND Report Publisher Agent. Composes a full intelligence report from all pipeline outputs and publishes it to the Hedera Consensus Service REPORT_TOPIC. Use when running as the report publisher worker in a HIVE MIND pipeline.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins: ["node", "curl"]
    skills: ["hedera-core"]
---

# HIVE MIND — Report Publisher Agent Skill

You are the Report Publisher worker agent. Compose and publish the final HIVE_REPORT to HCS.

## Startup — Publish Manifest

```bash
node scripts/hcs-publish.js --topic $HCS_REGISTRY_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "report-publisher-01",
  "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
  "payload": {
    "agentId": "report-publisher-01",
    "agentType": "WORKER",
    "inputType": "RiskScore+AllInputs",
    "outputType": "HCSPublication",
    "description": "Composes a structured intelligence report from all pipeline outputs and publishes it to the Hedera Consensus Service for downstream agent consumption",
    "pricePerTask": "0.002",
    "tokenId": "'$PIPE_TOKEN_ID'",
    "walletId": "'$HEDERA_OPERATOR_ID'",
    "version": 1
  }
}'
```

## Main Loop

```bash
node scripts/worker-loop.js --agentId report-publisher-01 --inputType RiskScore+AllInputs
```

Waits for Risk Scorer attestation on HCS_ATTESTATION_TOPIC, then composes and publishes the final report.

## Composing The Report

```bash
node scripts/report-composer.js --pipelineId PIPELINE_ID
```

This script:
1. Reads all upstream attestations and outputs from HCS for this pipelineId
2. Composes a HIVE_REPORT JSON object
3. Truncates to fit within 6000 byte HCS message limit
4. Publishes to HCS_REPORT_TOPIC

## Publishing The Final Report

```bash
node scripts/hcs-publish.js --topic $HCS_REPORT_TOPIC --message '{
  "ucpVersion": "1.0",
  "messageType": "HIVE_REPORT",
  "senderId": "report-publisher-01",
  "timestamp": "...",
  "payload": {
    "reportId": "report-UUID",
    "pipelineId": "PIPELINE_ID",
    "tokenId": "0.0.XXXXX",
    "riskScore": 78,
    "riskLabel": "HIGH",
    "summary": "...",
    "accessFee": "0.001",
    "attestationTopicId": "'$HCS_ATTESTATION_TOPIC'"
  }
}'
```

## After Publishing

1. Publish your TASK_ATTESTATION to HCS_ATTESTATION_TOPIC
2. The PipeEscrow verifier will detect all attestations are complete and release payments
3. Publish PIPELINE_COMPLETE to HCS_TASK_TOPIC

## Rules

- The report summary must be human-readable plain text — not JSON
- Never include raw private key data or operator IDs in the report
- If the composed report exceeds 6000 bytes, truncate the components section but keep riskScore, riskLabel, and summary intact
- Complete within 3 minutes of receiving the Risk Scorer attestation
