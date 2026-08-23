# UNHO local automation setup - Windows
# Usage (admin PowerShell): Set-ExecutionPolicy -Scope Process Bypass; .\setup-windows.ps1
# NOTE: messages are ASCII-only on purpose - Windows PowerShell 5.1 mis-parses
# non-ASCII .ps1 files saved without a BOM. Do not add Korean text to this file.
$ErrorActionPreference = "Stop"

$Base = "$env:USERPROFILE\unho-automation"
$BrowserProfileDir = "$Base\browser-profile"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }

Step "0. Checking prerequisites"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn "Node.js not found. Install LTS from https://nodejs.org and re-run."
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Warn "Git not found. Install from https://git-scm.com/download/win and re-run."
  exit 1
}
New-Item -ItemType Directory -Force -Path $Base, $BrowserProfileDir | Out-Null

Step "1. Claude Code CLI"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  npm install -g @anthropic-ai/claude-code
} else {
  Write-Host "Already installed"
}

Step "2. Registering Playwright MCP (browser automation for blog/SNS)"
claude mcp remove --scope user playwright 2>$null
claude mcp add --scope user playwright -- npx -y "@playwright/mcp@latest" --user-data-dir $BrowserProfileDir
Write-Host "Playwright MCP registered (profile: $BrowserProfileDir)"

Step "3. Installing Premiere Pro MCP"
$PremDir = "$Base\premiere-mcp"
if (-not (Test-Path "$PremDir\.git")) {
  git clone --depth 1 https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP $PremDir
} else {
  git -C $PremDir pull --ff-only
}
Push-Location $PremDir
npm install
$pkgScripts = (Get-Content package.json -Raw | ConvertFrom-Json).scripts
if ($pkgScripts.PSObject.Properties.Name -contains "setup:windows") {
  npm run setup:windows
} elseif ($pkgScripts.PSObject.Properties.Name -contains "setup:win") {
  npm run setup:win
} else {
  Warn "No Windows setup script found - follow $PremDir\README.md manually (includes CEP panel install)."
}
Pop-Location

Step "4. Installing skills (~/.claude/skills)"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
foreach ($s in @("premiere-edit", "naver-blog", "sns-publish")) {
  $dst = "$env:USERPROFILE\.claude\skills\$s"
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse "$Here\skills\$s" $dst
  Write-Host "  - $s"
}

Step "5. Publish scripts + .env"
New-Item -ItemType Directory -Force -Path "$Base\scripts" | Out-Null
Copy-Item "$Here\scripts\threads_publish.py", "$Here\scripts\instagram_publish.py" "$Base\scripts\" -Force
if (-not (Test-Path "$Base\.env")) {
  Copy-Item "$Here\scripts\.env.example" "$Base\.env"
  Warn "Tokens needed: edit $Base\.env (for Threads/Instagram API)"
}
if (Get-Command python -ErrorAction SilentlyContinue) {
  python -m pip install --quiet requests python-dotenv
} else {
  Warn "Python not found. Install from https://python.org (check 'Add Python to PATH'), then run: python -m pip install requests python-dotenv"
}

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "Remaining manual steps (see local-setup/README.md):"
Write-Host "  1) Log in to Naver once  2) Fill tokens in $Base\.env  3) Open the Premiere Extensions panel"
