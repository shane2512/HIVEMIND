#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo ".env not found at $ENV_FILE"
  exit 1
fi

get_env() {
  local key="$1"
  grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d'=' -f2-
}

LLM_PROVIDER="$(get_env LLM_PROVIDER)"
if [[ -z "$LLM_PROVIDER" ]]; then
  LLM_PROVIDER="openrouter"
fi

case "${LLM_PROVIDER,,}" in
  openrouter)
    MODEL="$(get_env OPENROUTER_MODEL)"
    MODEL="${MODEL:-openrouter/deepseek/deepseek-chat-v3-0324:free}"
    ;;
  groq)
    MODEL="$(get_env GROQ_MODEL)"
    MODEL="${MODEL:-groq/llama-3.3-70b-versatile}"
    ;;
  deepseek)
    MODEL="$(get_env DEEPSEEK_MODEL)"
    MODEL="${MODEL:-deepseek/deepseek-chat}"
    ;;
  ollama)
    MODEL="$(get_env OLLAMA_MODEL)"
    MODEL="${MODEL:-ollama/deepseek-r1:8b}"
    ;;
  *)
    MODEL="openrouter/deepseek/deepseek-chat-v3-0324:free"
    ;;
esac

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

  mkdir -p "$skills_dir" "$scripts_dir"
  rm -rf "$skills_dir/hedera-core" "$skills_dir/$agent"

  cp -R "$ROOT_DIR/skills/hedera-core" "$skills_dir/hedera-core"
  cp -R "$ROOT_DIR/skills/$agent" "$skills_dir/$agent"
  cp -f "$ROOT_DIR"/agents/shared/scripts/*.js "$scripts_dir/"
  cp -f "$ROOT_DIR"/agents/shared/*.js "$workspace_dir/"
  cp -f "$ROOT_DIR/.env" "$workspace_dir/.env"

  openclaw --profile "$agent" config set agents.defaults.workspace "$workspace_dir"
  openclaw --profile "$agent" config set agents.defaults.model.primary "$MODEL"
  openclaw --profile "$agent" config validate

  echo "[OK] configured profile for $agent"
done

echo "All agent skill profiles are configured."