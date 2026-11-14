# 무당티 유통 관리 — 독립 사이트

운호 플랫폼(`/mudangtea` 메뉴)에 있던 무당티 유통 관리 화면을 별도 사이트로 분리한 앱이다.
같은 저장소의 `mudangtea/` 폴더이며, 운호 앱과 코드가 분리되어 독립 배포된다.

## 설계 원칙

| 항목 | 방식 | 이유 |
|---|---|---|
| 데이터베이스 | 운호 플랫폼과 **같은 Supabase 프로젝트**의 `mdt_*` 표 5개 사용 | 기존 입력 데이터 이관 불필요, 계정·권한 이중 관리 없음 |
| 로그인 | 운호 플랫폼과 같은 이메일·비밀번호 | `users` 표 공유 |
| 접근 권한 | 대표·직원 중 재무 열람 권한자만(대표, `can_finance`, `FINANCE_VIEWER_EMAILS`) | 공급가·이익이 노출되는 화면 |
| 가격 설정 변경 | 대표 계정만 | 기존과 동일 |
| 변경 이력 | 운호 플랫폼의 `audit_logs`에 `entity = mudangtea`로 기록 | 이력 한곳에서 조회 |
| 검색 노출 | `noindex` 헤더·메타 | 내부 전용 |

화면 구성(요약·판매처·제안·판매 기록·재고·유통기한·배송비·설정)과 계산 규칙은 분리 전과 같다.
계산 규칙은 `src/lib/mudangtea.ts`, 테스트는 `tests/mudangtea.test.ts`.

## 폴더

```
mudangtea/
  src/app/page.tsx            대시보드(서버: 권한 확인·데이터 조회)
  src/app/MudangteaClient.tsx 화면
  src/app/actions.ts          저장·삭제·가격 설정(서버 액션)
  src/app/login/              로그인
  src/app/api/auth/           세션 연결·로그아웃
  src/lib/                    계산 규칙, 인증, 권한, Supabase 클라이언트
```

DB 스키마 원본은 운호 앱의 `supabase/migrations/0099_mudangtea_distribution.sql`이다(같은 DB를 쓰므로 한곳에서 관리).

## 로컬 실행

```bash
cd mudangtea
cp .env.example .env.local   # 운호 플랫폼과 같은 Supabase 값 입력
npm install
npm run dev                  # http://localhost:3100
npm test                     # 계산 규칙 테스트
```

배포는 [`DEPLOY.md`](DEPLOY.md) 참고.
