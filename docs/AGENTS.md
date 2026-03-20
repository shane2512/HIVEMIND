# HIVE MIND — Agent Specifications

All agents are OpenClaw agents using the Hedera Agent Kit for wallet management and Hedera service interactions.

---

## Agent Overview

| Agent | Type | Input Type | Output Type | PIPE Fee |
|---|---|---|---|---|
| Watcher Agent | Trigger | HTS Event Stream | TaskBundle | 0.001 (detection fee) |
| Plumber Agent | Coordinator | All Manifests + TaskBundle | PipelineBlueprint | 8% routing fee |
| Wallet Analyst | Worker | WalletAddress | WalletHistory | 0.002 |
| Sentiment Agent | Worker | TokenId | SentimentScore | 0.002 |
| Liquidity Agent | Worker | TokenId | LiquidityReport | 0.002 |
| Risk Scorer | Worker | WalletHistory + SentimentScore + LiquidityReport | RiskScore | 0.004 |
| Report Publisher | Worker | RiskScore + AllInputs | HCSPublication | 0.002 |

---

## UCP Manifest Schema

Every agent publishes this manifest to the HCS `REGISTRY_TOPIC` on startup.

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "string — unique identifier eg. wallet-analyst-01",
  "agentType": "WATCHER | COORDINATOR | WORKER",
  "inputType": "string — type name of accepted input",
  "outputType": "string — type name of produced output",
  "description": "string — natural language description for tiebreaking",
  "pricePerTask": "string — PIPE amount with 6 decimal precision",
  "tokenId": "string — PIPE HTS token ID eg. 0.0.XXXXX",
  "walletId": "string — agent Hedera account ID eg. 0.0.XXXXX",
  "version": "integer — manifest version, increment on update",
  "timestamp": "ISO8601 timestamp"
}
```

---

## External Agent Registration Lifecycle

Third-party agents SHOULD use a lifecycle flow before they are considered schedulable by Plumber.

### Step 1 - Register

Publish `AGENT_REGISTER` to `REGISTRY_TOPIC` with identity and ownership proof fields.

### Step 2 - Human Claim

A claim service or owner workflow publishes `AGENT_CLAIMED` when a human owner verifies control of the agent wallet.

### Step 3 - Capability Publish

After claim, publish `AGENT_MANIFEST` with capability, price, and version details.

### Step 4 - Heartbeat Lease

Publish `AGENT_HEARTBEAT` at a regular interval (example: every 5 minutes, ttlSec 600).

### Step 5 - Revocation

If compromised, inactive, or policy-violating, publish `AGENT_REVOKED`.

### Scheduler Eligibility Rules (Plumber)

An agent is eligible only when all conditions pass:

1. Latest claim state is `claimed`
2. Latest status is not revoked
3. `activeUntil` from latest heartbeat is still in the future
4. Manifest version is current for the same `agentId`

This protects the network from spoofed identities, stale agents, and zombie manifests.

---

## Agent 1 — Watcher Agent

### Purpose
Monitors the Hedera blockchain for new HTS token creations. When a qualifying token is detected, autonomously posts a TaskBundle to the HCS task topic.

### How It Works

```
1. Subscribe to Hedera Mirror Node token creation events
   (poll https://testnet.mirrornode.hedera.com/api/v1/tokens every 5 seconds)

2. For each new token, evaluate:
   - Creator wallet age > 24 hours
   - Token not previously seen (dedup store)
   - If WATCHER_MIN_LIQUIDITY check passes

3. If qualifying:
   - Build TaskBundle (UCP format)
   - Publish to HCS TASK_TOPIC
   - Log detection to console
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "watcher-01",
  "agentType": "WATCHER",
  "inputType": "HTSEventStream",
  "outputType": "TaskBundle",
  "description": "Monitors Hedera Token Service for new token creations and evaluates them for analysis worthiness",
  "pricePerTask": "0.001",
  "version": 1
}
```

### Output — TaskBundle

```json
{
  "ucpVersion": "1.0",
  "messageType": "TASK_BUNDLE",
  "taskId": "task-{uuid}",
  "triggeredBy": "watcher-01",
  "triggerType": "HTS_TOKEN_CREATED",
  "triggerData": {
    "tokenId": "0.0.XXXXX",
    "tokenName": "string",
    "tokenSymbol": "string",
    "creatorWallet": "0.0.XXXXX",
    "createdAt": "ISO8601"
  },
  "requiredInputType": "WalletAddress+TokenId",
  "requiredOutputType": "HCSPublication",
  "maxBudget": "0.020",
  "timestamp": "ISO8601"
}
```

**Resources**
- [Mirror Node Token List API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#tokens)

---

## Agent 2 — Plumber Agent

### Purpose
Reads all agent manifests from the HCS registry and auto-assembles valid processing pipelines. The most novel component in HIVE MIND.

### How It Works

```
1. Subscribe to HCS REGISTRY_TOPIC
   - On each new manifest: add agent to I/O type graph
   - Edge: inputType → agent → outputType

2. Subscribe to HCS TASK_TOPIC
   - On TaskBundle: run pipeline assembly

3. Pipeline Assembly (BFS on type graph):
   - Start from triggerData types
   - Find all paths to requiredOutputType
   - Filter: no cycles, all agents available
   - Select: lowest total pricePerTask sum
   - If tie: use agent description similarity as tiebreaker

4. Publish PipelineBlueprint to HCS TASK_TOPIC

5. On pipeline completion:
   - Record in completions map
   - After 10 completions: mint Pipeline NFT via HTS
   - Earn routing fee from PipeEscrow
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "plumber-01",
  "agentType": "COORDINATOR",
  "inputType": "AgentManifest+TaskBundle",
  "outputType": "PipelineBlueprint",
  "description": "Reads agent capability manifests and assembles optimal processing pipelines based on input/output type compatibility",
  "pricePerTask": "0",
  "routingFeePercent": "8",
  "version": 1
}
```

### Output — PipelineBlueprint

```json
{
  "ucpVersion": "1.0",
  "messageType": "PIPELINE_BLUEPRINT",
  "pipelineId": "pipeline-{uuid}",
  "taskId": "task-{uuid}",
  "assembledBy": "plumber-01",
  "stages": [
    {
      "stageIndex": 0,
      "agentId": "wallet-analyst-01",
      "inputType": "WalletAddress",
      "outputType": "WalletHistory",
      "fee": "0.002",
      "parallel": true
    },
    {
      "stageIndex": 0,
      "agentId": "sentiment-01",
      "inputType": "TokenId",
      "outputType": "SentimentScore",
      "fee": "0.002",
      "parallel": true
    },
    {
      "stageIndex": 0,
      "agentId": "liquidity-01",
      "inputType": "TokenId",
      "outputType": "LiquidityReport",
      "fee": "0.002",
      "parallel": true
    },
    {
      "stageIndex": 1,
      "agentId": "risk-scorer-01",
      "inputType": "WalletHistory+SentimentScore+LiquidityReport",
      "outputType": "RiskScore",
      "fee": "0.004",
      "parallel": false,
      "dependsOn": [0]
    },
    {
      "stageIndex": 2,
      "agentId": "report-publisher-01",
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
  "timestamp": "ISO8601"
}
```

---

## Agent 3 — Wallet Analyst Agent

### Purpose
Fetches and analyses the full transaction history of the token's creator wallet on Hedera.

### How It Works

```
1. Subscribe to HCS TASK_TOPIC
   - Filter: pipelineId assigned to this agent, inputType = "WalletAddress"

2. Query Mirror Node for wallet history:
   - Account info (age, type, balance)
   - All transactions (count, types, HBAR flow)
   - Previous token creations from this wallet
   - Any association with known suspicious patterns

3. Compute WalletHistory object

4. Publish output hash to HCS ATTESTATION_TOPIC
   (hash = SHA256(JSON.stringify(walletHistory)))

5. Receive PIPE payment from PipeEscrow
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "wallet-analyst-01",
  "agentType": "WORKER",
  "inputType": "WalletAddress",
  "outputType": "WalletHistory",
  "description": "Fetches complete Hedera account transaction history and computes wallet age, activity patterns, and previous token creation behaviour",
  "pricePerTask": "0.002",
  "version": 1
}
```

### Output — WalletHistory

```json
{
  "walletId": "0.0.XXXXX",
  "accountAgeHours": 720,
  "totalTransactions": 145,
  "hbarNetFlow": 500.5,
  "previousTokenCreations": 2,
  "suspiciousPatterns": false,
  "activityScore": 65
}
```

**Resources**
- [Mirror Node Accounts API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#accounts)
- [Mirror Node Transactions API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#transactions)

---

## Agent 4 — HCS Sentiment Agent

### Purpose
Scans all HCS topics on Hedera for mentions of the token ID and computes a sentiment signal.

### How It Works

```
1. Subscribe to HCS TASK_TOPIC
   - Filter: assigned agent, inputType = "TokenId"

2. Query Mirror Node for HCS message history containing tokenId string

3. Compute SentimentScore:
   - Mention count
   - First/last mention time (recency)
   - Number of distinct topics mentioning it
   - Positive vs neutral vs negative keyword ratio (simple scoring)

4. Publish output hash to HCS ATTESTATION_TOPIC

5. Receive PIPE payment from PipeEscrow
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "sentiment-01",
  "agentType": "WORKER",
  "inputType": "TokenId",
  "outputType": "SentimentScore",
  "description": "Scans Hedera Consensus Service topics for token mentions and computes a community sentiment signal from HCS message activity",
  "pricePerTask": "0.002",
  "version": 1
}
```

### Output — SentimentScore

```json
{
  "tokenId": "0.0.XXXXX",
  "mentionCount": 12,
  "distinctTopics": 3,
  "firstMentionHoursAgo": 2.5,
  "sentimentLabel": "NEUTRAL",
  "sentimentScore": 50,
  "dataQuality": "LOW"
}
```

**Resources**
- [Mirror Node Topics Messages API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics)

---

## Agent 5 — Liquidity Agent

### Purpose
Analyses the token's supply distribution, holder count, and transfer velocity on HTS.

### How It Works

```
1. Subscribe to HCS TASK_TOPIC
   - Filter: assigned agent, inputType = "TokenId"

2. Query Mirror Node for HTS token data:
   - Token info (supply, decimals, treasury)
   - Token balances (holder distribution)
   - Token transfers (velocity, concentration)

3. Compute LiquidityReport

4. Publish output hash to HCS ATTESTATION_TOPIC

5. Receive PIPE payment from PipeEscrow
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "liquidity-01",
  "agentType": "WORKER",
  "inputType": "TokenId",
  "outputType": "LiquidityReport",
  "description": "Analyses Hedera Token Service data to compute holder distribution, transfer velocity, and supply concentration metrics",
  "pricePerTask": "0.002",
  "version": 1
}
```

### Output — LiquidityReport

```json
{
  "tokenId": "0.0.XXXXX",
  "totalSupply": "1000000",
  "holderCount": 3,
  "top1HolderPercent": 95.0,
  "transferCount24h": 2,
  "concentrationRisk": "HIGH",
  "liquidityScore": 20
}
```

**Resources**
- [Mirror Node Token Info API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#tokens)
- [Mirror Node Token Balances API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#balances)

---

## Agent 6 — Risk Scorer Agent

### Purpose
Waits for all three parallel agents to complete, reads their outputs from HCS, and computes a combined weighted risk score.

### How It Works

```
1. Subscribe to HCS ATTESTATION_TOPIC
   - Wait for all 3 upstream attestations for this pipelineId

2. Read WalletHistory, SentimentScore, LiquidityReport from HCS TASK_TOPIC

3. Compute weighted risk score:
   - Wallet score:    weight 40%
   - Liquidity score: weight 40%
   - Sentiment score: weight 20%
   - Final score: 0 (safe) to 100 (high risk)

4. Publish output hash to HCS ATTESTATION_TOPIC

5. Receive PIPE payment from PipeEscrow
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "risk-scorer-01",
  "agentType": "WORKER",
  "inputType": "WalletHistory+SentimentScore+LiquidityReport",
  "outputType": "RiskScore",
  "description": "Combines wallet history, HCS sentiment, and liquidity data into a weighted composite risk score for a Hedera token",
  "pricePerTask": "0.004",
  "version": 1
}
```

### Output — RiskScore

```json
{
  "tokenId": "0.0.XXXXX",
  "pipelineId": "pipeline-{uuid}",
  "riskScore": 78,
  "riskLabel": "HIGH",
  "components": {
    "walletRisk": 65,
    "liquidityRisk": 90,
    "sentimentRisk": 50
  },
  "recommendation": "CAUTION"
}
```

---

## Agent 7 — Report Publisher Agent

### Purpose
Formats the final intelligence report from all pipeline outputs and publishes it to the HCS report topic where other agents can subscribe and consume it.

### How It Works

```
1. Subscribe to HCS ATTESTATION_TOPIC
   - Wait for Risk Scorer attestation for this pipelineId

2. Read all upstream outputs from HCS

3. Format full HiveReport object

4. Publish HiveReport to HCS REPORT_TOPIC

5. Publish final attestation to HCS ATTESTATION_TOPIC

6. PipeEscrow settles all remaining payments

7. Plumber receives routing fee
```

### Manifest

```json
{
  "ucpVersion": "1.0",
  "messageType": "AGENT_MANIFEST",
  "agentId": "report-publisher-01",
  "agentType": "WORKER",
  "inputType": "RiskScore+AllInputs",
  "outputType": "HCSPublication",
  "description": "Composes a structured intelligence report from all pipeline outputs and publishes it to the Hedera Consensus Service for downstream agent consumption",
  "pricePerTask": "0.002",
  "version": 1
}
```

### Output — HiveReport (published to HCS REPORT_TOPIC)

```json
{
  "ucpVersion": "1.0",
  "messageType": "HIVE_REPORT",
  "reportId": "report-{uuid}",
  "pipelineId": "pipeline-{uuid}",
  "tokenId": "0.0.XXXXX",
  "tokenName": "string",
  "generatedAt": "ISO8601",
  "riskScore": 78,
  "riskLabel": "HIGH",
  "summary": "Token created by a 3-day-old wallet with no prior history. 95% supply held by treasury. Minimal HCS community activity.",
  "components": {
    "walletAnalysis": { ... },
    "sentimentAnalysis": { ... },
    "liquidityAnalysis": { ... }
  },
  "pipelineCost": "0.013",
  "attestationTopicId": "0.0.XXXXX",
  "accessFee": "0.001"
}
```

---

## Official Resources

- [Hedera JS SDK](https://github.com/hashgraph/hedera-sdk-js)
- [Hedera Agent Kit](https://github.com/hedera-dev/hedera-agent-kit)
- [OpenClaw Agent Framework](https://openclaw.ai/docs)
- [Mirror Node REST API Reference](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [HashScan Testnet Explorer](https://hashscan.io/testnet)
