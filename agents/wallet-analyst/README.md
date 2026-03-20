# Wallet Analyst Agent

Wallet Analyst processes pipeline stage assignments for WalletAddress analysis and publishes TASK_ATTESTATION outputs to HCS.

## Runtime

- Reads PIPELINE_BLUEPRINT messages from HCS_TASK_TOPIC.
- Finds stages assigned to wallet-analyst-01.
- Fetches account and transaction history from Mirror Node.
- Computes WalletHistory metrics and publishes a TASK_ATTESTATION.
- Initializes Hedera Agent Kit (AUTONOMOUS mode) at startup.

## Run

node agents/wallet-analyst/index.js
