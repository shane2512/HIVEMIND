#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE"
  exit 1
fi

node "$ROOT_DIR/scripts/generate-openclaw-configs.js" --root "$ROOT_DIR"

AGENTS=(
  watcher
  plumber
  wallet-analyst
  sentiment
  liquidity
  risk-scorer
  report-publisher
)

for agent in "${AGENTS[@]}"; do
  profile_dir="$HOME/.openclaw-$agent"
  workspace_dir="$profile_dir/workspace"
  skills_dir="$workspace_dir/skills"
  scripts_dir="$workspace_dir/scripts"
  utils_dir="$workspace_dir/utils"

  mkdir -p "$skills_dir" "$scripts_dir" "$utils_dir"
  rm -rf "$skills_dir/hedera-core" "$skills_dir/$agent"

  cp -R "$ROOT_DIR/skills/hedera-core" "$skills_dir/hedera-core"
  cp -R "$ROOT_DIR/skills/$agent" "$skills_dir/$agent"
  cp -f "$ROOT_DIR"/agents/shared/scripts/*.js "$scripts_dir/"
  cp -f "$ROOT_DIR"/agents/shared/utils/*.js "$utils_dir/"
  cp -f "$ROOT_DIR"/agents/shared/*.js "$workspace_dir/"
  cp -f "$ROOT_DIR/.env" "$workspace_dir/.env"

  openclaw --profile "$agent" config validate

  echo "[OK] configured profile for $agent"
done

echo "All agent skill profiles are configured."