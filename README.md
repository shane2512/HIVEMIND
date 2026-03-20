# HIVE MIND

**Autonomous Agent Pipeline Network on Hedera**

> A self-sustaining, agent-native intelligence network where OpenClaw agents autonomously perceive on-chain events, self-assemble into task pipelines, pay each other in PIPE tokens via HTS, attest work on HCS, and collectively build a growing intelligence layer — with zero human involvement after deployment.

[![Hedera Testnet](https://img.shields.io/badge/Network-Hedera%20Testnet-3d1fba)](https://portal.hedera.com)
[![OpenClaw](https://img.shields.io/badge/Agents-OpenClaw-orange)](https://openclaw.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## What Is HIVE MIND?

HIVE MIND is a killer app for the Agentic Society. It is a network of OpenClaw agents that collectively protect the Hedera ecosystem from bad actors — autonomously, continuously, and without any human involvement after deployment.

Every agent is an **OpenClaw instance with a specialist HIVE MIND skill installed**. Each runs its own continuous loop, publishes its capabilities to HCS, earns PIPE tokens for its work, and feeds its output into the next agent downstream. The network does not just produce reports — it acts on them. A HIGH RISK verdict does not sit on HCS doing nothing. It triggers a second pipeline that blacklists the creator wallet across the entire network, so every agent in the ecosystem automatically refuses to interact with that wallet going forward.

**The value is cumulative and permanent.** Every pipeline that runs makes the Hedera agent ecosystem provably safer for every other agent. The more agents that join, the faster bad actors are identified and the broader the protection becomes.

When a new HTS token is created on Hedera:

1. A **Watcher Agent** detects it from the live HTS event stream — no human trigger
2. A **Plumber Agent** auto-assembles a 5-agent analysis pipeline from HCS manifests
3. **Wallet Analyst**, **Sentiment**, and **Liquidity** agents run in parallel
4. A **Risk Scorer** combines their outputs into a weighted risk score
5. A **Report Publisher** posts the verdict permanently to HCS
6. If the verdict is HIGH RISK — a second pipeline fires automatically, blacklisting the creator wallet across the network
7. Every agent in the ecosystem reads the blacklist and refuses further interaction with that wallet
8. All agents receive PIPE tokens via EVM escrow — trust enforced on-chain, not by agreement

Zero human input. Permanent on Hedera. Every new agent that joins extends the reach of every past verdict.

---

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker and Docker Compose
- OpenClaw installed — [Installation Guide](https://docs.openclaw.ai/getting-started)
- An LLM provider — Groq free tier recommended ([Get API key](https://console.groq.com))
- Hedera testnet account — [Get one free](https://portal.hedera.com)
- Testnet HBAR — [Faucet](https://portal.hedera.com/faucet)

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
| Clear value in multi-agent environment | Network protection is cumulative — every HIGH RISK verdict blacklists a wallet across all agents permanently. Single agent sees nothing. The full network catches bad actors before they can harm other agents. Value compounds with every new agent that joins. |
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
