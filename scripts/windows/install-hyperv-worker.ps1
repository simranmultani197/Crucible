param()

$ErrorActionPreference = "Stop"

Write-Host "Configuring Windows Hyper-V prerequisites for Crucible local worker..."

try {
  Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -NoRestart -ErrorAction SilentlyContinue | Out-Null
} catch {
  Write-Host "Could not auto-enable Hyper-V (may require admin privileges)."
}

Write-Host ""
Write-Host "Set these environment values for Crucible:"
Write-Host '  SANDBOX_PROVIDER=auto'
Write-Host '  LOCAL_MICROVM_TRANSPORT=hyperv'
Write-Host '  LOCAL_MICROVM_HYPERV_CLI=powershell -ExecutionPolicy Bypass -File scripts/windows/hyperv-microvmctl.ps1'
Write-Host '  LOCAL_MICROVM_FALLBACK_TO_REMOTE=true'
Write-Host ""
Write-Host "Then run: npm run microvm:probe"
