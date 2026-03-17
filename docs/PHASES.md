# HIVE MIND — Build Phases

## Timeline Overview

Assumes a 3-week build window. Adjust start dates to your actual hackathon schedule.

```
Week 1: Foundation          — Contracts, HCS plumbing, shared agent scaffold
Week 2: Agent Logic         — All 6 agents working end-to-end
Week 3: Dashboard + Polish  — UI, demo prep, README, video
```

---

## Phase 0 — Setup (Day 1, 3 hours)

Everything needed before writing a single line of business logic.

### Understanding OpenClaw

OpenClaw is a locally-running AI assistant daemon. You extend it by writing **Skills** — a folder with a `SKILL.md` file that teaches the agent what to do. HIVE MIND provides 7 skills (one per agent role). Each skill instructs its OpenClaw instance to interact with Hedera via Node.js helper scripts.

OpenClaw is **free and open source**. It needs an LLM to run — use the Groq free tier.

### Tasks

- [ ] Create Hedera testnet account at [portal.hedera.com](https://portal.hedera.com)
- [ ] Get testnet HBAR from [faucet](https://portal.hedera.com/faucet) — request 1000 HBAR
- [ ] Get Groq free API key at [console.groq.com](https://console.groq.com) — for LLM inference
- [ ] Clone repo, install Node.js >= 18, install Docker
- [ ] Install OpenClaw globally: `npm install -g openclaw`
- [ ] Verify OpenClaw: `openclaw --version`
- [ ] Run `npm install` at root
- [ ] Copy `.env.example` to `.env` and fill in all credentials
- [ ] Verify Hedera connection: `node agents/shared/test-connection.js`
- [ ] Install Hedera JS SDK: `npm install @hashgraph/sdk`
- [ ] Install Hedera Agent Kit: `npm install @hedera-dev/hedera-agent-kit`
- [ ] Verify skills are valid: `openclaw skills list` from each agent workspace

### Verify

```bash
node agents/shared/test-connection.js
# Expected: Connected to Hedera testnet. Balance: XXXX HBAR
```

---

## Phase 1 — Hedera Infrastructure (Days 2–4)

Build all the on-chain primitives. Nothing agent-specific yet — just the plumbing.

### 1.1 — Create HCS Topics

Create the four HCS topics the network runs on. Store topic IDs in `.env`.

```javascript
// agents/shared/setup-topics.js
const { Client, TopicCreateTransaction } = require("@hashgraph/sdk");

// Creates: REGISTRY_TOPIC, TASK_TOPIC, ATTESTATION_TOPIC, REPORT_TOPIC
// Writes topic IDs to .env automatically
```

- [ ] Run `node agents/shared/setup-topics.js`
- [ ] Verify topics visible on [HashScan testnet](https://hashscan.io/testnet)
- [ ] Store topic IDs in `.env`

### 1.2 — Deploy PIPE Token (HTS)

Deploy the PIPE fungible token on Hedera Token Service.

```javascript
// contracts/deploy-pipe-token.js
const { TokenCreateTransaction, TokenType } = require("@hashgraph/sdk");

// Name: "PIPE Token"
// Symbol: "PIPE"
// Decimals: 6
// Initial supply: 10,000,000 PIPE
// Treasury: Goal Agent account
```

- [ ] Run `node contracts/deploy-pipe-token.js`
- [ ] Verify token on [HashScan testnet](https://hashscan.io/testnet)
- [ ] Store `PIPE_TOKEN_ID` in `.env`

### 1.3 — Deploy PipeEscrow Contract (EVM)

Deploy the escrow smart contract to Hedera EVM.

- [ ] Write `contracts/PipeEscrow.sol` — see `contracts/README.md` for full spec
- [ ] Run `npx hardhat run contracts/deploy.js --network hedera_testnet`
- [ ] Verify contract on [HashScan testnet](https://hashscan.io/testnet)
- [ ] Store `PIPE_ESCROW_ADDRESS` in `.env`

### 1.4 — Shared Agent Utilities

Build the shared module all agents import.

```
agents/shared/
├── hedera-client.js       ← Initialised Hedera SDK client
├── hcs-publisher.js       ← Publish UCP message to any HCS topic
├── hcs-subscriber.js      ← Subscribe to HCS topic with callback
├── hts-transfer.js        ← Transfer PIPE tokens between accounts
├── escrow-client.js       ← Interact with PipeEscrow contract
├── ucp-schema.js          ← UCP message validators (see docs/UCP.md)
├── pipe-token.js          ← PIPE token association and balance checks
└── test-connection.js     ← Health check script
```

- [ ] Build and test each utility in isolation
- [ ] Write unit tests in `agents/shared/__tests__/`

### Phase 1 Done When

```bash
node agents/shared/test-connection.js        # Hedera connected
node contracts/verify-deployment.js         # Token + escrow deployed
node agents/shared/test-hcs-roundtrip.js    # Publish + read HCS message works
```

---

## Phase 1.5 — OpenClaw Agent Configuration (Day 5)

Configure each OpenClaw instance to run as its HIVE MIND agent role.

### How OpenClaw Skills Work

Each skill is a directory with a `SKILL.md` file. The file uses YAML frontmatter for metadata and Markdown for instructions. OpenClaw reads `SKILL.md` and follows the instructions using its built-in tools (bash, API calls, file access).

HIVE MIND skills live in `skills/` directory. Each skill instructs its OpenClaw instance to call Node.js helper scripts in `agents/shared/scripts/` for Hedera interactions.

### Install Skills Into OpenClaw Workspaces

```bash
# Run this script to install all skills into their respective OpenClaw workspaces
./scripts/install-skills.sh

# What the script does per agent:
# mkdir -p ~/.openclaw-{agentname}/workspace/skills/
# cp -r skills/{agentname}/ ~/.openclaw-{agentname}/workspace/skills/
# cp -r skills/hedera-core/ ~/.openclaw-{agentname}/workspace/skills/
```

### Configure Each OpenClaw Instance

Each OpenClaw instance needs its own `openclaw.json` config pointing to its agent workspace:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "groq/llama-3.3-70b-versatile"
      },
      "workspace": "/home/user/.openclaw-watcher/workspace"
    }
  },
  "providers": {
    "groq": {
      "apiKey": "gsk_..."
    }
  }
}
```

### Verify Skills Load

```bash
# Per agent instance
openclaw --config ~/.openclaw-watcher/openclaw.json skills list
# Expected: hedera-core, hivemind-watcher listed as eligible
```

**Resources**
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/creating-skills)
- [OpenClaw Configuration Docs](https://docs.openclaw.ai/configuration)
- [Groq Free Tier](https://console.groq.com)

The trigger. If this does not work, nothing works.

### Tasks

- [ ] Subscribe to Hedera Mirror Node token creation events
- [ ] Implement evaluation logic — filter out low-quality tokens
- [ ] Publish qualifying events as UCP `TaskBundle` to `TASK_TOPIC`
- [ ] Handle reconnection on Mirror Node disconnect
- [ ] Write `agents/watcher/README.md`

### Evaluation Criteria (configurable via `.env`)

```javascript
// A token qualifies if ALL of the following are true:
// 1. Creator wallet is older than 24 hours
// 2. Initial treasury has > WATCHER_MIN_LIQUIDITY HBAR equivalent
// 3. Token has not been seen before (dedup by tokenId)
```

### Test

```bash
cd agents/watcher && node index.js
# In another terminal, create a test token on Hedera testnet
# Expected: Watcher logs "Qualifying token detected: 0.0.XXXXX"
# Expected: TaskBundle visible on HashScan TASK_TOPIC
```

**Resources**
- [Mirror Node REST API — Token Endpoint](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#tokens)
- [Hedera Mirror Node Websocket](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#websockets)

---

## Phase 3 — Plumber Agent (Days 7–9)

The most novel component. This is what makes HIVE MIND different from a simple multi-agent script.

### Tasks

- [ ] Subscribe to `REGISTRY_TOPIC` — read all agent manifests
- [ ] Build I/O type graph in memory
- [ ] On receiving a `TaskBundle`, find all valid pipelines using type matching
- [ ] Select cheapest valid pipeline
- [ ] Publish `PipelineBlueprint` to `TASK_TOPIC`
- [ ] Track completions — after 10, mint Pipeline NFT via HTS
- [ ] Write `agents/plumber/README.md`

### Pipeline Assembly Algorithm

```javascript
function assemblePipeline(taskBundle, agentGraph) {
  const { inputType, requiredOutputType } = taskBundle;
  
  // Find all paths from inputType to requiredOutputType
  // using BFS on the agent I/O type graph
  const paths = bfs(agentGraph, inputType, requiredOutputType);
  
  // Filter to valid paths (no cycles, all agents available)
  const validPaths = paths.filter(isValid);
  
  // Select cheapest: sum of all agent fees along the path
  return validPaths.sort((a, b) => totalCost(a) - totalCost(b))[0];
}
```

### Test

```bash
cd agents/plumber && node index.js
# Feed it a mock TaskBundle
# Expected: PipelineBlueprint published to TASK_TOPIC
# Expected: Blueprint lists 5 agents in correct order with fees
```

---

## Phase 4 — Worker Agents (Days 9–12)

Build all four worker agents. They share the same structure — only the execution logic differs.

### Common Structure Per Agent

```
agents/{agent-name}/
├── index.js          ← Main agent loop
├── executor.js       ← The actual task logic
├── manifest.js       ← UCP manifest definition
└── README.md
```

### 4.1 — Wallet Analyst Agent (Day 9)

- [ ] Subscribe to `TASK_TOPIC` — listen for tasks with `inputType: "WalletAddress"`
- [ ] Query Hedera Mirror Node for wallet transaction history
- [ ] Compute: account age, transaction count, previous token creations, HBAR flow patterns
- [ ] Output: `WalletHistory` object
- [ ] Submit attestation hash to `ATTESTATION_TOPIC`

**Resources**
- [Mirror Node Account Transactions](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#accounts)

### 4.2 — HCS Sentiment Agent (Day 10)

- [ ] Subscribe to `TASK_TOPIC` — listen for tasks with `inputType: "TokenId"`
- [ ] Query all HCS topics for mentions of the token ID
- [ ] Compute: mention count, first/last mention time, topic diversity score
- [ ] Output: `SentimentScore` object
- [ ] Submit attestation hash to `ATTESTATION_TOPIC`

**Resources**
- [Mirror Node Topics API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#topics)

### 4.3 — Liquidity Agent (Day 10)

- [ ] Subscribe to `TASK_TOPIC` — listen for tasks with `inputType: "TokenId"`
- [ ] Query HTS for token supply, holders, and transfer history
- [ ] Compute: holder count, transfer velocity, supply concentration
- [ ] Output: `LiquidityReport` object
- [ ] Submit attestation hash to `ATTESTATION_TOPIC`

**Resources**
- [Mirror Node Tokens API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#tokens)

### 4.4 — Risk Scorer Agent (Day 11)

- [ ] Subscribe to `ATTESTATION_TOPIC` — wait for all three upstream attestations
- [ ] Read `WalletHistory`, `SentimentScore`, `LiquidityReport` from HCS
- [ ] Compute weighted risk score (0–100)
- [ ] Output: `RiskScore` object with component breakdown
- [ ] Submit attestation hash to `ATTESTATION_TOPIC`

### 4.5 — Report Publisher Agent (Day 12)

- [ ] Subscribe to `ATTESTATION_TOPIC` — wait for Risk Scorer attestation
- [ ] Read all upstream outputs from HCS
- [ ] Format structured risk report
- [ ] Publish to `REPORT_TOPIC` on HCS
- [ ] Submit final attestation
- [ ] PipeEscrow releases all agent payments

### Phase 4 Done When

```bash
npm run agents:start
# All 5 worker agents running
# Feed a test task
# Expected: All 5 attestations appear on HashScan ATTESTATION_TOPIC
# Expected: Report appears on HashScan REPORT_TOPIC
# Expected: PIPE token transfers visible on HashScan
```

---

## Phase 5 — End-to-End Integration (Day 13)

Connect all agents into a single working system.

### Tasks

- [ ] Run all 6 agents simultaneously with `docker-compose up`
- [ ] Create a real HTS token on testnet
- [ ] Verify Watcher detects it within 10 seconds
- [ ] Verify Plumber assembles pipeline within 5 seconds
- [ ] Verify all 5 worker agents complete and get paid
- [ ] Verify final report appears on HCS
- [ ] Fix any race conditions in the attestation waiting logic
- [ ] Fix any PIPE token balance issues

### Integration Test Script

```bash
node tests/integration/full-pipeline-test.js
# Creates a real HTS token
# Waits 90 seconds
# Checks all expected HCS messages exist
# Checks all PIPE transfers occurred
# Reports pass/fail per stage
```

---

## Phase 6 — Observer Dashboard (Days 14–16)

Build the React Flow dashboard. Humans see everything, control nothing.

### Tasks

- [ ] Scaffold React + Vite app in `ui/`
- [ ] Install React Flow: `npm install reactflow`
- [ ] Build `AgentCanvas.jsx` — React Flow graph with 6 agent nodes
- [ ] Connect to Hedera Mirror Node WebSocket for live HCS messages
- [ ] Animate edges when a pipeline stage completes
- [ ] Build `HCSFeed.jsx` — scrolling live message feed
- [ ] Build `StatsBar.jsx` — agents registered, tasks completed, PIPE settled, reports published
- [ ] Colour-code node states: idle (grey), active (blue), attesting (orange), settled (green)
- [ ] Show PIPE amounts on edges during active pipeline
- [ ] Deploy to Vercel: `vercel deploy`
- [ ] Write `ui/README.md`

**Resources**
- [React Flow Docs](https://reactflow.dev/docs)
- [Hedera Mirror Node WebSocket](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#websockets)
- [Vercel Deployment](https://vercel.com/docs)

---

## Phase 7 — Demo Preparation (Days 17–18)

Prepare everything judges need to evaluate the project.

### Tasks

- [ ] Run full pipeline 5 times end-to-end — fix anything that fails
- [ ] Collect real testnet transaction hashes for README
- [ ] Record 3-minute demo video — follow script in `docs/DEMO.md`
- [ ] Final pass on all documentation
- [ ] Verify `docker-compose up` works on a clean machine
- [ ] Verify live demo URL is accessible
- [ ] Submit on DoraHacks before deadline

### Pre-Recording Checklist

```
[ ] All 6 agents running and healthy
[ ] Hedera testnet responding normally (check status.hedera.com)
[ ] Dashboard open at localhost:3000
[ ] HashScan testnet open in another tab
[ ] HTS token creation transaction pre-filled and ready
[ ] Screen recording software open
[ ] No other processes that might cause lag
```

---

## Phase 8 — Documentation (Days 19–21)

Polish all docs. Judges read documentation carefully.

### Docs Checklist

- [ ] `README.md` — setup works from scratch on a clean machine
- [ ] `ARCHITECTURE.md` — accurate and up to date
- [ ] `docs/AGENTS.md` — all 6 agents documented with manifest schemas
- [ ] `docs/PIPELINE.md` — all pipeline flows documented
- [ ] `docs/UCP.md` — UCP schema formally specified
- [ ] `docs/HCS.md` — all 4 HCS topics documented
- [ ] `docs/HTS.md` — PIPE token and Pipeline NFT documented
- [ ] `docs/DEMO.md` — demo script matches recorded video
- [ ] `contracts/README.md` — escrow contract spec and deployment guide
- [ ] All HashScan links to real testnet transactions included
- [ ] `.env.example` complete and accurate

---

## Cut List — If Time Runs Short

If you run out of time, cut in this order. The core demo still works without these:

| Feature | Cut Impact | Priority |
|---|---|---|
| Pipeline NFT minting | Loses bonus points — demo still works | Cut last |
| Agent-triggers-agent pipeline | Impressive but not required | Cut if needed |
| Arbitrage / EVM contract trigger | Second pipeline type — nice to have | Cut if needed |
| Report paywall (PIPE to read) | Economic loop less clean | Cut if needed |
| Animated edge PIPE flow on dashboard | Visual polish only | Cut first |

**Never cut:**
- All 6 agents working end-to-end
- HCS attestations for every stage
- PIPE token payments via escrow
- Live demo URL
- Docker Compose

---

## Official Resources

- [OpenClaw GitHub (open source, free)](https://github.com/openclaw/openclaw)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/creating-skills)
- [OpenClaw Configuration](https://docs.openclaw.ai/configuration)
- [ClawHub — Community Skills Registry](https://clawhub.ai)
- [Groq Free Tier API](https://console.groq.com)
- [Hedera Getting Started](https://docs.hedera.com/hedera/getting-started)
- [Hedera JS SDK GitHub](https://github.com/hashgraph/hedera-sdk-js)
- [Hedera Agent Kit GitHub](https://github.com/hedera-dev/hedera-agent-kit)
- [HashScan Testnet](https://hashscan.io/testnet)
- [Hedera Status Page](https://status.hedera.com)
- [Hedera Discord](https://hedera.com/discord)
- [React Flow Docs](https://reactflow.dev/docs)
