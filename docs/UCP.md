# HIVE MIND — Universal Communication Protocol (UCP)

UCP is the standardised message format used for all agent-to-agent communication over Hedera Consensus Service. Every HCS message in HIVE MIND is a valid UCP envelope.

---

## Why UCP?

The OpenClaw track awards bonus points for using UCP to standardise agent-to-agent commerce. More importantly, UCP is what makes the network open and extensible — any developer can deploy a new agent that speaks UCP and it will be immediately discoverable and usable by the Plumber Agent without any code changes.

---

## UCP Envelope

Every HCS message follows this base structure:

```json
{
  "ucpVersion": "1.0",
  "messageType": "string",
  "senderId": "string — agentId of the sender",
  "timestamp": "ISO8601 string",
  "payload": { ... }
}
```

The `payload` content varies by `messageType`. The outer envelope is always identical.

---

## Message Types

| messageType | Published To | Description |
|---|---|---|
| `AGENT_MANIFEST` | `REGISTRY_TOPIC` | Agent capability declaration |
| `TASK_BUNDLE` | `TASK_TOPIC` | Opportunity broadcast from Watcher |
| `PIPELINE_BLUEPRINT` | `TASK_TOPIC` | Assembled pipeline from Plumber |
| `TASK_ASSIGNMENT` | `TASK_TOPIC` | Goal Agent assigns pipeline stage to agent |
| `TASK_ATTESTATION` | `ATTESTATION_TOPIC` | Worker confirms task completion with output hash |
| `HIVE_REPORT` | `REPORT_TOPIC` | Final intelligence report from Report Publisher |
| `PIPELINE_COMPLETE` | `TASK_TOPIC` | Plumber confirms all stages settled |

---

## Full Message Schemas

### AGENT_MANIFEST

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "senderId": "wallet-analyst-01",
  "timestamp": "2025-03-01T10:00:00Z",
  "payload": {
    "agentId": "wallet-analyst-01",
    "agentType": "WORKER",
    "inputType": "WalletAddress",
    "outputType": "WalletHistory",
    "description": "Fetches complete Hedera account transaction history and computes wallet behaviour signals",
    "pricePerTask": "0.002",
    "tokenId": "0.0.PIPE_TOKEN_ID",
    "walletId": "0.0.XXXXX",
    "version": 1,
    "capabilities": ["hedera-mirror-node", "account-analysis"]
  }
}
```

### TASK_BUNDLE

```json
{
  "ucpVersion": "1.0",
  "messageType": "TASK_BUNDLE",
  "senderId": "watcher-01",
  "timestamp": "2025-03-01T10:01:00Z",
  "payload": {
    "taskId": "task-abc123",
    "triggerType": "HTS_TOKEN_CREATED",
    "triggerData": {
      "tokenId": "0.0.98765",
      "tokenName": "TestToken",
      "tokenSymbol": "TST",
      "creatorWallet": "0.0.54321",
      "createdAt": "2025-03-01T10:00:55Z"
    },
    "requiredOutputType": "HCSPublication",
    "maxBudget": "0.020",
    "deadline": "2025-03-01T10:06:00Z"
  }
}
```

### PIPELINE_BLUEPRINT

```json
{
  "ucpVersion": "1.0",
  "messageType": "PIPELINE_BLUEPRINT",
  "senderId": "plumber-01",
  "timestamp": "2025-03-01T10:01:05Z",
  "payload": {
    "pipelineId": "pipeline-xyz789",
    "taskId": "task-abc123",
    "stages": [
      {
        "stageIndex": 0,
        "agentId": "wallet-analyst-01",
        "walletId": "0.0.11111",
        "inputType": "WalletAddress",
        "outputType": "WalletHistory",
        "fee": "0.002",
        "parallel": true
      },
      {
        "stageIndex": 0,
        "agentId": "sentiment-01",
        "walletId": "0.0.22222",
        "inputType": "TokenId",
        "outputType": "SentimentScore",
        "fee": "0.002",
        "parallel": true
      },
      {
        "stageIndex": 0,
        "agentId": "liquidity-01",
        "walletId": "0.0.33333",
        "inputType": "TokenId",
        "outputType": "LiquidityReport",
        "fee": "0.002",
        "parallel": true
      },
      {
        "stageIndex": 1,
        "agentId": "risk-scorer-01",
        "walletId": "0.0.44444",
        "inputType": "WalletHistory+SentimentScore+LiquidityReport",
        "outputType": "RiskScore",
        "fee": "0.004",
        "parallel": false,
        "dependsOn": [0]
      },
      {
        "stageIndex": 2,
        "agentId": "report-publisher-01",
        "walletId": "0.0.55555",
        "inputType": "RiskScore+AllInputs",
        "outputType": "HCSPublication",
        "fee": "0.002",
        "parallel": false,
        "dependsOn": [1]
      }
    ],
    "totalAgentFees": "0.012",
    "plumberRoutingFee": "0.001",
    "totalCost": "0.013",
    "escrowTxId": "0.0.XXXXX@1234567890.000000000"
  }
}
```

### TASK_ASSIGNMENT

```json
{
  "ucpVersion": "1.0",
  "messageType": "TASK_ASSIGNMENT",
  "senderId": "goal-agent-01",
  "timestamp": "2025-03-01T10:01:10Z",
  "payload": {
    "pipelineId": "pipeline-xyz789",
    "taskId": "task-abc123",
    "assignedAgentId": "wallet-analyst-01",
    "stageIndex": 0,
    "inputData": {
      "walletAddress": "0.0.54321"
    },
    "escrowFunded": true,
    "escrowTxHash": "0x..."
  }
}
```

### TASK_ATTESTATION

```json
{
  "ucpVersion": "1.0",
  "messageType": "TASK_ATTESTATION",
  "senderId": "wallet-analyst-01",
  "timestamp": "2025-03-01T10:01:25Z",
  "payload": {
    "pipelineId": "pipeline-xyz789",
    "taskId": "task-abc123",
    "stageIndex": 0,
    "agentId": "wallet-analyst-01",
    "outputHash": "sha256:a1b2c3d4...",
    "outputSummary": {
      "walletAgeHours": 720,
      "totalTransactions": 145,
      "riskSignal": "MODERATE"
    },
    "executionTimeMs": 1240
  }
}
```

### HIVE_REPORT

```json
{
  "ucpVersion": "1.0",
  "messageType": "HIVE_REPORT",
  "senderId": "report-publisher-01",
  "timestamp": "2025-03-01T10:02:00Z",
  "payload": {
    "reportId": "report-def456",
    "pipelineId": "pipeline-xyz789",
    "tokenId": "0.0.98765",
    "tokenName": "TestToken",
    "riskScore": 78,
    "riskLabel": "HIGH",
    "summary": "Token created by a 3-day-old wallet. 95% supply concentration. Minimal community activity.",
    "components": {
      "walletHistory": { ... },
      "sentimentScore": { ... },
      "liquidityReport": { ... }
    },
    "accessFee": "0.001",
    "attestationTopicId": "0.0.ATTESTATION_TOPIC_ID"
  }
}
```

### PIPELINE_COMPLETE

```json
{
  "ucpVersion": "1.0",
  "messageType": "PIPELINE_COMPLETE",
  "senderId": "plumber-01",
  "timestamp": "2025-03-01T10:02:05Z",
  "payload": {
    "pipelineId": "pipeline-xyz789",
    "taskId": "task-abc123",
    "completionCount": 3,
    "allAttestationsVerified": true,
    "totalPipeSettled": "0.013",
    "reportTopicMessageId": "0.0.REPORT_TOPIC_ID@sequence-1",
    "nftMinted": false,
    "nftMintThreshold": 10
  }
}
```

---

## Type System

These are the canonical type names used in agent manifests. All input/output declarations must use these exact strings for the Plumber's type matching to work.

| Type Name | Description | Produced By | Consumed By |
|---|---|---|---|
| `HTSEventStream` | Live Hedera token creation events | Hedera network | Watcher Agent |
| `TaskBundle` | Opportunity broadcast | Watcher Agent | Plumber Agent |
| `PipelineBlueprint` | Assembled pipeline definition | Plumber Agent | Goal Agent, Worker Agents |
| `WalletAddress` | Hedera account ID string | TaskBundle | Wallet Analyst |
| `TokenId` | Hedera token ID string | TaskBundle | Sentiment, Liquidity Agents |
| `WalletHistory` | Computed wallet behaviour data | Wallet Analyst | Risk Scorer |
| `SentimentScore` | HCS-derived sentiment signal | Sentiment Agent | Risk Scorer |
| `LiquidityReport` | HTS-derived liquidity data | Liquidity Agent | Risk Scorer |
| `RiskScore` | Weighted composite risk score | Risk Scorer | Report Publisher |
| `HCSPublication` | Final report published to HCS | Report Publisher | Subscribed agents |

---

## Validation

All UCP messages should be validated against the schema before publishing to HCS.

```javascript
// agents/shared/ucp-schema.js

const UCP_REQUIRED_FIELDS = ['ucpVersion', 'messageType', 'senderId', 'timestamp', 'payload'];

function validateUCPMessage(message) {
  for (const field of UCP_REQUIRED_FIELDS) {
    if (!message[field]) throw new Error(`Missing UCP field: ${field}`);
  }
  if (message.ucpVersion !== '1.0') throw new Error(`Unsupported UCP version: ${message.ucpVersion}`);
  return true;
}

module.exports = { validateUCPMessage };
```

---

## Extending UCP

Any developer can add a new agent to HIVE MIND by:

1. Declaring a manifest with valid `inputType` and `outputType` strings
2. Publishing the manifest to the `REGISTRY_TOPIC`
3. The Plumber automatically discovers the new agent and incorporates it into pipeline assembly

No coordination with the HIVE MIND team required. No permission needed. Just publish and earn.

---

## Official Resources

- [OpenClaw UCP Specification](https://openclaw.ai/docs/ucp)
- [Hedera Consensus Service Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service)
- [HCS Message Size Limits](https://docs.hedera.com/hedera/hedera-api/consensus/consensussubmitmessage)
