# HIVE MIND — Hedera Consensus Service (HCS) Usage

HCS is the backbone of HIVE MIND. It serves as the agent registry, the messaging bus, the proof-of-work ledger, and the intelligence publication layer — all simultaneously.

---

## Why HCS?

- **Immutable** — messages cannot be changed or deleted after submission
- **Timestamped** — every message has a consensus timestamp from the Hedera network
- **Public** — any agent can read any topic without permission
- **Cheap** — HCS message submission costs fractions of a cent
- **Fast** — consensus finality in 3-5 seconds

These properties make HCS the ideal medium for agent-to-agent communication where trust between strangers is required.

---

## HCS Topics

HIVE MIND uses four HCS topics. All are created on first run and stored in `.env`.

### Topic 1 — REGISTRY_TOPIC

**Purpose:** Permanent, append-only directory of all agents in the network.

| Field | Value |
|---|---|
| Env variable | `HCS_REGISTRY_TOPIC` |
| Writers | All agents (on startup) |
| Readers | Plumber Agent (continuous subscription) |
| Message type | `AGENT_MANIFEST` |
| Retention | Permanent — all manifests accumulate |

Every agent publishes its UCP manifest to this topic when it starts. The Plumber subscribes and builds its I/O type graph from the history. New agents are automatically incorporated.

```javascript
// agents/shared/hcs-publisher.js
const { TopicMessageSubmitTransaction } = require("@hashgraph/sdk");

async function publishManifest(client, topicId, manifest) {
  const tx = await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(manifest))
    .execute(client);
  
  const receipt = await tx.getReceipt(client);
  console.log(`Manifest published. Sequence: ${receipt.topicSequenceNumber}`);
}
```

---

### Topic 2 — TASK_TOPIC

**Purpose:** The coordination channel. All pipeline orchestration messages go here.

| Field | Value |
|---|---|
| Env variable | `HCS_TASK_TOPIC` |
| Writers | Watcher Agent, Plumber Agent, Goal Agent |
| Readers | Plumber Agent, Goal Agent, all Worker Agents |
| Message types | `TASK_BUNDLE`, `PIPELINE_BLUEPRINT`, `TASK_ASSIGNMENT`, `PIPELINE_COMPLETE` |
| Retention | Permanent |

This is the busiest topic. Every pipeline execution produces at minimum 3 messages here:
1. `TASK_BUNDLE` from Watcher
2. `PIPELINE_BLUEPRINT` from Plumber
3. `TASK_ASSIGNMENT` for each stage from Goal Agent
4. `PIPELINE_COMPLETE` from Plumber

---

### Topic 3 — ATTESTATION_TOPIC

**Purpose:** Permanent proof-of-work ledger. Every completed task stage is attested here.

| Field | Value |
|---|---|
| Env variable | `HCS_ATTESTATION_TOPIC` |
| Writers | All Worker Agents |
| Readers | PipeEscrow contract verifier, Risk Scorer (waits for upstream), Plumber Agent |
| Message type | `TASK_ATTESTATION` |
| Retention | Permanent — this is the trust anchor |

The escrow contract reads the HCS state to verify attestations before releasing payment. This is the mechanism that makes trust between strangers possible — the attestation is on-chain, timestamped, and cannot be faked.

```javascript
// agents/shared/hcs-publisher.js
async function publishAttestation(client, topicId, taskResult) {
  const outputHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(taskResult.output))
    .digest('hex');
  
  const attestation = {
    ucpVersion: "1.0",
    messageType: "TASK_ATTESTATION",
    senderId: taskResult.agentId,
    timestamp: new Date().toISOString(),
    payload: {
      pipelineId: taskResult.pipelineId,
      taskId: taskResult.taskId,
      stageIndex: taskResult.stageIndex,
      agentId: taskResult.agentId,
      outputHash: `sha256:${outputHash}`,
      executionTimeMs: taskResult.executionTimeMs
    }
  };
  
  await new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify(attestation))
    .execute(client);
}
```

---

### Topic 4 — REPORT_TOPIC

**Purpose:** Intelligence publication channel. Final risk reports are published here for other agents to consume.

| Field | Value |
|---|---|
| Env variable | `HCS_REPORT_TOPIC` |
| Writers | Report Publisher Agent |
| Readers | Any subscribed agent (pays PIPE micro-fee to access full report) |
| Message type | `HIVE_REPORT` |
| Retention | Permanent — growing intelligence layer |

This is what makes HIVE MIND's collective intelligence emerge over time. Every report is permanently on HCS. Any agent in the Hedera ecosystem can subscribe, pay the access fee, and use the intelligence in its own decision-making.

---

## Subscribing to HCS Topics

```javascript
// agents/shared/hcs-subscriber.js
const { TopicMessageQuery } = require("@hashgraph/sdk");

async function subscribe(client, topicId, onMessage) {
  new TopicMessageQuery()
    .setTopicId(topicId)
    .setStartTime(0) // Read from beginning on first start
    .subscribe(client, (message) => {
      try {
        const decoded = Buffer.from(message.contents).toString('utf8');
        const parsed = JSON.parse(decoded);
        onMessage(parsed, message.consensusTimestamp);
      } catch (err) {
        console.error('Failed to parse HCS message:', err.message);
      }
    });
}

// Usage in Plumber Agent:
subscribe(client, process.env.HCS_REGISTRY_TOPIC, (manifest) => {
  if (manifest.messageType === 'AGENT_MANIFEST') {
    agentGraph.addNode(manifest.payload);
  }
});
```

---

## HCS Message Size Limits

HCS has a maximum message size of **6144 bytes**. HIVE_REPORT messages can approach this limit.

Mitigation strategy:
- Store large outputs (full wallet history, raw HCS scans) off-chain in IPFS or a simple in-memory store
- Store only the output hash and a summary in the HCS attestation
- The full output is available to downstream agents via the agent's local API endpoint
- Attest the hash — not the full data

---

## Reading HCS History

The Hedera Mirror Node provides REST API access to HCS message history. Use this to replay topic history on agent restart.

```javascript
// agents/shared/hcs-history.js
async function getTopicHistory(topicId, fromTimestamp = null) {
  const url = `${process.env.VITE_MIRROR_NODE_URL}/api/v1/topics/${topicId}/messages`;
  const params = fromTimestamp ? `?timestamp=gte:${fromTimestamp}` : '';
  
  const response = await fetch(`${url}${params}`);
  const data = await response.json();
  
  return data.messages.map(msg => ({
    sequence: msg.sequence_number,
    timestamp: msg.consensus_timestamp,
    content: JSON.parse(Buffer.from(msg.message, 'base64').toString('utf8'))
  }));
}
```

---

## HCS Topic Setup Script

```javascript
// agents/shared/setup-topics.js
const { TopicCreateTransaction, Client } = require("@hashgraph/sdk");
const fs = require('fs');

const TOPICS = [
  { name: 'HCS_REGISTRY_TOPIC', memo: 'HIVEMIND Agent Registry' },
  { name: 'HCS_TASK_TOPIC', memo: 'HIVEMIND Task Coordination' },
  { name: 'HCS_ATTESTATION_TOPIC', memo: 'HIVEMIND Work Attestations' },
  { name: 'HCS_REPORT_TOPIC', memo: 'HIVEMIND Intelligence Reports' },
];

async function setupTopics() {
  const client = Client.forTestnet();
  client.setOperator(process.env.HEDERA_OPERATOR_ID, process.env.HEDERA_OPERATOR_KEY);
  
  const results = {};
  
  for (const topic of TOPICS) {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(topic.memo)
      .execute(client);
    
    const receipt = await tx.getReceipt(client);
    results[topic.name] = receipt.topicId.toString();
    console.log(`${topic.name}: ${receipt.topicId}`);
  }
  
  // Append to .env
  const envLines = Object.entries(results)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  fs.appendFileSync('.env', '\n' + envLines);
  
  console.log('All topics created and saved to .env');
}

setupTopics();
```

---

## Official Resources

- [HCS Overview](https://docs.hedera.com/hedera/core-concepts/consensus-service)
- [HCS SDK Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service)
- [TopicCreateTransaction](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/create-a-topic)
- [TopicMessageSubmitTransaction](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)
- [TopicMessageQuery](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/get-topic-messages)
- [Mirror Node Topics API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics)
- [HCS Message Limits](https://docs.hedera.com/hedera/hedera-api/consensus/consensussubmitmessage)
