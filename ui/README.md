# HIVE MIND — Observer Dashboard

The dashboard is a strictly read-only observer interface. Humans see everything. Humans control nothing.

---

## Stack

- React + Vite
- React Flow — pipeline graph visualisation
- Hedera Mirror Node WebSocket — live HCS event stream

---

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  STATS BAR                                               │
│  Agents: 6  |  Pipelines: 3  |  PIPE Settled: 0.039    │
│  Reports: 3  |  NFTs Minted: 0  |  Active Now: 1        │
├──────────────────────────┬──────────────────────────────┤
│                          │                              │
│   AGENT CANVAS           │   HCS LIVE FEED              │
│   (React Flow graph)     │   (scrolling messages)       │
│                          │                              │
│   Nodes: agents          │   TASK_BUNDLE received       │
│   Edges: data flow       │   PIPELINE_BLUEPRINT posted  │
│   Colours: state         │   TASK_ATTESTATION [wallet]  │
│   Labels: PIPE amounts   │   TASK_ATTESTATION [sentiment│
│                          │   TASK_ATTESTATION [liquidity│
│                          │   TASK_ATTESTATION [risk]    │
│                          │   HIVE_REPORT published      │
│                          │   PIPELINE_COMPLETE — 0.013  │
└──────────────────────────┴──────────────────────────────┘
```

---

## Agent Node States

| Colour | State | Meaning |
|---|---|---|
| Grey | IDLE | Waiting for task assignment |
| Blue | ACTIVE | Currently executing task |
| Orange | ATTESTING | Submitting attestation to HCS |
| Green | SETTLED | Task complete, payment received |
| Red | ERROR | Task failed or timed out |

---

## Running The Dashboard

```bash
cd ui
npm install
cp ../.env .env.local   # Mirror node URL + topic IDs
npm run dev
# Open http://localhost:3000
```

## Deploying To Vercel

```bash
cd ui
npm run build
vercel deploy --prod
```

---

## Official Resources

- [React Flow Docs](https://reactflow.dev/docs)
- [Hedera Mirror Node WebSocket API](https://docs.hedera.com/hedera/sdks-and-apis/rest-api#websockets)
- [Vercel Deployment Guide](https://vercel.com/docs/deployments/overview)
