# HIVE MIND — Pipeline Flows

All pipelines are assembled autonomously by the Plumber Agent based on agent manifests in the HCS registry. No pipeline is hardcoded. The two pipelines below form a complete protection loop — the first analyses a token, the second acts on the verdict.

---

## The Core Value Loop

This is what HIVE MIND actually does. Not just produces reports — it protects the network.

```
New HTS token created
        ↓
Pipeline 1 — Analysis Pipeline (40 seconds)
        ↓
If verdict is HIGH RISK:
        ↓
Pipeline 2 — Protection Pipeline (automatically triggered by Pipeline 1 output)
        ↓
Creator wallet blacklisted across entire agent network
        ↓
All agents permanently refuse to interact with that wallet
```

Pipeline 1 alone is a report. Pipeline 1 feeding Pipeline 2 is a **self-defending agent ecosystem**. This is the value that only exists in a multi-agent environment — a single agent cannot protect anyone else.

---

## Pipeline 1 — Token Analysis

**Trigger:** Watcher Agent detects a new HTS token creation on Hedera testnet.

### Full Flow

```
[Hedera Testnet — New HTS Token Created]
                   │
                   ▼
         [Watcher Agent]
         Evaluates token:
         — Creator wallet age > 24 hours
         — Not previously seen
                   │
                   ▼
    Posts TASK_BUNDLE to HCS TASK_TOPIC
                   │
                   ▼
         [Plumber Agent]
         Reads REGISTRY_TOPIC manifests
         Builds I/O type graph
         Finds cheapest valid pipeline
         Posts PIPELINE_BLUEPRINT to HCS
                   │
                   ▼
          [Goal Agent]
     Calls PipeEscrow.fund()
     Locks 0.013 PIPE in escrow
     Posts TASK_ASSIGNMENT for each stage
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
   [Wallet      [Sentiment  [Liquidity
    Analyst]     Agent]      Agent]
   Queries      Scans HCS   Queries HTS
   Mirror Node  topics for  token supply
   wallet       token       and holders
   history      mentions
         │         │         │
         └─────────┼─────────┘
                   ▼
     3 TASK_ATTESTATIONs on HCS ATTESTATION_TOPIC
                   │
                   ▼
          [Risk Scorer]
     Waits for all 3 upstream attestations
     Computes weighted risk score (0–100)
     Posts TASK_ATTESTATION
                   │
                   ▼
       [Report Publisher]
     Formats full HiveReport
     Posts to HCS REPORT_TOPIC with verdict
     Posts final TASK_ATTESTATION
                   │
                   ▼
       [PipeEscrow Contract]
     Verifies all attestations on HCS
     Releases PIPE to each agent wallet
                   │
                   ▼
     IF riskLabel === "HIGH" or "CRITICAL"
                   │
                   ▼
     Pipeline 2 fires automatically ↓
```

### Timeline

| Time | Event |
|---|---|
| T+0s | New HTS token detected by Watcher |
| T+5s | TaskBundle published to HCS |
| T+8s | PipelineBlueprint published by Plumber |
| T+10s | Escrow funded, parallel agents start |
| T+25s | All three stage-0 attestations on HCS |
| T+28s | Risk Scorer computes and attests |
| T+32s | Report published to HCS REPORT_TOPIC |
| T+35s | Escrow releases all payments |
| T+38s | If HIGH RISK — Pipeline 2 triggers |

---

## Pipeline 2 — Network Protection (Agent-Triggers-Agent)

**Trigger:** Report Publisher posts a HIGH RISK or CRITICAL verdict to HCS REPORT_TOPIC. A Watchlist Agent is subscribed to this topic. It detects the verdict and autonomously initiates Pipeline 2 — **no human input, no blockchain event, no new token needed**.

This is the critical distinction that makes HIVE MIND genuinely agent-native. The trigger is another agent's output. Humans have nothing to do with this.

### Full Flow

```
[Report Publisher posts HIVE_REPORT with riskLabel: "HIGH"]
                   │
                   ▼
      [Watchlist Agent — subscribed to HCS REPORT_TOPIC]
      Detects riskLabel === "HIGH" or "CRITICAL"
      Posts new TASK_BUNDLE to HCS TASK_TOPIC:
      "Cross-reference creator wallet 0.0.54321
       with all past HIVE_REPORT entries on HCS"
                   │
                   ▼
         [Plumber Agent — same instance]
         Assembles Pipeline 2:
         Cross-Reference Agent → Blacklist Agent
                   │
                   ▼
      [Cross-Reference Agent]
      Scans entire HCS REPORT_TOPIC history
      Finds all past reports mentioning wallet 0.0.54321
      Output: WalletRiskProfile
      — how many prior HIGH RISK tokens from this wallet
      — first/last seen dates
      — pattern classification
                   │
                   ▼
      [Blacklist Agent]
      Posts wallet 0.0.54321 to HCS BLACKLIST_TOPIC:
      {
        "walletId": "0.0.54321",
        "addedAt": "timestamp",
        "reason": "3 HIGH RISK tokens created",
        "evidenceReportIds": ["report-abc", "report-def", "report-xyz"]
      }
                   │
                   ▼
      [ALL agents in the network]
      Every agent subscribes to HCS BLACKLIST_TOPIC
      On new entry: update internal filter
      Refuse to process any future task involving
      wallet 0.0.54321 as creator or recipient
```

### Why This Is The Real Value

| Without Pipeline 2 | With Pipeline 2 |
|---|---|
| Agent publishes a report | Report triggers network-wide action |
| Information sits on HCS | Information becomes enforcement |
| Next bad token from same wallet gets analysed again | Next bad token from same wallet is rejected before analysis even starts |
| Value = one report | Value = permanent network protection |
| Works with 1 agent | Only works because multiple agents are watching each other |

The blacklist on HCS is permanent, public, and readable by any agent that joins the network in the future — not just today's agents. A new developer deploying a new agent next month automatically inherits the full protection history of the network from day one.

---

## The Full Protection Loop (Both Pipelines Together)

```
Token 1 created by wallet-A
   → Pipeline 1 fires → verdict: HIGH RISK
   → Pipeline 2 fires → wallet-A blacklisted

Token 2 created by wallet-A (same bad actor)
   → Watcher detects it
   → Watcher checks HCS BLACKLIST_TOPIC before posting TaskBundle
   → wallet-A is on the blacklist
   → Watcher does NOT post a TaskBundle
   → Pipeline never runs — bad actor blocked for free

Token 3 created by wallet-B (new bad actor)
   → Pipeline 1 fires → verdict: HIGH RISK
   → Pipeline 2 fires → wallet-B added to blacklist
   → Network now protects against both wallet-A and wallet-B
```

The network builds a permanent, cumulative shield. Every bad actor caught makes the next one cheaper to stop.

---

## Pipeline Type Graph

The Plumber maintains this graph in memory, rebuilt from HCS manifests on every restart.

```
HTSEventStream
      └──[Watcher]──▶ TaskBundle ──▶ [Plumber] ──▶ PipelineBlueprint

WalletAddress ──[Wallet Analyst]──▶ WalletHistory ──┐
                                                     ├──▶ [Risk Scorer] ──▶ RiskScore ──▶ [Report Publisher] ──▶ HCSPublication
TokenId ──[Sentiment Agent]──▶ SentimentScore ───────┤
                                                     │
TokenId ──[Liquidity Agent]──▶ LiquidityReport ─────┘

HCSPublication ──[Watchlist Agent]──▶ ProtectionTask ──▶ [Plumber] ──▶ Pipeline 2

WalletId ──[Cross-Reference Agent]──▶ WalletRiskProfile ──▶ [Blacklist Agent] ──▶ BlacklistEntry
```

When a new developer deploys an agent with `inputType: "RiskScore"` and `outputType: "AlertNotification"`, the Plumber automatically discovers a new branch without any code changes to HIVE MIND. The network extends itself.

---

## Escrow Contract State Machine

```
UNFUNDED → FUNDED → IN_PROGRESS → SETTLED
                         │
                         └──timeout──▶ PARTIAL_TIMEOUT
                                       (timed-out fee returned,
                                        completed agents still paid)
```

---

## Official Resources

- [Hedera Mirror Node API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api)
- [HCS SDK — Submit Message](https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service/submit-a-message)
- [HTS SDK — Transfer Tokens](https://docs.hedera.com/hedera/sdks-and-apis/sdks/token-service/transfer-tokens)
- [Hedera EVM Smart Contracts](https://docs.hedera.com/hedera/core-concepts/smart-contracts)
- [HashScan Testnet](https://hashscan.io/testnet)
