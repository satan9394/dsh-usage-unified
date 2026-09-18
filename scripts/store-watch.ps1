# Append the status of the DSH STORE contract issue to logs\dsh-store-806.log.
#
# The store rechecks every 8 hours; this task polls on the same cadence and
# records state / last-updated / latest comment so the outcome is visible
# without visiting GitHub.
#
#   pwsh -NoProfile -File scripts\store-watch.ps1
param(
    [string]$Repo = 'AI-Scarlett/DSH-Store',
    [int]$Issue = 806
)
$ErrorActionPreference = 'Continue'
# `gh` emits UTF-8; PowerShell otherwise decodes native stdout with the console
# code page and mangles non-ASCII, breaking ConvertFrom-Json.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir "dsh-store-$Issue.log"
$stamp = Get-Date -Format s

# `gh` is run through the call operator so its stderr cannot be mistaken for
# JSON, and its exit code is checked explicitly. A transient failure (`gh` not
# on PATH, rate limit, offline) must leave a diagnosable line rather than an
# opaque "JSON parse failed" that loses the poll entirely.
function Write-Line([string]$text) {
    Add-Content -LiteralPath $log -Encoding utf8 -Value $text
    Write-Host $text
}

$raw = (& gh issue view $Issue --repo $Repo --json state,updatedAt,title,comments 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
    Write-Line "[$stamp] ERROR: gh exited $LASTEXITCODE :: $(($raw -replace '\s+', ' ').Trim())"
    return
}

# Tolerate stray leading noise: parse from the first brace to the last.
$text = $raw.Trim()
$start = $text.IndexOf('{')
$end = $text.LastIndexOf('}')
if ($start -lt 0 -or $end -lt $start) {
    Write-Line "[$stamp] ERROR: no JSON object in gh output :: $(($text -replace '\s+', ' ').Trim())"
    return
}

try {
    $view = $text.Substring($start, $end - $start + 1) | ConvertFrom-Json -ErrorAction Stop
} catch {
    Write-Line "[$stamp] ERROR: $($_.Exception.Message) :: $(($text -replace '\s+', ' ').Trim())"
    return
}

$comments = @($view.comments)
$last = ''
if ($comments.Count -gt 0) {
    $body = [string]$comments[-1].body
    $body = ($body -replace '\s+', ' ').Trim()
    if ($body.Length -gt 240) { $body = $body.Substring(0, 240) + '…' }
    $last = $body
}
Write-Line "[$stamp] state=$($view.state) updated=$($view.updatedAt) comments=$($comments.Count) last=$last"
