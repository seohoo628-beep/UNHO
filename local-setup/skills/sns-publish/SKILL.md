---
name: sns-publish
description: 쓰레드(Threads)·인스타그램 게시물과 카드뉴스를 만들고 Meta 공식 API로 발행한다. 사용자가 "쓰레드 올려줘", "인스타 게시", "카드뉴스", "SNS 자동화"를 언급하면 사용한다. 발행 전 반드시 최종 문구를 사용자에게 확인받는다.
---

# 쓰레드 · 인스타 · 카드뉴스 발행

## 원칙

- **발행 전 확인.** 최종 문구·이미지를 보여주고 사용자가 "올려" 하면 발행한다.
- 공식 API(graph.threads.net / Instagram Graph API)를 우선 사용한다.
  브라우저 자동화로 로그인 게시하는 방식은 쓰지 않는다.
- 화장품·건강기능식품·외식·의료 브랜드 문구는 작성 직후 표시광고 규제 기준으로
  자체 검수한다.

## 사전 조건

`~/unho-automation/.env` 에 토큰이 있어야 한다:
`THREADS_ACCESS_TOKEN`, `THREADS_USER_ID`, `IG_ACCESS_TOKEN`, `IG_USER_ID`.
비어 있으면 발행 대신 초안만 만들고, README의 토큰 발급 절차를 안내한다.

## 쓰레드 발행

1. 계정 톤에 맞는 본문 작성 (500자 제한, 후킹 첫 줄 + 줄바꿈 리듬).
2. 사용자 확인 후:
   ```bash
   python3 ~/unho-automation/scripts/threads_publish.py --text "본문"
   # 이미지 포함 시: --image-url "https://..." (공개 URL 필요)
   ```
3. 결과의 게시물 ID/URL을 보고한다.

## 인스타그램 발행

- 인스타 API는 **공개 이미지 URL**만 받는다. 로컬 이미지는 먼저 공개 가능한 곳
  (자사 사이트, 스토리지)에 올린 뒤 그 URL로 발행한다. 업로드처가 없으면
  이미지+캡션을 준비해 두고 앱에서 직접 올리도록 안내한다.
2. 사용자 확인 후:
   ```bash
   python3 ~/unho-automation/scripts/instagram_publish.py \
     --image-url "https://..." --caption "캡션"
   # 카루셀: --image-url 을 여러 번 반복
   ```

## 카드뉴스 제작

1. 장수 구성: 표지(후킹) → 본문 2~6장(장당 메시지 1개) → 마지막 장(CTA).
2. 1080×1350px 세로형 기본. HTML/SVG로 레이아웃을 만들고 스크린샷으로 PNG 추출
   (Playwright 사용), `~/unho-automation/cardnews/<날짜-주제>/` 에 저장한다.
3. 브랜드 컬러·로고를 유지하고, 텍스트는 장당 40자 이내로 크게.
4. 완성본을 보여주고 확인받은 뒤 인스타 카루셀 절차로 발행한다.

## 빈도 제한

같은 계정에 하루 3건 이상 API 발행하지 않는다. 초과분은 예약 목록으로 저장해 두고
다음 날 발행을 제안한다.
