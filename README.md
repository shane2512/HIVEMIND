# HIVE MIND

**Self-Evolving Agentic Network on Hedera**

> A self-evolving, agent-native intelligence network where OpenClaw agents register capabilities on HCS, dynamically assemble pipelines from available agents, and autonomously execute on-chain workflows with PIPE token incentives via HTS. The current deployment focuses on token-creation analysis, with the same architecture designed to expand to many on-chain event types.

[![Hedera Testnet](https://img.shields.io/badge/Network-Hedera%20Testnet-3d1fba)](https://portal.hedera.com)
[![OpenClaw](https://img.shields.io/badge/Agents-OpenClaw-orange)](https://openclaw.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What Is HIVE MIND?

HIVE MIND is a self-evolving agentic network for the Agentic Society. It continuously discovers what agents are registered in the HCS registry, composes pipelines from their declared capabilities, and executes those pipelines autonomously after deployment.

Every agent is an **OpenClaw instance with a specialist HIVE MIND skill installed**. Each runs its own continuous loop, publishes capabilities to HCS, earns PIPE tokens for completed work, and feeds outputs into downstream agents. The system is designed to adapt as agents join, leave, or update their manifests, so pipeline composition evolves with the registry state. Today, this deployment is specialized for HTS token-creation analysis; next, the same orchestration model can be applied to broader on-chain events such as treasury flows, contract interactions, governance actions, and anomaly patterns.

**The value is cumulative and permanent.** Every pipeline run adds reusable intelligence to the network and improves future routing and decision quality. The more capable agents that register, the more complex and useful workflows HIVE MIND can assemble automatically.

Current active use case: when a new HTS token is created on Hedera:

1. A **Watcher Agent** detects it from the live HTS event stream — no human trigger
2. A **Plumber Agent** assembles the analysis pipeline from currently registered HCS manifests
3. **Wallet Analyst**, **Sentiment**, and **Liquidity** agents run in parallel
4. A **Risk Scorer** combines their outputs into a weighted risk score
5. A **Report Publisher** posts the verdict permanently to HCS
6. If the verdict is HIGH RISK, policy pipelines can trigger configurable responses (for example: warnings, watchlist updates, tighter trust thresholds, or selective restriction flows)
7. Agents consume those policy signals and adjust behavior according to configured risk controls, instead of enforcing one fixed global block action
8. All agents receive PIPE tokens via EVM escrow — trust enforced on-chain, not by agreement

Zero human input during runtime. Permanent attestation trail on Hedera. Every new registered agent expands what the network can do next.

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- OpenClaw installed — [Installation Guide](https://docs.openclaw.ai/getting-started)
- An LLM provider — Groq free tier recommended ([Get API key](https://console.groq.com))
- Hedera testnet account — [Get one free](https://portal.hedera.com)
- Testnet HBAR — [Faucet](https://portal.hedera.com/faucet)

### Local Environment Setup (.env)

Create your root environment file first:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `.env` in the repository root and fill values in this order.

1. Required secrets (must be set manually)
    - `HEDERA_OPERATOR_ID`
    - `HEDERA_OPERATOR_KEY`
    - `HEDERA_EVM_PRIVATE_KEY`
    - API key for your selected `LLM_PROVIDER` (`OPENROUTER_API_KEY` or `GROQ_API_KEY` or `DEEPSEEK_API_KEY`)

2. Non-secret runtime values (safe to share in team docs)
    - `HEDERA_NETWORK=testnet`
    - `MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com`
    - `HEDERA_JSON_RPC_URL=https://testnet.hashio.io/api`
    - `PIPE_TOKEN_DECIMALS=6`
    - `ESCROW_TIMEOUT_SECONDS=600`
    - watcher/plumber/goal tuning values (`WATCHER_*`, `PLUMBER_*`, `GOAL_AGENT_*`, `TASK_TIMEOUT_MINUTES`)

3. Non-secret Hedera IDs and addresses (auto-populated by scripts)
    - Topics: `HCS_REGISTRY_TOPIC`, `HCS_TASK_TOPIC`, `HCS_ATTESTATION_TOPIC`, `HCS_REPORT_TOPIC`, `HCS_BLACKLIST_TOPIC`
    - Assets: `PIPE_TOKEN_ID`, `PIPELINE_NFT_TOKEN_ID`, `PIPE_ESCROW_ADDRESS`

Populate IDs/addresses by running:

```bash
npm install
npm run setup:topics
npm run deploy:pipe-token
npm run deploy:pipeline-nft
npm run deploy:escrow
```

Each script updates root `.env` automatically and skips values that are already present.

### UI Environment Setup (ui/.env.local)

The observer dashboard reads Vite-prefixed variables from `ui/.env.local`.

Create `ui/.env.local` with:

```dotenv
VITE_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
VITE_HCS_REGISTRY_TOPIC=0.0.x
VITE_HCS_TASK_TOPIC=0.0.x
VITE_HCS_ATTESTATION_TOPIC=0.0.x
VITE_HCS_REPORT_TOPIC=0.0.x
VITE_HCS_BLACKLIST_TOPIC=0.0.x
```

Copy the `0.0.x` topic IDs from root `.env` after `npm run setup:topics`.

### Run With Docker (Recommended)

```bash
git clone https://github.com/your-org/hivemind
cd hivemind
cp .env.example .env
# Fill in Hedera credentials and Groq API key in .env
docker-compose up
```

Docker Compose starts 6 OpenClaw instances, each with a different HIVE MIND skill installed. Open [http://localhost:3000](http://localhost:3000) to observe agents.

### Run Without Docker

```bash
# 1. Install OpenClaw globally
npm install -g openclaw

# 2. Deploy Hedera contracts and create HCS topics
npm install
cd contracts && npm run deploy:testnet && cd ..

# 3. Install skills into each OpenClaw workspace
./scripts/install-skills.sh

# 4. Start all 6 OpenClaw agent instances
npm run agents:start

# 5. Start the observer dashboard
cd ui && npm run dev
```

### One-Command Phase 5 Evidence Run

Use the runbook script to automatically launch the agent runtime, create a real test token, verify the full pipeline chain, and archive JSON evidence under `artifacts/runs/`.

```bash
npm run phase5:runbook
```

Useful flags:

- `-- --reuse-runtime` to skip starting local agents
- `-- --timeout-sec 300` to extend verification timeout
- `-- --keep-runtime` to leave agents running after completion

---

## Repository Structure

```
hivemind/
├── README.md
├── ARCHITECTURE.md
├── docker-compose.yml
├── .env.example
│
├── skills/                      ← OpenClaw skill definitions
│   ├── hedera-core/             ← Shared Hedera utilities (required by all agents)
│   │   └── SKILL.md
│   ├── watcher/                 ← Watcher Agent skill
│   │   └── SKILL.md
│   ├── plumber/                 ← Plumber Agent skill
│   │   └── SKILL.md
│   ├── wallet-analyst/          ← Worker Agent skill
│   │   └── SKILL.md
│   ├── sentiment/               ← Worker Agent skill
│   │   └── SKILL.md
│   ├── liquidity/               ← Worker Agent skill
│   │   └── SKILL.md
│   ├── risk-scorer/             ← Worker Agent skill
│   │   └── SKILL.md
│   └── report-publisher/        ← Worker Agent skill
│       └── SKILL.md
│
├── agents/
│   └── shared/                  ← Node.js helper scripts called by skills
│       ├── scripts/
│       │   ├── hcs-publish.js
│       │   ├── hcs-read.js
│       │   ├── pipe-transfer.js
│       │   ├── watcher-loop.js
│       │   ├── plumber-loop.js
│       │   ├── worker-loop.js
│       │   └── ...
│       └── setup-topics.js
│
├── contracts/
│   ├── PipeToken.sol
│   ├── PipeEscrow.sol
│   └── README.md
│
├── ui/
│   ├── src/
│   │   ├── components/
│   │   │   ├── AgentCanvas.jsx
│   │   │   ├── HCSFeed.jsx
│   │   │   └── StatsBar.jsx
│   │   └── App.jsx
│   └── README.md
│
└── docs/
    ├── PHASES.md
    ├── AGENTS.md
    ├── PIPELINE.md
    ├── UCP.md
    ├── HCS.md
    ├── HTS.md
    └── DEMO.md
```

---

## Hedera Stack

| Service | Usage |
|---|---|
| **HCS** | Agent registry, task broadcasts, pipeline blueprints, attestations, intelligence reports |
| **HTS** | PIPE fungible token for payments, Pipeline NFTs for proven pipelines |
| **Hedera EVM** | PipeEscrow contract enforcing payment splits and release |
| **Hedera Agent Kit** | Agent wallet management and Hedera service interactions |

---

## Requirements Compliance

| Requirement | How It Is Met |
|---|---|
| Agent-first — OpenClaw primary users | Blockchain events trigger everything. No human input after deployment. |
| Autonomous behaviour | Agents perceive, decide, hire, pay, and publish independently |
| Clear value in multi-agent environment | Intelligence is cumulative and registry-driven: more registered agents enable richer pipelines and broader autonomous coverage. HIGH RISK outcomes can drive configurable policy responses (watchlists, warnings, selective restrictions), not a single hardcoded action. |
| HTS usage | PIPE token for all payments, Pipeline NFTs after 10 completions |
| HCS usage | Registry, tasks, blueprints, attestations, reports |
| EVM usage | PipeEscrow enforces payment and verifies attestations |
| Public repo | This repository |
| Live demo URL | Deployed to Vercel |
| Runnable Docker | `docker-compose up` |
| README with walkthrough | This file |
| UI for human observers | React Flow dashboard — no controls, observe only |
| UCP standardisation (bonus) | All manifests follow UCP schema — see `docs/UCP.md` |
| Reputation indicators (bonus) | Pipeline NFTs as trust signals |

---

## Official Resources

- [Hedera Developer Portal](https://portal.hedera.com)
- [Hedera JS SDK Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks)
- [Hedera JS SDK GitHub](https://github.com/hashgraph/hedera-sdk-js)
- [Hedera Agent Kit](https://github.com/hedera-dev/hedera-agent-kit)
- [OpenClaw Documentation](https://openclaw.ai/docs)
- [Hedera Consensus Service Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service)
- [Hedera Token Service Docs](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service)
- [Hedera Smart Contracts Docs](https://docs.hedera.com/hedera/core-concepts/smart-contracts)
- [Hedera Testnet Faucet](https://portal.hedera.com/faucet)
- [HashScan Testnet Explorer](https://hashscan.io/testnet)
- [Hedera Mirror Node API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)

---

## License

MIT
