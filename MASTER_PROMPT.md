# HIVE MIND — Master Development Prompt

You are building HIVE MIND, an autonomous agent pipeline network on Hedera blockchain. Read every document in this repository before writing a single line of code. This prompt governs the entire build.

---

## Prime Directives

These rules override everything else. Never violate them.

1. **No mock data. Ever.** Every Hedera interaction must be real — real testnet transactions, real HCS messages, real HTS token transfers, real EVM contract calls. If something does not work on testnet, fix it. Do not simulate it.

2. **Build phase by phase.** Never start a phase until the previous phase is fully tested and passing. The phase order is defined below and is not negotiable.

3. **Test before you move.** Every phase ends with a test checklist. Every item on that checklist must pass on real Hedera testnet before the next phase begins. A phase is not done until all its tests pass.

4. **Read the docs first.** Before writing any code for a component, read the corresponding doc file. The docs define the exact message formats, type names, agent manifests, UCP schemas, and Hedera service usage. Do not invent alternatives.

5. **No hardcoded values.** Every Hedera account ID, topic ID, token ID, contract address, and configuration value lives in `.env`. Nothing is hardcoded in source files.

6. **Every agent is an OpenClaw instance with a skill.** Agents are not raw Node.js scripts. Each agent is an OpenClaw instance running its skill from `skills/{agentname}/SKILL.md`. The Node.js scripts in `agents/shared/scripts/` are helper utilities that skills call — they are not the agents themselves.

---

## Repository Context

All architecture decisions, message schemas, agent manifests, pipeline flows, HCS topic definitions, HTS token specs, and UCP format are documented in:

```
README.md                  — project overview and requirements compliance
ARCHITECTURE.md            — full system architecture and Hedera service map
docs/AGENTS.md             — all agent specs with exact manifest JSON and output schemas
docs/PIPELINE.md           — Pipeline 1 (analysis) and Pipeline 2 (protection) full flows
docs/UCP.md                — UCP message format — every message must follow this
docs/HCS.md                — all 5 HCS topics, publish/subscribe patterns, size limits
docs/HTS.md                — PIPE token deployment, Pipeline NFT minting, transfer helpers
docs/PHASES.md             — build phases with tasks and test checklists
contracts/README.md        — PipeEscrow interface, state machine, deployment guide
skills/*/SKILL.md          — OpenClaw skill definitions for each agent
```

Read all of these before starting. When in doubt about any schema, format, or behaviour — the docs are the source of truth.

---

## Technology Stack

```
Agent runtime:     OpenClaw (npm install -g openclaw)
LLM provider:      Groq free tier (https://console.groq.com)
Hedera SDK:        @hashgraph/sdk
Hedera Agent Kit:  @hedera-dev/hedera-agent-kit
Blockchain:        Hedera Testnet
Smart contracts:   Solidity + Hardhat (Hedera EVM, chainId 296)
Frontend:          React + Vite + React Flow
Deployment:        Docker Compose (local) + Vercel (dashboard)
```

---

## Environment Setup (Do This First)

Before any phase begins:

```bash
# 1. Install OpenClaw
npm install -g openclaw
openclaw --version   # must succeed

# 2. Get Groq API key — https://console.groq.com
# Free tier is sufficient

# 3. Create Hedera testnet account — https://portal.hedera.com
# Get testnet HBAR from faucet — https://portal.hedera.com/faucet

# 4. Fill .env from .env.example
cp .env.example .env
# Fill in: HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, GROQ_API_KEY

# 5. Install dependencies
npm install

# 6. Verify Hedera connection
node agents/shared/test-connection.js
# Must print: Connected to Hedera testnet. Balance: XXXX HBAR
# If this fails, fix it before doing anything else
```

---

## Phase 0 — Hedera Infrastructure

**Goal:** All HCS topics created, PIPE token deployed, PipeEscrow contract deployed, all IDs saved to .env.

### What To Build

**Step 1 — Create HCS Topics**

Create all 5 HCS topics. Save IDs to `.env`.

```javascript
// agents/shared/setup-topics.js
// Creates: HCS_REGISTRY_TOPIC, HCS_TASK_TOPIC, HCS_ATTESTATION_TOPIC,
//          HCS_REPORT_TOPIC, HCS_BLACKLIST_TOPIC
// Uses TopicCreateTransaction from @hashgraph/sdk
// Appends all 5 topic IDs to .env automatically after creation
```

**Step 2 — Deploy PIPE Token (HTS)**

```javascript
// contracts/deploy-pipe-token.js
// Name: "PIPE Token", Symbol: "PIPE"
// Type: FungibleCommon, Decimals: 6
// InitialSupply: 10_000_000_000_000 (10M with 6 decimal places)
// Treasury: HEDERA_OPERATOR_ID
// Saves PIPE_TOKEN_ID to .env
```

**Step 3 — Deploy Pipeline NFT Collection (HTS)**

```javascript
// contracts/deploy-pipeline-nft.js
// Name: "HIVEMIND Pipeline Certificate", Symbol: "HPCERT"
// Type: NonFungibleUnique
// Saves PIPELINE_NFT_TOKEN_ID to .env
```

**Step 4 — Deploy PipeEscrow Contract (Hedera EVM)**

Write `contracts/PipeEscrow.sol` following the interface in `contracts/README.md`. Key requirements:
- Accepts PIPE token (HTS) as the payment asset
- fund(pipelineId, agentWallets[], agentFees[], plumberWallet, plumberFee) — locks total PIPE
- releasePayment(pipelineId, agentWallet) — releases one agent's fee after attestation verified
- claimTimeout(pipelineId) — returns unclaimed fees after timeout window
- State machine: UNFUNDED → FUNDED → IN_PROGRESS → SETTLED / PARTIAL_TIMEOUT
- Emits events: PipelineFunded, PaymentReleased, PipelineSettled, TimeoutClaimed

```bash
# Deploy using Hardhat with Hedera EVM config (chainId 296)
npx hardhat run contracts/scripts/deploy-escrow.js --network hedera_testnet
# Saves PIPE_ESCROW_ADDRESS to .env
```

**Step 5 — Build Shared Scripts**

These are the Node.js utilities that OpenClaw skills call via bash. Every script must accept arguments from the command line and print results to stdout.

```
agents/shared/scripts/
├── hcs-publish.js        --topic TOPIC_ID --message '{"ucpVersion":"1.0",...}'
├── hcs-read.js           --topic TOPIC_ID --limit 100 --from-timestamp (optional)
├── hcs-subscribe.js      --topic TOPIC_ID (streams new messages, one JSON per line)
├── pipe-transfer.js      --to 0.0.XXXXX --amount 0.002
├── pipe-balance.js       --account 0.0.XXXXX
├── pipe-associate.js     --account 0.0.XXXXX
├── escrow-fund.js        --pipeline-id X --agents '[{...}]' --plumber '{...}'
├── escrow-release.js     --pipeline-id X --agent 0.0.XXXXX
├── mint-pipeline-nft.js  --pipeline-id X --metadata '{...}'
└── test-connection.js    (no args — prints balance and confirms connection)
```

Every script must:
- Validate required arguments before running
- Print a clear error message if a Hedera call fails
- Exit with code 1 on failure, code 0 on success
- Never use mock data or local simulation

### Phase 0 Test Checklist

Do not proceed to Phase 1 until every item passes:

```
[ ] node agents/shared/test-connection.js
    → Prints real HBAR balance from Hedera testnet

[ ] node agents/shared/setup-topics.js
    → Creates 5 topics, prints 5 topic IDs
    → All 5 topic IDs visible on https://hashscan.io/testnet

[ ] node contracts/deploy-pipe-token.js
    → Prints PIPE token ID
    → Token visible on HashScan with correct name/symbol/supply

[ ] node contracts/deploy-pipeline-nft.js
    → Prints NFT token ID
    → Token visible on HashScan

[ ] npx hardhat run contracts/scripts/deploy-escrow.js --network hedera_testnet
    → Prints contract address
    → Contract visible and verified on HashScan

[ ] node agents/shared/scripts/hcs-publish.js --topic $HCS_TASK_TOPIC --message '{"ucpVersion":"1.0","messageType":"TEST","senderId":"test","timestamp":"2025-01-01T00:00:00Z","payload":{"test":true}}'
    → Prints transaction ID
    → Message visible on HashScan TASK_TOPIC

[ ] node agents/shared/scripts/hcs-read.js --topic $HCS_TASK_TOPIC --limit 1
    → Prints the test message just published

[ ] node agents/shared/scripts/pipe-balance.js --account $HEDERA_OPERATOR_ID
    → Prints 10000000 (full PIPE supply in operator account)

[ ] node agents/shared/scripts/pipe-transfer.js --to $HEDERA_OPERATOR_ID --amount 0.001
    → Completes without error (self-transfer as sanity check)
    → Transfer visible on HashScan
```

All 9 checks must pass. Fix failures before moving to Phase 1.

---

## Phase 1 — OpenClaw Agent Configuration

**Goal:** All 7 OpenClaw instances configured, skills installed, manifests published to HCS.

### What To Build

**Step 1 — Install OpenClaw Skills**

Create a script that installs all skills into their respective OpenClaw workspaces:

```bash
# scripts/install-skills.sh
# For each agent: creates workspace, copies hedera-core + agent skill,
# creates openclaw.json with Groq config pointing to workspace
```

Each `openclaw.json` must:
- Point to the agent's workspace directory
- Use `groq/llama-3.3-70b-versatile` as the primary model
- Reference the Groq API key from environment
- Have the agent's `.env` values accessible to scripts

**Step 2 — Verify Skills Load**

```bash
for agent in watcher plumber wallet-analyst sentiment liquidity risk-scorer report-publisher; do
  openclaw --config ~/.openclaw-$agent/openclaw.json skills list
  # Must show: hedera-core, hivemind-$agent as eligible
done
```

**Step 3 — Publish All Manifests To HCS**

Run each agent's startup manifest publish. Use the exact manifest JSON from `docs/AGENTS.md`. Do not change field names, types, or values.

```bash
# Each agent publishes its manifest via the hcs-publish.js script
# Manifest format is in docs/AGENTS.md and docs/UCP.md
# Every manifest must include: ucpVersion, messageType: "AGENT_MANIFEST",
# senderId, timestamp, and all payload fields
```

### Phase 1 Test Checklist

```
[ ] openclaw --version prints a version number on all 7 instances

[ ] openclaw --config ~/.openclaw-watcher/openclaw.json skills list
    → Shows hedera-core and hivemind-watcher as eligible

[ ] Repeat skills list check for all 7 agents — all must pass

[ ] node agents/shared/scripts/hcs-read.js --topic $HCS_REGISTRY_TOPIC --limit 20
    → Returns exactly 7 AGENT_MANIFEST messages
    → Each has correct agentId, inputType, outputType, pricePerTask
    → Manifests match the specs in docs/AGENTS.md exactly

[ ] All 7 manifests visible on HashScan REGISTRY_TOPIC
    → Check: https://hashscan.io/testnet/topic/{HCS_REGISTRY_TOPIC}
```

All 5 checks must pass. Fix failures before moving to Phase 2.

---

## Phase 2 — Watcher Agent

**Goal:** Watcher Agent running continuously, detecting real HTS token creations, posting real TaskBundles to HCS.

### What To Build

Write `agents/shared/scripts/watcher-loop.js`. This is the continuous loop the Watcher's OpenClaw skill calls. It must:

- Poll `https://testnet.mirrornode.hedera.com/api/v1/tokens?order=desc&limit=10` every 5 seconds
- Track the last seen token creation timestamp to avoid reprocessing
- For each new token, fetch creator account details and check age
- Skip tokens whose creator wallet is less than 24 hours old
- Skip tokens whose tokenId has been seen before (persist seen IDs to a local JSON file)
- Skip tokens created by `HEDERA_OPERATOR_ID` itself
- For qualifying tokens: build TaskBundle following the schema in `docs/UCP.md`
- Call `hcs-publish.js` to post the TaskBundle to `HCS_TASK_TOPIC`
- Log every detection, every skip (with reason), and every publish with timestamp

### Phase 2 Test Checklist

```
[ ] Start watcher-loop.js — runs without crashing for 60 seconds

[ ] Create a real HTS token on Hedera testnet using Hedera Portal
    → https://portal.hedera.com

[ ] Within 30 seconds of token creation:
    → watcher-loop.js logs "Qualifying token detected"
    → TaskBundle appears on HashScan HCS_TASK_TOPIC
    → TaskBundle JSON is valid UCP format (validate against docs/UCP.md)
    → TaskBundle contains correct tokenId, creatorWallet, triggerType: "HTS_TOKEN_CREATED"

[ ] Create a second token from the same account immediately
    → watcher-loop.js logs "Skipped — creator wallet too young" or similar
    → No second TaskBundle posted (dedup working)

[ ] Kill and restart watcher-loop.js
    → Does not repost TaskBundles for already-seen tokens
    → Resumes correctly from where it left off
```

All 5 checks must pass. Fix failures before Phase 3.

---

## Phase 3 — Plumber Agent

**Goal:** Plumber Agent reading registry manifests, building the I/O type graph, assembling correct PipelineBlueprints when TaskBundles arrive, posting blueprints to HCS.

### What To Build

Write `agents/shared/scripts/plumber-load-registry.js` and `agents/shared/scripts/plumber-loop.js`.

**plumber-load-registry.js** must:
- Read full history of `HCS_REGISTRY_TOPIC` via Mirror Node
- Parse all AGENT_MANIFEST messages
- Build a directed graph in memory: nodes are agents, edges connect outputType → inputType
- Save the graph to a local JSON file (`plumber-graph.json`) for the loop to use

**plumber-loop.js** must:
- Load the graph from `plumber-graph.json` on startup
- Subscribe to `HCS_REGISTRY_TOPIC` for new agents joining
- Subscribe to `HCS_TASK_TOPIC` for new TaskBundles
- When a new AGENT_MANIFEST arrives: add to graph, update `plumber-graph.json`
- When a TASK_BUNDLE arrives:
  - Run BFS from available input types to `requiredOutputType`
  - Find all valid paths
  - Select lowest total pricePerTask path
  - Build PipelineBlueprint following schema in `docs/UCP.md`
  - Call `hcs-publish.js` to post PipelineBlueprint to `HCS_TASK_TOPIC`
- Track pipeline completions. After 10 completions for a blueprint: call `mint-pipeline-nft.js`
- Publish routing fee claim to HCS after each settled pipeline

The Plumber must never assemble a pipeline that includes itself as a worker stage. It must never assemble a pipeline whose total cost exceeds the TaskBundle `maxBudget`.

### Phase 3 Test Checklist

```
[ ] node agents/shared/scripts/plumber-load-registry.js
    → Reads all 7 manifests from HCS
    → Prints I/O type graph to console
    → Saves plumber-graph.json

[ ] Inspect plumber-graph.json
    → Contains correct edges for all 7 agents
    → WalletAddress → wallet-analyst-01 → WalletHistory edge exists
    → TokenId → sentiment-01 → SentimentScore edge exists
    → TokenId → liquidity-01 → LiquidityReport edge exists

[ ] Start plumber-loop.js
    → Runs without crashing

[ ] While plumber-loop is running, post a fake TaskBundle to HCS:
    node agents/shared/scripts/hcs-publish.js \
      --topic $HCS_TASK_TOPIC \
      --message '{"ucpVersion":"1.0","messageType":"TASK_BUNDLE","senderId":"test","timestamp":"...","payload":{"taskId":"test-001","triggerType":"HTS_TOKEN_CREATED","triggerData":{"tokenId":"0.0.12345","creatorWallet":"0.0.54321"},"requiredOutputType":"HCSPublication","maxBudget":"0.020"}}'

[ ] Within 10 seconds:
    → plumber-loop.js logs "Pipeline assembled for task-001"
    → PipelineBlueprint appears on HashScan HCS_TASK_TOPIC
    → Blueprint contains all 5 worker stages in correct order
    → Blueprint totalCost is 0.013 or less
    → Blueprint matches schema in docs/UCP.md exactly
```

All 5 checks must pass. Fix failures before Phase 4.

---

## Phase 4 — Worker Agents

**Goal:** All 5 worker agents (Wallet Analyst, Sentiment, Liquidity, Risk Scorer, Report Publisher) executing real tasks, posting real attestations to HCS, receiving real PIPE payments.

### What To Build

For each worker agent, write its loop script and compute script:

**wallet-analyst:**
- `worker-loop.js --agentId wallet-analyst-01 --inputType WalletAddress`
  - Subscribes to HCS_TASK_TOPIC, filters for TASK_ASSIGNMENT to wallet-analyst-01
- `wallet-analyst-compute.js --accountId 0.0.XXXXX`
  - Queries Mirror Node `/api/v1/accounts/{id}` and `/api/v1/transactions?account.id={id}`
  - Computes WalletHistory object (see schema in docs/AGENTS.md)
  - Saves output to local file, prints output hash (SHA256)

**sentiment:**
- `worker-loop.js --agentId sentiment-01 --inputType TokenId`
- `sentiment-scan.js --tokenId 0.0.XXXXX`
  - Queries Mirror Node for HCS messages mentioning tokenId string
  - Computes SentimentScore (see schema in docs/AGENTS.md)

**liquidity:**
- `worker-loop.js --agentId liquidity-01 --inputType TokenId`
- `liquidity-compute.js --tokenId 0.0.XXXXX`
  - Queries Mirror Node `/api/v1/tokens/{id}` and `/api/v1/tokens/{id}/balances`
  - Computes LiquidityReport (see schema in docs/AGENTS.md)

**risk-scorer:**
- `risk-scorer-loop.js`
  - Subscribes to HCS_ATTESTATION_TOPIC
  - For each pipelineId, tracks arrival of stage-0 attestations
  - When all 3 stage-0 attestations arrive: fetches upstream outputs, computes RiskScore
  - Weighted scoring: wallet 40%, liquidity 40%, sentiment 20%
  - Posts TASK_ATTESTATION to HCS_ATTESTATION_TOPIC

**report-publisher:**
- `worker-loop.js --agentId report-publisher-01 --inputType RiskScore+AllInputs`
- `report-composer.js --pipelineId pipeline-XXXXX`
  - Reads all upstream outputs from HCS for this pipeline
  - Composes HIVE_REPORT (must be under 6000 bytes)
  - Posts to HCS_REPORT_TOPIC
  - Posts final TASK_ATTESTATION

**Attestation format for every worker** — follow exactly from docs/UCP.md:
```json
{
  "ucpVersion": "1.0",
  "messageType": "TASK_ATTESTATION",
  "senderId": "agent-id-here",
  "timestamp": "ISO8601",
  "payload": {
    "pipelineId": "...",
    "taskId": "...",
    "stageIndex": 0,
    "agentId": "...",
    "outputHash": "sha256:HASH",
    "outputSummary": { ... },
    "executionTimeMs": 1240
  }
}
```

### Phase 4 Test Checklist

Test each agent independently before testing them together.

```
[ ] node agents/shared/scripts/wallet-analyst-compute.js --accountId $HEDERA_OPERATOR_ID
    → Returns valid WalletHistory JSON
    → accountAgeHours is a real number > 0
    → totalTransactions is real count from Mirror Node
    → No mock or hardcoded values

[ ] node agents/shared/scripts/liquidity-compute.js --tokenId $PIPE_TOKEN_ID
    → Returns valid LiquidityReport JSON
    → holderCount reflects real token distribution
    → totalSupply matches deployed PIPE token supply

[ ] node agents/shared/scripts/sentiment-scan.js --tokenId $PIPE_TOKEN_ID
    → Returns valid SentimentScore JSON
    → Even if mentionCount is 0, object is valid

[ ] Full integration test — run all 5 workers simultaneously:
    npm run workers:start

    Then post a complete TaskBundle + PipelineBlueprint sequence to HCS
    (use the test scripts from Phase 3 checklist)

    Within 5 minutes:
    → 5 TASK_ATTESTATIONs appear on HashScan HCS_ATTESTATION_TOPIC
    → Each from a different agentId
    → All 5 outputHash values are valid sha256 hashes
    → HIVE_REPORT appears on HashScan HCS_REPORT_TOPIC
    → HIVE_REPORT contains riskScore (0–100), riskLabel, summary
    → HIVE_REPORT is valid UCP format
```

All 5 checks must pass. Fix failures before Phase 5.

---

## Phase 5 — Escrow Payment Flow

**Goal:** Full end-to-end pipeline where PIPE tokens are locked in escrow before work, released to each agent after attestation, Plumber receives routing fee, all transfers visible on HashScan.

### What To Build

Write `agents/shared/scripts/escrow-verifier.js`. This runs alongside the Plumber Agent and:
- Subscribes to HCS_ATTESTATION_TOPIC
- When an attestation arrives, verifies it exists on HCS via Mirror Node
- Calls `PipeEscrow.releasePayment(pipelineId, agentWallet)` on the EVM contract
- Tracks which agents in each pipeline have been paid
- When all agents paid: calls PipeEscrow final settlement function

Also build `agents/shared/scripts/escrow-fund.js` and ensure Goal Agent calls it with correct parameters after receiving a PipelineBlueprint.

### Phase 5 Test Checklist

```
[ ] Run full pipeline end-to-end (Watcher + Plumber + all Workers + Escrow Verifier)
    → Create a real HTS token on testnet
    → Wait for pipeline to complete

    After completion:
    → PipeEscrow contract state shows SETTLED for that pipelineId
    → wallet-analyst-01 account shows +0.002 PIPE on HashScan
    → sentiment-01 account shows +0.002 PIPE on HashScan
    → liquidity-01 account shows +0.002 PIPE on HashScan
    → risk-scorer-01 account shows +0.004 PIPE on HashScan
    → report-publisher-01 account shows +0.002 PIPE on HashScan
    → plumber-01 account shows +0.001 PIPE on HashScan
    → All transfers are real HTS transactions on HashScan
    → No PIPE transfer is simulated or mocked

[ ] Run the pipeline a second time with a different token
    → All payments release correctly again
    → No state bleed from first pipeline run
```

Both checks must pass. Fix failures before Phase 6.

---

## Phase 6 — Protection Pipeline (Agent-Triggers-Agent)

**Goal:** When Report Publisher posts a HIGH RISK verdict, Watchlist Agent detects it automatically, Pipeline 2 fires, creator wallet is permanently blacklisted on HCS BLACKLIST_TOPIC.

### What To Build

**Watchlist Agent** (a 7th agent — add its skill to `skills/watchlist/SKILL.md`):
- Subscribes to HCS_REPORT_TOPIC
- On each HIVE_REPORT: checks riskLabel
- If riskLabel is "HIGH" or "CRITICAL":
  - Posts a new TASK_BUNDLE to HCS_TASK_TOPIC targeting `requiredOutputType: "BlacklistEntry"`
  - Does NOT wait for human approval

**Cross-Reference Agent** script:
- Reads full HCS_REPORT_TOPIC history
- Finds all past reports mentioning the flagged wallet as creatorWallet
- Outputs WalletRiskProfile (count of prior HIGH RISK tokens, dates, report IDs)

**Blacklist Agent** script:
- Posts BlacklistEntry to HCS_BLACKLIST_TOPIC:
  ```json
  {
    "walletId": "0.0.XXXXX",
    "addedAt": "ISO8601",
    "reason": "string",
    "evidenceReportIds": ["report-abc", "report-def"]
  }
  ```

**Update Watcher Agent** to check HCS_BLACKLIST_TOPIC history on startup and before posting any TaskBundle. If creator wallet is on the blacklist — skip the token, log the reason, do not post a TaskBundle.

### Phase 6 Test Checklist

```
[ ] Manufacture a HIGH RISK scenario:
    — Deploy a token from a wallet that has already been analysed
    — Manually post a HIVE_REPORT with riskLabel: "HIGH" to HCS_REPORT_TOPIC
      using hcs-publish.js (use real creatorWallet from a real testnet account)

[ ] Within 60 seconds of the HIGH RISK report appearing on HCS:
    → Watchlist Agent logs "HIGH RISK detected — initiating protection pipeline"
    → New TASK_BUNDLE from watchlist-01 appears on HashScan HCS_TASK_TOPIC
    → Plumber assembles Pipeline 2 (Cross-Reference → Blacklist stages)
    → Cross-Reference Agent attestation appears on HCS_ATTESTATION_TOPIC
    → BlacklistEntry appears on HashScan HCS_BLACKLIST_TOPIC
    → BlacklistEntry contains the correct creatorWallet and evidenceReportIds

[ ] Create a new token on testnet from the now-blacklisted wallet
    → Watcher Agent logs "Skipped — creator wallet on blacklist"
    → No TaskBundle posted
    → No pipeline fires
    → Zero PIPE spent

[ ] Restart all agents cold (docker-compose restart)
    → Watcher still refuses tokens from blacklisted wallet after restart
    → Blacklist is loaded from HCS on startup — not from local memory
```

All 4 checks must pass. Fix failures before Phase 7.

---

## Phase 7 — Docker Compose

**Goal:** `docker-compose up` from a clean environment starts all 7 agents + dashboard with zero manual steps after `.env` is filled in.

### What To Build

Update `docker-compose.yml` so each service:
- Has its own Dockerfile in its agent directory
- Mounts the shared scripts directory
- Passes all env variables from the root `.env`
- Has a health check that verifies HCS connectivity
- Restarts automatically on crash
- Depends on the `setup` service completing successfully

The `setup` service runs once and:
1. Calls `test-connection.js` — exits with error if Hedera unreachable
2. Calls `setup-topics.js` — skips if topics already exist in `.env`
3. Calls `deploy-pipe-token.js` — skips if PIPE_TOKEN_ID already in `.env`
4. Calls `deploy-pipeline-nft.js` — skips if PIPELINE_NFT_TOKEN_ID already in `.env`
5. Calls `deploy-escrow.js` — skips if PIPE_ESCROW_ADDRESS already in `.env`
6. Calls `install-skills.sh` — installs all skills into OpenClaw workspaces

### Phase 7 Test Checklist

```
[ ] Delete all topic IDs and contract addresses from .env
    (keep only HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, GROQ_API_KEY)

[ ] docker-compose up
    → setup service completes successfully
    → All 5 topic IDs written to .env by setup service
    → PIPE token deployed, PIPE_TOKEN_ID written to .env
    → PipeEscrow deployed, PIPE_ESCROW_ADDRESS written to .env
    → All 7 agent containers start
    → All 7 manifests published to HCS_REGISTRY_TOPIC
    → Dashboard accessible at http://localhost:3000

[ ] Without touching anything — create a token on Hedera testnet
    → Full Pipeline 1 completes within 60 seconds
    → All payments settle on HashScan
    → If HIGH RISK: Pipeline 2 completes within 120 seconds

[ ] Kill one agent container mid-pipeline (docker kill hivemind-sentiment-1)
    → Pipeline handles timeout gracefully
    → Escrow returns timed-out fee to Goal Agent
    → Other agents still get paid

[ ] docker-compose down && docker-compose up
    → Agents restart cleanly
    → Do not repost manifests that already exist in registry
    → Blacklist is correctly reloaded from HCS
    → No duplicate TaskBundles for previously-seen tokens
```

All 5 checks must pass. Fix failures before Phase 8.

---

## Phase 8 — Observer Dashboard

**Goal:** React Flow dashboard at localhost:3000 showing live agent graph, HCS message feed, network stats, with no human controls of any kind.

### What To Build

```
ui/src/
├── App.jsx
├── components/
│   ├── AgentCanvas.jsx   ← React Flow graph
│   ├── HCSFeed.jsx       ← Live scrolling HCS message stream
│   └── StatsBar.jsx      ← Network statistics bar
└── hooks/
    └── useHCSStream.js   ← Mirror Node WebSocket subscription
```

**AgentCanvas.jsx:**
- 7 nodes — one per agent (Watcher, Plumber, Wallet Analyst, Sentiment, Liquidity, Risk Scorer, Report Publisher)
- Node colour: grey=IDLE, blue=ACTIVE, orange=ATTESTING, green=SETTLED, red=ERROR
- Animated edges during active pipeline — show PIPE amounts on edge labels
- Uses React Flow — `npm install reactflow`
- Updates in real time from HCS event stream

**HCSFeed.jsx:**
- Scrolling list of last 50 HCS messages across all 5 topics
- Each entry: timestamp, topic name, messageType, senderId, short summary
- New messages appear at top with a brief highlight animation
- Clickable — opens HashScan link for that message in new tab

**StatsBar.jsx:**
- Agents registered (read from registry topic message count)
- Pipelines completed
- PIPE tokens settled (total across all escrow contracts)
- Reports published
- Active pipelines right now
- Wallets blacklisted

**useHCSStream.js:**
- Polls Mirror Node REST API every 3 seconds (WebSocket not always available on testnet)
- Fetches new messages from all 5 HCS topics since last poll timestamp
- Updates component state — no manual refresh needed

**No controls. No buttons. No forms. No wallet connection.**

### Phase 8 Test Checklist

```
[ ] cd ui && npm run dev → starts without errors

[ ] Open http://localhost:3000
    → 7 agent nodes visible on canvas
    → All nodes grey (IDLE) when no pipeline is running

[ ] Trigger a pipeline by creating a token on testnet
    → Watcher node turns blue within 10 seconds
    → Pipeline edges appear as Plumber assembles
    → Parallel agents (Wallet, Sentiment, Liquidity) all blue simultaneously
    → Each node transitions: blue → orange → green as it attests
    → HCS feed shows each message arriving in real time
    → Stats bar increments correctly after pipeline settles

[ ] Check that no button, form, or control exists anywhere in the UI
    → Right-click → Inspect — confirm no <button>, <input>, <select> tags
      that could trigger agent behaviour

[ ] npm run build → builds without errors
[ ] vercel deploy → deploys successfully, live URL accessible
```

All 6 checks must pass.

---

## Phase 9 — Final Verification And Demo Prep

**Goal:** Everything works end-to-end from `docker-compose up` on a clean machine. Demo video recorded.

### Final End-to-End Test

```
[ ] Fresh machine (or fresh Docker environment — remove all volumes)
[ ] git clone your repo
[ ] cp .env.example .env — fill in only HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, GROQ_API_KEY
[ ] docker-compose up
[ ] Wait for setup to complete
[ ] Create a token on Hedera testnet
[ ] Verify full Pipeline 1 completes with all payments on HashScan
[ ] Verify Pipeline 2 fires if HIGH RISK
[ ] Verify dashboard shows everything correctly
[ ] Collect all HashScan URLs and add to README
```

### Demo Video

Follow the script in `docs/DEMO.md` exactly. The demo must show:
- Real HCS messages appearing on HashScan
- Real PIPE token transfers on HashScan
- Pipeline 2 firing automatically without human input
- A second token from the blacklisted wallet being rejected

### Submission Checklist

```
[ ] Public GitHub repo with all code and docs
[ ] All HashScan URLs for real testnet transactions in README
[ ] Live dashboard URL (Vercel)
[ ] docker-compose up works from clean clone
[ ] Demo video under 3 minutes uploaded to YouTube/Loom
[ ] Demo video link in README
[ ] All 5 HCS topics have real message history on HashScan
[ ] PIPE token visible on HashScan with real transfers
[ ] PipeEscrow contract verified on HashScan
```

---

## What Good Looks Like

A passing submission has:

- Real transactions on HashScan for every pipeline step
- Real PIPE token transfers to real agent accounts
- All 5 HCS topics populated with real message history
- A dashboard that updates live without manual refresh
- Pipeline 2 firing from Pipeline 1's output with no human action
- A blacklisted wallet being rejected by the Watcher on a second attempt
- `docker-compose up` working from a clean clone with only credentials in `.env`

A failing submission has:

- Any console.log that says "mock", "simulated", "test data", or "placeholder"
- Any hardcoded wallet address, topic ID, or token ID in source code
- Any pipeline step that does not produce a real HCS message
- A dashboard with buttons or forms that control agent behaviour
- A demo video where a human triggers anything other than the initial token creation

---

## Official Resources

Keep these open while building:

- [Hedera JS SDK Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks)
- [Hedera JS SDK GitHub](https://github.com/hashgraph/hedera-sdk-js)
- [Hedera Agent Kit GitHub](https://github.com/hedera-dev/hedera-agent-kit)
- [Hedera Mirror Node REST API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [Hedera EVM / JSON-RPC Relay](https://docs.hedera.com/hedera/core-concepts/smart-contracts/json-rpc-relay)
- [HashScan Testnet Explorer](https://hashscan.io/testnet)
- [Hedera Testnet Faucet](https://portal.hedera.com/faucet)
- [OpenClaw Skills Documentation](https://docs.openclaw.ai/tools/creating-skills)
- [Groq Free Tier](https://console.groq.com)
- [React Flow Documentation](https://reactflow.dev/docs)
- [Hedera Status Page](https://status.hedera.com)
- [Hardhat Documentation](https://hardhat.org/docs)
