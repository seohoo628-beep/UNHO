# 운호컴퍼니 운영 통합 플랫폼 — Phase 1

승인 대기 큐를 중심에 둔 운영 플랫폼이다. 마케터·MD·디자이너가 만들던 반복 산출물을
AI가 만들고, 사람(대표)은 승인과 집행만 한다.

**Phase 1 범위**: 인증 · 역할 3종(대표·직원·AI) · 브랜드 데이터 이관 · 업무 등록 ·
마케터 에이전트 1종 · 규제 검수(자동) · 승인 큐 · 대시보드 상단 승인 대기 카운트.
외주업체 포털, MD·디자이너 에이전트, 거래처·발주, 리포트는 Phase 2/3.

## 완료 기준

대표가 아침에 대시보드 한 화면을 열어 승인 대기 항목을 보고, 승인 또는 반려를 누르고,
그 결과가 담당자에게 보이는 흐름이 실제로 돈다.

```
AI 생성 → 규제 검수(자동) → 사람 검토 → 대표 승인 → (집행) → (성과 기록)
                    │
        검수 미통과는 승인 큐에 올리지 않고
        지적 문구 + 대체 제안과 함께 AI 화면에서 재생성
```

---

# 처음 설치하는 사람을 위한 안내

개발 경험이 없어도 순서대로 따라 하면 된다. 필요한 계정은 세 개다.
**Supabase**(데이터·로그인), **Anthropic**(AI 실행), **Vercel**(배포). 모두 무료로 시작할 수 있다.

전체 순서는 이렇다.

```
1. 코드 내려받기·도구 설치
2. Supabase 프로젝트 만들기
3. 데이터베이스 표(SQL) 4개를 순서대로 실행
4. 열쇠 값(환경변수) 모으기
5. 로컬에서 실행해 확인
6. 대표 로그인 계정 만들기
7. Vercel에 올려 배포
```

## 1단계 — 코드 내려받기와 도구 설치

1. [Node.js](https://nodejs.org) LTS 버전을 설치한다(한 번만).
2. 이 저장소를 내려받아 폴더에서 아래를 실행한다.

```bash
npm install
```

## 2단계 — Supabase 프로젝트 만들기

1. https://supabase.com 에 가입하고 **New project**를 만든다.
2. 프로젝트 이름과 데이터베이스 비밀번호를 정한다(비밀번호는 따로 적어 둔다).
3. Region은 `Northeast Asia (Seoul)` 권장.
4. 생성까지 1~2분 기다린다.

## 3단계 — 데이터베이스 표 만들기 (SQL 실행)

Supabase 프로젝트 화면 왼쪽 메뉴에서 **SQL Editor**를 연다.
아래 파일 4개를 **반드시 이 순서대로**, 하나씩 복사해 붙여넣고 **Run** 한다.

| 순서 | 파일 | 하는 일 |
|---|---|---|
| 1 | `supabase/migrations/0001_schema.sql` | 표(테이블) 7개 생성 |
| 2 | `supabase/migrations/0002_rls.sql` | 역할별 접근 권한(RLS) 설정 |
| 3 | `supabase/migrations/0003_seed_brand_master.sql` | 법인·브랜드·사용자 기초 데이터 입력 |
| 4 | `supabase/migrations/0004_entity_type_and_ai_scope.sql` | 법인 구분(own/partner) 및 AI 대상 브랜드 정리 |
| 5 | `supabase/migrations/0005_phase2_3_schema.sql` | Phase 2/3 표(거래처·발주·재고·성과·첨부) + vendor 역할 |
| 6 | `supabase/migrations/0006_phase2_3_rls.sql` | 외주업체 데이터 격리(RLS) |
| 7 | `supabase/migrations/0007_enable_brands_seed_vendors.sql` | 전 브랜드 AI 포함(엣지라인 제외) + 거래처 이관 |

> 5번(enum에 vendor 추가)과 6번은 각각 별도로 Run 한다(6번은 5번이 커밋된 뒤 실행돼야 함).

> 순서를 바꾸면 실패한다. 1번이 표를 만들고, 그 위에 2·3·4번이 얹히는 구조다.

Supabase CLI에 익숙하다면 대신 아래 한 줄로도 된다(선택).

```bash
supabase db reset   # 0001 → 0002 → 0003 → 0004 순서로 자동 적용
```

## 4단계 — 열쇠 값(환경변수) 모으기

`.env.example` 파일을 복사해 `.env.local` 파일을 만든다.

```bash
cp .env.example .env.local
```

그리고 아래 표대로 값을 채운다. **변수명은 그대로 두고 값만 바꾼다.**

| 환경변수 | 어디서 얻나 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → **API** → Project URL | 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → **API** → Project API keys → `anon` `public` | 브라우저용 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → **API** → Project API keys → `service_role` | **비공개.** 서버에서만 사용. 절대 외부에 노출 금지 |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys | AI(마케터 에이전트) 실행용 |
| `ANTHROPIC_MODEL` | 그대로 둠 | 기본값 `claude-sonnet-5` |
| `CRON_SECRET` | 아무 긴 무작위 문자열 | 정기 실행 보호용. 아래 명령으로 생성 가능 |
| `NEXT_PUBLIC_SITE_URL` | 로컬은 `http://localhost:3000` | 로그인 링크가 돌아올 주소 |

`CRON_SECRET`은 아래로 하나 만들어 붙여넣으면 된다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> `service_role` 키는 데이터 전체를 다룰 수 있는 마스터 키다. 이 키는 서버(API 라우트)에서만
> 쓰이며 브라우저로 나가지 않는다. GitHub 등에 올리지 않는다(`.env.local`은 이미 git 제외됨).

## 5단계 — 로컬에서 실행해 확인

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 연다. 로그인 화면이 나오면 정상이다.
(아직 로그인은 6단계에서 계정을 준비한 뒤에 된다.)

## 6단계 — 대표(최운호) 로그인 계정 만들기

이 플랫폼은 아무나 가입하는 구조가 아니다. **미리 등록된 이메일만** 로그인 링크를 받는다.
`0003` 시드가 아래 이메일을 등록해 두었다. 실제 이메일로 바꾸는 방법은 두 가지다.

- 시드 기본값: 대표 `choi@unhocompany.com`, 직원 `lee@unhocompany.com` / `park@unhocompany.com`

### 방법 A — Supabase 화면에서 (권장, 클릭만)

1. Supabase → **Authentication** → **Providers** → Email 이 켜져 있는지 확인.
   `Confirm email`은 꺼도 되고 켜도 된다(매직링크 방식).
2. Supabase → **Authentication** → **Users** → **Add user** → **Send invitation**
   또는 **Create new user**로 대표 이메일(예: `choi@unhocompany.com`)을 만든다.
3. 이 이메일이 `users` 표에 이미 있어야 로그인이 된다. 시드 이메일과 **똑같이** 맞추거나,
   실제 이메일을 쓰려면 SQL Editor에서 아래처럼 대표 이메일을 바꾼다.

```sql
update public.users set email = '실제대표이메일@example.com'
 where role = 'owner';
```

4. 플랫폼 로그인 화면에서 그 이메일을 넣고 **로그인 링크 받기**를 누른다.
5. 메일함의 링크를 클릭하면 로그인되고, 최초 로그인 시 계정이 자동 연결된다.

### 방법 B — 스크립트로 이메일 일괄 등록 (선택)

실제 이메일들을 한 번에 넣고 싶으면 아래를 쓴다(`.env.local`이 채워져 있어야 함).

```bash
OWNER_EMAIL=대표@example.com \
STAFF1_EMAIL=이아라@example.com \
STAFF2_EMAIL=박상민@example.com \
npm run seed:users
```

> 로그인은 "이메일로 오는 링크"를 클릭하는 매직링크 방식이라 비밀번호가 없다.
> `users` 표에 없는 이메일은 링크를 넣어도 로그인되지 않는다(의도된 차단).

## 7단계 — Vercel에 배포

1. https://vercel.com 에 GitHub로 로그인하고 이 저장소를 **Import**한다.
2. **Environment Variables**에 4단계의 표에 있는 값을 모두 그대로 등록한다.
   (`NEXT_PUBLIC_SITE_URL`은 배포 도메인으로, 예: `https://unho-ops.vercel.app`)
3. **Deploy**를 누른다.
4. 배포 후 Supabase → **Authentication** → **URL Configuration**의
   **Redirect URLs**에 `https://<배포도메인>/auth/callback`을 추가한다.
   (로그인 링크가 이 주소로 돌아온다.)
5. 정기 실행(마케터 에이전트 평일 09:00)은 `vercel.json`의 Cron이 자동으로 처리한다.

---

# 화면

| 경로 | 화면 | 내용 |
|---|---|---|
| `/dashboard` | 대시보드 | 최상단 대표 승인 대기 카운트, 규제 검수 미통과, 지연 업무, 대표 회신 대기, 최근 승인 결정 |
| `/approvals` | 승인 큐 | 검수 통과 산출물을 카드로. 원문·검수 결과를 한 화면에서. 승인 / 반려 / 수정 요청 |
| `/tasks` | 업무 보드 | 브랜드·담당자 필터. 대기 대상이 대표인 항목은 붉게. 업무 등록·상태 변경 |
| `/ai` | AI 직원 | 마케터 에이전트 수동 실행, 최근 산출물, 검수 미통과 지적·대체 제안 |
| `/brands` | 브랜드 | brand_master 이관 데이터 열람·편집. VI 팔레트 색상 미리보기 |

# 역할과 권한 (RLS로 강제)

| 역할 | 권한 |
|---|---|
| 대표 (owner) | 전체 열람, 승인·반려, 수정 요청, 업무·브랜드 편집 |
| 직원 (staff) | 전체 열람, 업무 등록·상태 변경, 브랜드 편집, 수정 요청 (승인·반려 불가) |
| AI (ai) | 로그인 세션이 없다. 산출물 기록은 서버의 `service_role` 로만. 승인·발송·금액확정 구조적 불가 |

# 데이터 모델

`corporations` 법인·당사자 · `brands` 브랜드(규제 근거·VI 팔레트·톤) · `users` 사용자 ·
`tasks` 업무(대기 사유·대기 대상 포함) · `ai_outputs` AI 산출물 ·
`compliance_checks` 규제 검수 결과 · `approvals` 승인 이력.

## 법인 구분 — `corporations.entity_type`

| 구분 | 값 | 법인 |
|---|---|---|
| 자사 | `own` | ㈜운호컴퍼니, 뷰티밤㈜ |
| 파트너 | `partner` | SBJ컴퍼니, 엣지라인의원 |

**발주서·계약서의 당사자는 `entity_type='own'` 법인만 선택할 수 있다.** 파트너 법인은
당사자 선택에서 제외된다. 당사자 선택 UI(Phase 2의 발주·계약)는 반드시
`src/lib/corporations.ts`의 `listContractingParties()`(own 만 반환)를 사용한다.
브랜드 화면의 법인 헤더에도 "발주·계약 당사자 가능 / 당사자 선택 불가" 표시가 붙는다.

# 마케터 에이전트

- 실행: 평일 09:00 (Vercel Cron → `/api/cron/marketer`), 또는 `/ai`에서 수동 실행
- 브랜드의 `카테고리`·`규제 근거`·`VI 팔레트`·`톤 3줄`을 DB에서 읽어 프롬프트를 조립한다
- 산출: 릴스 대본(후킹 3안·컷 구성·자막·촬영 디렉션), 피드 카피, 업로드 카피·해시태그
- **AI 자동 생성 대상은 6개 브랜드만**: 리앤밤·주당의비결·슈퍼릴라·뷰티밤·대운목장·신미집
  (`brands.ai_enabled=true`). 나머지는 전부 `false`. `/brands`에서 대표가 켜고 끌 수 있다

## Cron 시간대 (UTC 기준 주의)

Vercel Cron은 **UTC**로 해석한다. 한국시간(KST)은 UTC+9이므로 **평일 KST 09:00 = UTC 00:00**이다.

```json
// vercel.json  — 평일(월~금) KST 09:00
{ "crons": [ { "path": "/api/cron/marketer", "schedule": "0 0 * * 1-5" } ] }
```

현재 값이 `0 0 * * 1-5`로 이미 올바르게 설정돼 있다.

# 플랫폼 레벨에서 막는 것

1. **AI가 금액을 확정하지 않는다** — 금액 자리는 `[   ]`로 비우도록 프롬프트에서 강제
2. **AI가 대외 발송하지 않는다** — 산출물은 초안 저장만. 발송 기능 없음
3. **AI가 법적 확약 표현을 쓰지 않는다** — 보장·전액 책임·무조건을 규제 검수 금지어로 등록
4. **엣지라인의원 자동 생성 제외** — `ai_enabled=false`
5. **검수 미통과분은 승인 큐에 올라오지 않는다** — 지적 문구·대체 제안과 함께 재생성

규제 검수 규칙은 `src/lib/compliance.ts`에 있고, 브랜드의 `regulation`(화장품법 /
건강기능식품법 / 식품표시광고법 / 의료법)에 따라 다른 기준을 적용한다.

# 환경변수 요약

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon 키 (RLS 적용, 브라우저·서버 세션용) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용. AI 산출물 기록·시드에만 사용. 절대 클라이언트 노출 금지 |
| `ANTHROPIC_API_KEY` | 마케터 에이전트 실행 (서버 라우트에서만 호출) |
| `ANTHROPIC_MODEL` | 기본 `claude-sonnet-5` |
| `CRON_SECRET` | `/api/cron/*` 보호. `Authorization: Bearer <CRON_SECRET>` |
| `NEXT_PUBLIC_SITE_URL` | 매직링크 콜백 사이트 URL (로컬 `http://localhost:3000`) |

# 무엇을 만들었고 무엇을 남겼나

**만든 것**: 스키마·RLS(7개 테이블), 브랜드/법인 이관 시드, 매직링크 인증, 대시보드,
승인 큐(승인·반려·수정요청), 업무 보드, AI 직원 화면, 브랜드 편집(VI 미리보기),
마케터 에이전트 + 규제 검수 게이트 + 평일 09:00 Cron, 법인 own/partner 구분과 당사자 가드.

**Phase 2/3 추가 (구현 완료)**:
- MD 에이전트(셀러 매칭·제안), 디자이너 에이전트(지시서) — AI 직원 화면에서 실행, 규제 검수 게이트 공통
- 거래처·발주 화면(`/vendors`): 발주-입고-정산 대사, 재고 소진 판정
- 외주업체 포털(`/portal`): 배정 업무·진행 보고·산출물 업로드·정산 현황. RLS로 자기 데이터만 열람
- 주간 리포트(`/reports`): 7일 집계 + PDF 내보내기(인쇄) + 성과 기록, 성과→마케터 피드백 루프
- MD 정기 실행 Cron(평일 10:00)

### Phase 2/3 추가 설정
1. **마이그레이션 0005·0006·0007** 을 순서대로 실행(위 표 참고).
2. **외주업체 포털 파일 업로드**를 쓰려면 Supabase → Storage → **New bucket** → 이름 `vendor-uploads`
   (비공개) 를 만든다. 업로드는 서버(service_role)로 처리한다.
3. **외주업체 계정 생성**: 거래처를 `/vendors`에서 등록한 뒤, 해당 업체 로그인 계정을 만든다.
   ```sql
   -- 예: 특정 거래처(code)에 연결된 vendor 로그인 계정
   insert into public.users (email, name, role, vendor_id)
   select 'vendor@example.com', '리아이 담당', 'vendor', v.id
   from public.vendors v where v.code = 'V-RB-01';
   ```
   비밀번호는 대표 계정과 동일한 방식(auth.users crypt) 또는 매직링크로 설정한다.
   해당 업체에 업무를 배정하려면 tasks 의 `assignee_kind='vendor'`, `assignee_vendor_id` 를 지정한다.
