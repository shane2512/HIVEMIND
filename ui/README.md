# HIVE MIND — Observer Dashboard

Read-only observer interface for human monitoring. The application itself remains agent-first.

## What It Shows

- Live stats: active/completed pipelines, reports, settled PIPE totals, planner mode.
- Agent flow map with state coloring (IDLE, ACTIVE, ATTESTING, SETTLED, ERROR).
- Unified HCS feed across task, attestation, and report topics.
- Latest pipeline timeline with stage completion and latency checkpoints.
- Manual refresh, poll interval controls, and JSON snapshot export for evidence capture.

## Stack

- React + Vite
- Hedera Mirror Node REST polling

## Required Environment Variables

Create `ui/.env.local` (or export in your shell):

```dotenv
VITE_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
VITE_HCS_TASK_TOPIC=0.0.x
VITE_HCS_ATTESTATION_TOPIC=0.0.x
VITE_HCS_REPORT_TOPIC=0.0.x
```

## Run Locally

```bash
cd ui
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
cd ui
npm run build
npm run preview
```
