# 하루바른·나아 플랫폼 배포 가이드

이 앱(`harubareun/`)을 실제 접속 가능한 주소로 올리는 방법이다.
**방법 A(대시보드 클릭, 권장)** 또는 **방법 B(터미널 스크립트, 한 번에)** 중 하나만 하면 된다.

로그인은 비밀번호가 없다 — **이메일 매직링크** 방식이다. 아래를 마치면
로그인 화면에서 `seohoo628@gmail.com`(0003 시드에 대표로 등록됨)을 넣고
받은 메일의 링크를 눌러 접속한다.

---

## 방법 A — 대시보드 클릭 (권장, 약 10분)

### 1) Supabase 프로젝트 만들기
1. https://supabase.com → **New project** (Region: `Northeast Asia (Seoul)`).
2. 생성되면 **Settings → API** 에서 아래 3개를 복사해 둔다.
   - `Project URL`  → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public`  → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
3. **SQL Editor** 를 열고, 마이그레이션 75개를 하나씩 넣는 대신 **통합본 3개**를
   순서대로 붙여넣고 Run 한다 (각 파일을 GitHub에서 열어 Raw로 전체 복사):
   - `supabase/setup/setup_1of3.sql` → Run
   - `supabase/setup/setup_2of3.sql` → Run
   - `supabase/setup/setup_3of3.sql` → Run
   > 3개로 나눈 이유: enum 값 추가(0005·0049) 이후 커밋되도록 경계를 맞췄다.
   > 반드시 1 → 2 → 3 순서로 한 번에 하나씩 Run 한다.
4. **Authentication → Providers → Email** 을 켠다(매직링크). `Confirm email`은 꺼도 된다.
5. **Authentication → Users → Add user** 로 `seohoo628@gmail.com` 을 추가.

### 2) Vercel 배포
1. https://vercel.com → **Add New → Project** → 이 저장소(`seohoo628-beep/UNHO`) Import.
2. **Root Directory** 를 `harubareun` 으로 지정 (⚠️ 가장 중요).
3. **Environment Variables** 에 아래를 입력:
   | 변수 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 위 Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 위 anon 키 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 위 service_role 키 |
   | `NEXT_PUBLIC_SITE_URL` | 배포될 주소(예: `https://harubareun-naa.vercel.app`) |
   | `ANTHROPIC_API_KEY` | (선택) AI 기능용 |
   | `CRON_SECRET` | 아무 긴 무작위 문자열 |
4. **Deploy** → 나오는 `*.vercel.app` 이 접속 주소.
5. Supabase → **Authentication → URL Configuration → Redirect URLs** 에
   `https://<배포주소>/auth/callback` 을 추가한다. (매직링크가 이 주소로 돌아온다.)

끝. 로그인 화면에서 `seohoo628@gmail.com` → 메일 링크 클릭 → 대표로 로그인.

---

## 방법 B — 터미널 스크립트 (한 번에)

로컬 PC에 Node.js가 있으면, 저장소를 받은 뒤 아래를 실행한다. 토큰은
셸 환경변수로만 넘기고 파일에 저장하지 않는다.

```bash
cd harubareun
npm install

# 값 채우기 (따옴표 안에)
export VERCEL_TOKEN="..."              # https://vercel.com/account/settings/tokens
export SUPABASE_ACCESS_TOKEN="..."     # https://supabase.com/dashboard/account/tokens
export SUPABASE_DB_PASSWORD="..."      # 새로 만들 DB 비밀번호(직접 정함)
export ANTHROPIC_API_KEY=""            # (선택)

bash scripts/deploy.sh
```

스크립트가 하는 일: Supabase 프로젝트 생성(서울) → 마이그레이션 적용 →
API 키 추출 → Vercel에 `harubareun` 배포 + 환경변수 주입 → 접속 URL 출력.
그 뒤 Supabase 대시보드에서 위 **A-1-5(Add user)** 와 **A-2-5(Redirect URL)** 만
마무리하면 로그인이 열린다.

> ⚠️ 채팅으로 토큰을 공유했다면 배포 후 반드시 **해당 토큰을 폐기(revoke)** 한다.
> 배포 자체는 그대로 유지된다.
