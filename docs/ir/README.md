# 주당의비결 IR 2026 — 투자유치 덱

운호컴퍼니 브랜드 **주당의비결**의 채널 증폭 라운드(Pre-A) IR 자료. 기존
`주당의비결 × 티오더 Investment Memorandum`을 뷰티테크 IR 수준의 투자자용
덱 구조로 재구성·고도화한 산출물이다.

## 산출물

| 파일 | 용도 |
|---|---|
| `jd_ir_2026_kr.html` | 자체완결(self-contained) HTML 덱. 폰트·스타일 모두 내장 — 브라우저로 바로 열람, 인쇄 시 16:9 PDF |
| `jd_ir_2026_kr.pdf` | 배포·인쇄용 21페이지 PDF (1280×720, 16:9) |

## 구성 (21면 · 투자자 IR 목차)

Cover → 01 Executive Summary → 02 Problem → **[제품과 채널]** → 03 Solution(제품)
→ 04 Catalyst(티오더 단독 입점) → Traction → Distribution → **[모델과 시장]**
→ 05 Market(TAM/SAM/SOM) → 06 Unit Economics → Moat(자동발주 락인)
→ 07 Competitive Edge → **[계획과 투자 조건]** → 08 Financials(3개년)
→ 09 Roadmap → 10 Team → 11 Use of Funds → 12 The Ask → Risk & Next Steps → Closing

## 디자인 (주당의비결 VI)

- 팔레트: Ink Black / Cognac / Gold / Cream
- 서체: Noto Serif KR(디스플레이) + Noto Sans KR(본문·데이터)
- 슬로건: 마신 다음이 다르다
- 톤: 절제된 프리미엄

## 밸류에이션 근거

- **Pre-money 80억** = 2026E 매출 40억 × **PSR 2.0x** (사용자 지정)
- **SI(전략적 투자) 케이스 Pre-money 60억** = PSR 1.5x, 채널 시너지 반영 (사용자 지정)
- 조달 20억(트랜치 1차 8억 → KPI → 2차 12억) 기준 지분 FI 20.0% / SI 25.0%

## 확인 필요 항목 (확정 전 검토)

문서 내 금액·조건 중 **사용자 미확정** 항목. 대외 배포 전 확정 요망.

1. **2026E 매출 40억** — PSR 산정 기준값. 연간 목표 45~50억 대비 보수 산정치이며 확정 필요
2. **3개년 추정 손익(08면)** — 매출 48/125/260, GPM ~51%, 영업이익 (2)/18/50은 상반기 실적 20억 기반 추정치. 실제 재무제표로 대체 필요
3. **SAM ~700억 / SOM 144~360억(05면)** — 파일럿 단가 기반 산정치(추정). 근거 데이터룸 자료로 확정 필요
4. **경쟁사 매트릭스(07면)** — 컨디션·상쾌환 대비 축은 공개정보 기반 정성 평가. 대외용은 출처 확인 필요
5. **RCPS·CB 세부 조건(12면)** — 기존 IM 기준값. 텀시트 단계에서 협의·확정

## 재생성

원본은 `/tmp/build/`의 `style.css` + `slides.html` + 내장 폰트에서 Playwright(Chromium)로
스크린샷·PDF를 생성. 소스가 필요하면 별도 요청.
