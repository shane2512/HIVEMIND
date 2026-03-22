param(
  [switch]$DryRun
)

$repoRoot = Split-Path -Parent $PSScriptRoot

$targets = @(
  @{ Name = 'watcher'; Cwd = $repoRoot; Cmd = 'npm run watcher:start' },
  @{ Name = 'plumber'; Cwd = $repoRoot; Cmd = 'npm run plumber:start' },
  @{ Name = 'wallet-analyst'; Cwd = $repoRoot; Cmd = 'npm run wallet-analyst:start' },
  @{ Name = 'sentiment'; Cwd = $repoRoot; Cmd = 'npm run sentiment:start' },
  @{ Name = 'liquidity'; Cwd = $repoRoot; Cmd = 'npm run liquidity:start' },
  @{ Name = 'risk-scorer'; Cwd = $repoRoot; Cmd = 'npm run risk-scorer:start' },
  @{ Name = 'report-publisher'; Cwd = $repoRoot; Cmd = 'npm run report-publisher:start' },
  @{ Name = 'ui'; Cwd = (Join-Path $repoRoot 'ui'); Cmd = 'npm run dev' }
)

foreach ($target in $targets) {
  $launch = "Set-Location '$($target.Cwd)'; $($target.Cmd)"

  if ($DryRun) {
    Write-Host "[DRY RUN] $($target.Name): $launch"
    continue
  }

  Start-Process powershell -ArgumentList @(
    '-NoExit',
    '-Command',
    $launch
  ) | Out-Null

  Write-Host "[STARTED] $($target.Name)"
}

if (-not $DryRun) {
  Write-Host 'All agents and UI started in separate terminals.'
}
