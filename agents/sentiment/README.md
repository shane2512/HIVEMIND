# Sentiment Agent

Sentiment scans Hedera topic activity for TokenId mentions and publishes SentimentScore attestations.

## Runtime

- Reads PIPELINE_BLUEPRINT messages from HCS_TASK_TOPIC.
- Finds stages assigned to sentiment-01.
- Scans configured HCS topics for token mentions.
- Computes sentiment metrics and publishes TASK_ATTESTATION.
- Initializes Hedera Agent Kit (AUTONOMOUS mode) at startup.

## Run

node agents/sentiment/index.js
