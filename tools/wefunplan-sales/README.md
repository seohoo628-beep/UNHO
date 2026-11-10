# 위펀플랜 영업 현황 대시보드

위펀플랜 마케팅 영업 거래처 원장, 월별 실적·인센티브, 주간 보고서를 한 화면에서 관리하는 페이지다.
Claude 아티팩트로 운영 중이며, 이 폴더는 그 페이지의 원본 소스를 보관한다.

- 운영 페이지: https://claude.ai/artifact/RqWhS83jbpieqkWFrmkK49
- 원본: `index.html` (아티팩트 런타임 위에서 동작하는 단일 HTML. 로고는 base64로 내장)
- 로고 원본: `logo.png`

## 화면 구성

| 탭 | 내용 |
|---|---|
| 거래처 현황 | 오늘의 팔로업(접기/펼치기), 월별 실적(월 선택), 누적·파이프라인, 단계별 파이프라인, 거래처 원장 |
| 주간 보고서 | 원장 변동을 모아 AI 초안 작성 → 수정 → 주차별 저장, 본문 복사 |

## 계산 규칙

| 항목 | 규칙 |
|---|---|
| 월 실제이익 | 월 예산 × 실제이익률 (기본 35%, 거래처별 수정 가능, 금액 직접 수정 가능) |
| 월 인센티브 | 월 실제이익 × 40% (고정) |
| 월별 실적 | 계약·집행중 단계이며 계약 시작일이 있는 거래처만 집계. 시작월부터 매달 자동(예정) |
| 월별 확정 | 거래처 패널의 월별 정산표에서 금액 수정 또는 지급완료 체크 시 그 달은 확정으로 고정 |
| 누적 | 선택한 월까지 월별 값 합계 |
| 종료 거래처 | 계약 종료일이 있으면 그 달까지만 집계 |

단계: 리드 → 미팅 → 제안 → 협상(진행예정) → 계약 → 집행중(진행중) → 종료·보류

## 데이터 구조

아티팩트 공유 DB에 저장된다. 페이지 소스에는 데이터가 들어 있지 않다.

`accounts/<id>`

| 필드 | 설명 |
|---|---|
| `name`, `brand`, `industry` | 업체명, 브랜드명, 업종(F&B / 제품사업 / 직접 입력) |
| `contact`, `phone` | 담당자, 연락처 |
| `step`, `endReason`, `endDate` | 단계, 종료 구분(done/hold), 계약 종료일 |
| `progress`, `progressSummary` | 진행상황 메모, AI 정리본 |
| `nextAction`, `nextDate` | 다음 액션, 액션 일자 (팔로업 알림 기준) |
| `scope` | 업무범위 목록 |
| `budget`, `profitRate`, `profit`, `incentive` | 월 예산(만원), 실제이익률(%), 월 실제이익(만원), 월 인센티브(만원) |
| `startDate`, `months` | 계약 시작일, 월별 정산 `{ "YYYY-MM": { revenue, profit, paid } }` |
| `proposals` | 제안서 `{ name, asset? , packed?, href?, size?, at, by }` |
| `history` | 단계 변동 기록 `{ at, from, to, by }` (주간 보고서용) |
| `updatedAt`, `updatedBy`, `createdAt` | 수정 이력 |

`reports/w-<YYYY-MM-DD>`: 주간 보고서 `{ week, title, body, updatedAt, updatedBy }`

## 파일 업로드

- PDF·이미지·영상·CSV·TXT·JSON·MD는 원본 그대로 저장 (파일당 20MB)
- 그 외 형식(PPT/PPTX, DOC/DOCX, XLS/XLSX, HWP, ZIP 등)은 base64 텍스트로 감싸 저장 (`packed: true`, 원본 14MB까지)
- 내려받을 때 원본으로 복원. 내려받기 허용 목록에 없는 형식(PPT, DOC, XLS, HWP 등)은 ZIP으로 감싸서 내려받음
- 업로드는 아티팩트 편집 권한자만 가능. 기존 거래처에서는 업로드 즉시 DB에 저장

## 아티팩트 권한

`db`, `user`(profile), `assets`, `sample`(AI 정리·보고서 초안), `downloads`

## 매일 팔로업 알림

Claude 예약 작업 `위펀플랜 팔로업 알림`이 매일 08:49(한국 시간)에 새 세션을 열어 `accounts`를 읽기 전용으로 조회하고,
지연 / 오늘 / 이틀 내 / 일정 없음으로 분류한 요약을 앱 푸시로 보낸다. 예약 작업은 만든 계정 소유이며,
다른 계정에서 받으려면 그 계정에 대시보드를 공유한 뒤 같은 예약 작업을 새로 만들어야 한다.

## 수정 방법

`index.html`을 고친 뒤 같은 아티팩트 URL로 다시 게시한다. DB 데이터는 재게시해도 유지된다.
