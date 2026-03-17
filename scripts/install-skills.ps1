param(
  [string]$RootPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$agents = @(
  'watcher',
  'plumber',
  'wallet-analyst',
  'sentiment',
  'liquidity',
  'risk-scorer',
  'report-publisher'
)

function Get-EnvValue {
  param([string]$Key)
  $line = Get-Content (Join-Path $RootPath '.env') | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) { return '' }
  return $line.Split('=', 2)[1].Trim()
}

$provider = Get-EnvValue 'LLM_PROVIDER'
if (-not $provider) { $provider = 'openrouter' }

$model = switch ($provider.ToLower()) {
  'openrouter' {
    $m = Get-EnvValue 'OPENROUTER_MODEL'
    if ($m) { $m } else { 'openrouter/deepseek/deepseek-chat-v3-0324:free' }
  }
  'groq' {
    $m = Get-EnvValue 'GROQ_MODEL'
    if ($m) { $m } else { 'groq/llama-3.3-70b-versatile' }
  }
  'deepseek' {
    $m = Get-EnvValue 'DEEPSEEK_MODEL'
    if ($m) { $m } else { 'deepseek/deepseek-chat' }
  }
  'ollama' {
    $m = Get-EnvValue 'OLLAMA_MODEL'
    if ($m) { $m } else { 'ollama/deepseek-r1:8b' }
  }
  default {
    'openrouter/deepseek/deepseek-chat-v3-0324:free'
  }
}

foreach ($agent in $agents) {
  $profileName = $agent
  $profileDir = Join-Path $HOME (".openclaw-" + $profileName)
  $workspaceDir = Join-Path $profileDir 'workspace'
  $skillsDir = Join-Path $workspaceDir 'skills'
  $workspaceScripts = Join-Path $workspaceDir 'scripts'

  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
  New-Item -ItemType Directory -Force -Path $workspaceScripts | Out-Null

  $coreTarget = Join-Path $skillsDir 'hedera-core'
  if (Test-Path $coreTarget) { Remove-Item -Recurse -Force $coreTarget }
  Copy-Item -Recurse -Force (Join-Path $RootPath 'skills/hedera-core') $coreTarget

  $agentTarget = Join-Path $skillsDir $agent
  if (Test-Path $agentTarget) { Remove-Item -Recurse -Force $agentTarget }
  Copy-Item -Recurse -Force (Join-Path $RootPath ("skills/" + $agent)) $agentTarget

  Get-ChildItem (Join-Path $RootPath 'agents/shared/scripts') -File | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $workspaceScripts $_.Name)
  }
  Get-ChildItem (Join-Path $RootPath 'agents/shared') -File -Filter '*.js' | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $workspaceDir $_.Name)
  }
  Copy-Item -Force (Join-Path $RootPath '.env') (Join-Path $workspaceDir '.env')

  openclaw --profile $profileName config set agents.defaults.workspace $workspaceDir | Out-Host
  openclaw --profile $profileName config set agents.defaults.model.primary $model | Out-Host
  openclaw --profile $profileName config validate | Out-Host

  $configPath = Join-Path $profileDir 'openclaw.json'
  if (-not (Test-Path $configPath)) {
    throw "Missing OpenClaw config after setup: $configPath"
  }

  Write-Output "[OK] $agent profile configured: $configPath"
}

Write-Output "All agent skill profiles are configured."