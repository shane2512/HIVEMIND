# HIVE MIND — Demo Script

3-minute demo video script for hackathon submission.

---

## Pre-Recording Setup

Complete all of these before starting the screen recorder.

```
[ ] docker-compose up running — all 6 agents healthy in terminal
[ ] Dashboard open at http://localhost:3000
[ ] HashScan testnet open: https://hashscan.io/testnet
[ ] Hedera Portal open for token creation: https://portal.hedera.com
[ ] HCS Registry Topic page open on HashScan
[ ] Screen recorder ready (OBS or QuickTime)
[ ] Hedera testnet confirmed working: https://status.hedera.com
[ ] Token creation form pre-filled (name, symbol, supply — just needs submit click)
[ ] All 6 agent nodes showing IDLE (grey) on dashboard
```

---

## Recording Script

### 0:00 – 0:20 — The Network Starts

**Show:** Terminal with `docker-compose up`. All agents start. Each publishes manifest.

**Show:** Dashboard — 7 grey nodes, empty HCS feed, zeroed stats bar.

**Show briefly:** HashScan Registry Topic — 7 manifests visible as recent messages.

**Text overlay:**
> "Seven OpenClaw agents just introduced themselves to each other on Hedera. No human told them to. They are waiting for the blockchain."

---

### 0:20 – 0:50 — The Only Human Action

**Show:** Hedera Portal token creation form — pre-filled.

**Text overlay:**
> "One human action. Creating a token on Hedera testnet. This is the last thing a human does in this demo."

**Action:** Click submit.

**Show:** Transaction confirmed on HashScan. Dashboard Watcher Agent turns blue.

---

### 0:50 – 1:20 — Pipeline 1 Assembles And Runs

**Show:** Dashboard — Plumber turns blue. Pipeline edges appear. Three parallel agents activate.

**Show:** HCS feed — TaskBundle, PipelineBlueprint, three TASK_ASSIGNMENTs all appearing.

**Show:** HashScan TASK_TOPIC — all messages timestamped and permanent.

**Text overlay:**
> "Plumber assembled a 5-agent analysis pipeline from the manifest registry. No human wired this. The Plumber read the registry and found the cheapest valid path."

---

### 1:20 – 1:55 — Verdict And Payment

**Show:** Dashboard — three parallel agents turn orange (attesting), then green. Risk Scorer fires. Report Publisher fires.

**Show:** HCS feed — five TASK_ATTESTATIONs appearing. Then HIVE_REPORT with riskLabel: HIGH.

**Show:** Dashboard — PIPE token amounts appear on each edge. All five nodes green.

**Text overlay:**
> "Five attestations on Hedera. Five payments released by the escrow contract. Every step is permanent and verifiable on-chain."

---

### 1:55 – 2:30 — The Real Value — Pipeline 2 Fires Automatically

**Show:** Dashboard — Watchlist Agent node suddenly turns blue. New pipeline edges appear. Cross-Reference Agent and Blacklist Agent activate.

**Text overlay:**
> "Nobody triggered this. The Watchlist Agent was subscribed to the report topic. It saw the HIGH RISK verdict and acted on its own."

**Show:** HCS feed — new TaskBundle from Watchlist Agent. New PipelineBlueprint from Plumber. CrossReference attestation. Then BLACKLIST_ENTRY appearing on HCS.

**Show:** HashScan BLACKLIST_TOPIC — wallet address permanently recorded with evidence report IDs.

**Text overlay:**
> "Creator wallet is now blacklisted on Hedera. Every agent in this network — and every agent that joins in the future — will refuse to process tokens from this wallet."

---

### 2:30 – 2:50 — Network Is Now Smarter

**Show:** Create a second token from the same wallet on testnet.

**Show:** Dashboard — Watcher detects it. Checks blacklist. Immediately rejects — no pipeline fires.

**Text overlay:**
> "Same bad actor. Zero cost to catch them this time. The network learned."

---

### 2:50 – 3:00 — The Point

**Show:** HashScan — four topics all populated. Real on-chain permanent history.

**Text overlay:**
> "Two pipelines. Seven agents. One blockchain trigger. Zero human clicks after the first token creation. This is what an agent-native infrastructure looks like on Hedera."

---

## Backup Plan

If Hedera testnet is slow during recording:

1. Have a pre-recorded run saved from earlier testing
2. Use the pre-recorded run for the demo video
3. In the README, include real testnet transaction hashes from your test runs
4. Judges accept pre-recorded demos — what matters is that the transactions are real

If an agent crashes mid-demo:

1. `docker-compose restart {agent-name}` — agents rejoin by reading HCS history
2. State is on HCS, not in agent memory — restart is safe

---

## HashScan Links To Include In README

After recording, collect these and add to your README:

```
PIPE Token:         https://hashscan.io/testnet/token/{PIPE_TOKEN_ID}
Registry Topic:     https://hashscan.io/testnet/topic/{HCS_REGISTRY_TOPIC}
Task Topic:         https://hashscan.io/testnet/topic/{HCS_TASK_TOPIC}
Attestation Topic:  https://hashscan.io/testnet/topic/{HCS_ATTESTATION_TOPIC}
Report Topic:       https://hashscan.io/testnet/topic/{HCS_REPORT_TOPIC}
Escrow Contract:    https://hashscan.io/testnet/contract/{PIPE_ESCROW_ADDRESS}
Sample Pipeline Tx: https://hashscan.io/testnet/transaction/{SAMPLE_TX_ID}
```

---

## Video Upload

- Upload to YouTube (unlisted) or Loom
- Title: "HIVE MIND — Autonomous Agent Pipeline Network on Hedera"
- Include link in DoraHacks submission and README

---

## Official Resources

- [Hedera Status Page](https://status.hedera.com)
- [HashScan Testnet](https://hashscan.io/testnet)
- [Hedera Portal](https://portal.hedera.com)
- [Hedera Testnet Faucet](https://portal.hedera.com/faucet)
