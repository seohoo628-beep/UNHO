# 운호컴퍼니 운영 통합 플랫폼 — Phase 1

승인 대기 큐를 중심에 둔 운영 플랫폼이다. 마케터·MD·디자이너가 만들던 반복 산출물을
AI가 만들고, 사람(대표)은 승인과 집행만 한다.

**Phase 1 범위**: 인증 · 역할 3종(대표·직원·AI) · 브랜드 데이터 이관 · 업무 등록 ·
마케터 에이전트 1종 · 규제 검수(자동) · 승인 큐 · 대시보드 상단 승인 대기 카운트.
외주업체 포털과 나머지 에이전트(MD·디자이너), 거래처·발주, 리포트는 Phase 2/3.

## 완료 기준

대표가 아침에 대시보드 한 화면을 열어 승인 대기 항목을 보고, 승인 또는 반려를 누르고,
그 결과(최근 승인 결정)가 담당자에게 보이는 흐름이 실제로 돈다.

```
AI 생성 → 규제 검수(자동) → 사람 검토 → 대표 승인 → (집행) → (성과 기록)
                    │
        검수 미통과는 승인 큐에 올리지 않고
        지적 문구 + 대체 제안과 함께 AI 화면에서 재생성
```

## 기술 스택

- Next.js 14 (App Router) + TypeScript
- Supabase (Postgres + Auth + Storage), Row Level Security로 역할별 격리
- 인증: 이메일 매직링크
- AI 실행: 서버 라우트에서 Anthropic API 호출(키는 환경변수). 클라이언트에서 직접 호출하지 않음
- 배포: Vercel, 정기 실행은 Vercel Cron
- 시간대는 전부 `Asia/Seoul` 고정

## 화면

| 경로 | 화면 | 내용 |
|---|---|---|
| `/dashboard` | 대시보드 | 최상단 대표 승인 대기 카운트, 규제 검수 미통과, 지연 업무, 대표 회신 대기, 최근 승인 결정 |
| `/approvals` | 승인 큐 | 검수 통과 산출물을 카드로. 원문·검수 결과를 한 화면에서. 승인 / 반려 / 수정 요청 |
| `/tasks` | 업무 보드 | 브랜드·담당자 필터. 대기 대상이 대표인 항목은 붉게. 업무 등록·상태 변경 |
| `/ai` | AI 직원 | 마케터 에이전트 수동 실행, 최근 산출물, 검수 미통과 지적·대체 제안 |
| `/brands` | 브랜드 | brand_master 이관 데이터 열람·편집. VI 팔레트 색상 미리보기 |

## 역할과 권한 (RLS로 강제)

| 역할 | 권한 |
|---|---|
| 대표 (owner) | 전체 열람, 승인·반려, 수정 요청, 업무·브랜드 편집 |
| 직원 (staff) | 전체 열람, 업무 등록·상태 변경, 브랜드 편집, 수정 요청 (승인·반려 불가) |
| AI (ai) | 로그인 세션이 없다. 산출물 기록은 서버의 `service_role` 로만. 승인·발송·금액확정 구조적 불가 |

승인·반려는 대표만, 수정 요청은 직원도 가능하다. AI는 세션이 없어 승인·발송·금액확정에
접근할 수 없다. 이 격리는 나중에 붙이지 않고 스키마 단계에서 확정했다.

## 데이터 모델

`corporations` 법인·당사자 · `brands` 브랜드(규제 근거·VI 팔레트·톤) · `users` 사용자 ·
`tasks` 업무(대기 사유·대기 대상 포함) · `ai_outputs` AI 산출물 ·
`compliance_checks` 규제 검수 결과 · `approvals` 승인 이력.

브랜드·법인 값은 앱에서 하드코딩하지 않고 전부 DB에서 읽는다. 최초 데이터는
`data/brand_master.xlsx`(법인마스터·브랜드마스터·VI규격)에서 이관했다
(`supabase/migrations/0003_seed_brand_master.sql`). 이관 후에는 이 DB가 원본이며
xlsx는 운영 워크스페이스의 `archive/`로 내린다.

## 마케터 에이전트

- 실행: 평일 09:00 (Vercel Cron, `vercel.json` → `/api/cron/marketer`), 또는 `/ai`에서 수동 실행
- 브랜드의 `카테고리`·`규제 근거`·`VI 팔레트`·`톤 3줄`을 DB에서 읽어 프롬프트를 조립한다.
  브랜드 구분 없는 문장은 실패로 본다
- 산출: 릴스 대본(후킹 3안·컷 구성·자막·촬영 디렉션), 피드 카피, 업로드 카피·해시태그
- **엣지라인의원**은 의료광고 사전심의 대상이라 `brands.ai_enabled = false`로 실행 대상에서
  제외한다. **청담오리골**도 계약 전 파트너 법인(SBJ컴퍼니) 소속이라 계약·사업자번호 확정
  전까지 `ai_enabled = false`로 보류한다. `/brands`에서 대표가 승인 시 켤 수 있다

## 플랫폼 레벨에서 막는 것

1. **AI가 금액을 확정하지 않는다** — 단가·수수료 등 금액 자리는 `[   ]`로 비우도록 프롬프트에서 강제
2. **AI가 대외 발송하지 않는다** — 산출물은 초안 저장만. 발송 기능 없음
3. **AI가 법적 확약 표현을 쓰지 않는다** — 보장·전액 책임·무조건을 규제 검수 금지어로 등록
4. **엣지라인의원 자동 생성 제외** — `ai_enabled = false`
5. **검수 미통과분은 승인 큐에 올라오지 않는다** — 지적 문구·대체 제안과 함께 재생성

규제 검수 규칙은 `src/lib/compliance.ts`에 있고, 브랜드의 `regulation`(화장품법 /
건강기능식품법 / 식품표시광고법 / 의료법)에 따라 다른 기준을 적용한다.

## 로컬 실행

```bash
# 1) 의존성
npm install

# 2) 환경변수 — .env.example 을 복사해 채운다
cp .env.example .env.local

# 3) DB 마이그레이션 (Supabase CLI)
#    supabase 프로젝트에 연결한 뒤:
supabase db reset            # 로컬 개발 DB에 0001~0003 순서로 적용
#    또는 원격 프로젝트에 순서대로 실행:
#    supabase/migrations/0001_schema.sql
#    supabase/migrations/0002_rls.sql
#    supabase/migrations/0003_seed_brand_master.sql

# 4) users 이메일을 실제 계정으로 (0003 시드값 대신, 선택)
OWNER_EMAIL=... STAFF1_EMAIL=... STAFF2_EMAIL=... npm run seed:users

# 5) 개발 서버
npm run dev        # http://localhost:3000
```

로그인은 `users` 테이블에 사전 등록된 이메일만 매직링크를 받는다. 최초 로그인 시
`auth_id`가 이메일로 연결된다(`/auth/callback`).

## 환경변수

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (RLS 적용, 브라우저·서버 세션용) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. AI 산출물 기록·시드에만 사용. 절대 클라이언트 노출 금지 |
| `ANTHROPIC_API_KEY` | 마케터 에이전트 실행 (서버 라우트에서만 호출) |
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-5` |
| `CRON_SECRET` | `/api/cron/*` 보호. `Authorization: Bearer <CRON_SECRET>` |
| `NEXT_PUBLIC_SITE_URL` | 매직링크 콜백 사이트 URL (로컬 `http://localhost:3000`) |

Vercel 배포 시 Cron이 `CRON_SECRET`을 자동으로 붙이도록 프로젝트 환경변수에 등록한다.

## 배포 (Vercel)

1. 이 저장소를 Vercel 프로젝트로 연결
2. 위 환경변수를 프로젝트에 등록
3. `vercel.json`의 Cron(`0 0 * * 1-5` = 평일 09:00 KST)이 `/api/cron/marketer`를 호출
4. Supabase Auth의 Redirect URL에 `https://<도메인>/auth/callback` 등록

## 무엇을 만들었고 무엇을 남겼나

**만든 것**: 스키마·RLS(7개 테이블), 브랜드/법인 이관 시드, 매직링크 인증, 대시보드,
승인 큐(승인·반려·수정요청), 업무 보드, AI 직원 화면, 브랜드 편집(VI 미리보기),
마케터 에이전트 + 규제 검수 게이트 + 평일 09:00 Cron.

**남긴 것 (Phase 2/3)**: 외주업체 포털·데이터 격리, MD·디자이너 에이전트, 셀러 시트 연동,
거래처·발주 대사, 재고 소진 판정, 주간 리포트 PDF, 집행 후 성과 추적.

**확인 필요**: `users` 이메일을 실제 계정으로 교체, `청담오리골`/`엣지라인의원`의
`ai_enabled` 정책 확정, VI 팔레트 "제안 → 확정" 승인.
