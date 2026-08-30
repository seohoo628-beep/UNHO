# 운호컴퍼니 로컬 자동화 세팅 (영상편집 · 블로그 · SNS)

이 폴더는 **사장님 컴퓨터(로컬)** 에서 Claude Code로 아래 3가지 자동화를 쓰기 위한
원클릭 세팅 패키지입니다. 원격 세션(웹 Claude Code)에서는 로컬 프로그램을 조작할 수
없으므로, 반드시 본인 컴퓨터에서 실행합니다.

| # | 자동화 | 방식 | 세팅 후 쓰는 법 |
|---|---|---|---|
| 1 | 영상편집 (Premiere Pro) | Premiere MCP + CEP 패널 | "프리미어에서 이 클립들 컷편집해줘" |
| 3 | 네이버 블로그 | Playwright 브라우저 자동화 (반자동) | "주당의비결 블로그 글 써서 에디터에 넣어줘" |
| 4 | 쓰레드·인스타·카드뉴스 | Meta 공식 API + 브라우저 보조 | "이 카드뉴스 쓰레드에 올려줘" |

## 설치 (한 번만)

### 사전 준비

- **Node.js 18 이상** — <https://nodejs.org> 에서 LTS 설치
- **Python 3.10 이상** (쓰레드/인스타 API 발행용)
- Premiere Pro 2020(14.0) 이상 — 1번 자동화를 쓸 경우만

### macOS

```bash
# 이 저장소를 로컬에 받은 뒤
cd UNHO/local-setup
bash setup-mac.sh
```

### Windows (PowerShell 관리자 권한)

```powershell
cd UNHO\local-setup
Set-ExecutionPolicy -Scope Process Bypass
.\setup-windows.ps1
```

스크립트가 하는 일:

1. Claude Code CLI 설치 확인 (`npm install -g @anthropic-ai/claude-code`)
2. **Playwright MCP** 등록 (로그인 유지되는 전용 브라우저 프로필 사용)
3. **Premiere Pro MCP** 클론 + 설치 ([hetpatel-11/Adobe_Premiere_Pro_MCP](https://github.com/hetpatel-11/Adobe_Premiere_Pro_MCP))
4. 사용 스킬 3종을 `~/.claude/skills/` 에 복사
   (`premiere-edit`, `naver-blog`, `sns-publish`)
5. `~/unho-automation/.env` 생성 (쓰레드/인스타 토큰 입력용)

## 설치 후 1회 수동 작업

### 네이버 블로그 (3번)

전용 브라우저 프로필에 한 번만 로그인해 두면 이후 세션이 유지됩니다.

```
claude 실행 → "네이버 로그인 창 열어줘" → 브라우저가 뜨면 직접 로그인 → 완료
```

> 자동 '발행' 클릭은 하지 않습니다. Claude가 글을 쓰고 에디터에 채워 넣으면
> **발행 버튼은 사장님이 직접** 누릅니다. (계정 제재 위험 최소화)

### 쓰레드 / 인스타그램 (4번)

공식 API를 쓰므로 토큰이 필요합니다. `~/unho-automation/.env` 를 열어 채웁니다.

1. <https://developers.facebook.com> → 앱 만들기 → **Threads API** 사용 사례 추가
2. 장기 액세스 토큰 발급 → `THREADS_ACCESS_TOKEN`, `THREADS_USER_ID` 입력
3. 인스타는 **비즈니스/크리에이터 계정**을 Facebook 페이지에 연결 후
   Instagram Graph API 토큰 발급 → `IG_ACCESS_TOKEN`, `IG_USER_ID` 입력

### 프리미어 (1번)

Premiere Pro를 켠 뒤 `창(Window) → 확장(Extensions)` 에서 MCP Bridge 패널을
엽니다. 패널이 안 보이면 `~/unho-automation/premiere-mcp` 의 README를 참고해
CEP 패널 설치 단계를 다시 실행합니다.

## 일상 사용 예시

로컬 터미널에서 `claude` 실행 후:

- "어제 찍은 릴스 원본 3개 프리미어 타임라인에 올리고 무음 구간 잘라줘"
- "주당의비결 블로그 글 1편 써서 네이버 에디터에 넣어줘. 발행은 내가 할게"
- "이 문구로 카드뉴스 4장 만들고 쓰레드에 올려줘"

## 주의사항

- 네이버·인스타·쓰레드 모두 **대량 자동 게시는 계정 제재 사유**가 될 수 있습니다.
  하루 몇 건 수준의 실사용 + 발행 전 사람 확인을 기본값으로 유지하세요.
- 광고 문구는 게시 전 compliance-review 기준(표시광고 규제)을 통과해야 합니다.
- `.env` 의 토큰은 절대 저장소에 커밋하지 않습니다.
