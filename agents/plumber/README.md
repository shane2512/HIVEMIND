# Plumber Agent

Plumber reads manifests from HCS registry, builds the capability graph, and publishes valid `PIPELINE_BLUEPRINT` messages for incoming `TASK_BUNDLE` messages.

## Behavior

- Bootstraps agent manifests from `HCS_REGISTRY_TOPIC`.
- Watches registry updates and refreshes manifest map on new `AGENT_MANIFEST`.
- Watches task topic for new `TASK_BUNDLE` messages.
- Runs deterministic cheapest-path assembly constrained by type compatibility and max budget.
- Publishes either `PIPELINE_BLUEPRINT` or `PIPELINE_FAILED` to `HCS_TASK_TOPIC`.
- Tracks `PIPELINE_COMPLETE` messages and mints a Pipeline NFT after `PLUMBER_NFT_MINT_THRESHOLD` completions.
- Deduplicates by `taskId` via state file `agents/plumber/.state/plumber-state.json`.

## Planner Config

- Plumber currently uses deterministic assembly only.

## Run

From repository root:

```bash
node agents/plumber/index.js
```

Or:

```bash
npm run plumber:start
```

## Test

1. Ensure manifests exist in registry:

```bash
node scripts/publish-manifests.js
```

2. Start plumber.
3. Publish a test task bundle:

```bash
node scripts/publish-mock-taskbundle.js
```

4. Read task topic and confirm a `PIPELINE_BLUEPRINT` appears with expected stages:
   - wallet-analyst-01
   - sentiment-01
   - liquidity-01
   - risk-scorer-01
   - report-publisher-01
