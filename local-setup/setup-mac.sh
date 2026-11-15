#!/usr/bin/env bash
# 운호컴퍼니 로컬 자동화 세팅 — macOS
# 사용법: bash setup-mac.sh
set -euo pipefail

BASE="$HOME/unho-automation"
PROFILE_DIR="$BASE/browser-profile"
SKILL_SRC="$(cd "$(dirname "$0")" && pwd)/skills"
SCRIPT_SRC="$(cd "$(dirname "$0")" && pwd)/scripts"

step() { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$1"; }

step "0. 사전 확인"
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js가 없습니다. https://nodejs.org 에서 LTS 설치 후 다시 실행하세요."
  exit 1
fi
NODE_MAJOR="$(node -v | sed 's/v\([0-9]*\).*/\1/')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node.js 18 이상이 필요합니다. 현재: $(node -v)"
  exit 1
fi
mkdir -p "$BASE" "$PROFILE_DIR"

step "1. Claude Code CLI"
if ! command -v claude >/dev/null 2>&1; then
  npm install -g @anthropic-ai/claude-code
else
  echo "이미 설치됨: $(claude --version 2>/dev/null || echo claude)"
fi

step "2. Playwright MCP 등록 (블로그·SNS 브라우저 자동화)"
# 전용 프로필을 쓰므로 네이버/인스타 로그인이 세션 간 유지된다.
claude mcp remove --scope user playwright >/dev/null 2>&1 || true
claude mcp add --scope user playwright -- \
  npx -y @playwright/mcp@latest --user-data-dir "$PROFILE_DIR"
echo "Playwright MCP 등록 완료 (프로필: $PROFILE_DIR)"

step "3. Premiere Pro MCP 설치"
PREM_DIR="$BASE/premiere-mcp"
if [ ! -d "$PREM_DIR/.git" ]; then
  git clone --depth 1 https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP "$PREM_DIR"
else
  git -C "$PREM_DIR" pull --ff-only || true
fi
(
  cd "$PREM_DIR"
  npm install
  # 저장소가 제공하는 mac 자동 세팅 스크립트가 있으면 실행 (CEP 패널 설치 포함)
  if npm run 2>/dev/null | grep -q "setup:mac"; then
    npm run setup:mac || warn "setup:mac 실패 — $PREM_DIR/README.md 의 수동 설치 절차를 따르세요."
  else
    warn "setup:mac 스크립트가 없습니다 — $PREM_DIR/README.md 의 설치 절차를 따르세요."
  fi
)

step "4. 사용 스킬 설치 (~/.claude/skills)"
mkdir -p "$HOME/.claude/skills"
for s in premiere-edit naver-blog sns-publish; do
  rm -rf "$HOME/.claude/skills/$s"
  cp -R "$SKILL_SRC/$s" "$HOME/.claude/skills/$s"
  echo "  - $s"
done

step "5. 발행 스크립트 + .env"
mkdir -p "$BASE/scripts"
cp "$SCRIPT_SRC/threads_publish.py" "$SCRIPT_SRC/instagram_publish.py" "$BASE/scripts/"
if [ ! -f "$BASE/.env" ]; then
  cp "$SCRIPT_SRC/.env.example" "$BASE/.env"
  warn "토큰 입력 필요: $BASE/.env (쓰레드/인스타 API용)"
fi
python3 -m pip install --quiet requests python-dotenv 2>/dev/null || \
  warn "pip 설치 실패 — 'python3 -m pip install requests python-dotenv' 를 직접 실행하세요."

printf '\n\033[1;32m세팅 완료!\033[0m 남은 수동 작업은 local-setup/README.md 의 "설치 후 1회 수동 작업"을 보세요.\n'
echo "  1) 네이버 로그인 1회  2) $BASE/.env 토큰 입력  3) Premiere 확장 패널 열기"
