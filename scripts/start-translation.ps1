$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot '.sites-runtime\translation-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Install the local translation environment first; see docs/translation.md.' }
try {
    $taskHealth = Invoke-RestMethod 'http://127.0.0.1:5000/languages' -TimeoutSec 3
    if ($taskHealth.code -contains 'it') { Write-Output 'Translation service is already running.'; exit 0 }
} catch { }
$taskLog = Join-Path $taskRoot '.sites-runtime\translation'
New-Item -ItemType Directory -Force -Path $taskLog | Out-Null
Start-Process -FilePath $taskPython -ArgumentList @('-u', 'scripts/translation-server.py') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLog 'server.log') -RedirectStandardError (Join-Path $taskLog 'server-error.log') | Out-Null
Write-Output 'Translation service is starting in the background.'
