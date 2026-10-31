# A finite publishing step. No watcher, service, task, or detached process.
$evfxPreviousExitCode = $LASTEXITCODE
try {
    $evfxNode = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $evfxNode) { Write-Warning 'EVFX site sync skipped: Node is unavailable.'; return }
    & $evfxNode.Source (Join-Path $PSScriptRoot 'sync-after-build.mjs')
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Build succeeded; site sync will retry on the next build.' }
} catch {
    Write-Warning "Build succeeded; EVFX site sync was skipped: $($_.Exception.Message)"
} finally {
    $global:LASTEXITCODE = $evfxPreviousExitCode
}
