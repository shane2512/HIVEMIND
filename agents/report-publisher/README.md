# Report Publisher Agent

Report Publisher composes final HIVE_REPORT messages after risk scoring and closes the pipeline.

## Runtime

- Watches HCS_ATTESTATION_TOPIC for risk-scorer-01 attestations.
- Loads pipeline outputs and composes a HIVE_REPORT.
- Publishes HIVE_REPORT to HCS_REPORT_TOPIC.
- Publishes final TASK_ATTESTATION and PIPELINE_COMPLETE.
- Initializes Hedera Agent Kit (AUTONOMOUS mode) at startup.

## Run

node agents/report-publisher/index.js
