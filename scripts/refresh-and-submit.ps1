# Refresh the two local supplements tokscale cannot read by itself, then submit.
#
#  - tokscale-export.mjs : DSH's versioned `session.v<N>.jsonl.zstd` (tokscale
#                          only reads the legacy `session.jsonl.zstd`).
#  - ccswitch-export.mjs : CC Switch's proxy-side Claude Code usage (tokscale
#                          only reads the agent's local transcripts, which are
#                          nearly empty here).
#  - custom-pricing.mjs  : CC Switch model prices -> tokscale custom-pricing.
#
# Scheduled daily by `ai.tokscale.refresh`. The submit summary is appended to
# logs\refresh.log.
#
# Run manually:  pwsh -NoProfile -File scripts\refresh-and-submit.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'refresh.log'
$stamp = Get-Date -Format s

Write-Host "[refresh] exporting DSH sessions..."
node (Join-Path $PSScriptRoot 'tokscale-export.mjs')

Write-Host "[refresh] exporting CC Switch claude usage..."
node (Join-Path $PSScriptRoot 'ccswitch-export.mjs')

Write-Host "[refresh] refreshing custom pricing from CC Switch..."
node (Join-Path $PSScriptRoot 'custom-pricing.mjs')

Write-Host "[refresh] submitting to tokscale..."
$submit = tokscale submit 2>&1
$submit | ForEach-Object { Write-Host $_ }
$summary = (($submit | Select-String -CaseSensitive -Pattern 'Total tokens|Total cost|Successfully submitted') -join ' | ')
Add-Content -LiteralPath $log -Encoding UTF8 -Value ("[$stamp] " + $summary)
Write-Host "[refresh] done $stamp"
