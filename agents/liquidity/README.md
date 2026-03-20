# Liquidity Agent

Liquidity analyzes HTS token balances and transfer velocity and publishes LiquidityReport attestations.

## Runtime

- Reads PIPELINE_BLUEPRINT messages from HCS_TASK_TOPIC.
- Finds stages assigned to liquidity-01.
- Fetches token info, balances, and recent transfer activity from Mirror Node.
- Computes concentration and liquidity metrics and publishes TASK_ATTESTATION.
- Initializes Hedera Agent Kit (AUTONOMOUS mode) at startup.

## Run

node agents/liquidity/index.js
