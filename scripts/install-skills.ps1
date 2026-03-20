param(
  [string]$RootPath = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $RootPath '.env'
if (-not (Test-Path $envPath)) {
  throw ".env not found at $envPath"
}

$agents = @(
  'watcher',
  'plumber',
  'wallet-analyst',
  'sentiment',
  'liquidity',
  'risk-scorer',
  'report-publisher'
)

node (Join-Path $RootPath 'scripts/generate-openclaw-configs.js') --root $RootPath | Out-Host

foreach ($agent in $agents) {
  $profileName = $agent
  $profileDir = Join-Path $HOME (".openclaw-" + $profileName)
  $workspaceDir = Join-Path $profileDir 'workspace'
  $skillsDir = Join-Path $workspaceDir 'skills'
  $workspaceScripts = Join-Path $workspaceDir 'scripts'
  $workspaceUtils = Join-Path $workspaceDir 'utils'

  New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
  New-Item -ItemType Directory -Force -Path $workspaceScripts | Out-Null
  New-Item -ItemType Directory -Force -Path $workspaceUtils | Out-Null

  $coreTarget = Join-Path $skillsDir 'hedera-core'
  if (Test-Path $coreTarget) { Remove-Item -Recurse -Force $coreTarget }
  Copy-Item -Recurse -Force (Join-Path $RootPath 'skills/hedera-core') $coreTarget

  $agentTarget = Join-Path $skillsDir $agent
  if (Test-Path $agentTarget) { Remove-Item -Recurse -Force $agentTarget }
  Copy-Item -Recurse -Force (Join-Path $RootPath ("skills/" + $agent)) $agentTarget

  Get-ChildItem (Join-Path $RootPath 'agents/shared/scripts') -File | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $workspaceScripts $_.Name)
  }
  Get-ChildItem (Join-Path $RootPath 'agents/shared/utils') -File -Filter '*.js' | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $workspaceUtils $_.Name)
  }
  Get-ChildItem (Join-Path $RootPath 'agents/shared') -File -Filter '*.js' | ForEach-Object {
    Copy-Item -Force $_.FullName (Join-Path $workspaceDir $_.Name)
  }
  Copy-Item -Force (Join-Path $RootPath '.env') (Join-Path $workspaceDir '.env')

  openclaw --profile $profileName config validate | Out-Host

  $configPath = Join-Path $profileDir 'openclaw.json'
  if (-not (Test-Path $configPath)) {
    throw "Missing OpenClaw config after setup: $configPath"
  }

  Write-Output "[OK] $agent profile configured: $configPath"
}

Write-Output "All agent skill profiles are configured."