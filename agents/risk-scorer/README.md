# Risk Scorer Agent

Risk Scorer waits for upstream worker attestations and computes weighted risk output for each pipeline.

## Runtime

- Subscribes to HCS_ATTESTATION_TOPIC.
- Waits for wallet-analyst-01, sentiment-01, and liquidity-01 outputs for a pipeline.
- Computes weighted risk score and label.
- Publishes TASK_ATTESTATION as risk-scorer-01.
- Initializes Hedera Agent Kit (AUTONOMOUS mode) at startup.

## Run

node agents/risk-scorer/index.js
