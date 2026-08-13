#!/usr/bin/env bash
# 하루바른·나아 플랫폼 원샷 배포 스크립트 (로컬 터미널 전용).
# Supabase 프로젝트 생성 + 마이그레이션 + Vercel 배포까지 수행한다.
#
# 필요 환경변수:
#   VERCEL_TOKEN           (필수)  https://vercel.com/account/settings/tokens
#   SUPABASE_ACCESS_TOKEN  (필수)  https://supabase.com/dashboard/account/tokens
#   SUPABASE_DB_PASSWORD   (필수)  새 DB 비밀번호(직접 정함, 8자 이상)
#   ANTHROPIC_API_KEY      (선택)  AI 기능용
#   CRON_SECRET            (선택)  없으면 자동 생성
#   PROJECT_NAME           (선택)  기본 harubareun-naa
#   SUPABASE_REGION        (선택)  기본 ap-northeast-2 (서울)
#
# 사용법:
#   cd harubareun && bash scripts/deploy.sh
set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN 필요}"
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN 필요}"
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD 필요}"
PROJECT_NAME="${PROJECT_NAME:-harubareun-naa}"
SUPABASE_REGION="${SUPABASE_REGION:-ap-northeast-2}"
CRON_SECRET="${CRON_SECRET:-$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")}"
export SUPABASE_ACCESS_TOKEN

SB() { npx --yes supabase "$@"; }
VC() { npx --yes vercel "$@" --token "$VERCEL_TOKEN"; }

echo "▶ 1/6 Supabase 조직 확인"
ORG_ID="$(SB orgs list -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);if(!a.length){console.error('조직이 없습니다. Supabase 가입 후 조직을 만드세요.');process.exit(1)}process.stdout.write(a[0].id)})")"
echo "  org: $ORG_ID"

echo "▶ 2/6 Supabase 프로젝트 생성 ($PROJECT_NAME, $SUPABASE_REGION)"
REF="$(SB projects create "$PROJECT_NAME" --org-id "$ORG_ID" --db-password "$SUPABASE_DB_PASSWORD" --region "$SUPABASE_REGION" -o json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(JSON.parse(s).id)})")"
echo "  project ref: $REF"
echo "  ⏳ 프로비저닝 대기(약 60초)…"; sleep 60

echo "▶ 3/6 마이그레이션 적용"
SB link --project-ref "$REF" --password "$SUPABASE_DB_PASSWORD"
SB db push --password "$SUPABASE_DB_PASSWORD"

echo "▶ 4/6 API 키 추출"
KEYS_JSON="$(SB projects api-keys --project-ref "$REF" -o json)"
ANON="$(echo "$KEYS_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write((a.find(k=>k.name==='anon')||{}).api_key||'')})")"
SERVICE="$(echo "$KEYS_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const a=JSON.parse(s);process.stdout.write((a.find(k=>k.name==='service_role')||{}).api_key||'')})")"
SUPA_URL="https://$REF.supabase.co"
echo "  url: $SUPA_URL"

echo "▶ 5/6 Vercel 프로젝트 링크 + 환경변수"
VC link --yes --project "$PROJECT_NAME" >/dev/null 2>&1 || true
set_env() { printf '%s' "$2" | VC env add "$1" production --force >/dev/null 2>&1 || printf '%s' "$2" | VC env add "$1" production >/dev/null 2>&1 || true; }
set_env NEXT_PUBLIC_SUPABASE_URL "$SUPA_URL"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY "$ANON"
set_env SUPABASE_SERVICE_ROLE_KEY "$SERVICE"
set_env CRON_SECRET "$CRON_SECRET"
[ -n "${ANTHROPIC_API_KEY:-}" ] && set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"

echo "▶ 6/6 배포"
URL="$(VC deploy --prod --yes)"
echo
echo "✅ 배포 완료: $URL"
echo "   NEXT_PUBLIC_SITE_URL 설정 후 재배포하면 매직링크 주소가 정확해집니다:"
echo "     printf '%s' \"$URL\" | npx vercel env add NEXT_PUBLIC_SITE_URL production --force --token \$VERCEL_TOKEN && npx vercel deploy --prod --yes --token \$VERCEL_TOKEN"
echo
echo "다음 수동 2단계(대시보드):"
echo "  1) Supabase → Authentication → Users → Add user: seohoo628@gmail.com (+ Email provider ON)"
echo "  2) Supabase → Authentication → URL Configuration → Redirect URLs: $URL/auth/callback"
echo
echo "그 후 $URL 에서 seohoo628@gmail.com 로 매직링크 로그인."
