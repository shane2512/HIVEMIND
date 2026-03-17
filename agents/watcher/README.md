# Watcher Agent

Watcher monitors Hedera testnet for new HTS token creations and publishes qualifying opportunities as UCP TASK_BUNDLE messages to HCS.

## Behavior

- Polls Mirror Node token list on an interval (`WATCHER_POLL_INTERVAL_MS`, default `5000`).
- Fetches token details and evaluates creator wallet criteria.
- Deduplicates token IDs using local state file at `agents/watcher/.state/watcher-state.json`.
- Publishes qualifying tokens to `HCS_TASK_TOPIC`.
- If Mirror Node fails, waits `WATCHER_RECONNECT_DELAY_MS` (default `15000`) and retries.

## Qualification Rules

A token qualifies only when all checks pass:

- Creator wallet is not the operator account.
- Creator wallet age is at least `WATCHER_CREATOR_WALLET_MIN_AGE_HOURS`.
- Creator wallet balance is at least `WATCHER_MIN_LIQUIDITY_HBAR`.
- Token ID has not already been seen.

Set `WATCHER_EXCLUDE_OPERATOR_CREATOR=true` if you want to ignore tokens created by your own operator account.

## Run

From repository root:

```bash
node agents/watcher/index.js
```

Or:

```bash
npm run watcher:start
```

## Live Test

1. Start the watcher in one terminal.
2. Create a test token in another terminal:

```bash
node scripts/create-test-token.js
```

3. Watcher should log `Qualifying token detected: 0.0.x`.
4. Confirm a `TASK_BUNDLE` appears on `HCS_TASK_TOPIC`:

```bash
node agents/shared/scripts/hcs-read.js --topic $HCS_TASK_TOPIC --limit 5
```
