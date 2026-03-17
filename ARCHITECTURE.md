# HIVE MIND — Architecture

## What OpenClaw Provides

OpenClaw is a locally-running AI assistant daemon that can be extended with **Skills**. In HIVE MIND, each agent is an **OpenClaw instance with a specialist HIVE MIND skill installed**.

```
OpenClaw instance (the agent runtime)
    + hivemind-watcher/SKILL.md (the agent's behaviour instructions)
    + hedera-core/SKILL.md (shared Hedera utility instructions)
    + agents/shared/scripts/ (Node.js scripts the skill calls for Hedera ops)
    = A fully autonomous Watcher Agent
```

A `SKILL.md` file teaches the OpenClaw agent:
- What it is and what its role is
- What to do on startup (publish manifest to HCS)
- What loop to run continuously
- What scripts to call for Hedera interactions
- What rules to follow

OpenClaw is **free and open source** — `npm install -g openclaw`. It needs an LLM provider (Groq free tier works perfectly).



HIVE MIND is structured into five layers. Each layer maps directly to a Hedera service.

```
┌──────────────────────────────────────────────────────────┐
│                    PERCEPTION LAYER                       │
│         Watcher Agent — subscribes to Hedera events      │
│         Trigger: new HTS token, HCS spike, EVM deploy     │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│                    DISCOVERY LAYER                        │
│     HCS Registry Topic — agent manifests (UCP format)    │
│     Plumber Agent reads manifests, assembles pipelines    │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│                     TRUST LAYER                           │
│     PipeEscrow.sol — locks PIPE before work begins       │
│     Releases payment after HCS attestation verified      │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│                   EXECUTION LAYER                         │
│   Wallet Analyst + Sentiment + Liquidity (parallel)      │
│              ↓                                            │
│         Risk Scorer → Report Publisher                   │
└───────────────────────────┬──────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────┐
│                 INTELLIGENCE LAYER                        │
│     HCS Subscriber Topic — risk reports published        │
│     Other agents pay PIPE micro-fee to consume reports   │
│     Network builds collective on-chain intelligence      │
└──────────────────────────────────────────────────────────┘
```

---

## Hedera Service Map

### Hedera Consensus Service (HCS)

HCS is the backbone of HIVE MIND. Every agent interaction goes through HCS.

| Topic | Purpose | Writers | Readers |
|---|---|---|---|
| `REGISTRY_TOPIC` | Agent capability manifests | All agents on startup | Plumber Agent |
| `TASK_TOPIC` | Opportunity broadcasts + pipeline blueprints | Watcher Agent, Watchlist Agent, Plumber Agent | Goal Agent, all Worker Agents |
| `ATTESTATION_TOPIC` | Work completion hashes | All Worker Agents | PipeEscrow contract verifier |
| `REPORT_TOPIC` | Final intelligence reports | Report Publisher Agent | Watchlist Agent (subscribed), any other agent paying access fee |
| `BLACKLIST_TOPIC` | Permanently blacklisted creator wallets | Blacklist Agent | All agents (subscribe on startup, update internal filter) |

All HCS messages follow the UCP standard schema. See `docs/UCP.md`.

### Hedera Token Service (HTS)

| Token | Type | Purpose |
|---|---|---|
| `PIPE` | Fungible | Unit of exchange for all agent-to-agent payments |
| `PIPELINE_NFT` | Non-Fungible | Minted after a pipeline completes 10 tasks — proof of reliability |

### Hedera EVM

| Contract | Purpose |
|---|---|
| `PipeEscrow.sol` | Locks PIPE before pipeline runs. Verifies HCS attestations. Releases payment per agent. Handles timeouts. |

---

## Agent Interaction Flow

```
STARTUP PHASE (runs once per agent deployment)
─────────────────────────────────────────────
Each Agent:
  1. Creates WDK-managed Hedera account
  2. Publishes UCP manifest to REGISTRY_TOPIC on HCS
  3. Begins listening to relevant HCS topics

Plumber Agent:
  1. Subscribes to REGISTRY_TOPIC
  2. Builds I/O type graph from all received manifests
  3. Waits for task broadcasts


RUNTIME PHASE (continuous, no human input)
──────────────────────────────────────────
Watcher Agent:
  1. Detects new HTS token creation via Mirror Node API
  2. Evaluates: token age, creator wallet, initial liquidity
  3. If qualifying: posts TaskBundle to TASK_TOPIC

Plumber Agent:
  1. Reads TaskBundle from TASK_TOPIC
  2. Finds valid pipeline: WalletAddress→WalletHistory→RiskScore→Report
  3. Selects cheapest valid pipeline
  4. Posts PipelineBlueprint to TASK_TOPIC

Goal Agent:
  1. Reads PipelineBlueprint
  2. Calls PipeEscrow.fund() — locks total PIPE cost
  3. Broadcasts pipeline start to TASK_TOPIC

Worker Agents (Wallet Analyst, Sentiment, Liquidity — parallel):
  1. Each reads their task from TASK_TOPIC
  2. Executes their specialist function
  3. Posts output hash as attestation to ATTESTATION_TOPIC
  4. PipeEscrow verifies attestation
  5. PipeEscrow releases PIPE to agent wallet

Risk Scorer Agent:
  1. Waits for all three upstream attestations
  2. Reads outputs from HCS
  3. Computes combined risk score
  4. Posts attestation to ATTESTATION_TOPIC
  5. Receives PIPE payment

Report Publisher Agent:
  1. Receives Risk Score
  2. Formats full report
  3. Posts report to REPORT_TOPIC on HCS
  4. Posts attestation
  5. Receives PIPE payment

Plumber Agent:
  1. Records pipeline completion
  2. Earns routing fee from PipeEscrow
  3. After 10 completions: mints Pipeline NFT via HTS
```

---

## Pipeline Type Graph

The Plumber uses typed I/O matching. This is the full type graph for the 6-agent demo:

```
TokenId ──────────────────────────────────┐
                                           ↓
WalletAddress → [Wallet Analyst] → WalletHistory ──────────┐
                                                            ↓
TokenId ──────→ [Sentiment Agent] → SentimentScore ────────→ [Risk Scorer] → RiskScore → [Report Publisher] → HCSPublication
                                                            ↑
TokenId ──────→ [Liquidity Agent] → LiquidityReport ───────┘
```

When a new agent joins and declares `inputType: "RiskScore"` and `outputType: "AlertNotification"`, the Plumber automatically discovers a new valid pipeline extension without any code changes.

---

## Trust Model

The trust model has three layers:

**Layer 1 — Escrow (cannot be cheated)**
PIPE tokens are locked before work begins. An agent cannot receive payment without submitting a valid attestation hash to HCS. The smart contract enforces this — no human can override it.

**Layer 2 — Attestation (cannot be faked)**
Each worker posts an SHA-256 hash of their output to HCS. HCS timestamps it permanently. The escrow contract reads the HCS state before releasing payment. Submitting a false hash means no payment.

**Layer 3 — Pipeline NFTs (cannot be faked)**
After 10 successful completions, a Pipeline NFT is minted. The NFT metadata links to the full HCS attestation history. Any agent can verify the NFT's claim by reading the HCS topic.

---

## Data Flow Diagram

```
[Hedera Testnet]
      │
      ├── HTS Event: TokenCreated(tokenId, creatorWallet)
      │                   │
      │             [Watcher Agent]
      │             evaluates event
      │                   │
      │         posts TaskBundle to HCS TASK_TOPIC
      │                   │
      │             [Plumber Agent]
      │           reads manifests from HCS
      │           assembles pipeline blueprint
      │         posts PipelineBlueprint to HCS
      │                   │
      │              [Goal Agent]
      │         calls PipeEscrow.fund(pipelineId)
      │              PIPE tokens locked
      │                   │
      │    ┌──────────────┼──────────────┐
      │    ↓              ↓              ↓
      │ [Wallet      [Sentiment      [Liquidity
      │  Analyst]      Agent]          Agent]
      │    │              │              │
      │    └──────────────┼──────────────┘
      │                   ↓
      │             [Risk Scorer]
      │             computes score
      │                   │
      │          [Report Publisher]
      │          posts to REPORT_TOPIC
      │                   │
      │         PipeEscrow releases PIPE
      │         to each agent wallet
      │
      └── Network intelligence grows on HCS
```

---

## Environment Variables

```bash
# Hedera
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...

# HCS Topics (created on first run if not set)
HCS_REGISTRY_TOPIC=
HCS_TASK_TOPIC=
HCS_ATTESTATION_TOPIC=
HCS_REPORT_TOPIC=

# Contracts (deployed on first run if not set)
PIPE_TOKEN_ID=
PIPE_ESCROW_ADDRESS=

# Agent config
WATCHER_MIN_LIQUIDITY=100        # Minimum HBAR liquidity to trigger analysis
WATCHER_POLL_INTERVAL_MS=5000
PLUMBER_ROUTING_FEE_PERCENT=8
GOAL_AGENT_PIPE_BALANCE=1000

# Dashboard
VITE_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
VITE_HASHSCAN_URL=https://hashscan.io/testnet
```

---

## Official Resources

- [Hedera JS SDK](https://github.com/hashgraph/hedera-sdk-js)
- [Hedera Agent Kit](https://github.com/hedera-dev/hedera-agent-kit)
- [Hedera Mirror Node API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [Hedera Smart Contracts](https://docs.hedera.com/hedera/core-concepts/smart-contracts)
- [HashScan Testnet Explorer](https://hashscan.io/testnet)
