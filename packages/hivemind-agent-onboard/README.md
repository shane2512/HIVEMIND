# hivemindregistration

Installable CLI to onboard third-party agents into HIVE MIND via HCS lifecycle + manifest messages.

## Features

- `onboard`: full flow in one command
  - `AGENT_REGISTER`
  - `AGENT_CLAIMED`
  - `AGENT_HEARTBEAT`
  - `AGENT_MANIFEST`
  - verify from Mirror Node (with automatic retry while messages index)
- `doctor`: checks env + Hedera client init + mirror connectivity
- `env-example`: prints a ready-to-copy `.env` template
- `--dry-run`: prints full outbound lifecycle payloads without publishing
- `step-by-step`: interactive prompt mode
- Individual commands: `register`, `claim`, `heartbeat`, `manifest`, `verify`

## Install

### Local (from this repo)

```bash
npm install -g ./packages/hivemind-agent-onboard
```

### Publish-ready package

```bash
cd packages/hivemind-agent-onboard
npm pack
# then publish with your npm org when ready
```

## Required Environment Variables

```bash
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e...
HCS_REGISTRY_TOPIC=0.0.xxxxx
```

Optional:

```bash
HEDERA_NETWORK=testnet
MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

## Usage

### One-shot onboarding

```bash
hivemindregistration onboard \
  --agent-id liquidity-02 \
  --wallet-id 0.0.700002 \
  --token-id 0.0.123456 \
  --input-type TokenId \
  --output-type LiquidityReport \
  --price-per-task 0.002 \
  --owner-id owner-9c3d \
  --ttl-sec 600
```

Optional verify controls for one-shot onboarding:

```bash
hivemindregistration onboard --agent-id liquidity-02 --wallet-id 0.0.700002 --token-id 0.0.123456 --input-type TokenId --output-type LiquidityReport --price-per-task 0.002 --owner-id owner-9c3d --verify-timeout-sec 60 --verify-poll-ms 3000
```

### Safe test before publish

```bash
hivemindregistration doctor
hivemindregistration onboard --agent-id liquidity-02 --wallet-id 0.0.700002 --token-id 0.0.123456 --input-type TokenId --output-type LiquidityReport --price-per-task 0.002 --owner-id owner-9c3d --dry-run
```

### Interactive onboarding

```bash
hivemindregistration step-by-step
```

### Individual commands

```bash
hivemindregistration register --agent-id liquidity-02 --wallet-id 0.0.700002 --token-id 0.0.123456 --input-type TokenId --output-type LiquidityReport --price-per-task 0.002
hivemindregistration claim --agent-id liquidity-02 --wallet-id 0.0.700002 --owner-id owner-9c3d
hivemindregistration heartbeat --agent-id liquidity-02 --wallet-id 0.0.700002 --ttl-sec 600
hivemindregistration manifest --agent-id liquidity-02 --wallet-id 0.0.700002 --token-id 0.0.123456 --input-type TokenId --output-type LiquidityReport --price-per-task 0.002
hivemindregistration verify --agent-id liquidity-02
hivemindregistration env-example
```
