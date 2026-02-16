param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = "Stop"

if (-not $Args -or $Args.Count -eq 0) {
  Write-Error "Usage: hyperv-microvmctl.ps1 <create|exec|write|read|list|kill> ..."
  exit 1
}

$backend = $env:CRUCIBLE_HYPERV_BACKEND_COMMAND
if ([string]::IsNullOrWhiteSpace($backend)) {
  $backend = "hyperv-microvmctl-backend"
}

$backendParts = $backend.Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
$backendCmd = $backendParts[0]
$backendArgs = @()
if ($backendParts.Count -gt 1) {
  $backendArgs = $backendParts[1..($backendParts.Count - 1)]
}

$cmd = Get-Command $backendCmd -ErrorAction SilentlyContinue
if (-not $cmd) {
  Write-Error "Hyper-V backend command not found: $backendCmd"
  Write-Host "Set CRUCIBLE_HYPERV_BACKEND_COMMAND to your implementation command."
  exit 1
}

$allArgs = @()
$allArgs += $backendArgs
$allArgs += $Args

& $backendCmd @allArgs
exit $LASTEXITCODE
