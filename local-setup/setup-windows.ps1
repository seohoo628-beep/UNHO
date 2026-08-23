# 운호컴퍼니 로컬 자동화 세팅 — Windows
# 사용법(관리자 PowerShell): Set-ExecutionPolicy -Scope Process Bypass; .\setup-windows.ps1
$ErrorActionPreference = "Stop"

$Base = "$env:USERPROFILE\unho-automation"
$ProfileDir = "$Base\browser-profile"
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "[!] $m" -ForegroundColor Yellow }

Step "0. 사전 확인"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Warn "Node.js가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요."
  exit 1
}
New-Item -ItemType Directory -Force -Path $Base, $ProfileDir | Out-Null

Step "1. Claude Code CLI"
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
  npm install -g @anthropic-ai/claude-code
} else {
  Write-Host "이미 설치됨"
}

Step "2. Playwright MCP 등록 (블로그·SNS 브라우저 자동화)"
claude mcp remove --scope user playwright 2>$null
claude mcp add --scope user playwright -- npx -y "@playwright/mcp@latest" --user-data-dir $ProfileDir
Write-Host "Playwright MCP 등록 완료 (프로필: $ProfileDir)"

Step "3. Premiere Pro MCP 설치"
$PremDir = "$Base\premiere-mcp"
if (-not (Test-Path "$PremDir\.git")) {
  git clone --depth 1 https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP $PremDir
} else {
  git -C $PremDir pull --ff-only
}
Push-Location $PremDir
npm install
$scripts = (Get-Content package.json -Raw | ConvertFrom-Json).scripts
if ($scripts.PSObject.Properties.Name -contains "setup:windows") {
  npm run setup:windows
} elseif ($scripts.PSObject.Properties.Name -contains "setup:win") {
  npm run setup:win
} else {
  Warn "Windows 자동 세팅 스크립트가 없습니다 — $PremDir\README.md 의 설치 절차(CEP 패널 설치 포함)를 따르세요."
}
Pop-Location

Step "4. 사용 스킬 설치 (~/.claude/skills)"
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.claude\skills" | Out-Null
foreach ($s in @("premiere-edit", "naver-blog", "sns-publish")) {
  $dst = "$env:USERPROFILE\.claude\skills\$s"
  if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
  Copy-Item -Recurse "$Here\skills\$s" $dst
  Write-Host "  - $s"
}

Step "5. 발행 스크립트 + .env"
New-Item -ItemType Directory -Force -Path "$Base\scripts" | Out-Null
Copy-Item "$Here\scripts\threads_publish.py", "$Here\scripts\instagram_publish.py" "$Base\scripts\" -Force
if (-not (Test-Path "$Base\.env")) {
  Copy-Item "$Here\scripts\.env.example" "$Base\.env"
  Warn "토큰 입력 필요: $Base\.env (쓰레드/인스타 API용)"
}
python -m pip install --quiet requests python-dotenv

Write-Host "`n세팅 완료! 남은 수동 작업은 local-setup/README.md 의 '설치 후 1회 수동 작업'을 보세요." -ForegroundColor Green
Write-Host "  1) 네이버 로그인 1회  2) $Base\.env 토큰 입력  3) Premiere 확장 패널 열기"
