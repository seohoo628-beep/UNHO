---
name: daily-sns-card-news
description: >
  매일 스레드(Threads)·인스타그램 카드뉴스를 기획-제작-발행하는 자동발행 에이전트
  워크플로우. 계정 확정 → 소재 선정 → 카드뉴스(1080×1350 PNG) 제작 → 스레드 텍스트
  작성 → 문구 검수 → 발행(또는 드래프트 산출) → 발행 로그 기록까지 처리한다.
  사용자가 "카드뉴스", "스레드 글", "오늘 콘텐츠", "SNS 발행", "인스타 업로드",
  "자동발행"을 언급하거나 매일 정기 발행 루틴이 실행되면 반드시 이 스킬을 사용한다.
  릴스·숏폼 영상 대본은 reels-script 스킬로 넘긴다.
---

# Daily SNS Card News — 스레드·인스타 카드뉴스 자동발행

운호컴퍼니 브랜드 계정의 매일 콘텐츠(인스타그램 카드뉴스 + 스레드 텍스트)를
제작하고 발행하는 워크플로우. 실행 주체는 이 스킬을 읽은 에이전트이며, 스크립트는
렌더링과 API 발행만 담당한다.

## 산출물 규격

| 항목 | 규격 |
|---|---|
| 인스타 카드뉴스 | 1080×1350 PNG, 4~6장 (표지 1 + 본문 2~4 + CTA 1) |
| 스레드 텍스트 | 500자 이내, 훅 1줄 + 본문 + 유도 문장. 이미지 첨부 시 표지 카드 재사용 |
| 인스타 캡션 | 본문 3~5줄 + 해시태그(계정 설정의 `hashtags` + 소재 태그 3~5개) |
| 작업 폴더 | `projects/sns/YYYY-MM-DD/<account>/` |

작업 폴더 구성: `card-01.html … card-N.html`, `cards/card-01.png …`,
`threads.txt`, `caption.txt`, `publish-log.json`(발행 시 스크립트가 기록).

## 실행 순서

### 1. 계정 확정

[`config/accounts.json`](config/accounts.json)을 읽는다. 사용자가 계정을
지정하지 않은 정기 실행이면 `rotation` 배열에서 **오늘 날짜 기준 로테이션**
(`rotation[일련일수 % len]`)으로 정한다. 사용자가 브랜드를 언급했으면 그 계정.
계정 설정에는 톤, 컬러 토큰, 고정 해시태그, 금지 표현 카테고리가 있다.

### 2. 소재 선정

우선순위: ① 사용자가 준 소재 ② 계정 설정의 `content_pillars`에서 요일에 맞는
기둥 하나를 골라 구체 주제 1개로 좁힌다. 하루 1주제 원칙 — 카드 한 세트가
한 가지 질문에만 답해야 한다. 최근 작업 폴더(`projects/sns/`)를 훑어 직전
7일과 같은 주제는 피한다.

### 3. 카드뉴스 제작

1. [`templates/card_base.html`](templates/card_base.html)을 복사해 카드별
   HTML을 작성한다. 규격은 템플릿에 고정되어 있다(1080×1350, Pretendard,
   repo 번들 폰트 `@font-face` 참조). 컬러는 계정 설정의 토큰만 사용한다.
2. 표지: 훅 한 문장(15자 내외 대형 타이포) + 서브 한 줄. 본문 카드: 카드당
   메시지 1개, 3줄 이내. CTA 카드: 계정 설정의 `cta` 문구 + 핸들.
3. 렌더:
   ```bash
   python3 .claude/skills/daily-sns-card-news/scripts/render_cards.py \
     projects/sns/YYYY-MM-DD/<account>/ --out projects/sns/YYYY-MM-DD/<account>/cards/
   ```
4. 렌더된 PNG를 Read 도구로 직접 열어 확인한다: 텍스트 잘림, 줄바꿈 어색함,
   대비 부족이 하나라도 있으면 HTML을 고치고 다시 렌더한다. 확인 없이
   발행 단계로 넘어가지 않는다.

### 4. 스레드 텍스트 작성

카드 요약이 아니라 **스레드 문법으로 다시 쓴다**: 구어체 훅, 짧은 단락,
질문형 마무리. 해시태그는 0~2개만. `threads.txt`로 저장.

### 5. 검수

compliance-review 스킬이 사용 가능하면 카드 전체 문구 + 캡션 + 스레드
텍스트를 그 스킬로 검수한다(화장품·건기식·의료 브랜드는 필수). 스킬이 없으면
최소한 계정 설정의 `restricted_claims` 카테고리 표현(효능 단정, 최상급,
전후 비교 등)을 자체 점검하고 수정한다.

### 6. 발행

```bash
python3 .claude/skills/daily-sns-card-news/scripts/publish_sns.py \
  projects/sns/YYYY-MM-DD/<account>/ --account <account>
```

- 기본은 **dry-run**: 페이로드만 검증·출력한다. 실제 발행은 `--live`.
- `--live`는 환경변수 토큰이 필요하다(아래 표). 토큰이 없으면 스크립트가
  명확히 실패하므로, 그 경우 **드래프트 발행 모드**로 전환한다: PNG·텍스트
  파일을 SendUserFile로 사용자에게 전달하고 "토큰 미설정으로 드래프트만
  산출"이라고 보고한다. 조용히 건너뛰지 않는다.
- 인스타그램 Graph API는 공개 이미지 URL이 필요하다. `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`가 있으면 스크립트가 `sns-cards` 버킷에
  업로드해 URL을 만든다. 없으면 `--image-urls`로 직접 URL을 넘긴다.

| 환경변수 | 용도 |
|---|---|
| `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` | 스레드 발행 |
| `IG_ACCESS_TOKEN`, `IG_USER_ID` | 인스타그램 발행 |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | 카드 PNG 공개 URL 업로드(선택) |

계정별 토큰은 `IG_ACCESS_TOKEN__<ACCOUNT>` 형식(대문자, `-`→`_`)이 있으면
공용 변수보다 우선한다.

### 7. 기록·마무리

- `projects/`는 gitignore된 워크스페이스다 — 일별 산출물은 커밋하지 않는다.
  발행 기록은 `publish-log.json`이 작업 폴더에 남고, 카드 PNG와 텍스트는
  SendUserFile로 사용자에게 전달한다.
- 사용자 보고: 계정, 주제, 카드 장수, 발행 결과(발행 ID 또는 드래프트 사유)
  를 한 단락으로.

## 하지 않는 것

- 발행 토큰을 코드·커밋에 넣지 않는다. 환경변수로만.
- 검수(5단계) 전에 `--live` 발행하지 않는다.
- 같은 날 같은 계정에 중복 발행하지 않는다 — `publish-log.json`이 이미
  성공 기록을 갖고 있으면 중단하고 보고한다.
