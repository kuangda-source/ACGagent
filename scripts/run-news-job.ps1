$ErrorActionPreference = "Stop"

$projectRoot = "D:\program\ACGagent"
Set-Location $projectRoot

$nodePath = Join-Path $projectRoot ".tools\node"
$env:Path = "$nodePath;$env:Path"

$logDir = Join-Path $projectRoot "tmp\scheduler"
if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] start job:news" | Out-File -FilePath (Join-Path $logDir "news-task.log") -Encoding utf8 -Append

& (Join-Path $projectRoot ".tools\node\npm.cmd") run job:news 2>&1 | Out-File -FilePath (Join-Path $logDir "news-task.log") -Encoding utf8 -Append

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
"[$timestamp] done job:news" | Out-File -FilePath (Join-Path $logDir "news-task.log") -Encoding utf8 -Append
