# Runs the daily blog draft session. ASCII only - do not add Korean here.
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir
chcp 65001 | Out-Null
$prompt = [IO.File]::ReadAllText((Join-Path $dir "daily-prompt.txt"), [Text.Encoding]::UTF8)
claude.cmd $prompt
