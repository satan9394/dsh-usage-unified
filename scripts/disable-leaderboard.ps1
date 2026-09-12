# Turn the optional leaderboard integration off.
#
#   npm run leaderboard:off
#
# Removes the daily refresh task and disables tokscale's own autosubmit. Data
# already uploaded stays until you delete it with `tokscale delete-submitted-data`.
$ErrorActionPreference = 'Continue'

if (Get-ScheduledTask -TaskName 'ai.tokscale.refresh' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'ai.tokscale.refresh' -Confirm:$false
    Write-Host 'Removed daily task "ai.tokscale.refresh".'
} else {
    Write-Host 'No daily task registered.'
}

if (Get-Command tokscale -ErrorAction SilentlyContinue) {
    tokscale autosubmit disable 2>&1 | Out-Null
    Write-Host 'tokscale autosubmit: disabled.'
    Write-Host 'To erase already-uploaded data:  tokscale delete-submitted-data'
}

Write-Host 'The plugin keeps working locally; nothing further will be uploaded.'
