# 무당티 유통 관리 배포 가이드

새 Supabase 프로젝트를 만들지 않는다. 운호 플랫폼이 쓰는 Supabase를 그대로 연결한다. 약 5분.

## 1) Vercel 프로젝트 추가

1. https://vercel.com → **Add New → Project** → 이 저장소 Import.
2. **Root Directory**를 `mudangtea`로 지정한다. (가장 중요)
3. **Environment Variables** — 운호 플랫폼 Vercel 프로젝트의 값을 그대로 복사한다.

   | 변수 | 값 |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | 운호 플랫폼과 동일 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 운호 플랫폼과 동일 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 운호 플랫폼과 동일(최초 로그인 연결·변경 이력용) |
   | `CEO_EMAIL` | 선택. 운호 플랫폼에 설정돼 있으면 동일하게 |
   | `FINANCE_VIEWER_EMAILS` | 선택. 운호 플랫폼에 설정돼 있으면 동일하게 |

4. **Deploy**. 나오는 `*.vercel.app` 주소가 접속 주소다.
   필요하면 **Settings → Domains**에서 `mudangtea.<회사 도메인>` 같은 하위 도메인을 연결한다.

## 2) 운호 플랫폼 메뉴 연결

운호 플랫폼 Vercel 프로젝트의 환경변수에 `MUDANGTEA_URL` = 위 접속 주소를 추가하고 재배포한다.
이후 운호 플랫폼 사이드바의 '무당티 유통 관리'를 누르면 새 사이트로 이동한다.
(설정 전에는 이전 안내 화면이 나온다.)

## 3) 확인

- 운호 플랫폼 계정으로 로그인 → 기존에 입력한 판매처·판매·로트가 그대로 보이면 끝.
- 표가 없다는 안내가 나오면 운호 앱의 `supabase/migrations/0099_mudangtea_distribution.sql`을
  Supabase SQL Editor에서 한 번 실행한다(여러 번 실행해도 안전).

## 배포 비용

`vercel.json`의 `ignoreCommand`가 `mudangtea/` 밖의 변경으로는 이 사이트를 다시 빌드하지 않게 한다.
반대로 운호 플랫폼도 `mudangtea/` 변경으로는 다시 빌드하지 않는다.
