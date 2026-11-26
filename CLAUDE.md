# CLAUDE.md

This file is the project entry point for Claude Code. The ppt-master skill lives at `.claude/skills/ppt-master/` and is auto-discovered by Claude Code.

> **이 저장소는 두 개의 작업 영역을 담고 있습니다**: ① 운호컴퍼니 운영 통합 플랫폼(Next.js 앱 — `src/`, `supabase/`, `tests/` 등, 안내는 [`README.md`](README.md)), ② [byungjunjang/slide-master](https://github.com/byungjunjang/slide-master)에서 가져온 PPT 제작 워크플로우(slide-master — `.claude/skills/`, `docs/`, `projects/`, 안내는 [`README.slide-master.md`](README.slide-master.md)). 아래 내용은 PPT 제작(slide-master) 작업에만 적용됩니다. 앱 개발 작업에는 기존 저장소 관례를 따르세요. PPT 관련 의존성 설치: `pip install -r requirements.txt`.

> **Cross-harness (dual-host)**: [`AGENTS.md`](AGENTS.md) is the Codex-side execution-rules layer — it references this file as SSOT and only adds enforcement, so content edits here do not need mirroring there. `.codex/skills/` holds **generated** Codex discovery stubs: after editing any `.claude/skills/<name>/SKILL.md` frontmatter, run `python3 .claude/skills/ppt-master/scripts/sync_codex_stubs.py` (never hand-edit stubs; `preflight.py` fails while they are stale). Skill content itself lives only in `.claude/skills/`.

**Route before full-load (mandatory)**: for a presentation request, first read
[`.claude/skills/ppt-master/workflows/routing.md`](.claude/skills/ppt-master/workflows/routing.md).
Select the route there, then read only the selected execution owner(s) in full.
Do not preload the main SVG skill for a direct-PPTX route. For a repository edit,
read the owner of the contract being changed; the main skill is authoritative only
for the main SVG family and the shared SVG steps that explicitly invoke it.

> **영상(릴스) 제작 요청**: 별도 지시가 없으면 [`projects/sns/릴스_제작_가이드.md`](projects/sns/릴스_제작_가이드.md)의 감성·소재·자막·음악 기준을 기본값으로 따른다(대표 지시 2026-11-26).

> **Seemilar "태국 콘텐츠 찍을것들" 링크 요청**: 콘텐츠모음_DB 시트(1_DfkYkFZeLDNX6Qp_OcoMHo6YKQ2eCcZ7a3xYGpN3RQ)의 `Seemilar_추출` 탭을 읽어 링크 목록을 전달한다. 이 탭은 집 PC 예약 작업 「Seemilar 태국 촬영 링크 추출」이 컬렉션 185/521을 읽어 채운다(지시문: `projects/sns/Seemilar_태국촬영_링크추출_예약작업_지시문.txt`). 클라우드 세션에서는 Seemilar 로그인이 불가하고 비밀번호 입력은 금지이므로, 탭이 비었거나 오래됐으면 대표에게 그 작업의 '지금 실행'을 요청한다. 파일로 줄 때는 깔끔하게 No·플랫폼·참고 방향(영상별 한 줄, 40자 안팎: 무엇을 참고할지·어떻게 응용할지)·링크만 넣는다(엑셀 + 텍스트). 메모·스크립트 전문은 대표가 따로 요청할 때만 붙인다(대표 지시 2026-11-26).

## Project Overview

PPT Master is a presentation workflow package with SVG-authoring and direct-PPTX
route families. The main SVG family uses Strategist → Image_Generator → Executor
to convert source documents into editable DrawingML. Direct-PPTX routes preserve
an existing PowerPoint package and use their own execution gates.

**Main SVG Pipeline**: `Source Document → Create Project → [Template] → Strategist confirmation stage → [Image_Generator] → Executor Live Preview → Quality Check → Post-processing → Export PPTX`

**Route selection authority**:
[`.claude/skills/ppt-master/workflows/routing.md`](.claude/skills/ppt-master/workflows/routing.md)
owns the complete matrix and wins over every summary below.

| Selected family | Full execution owner(s) |
|---|---|
| New SVG-authored deck or PPTX re-architecture | [Main `ppt-master/SKILL.md`](.claude/skills/ppt-master/SKILL.md) |
| Existing PPTX, strict 1:1 wording/page preservation with visual redesign | [`beautify-pptx.md`](.claude/skills/ppt-master/workflows/beautify-pptx.md), then the main skill only at its explicit shared-SVG handoff |
| Raw PPTX template plus new material/topic | [`ppt-template-fill/SKILL.md`](.claude/skills/ppt-template-fill/SKILL.md) only |
| Finished PPTX, stable visible content/layout, add notes/audio/timing/transitions | [`native-enhance-pptx/SKILL.md`](.claude/skills/native-enhance-pptx/SKILL.md), then its required execution workflow |
| Reusable template creation or another standalone workflow | The selected workflow; load another owner only at an explicit handoff |

An ambiguous PPTX optimization request stays in the router until its one
discriminator question resolves whether the deck is 1:1 beautify or
re-architectable source. Do not load either full owner before that answer.

## Execution Ownership

- The selected skill or workflow owns its confirmations, preflight, validation,
  recovery, export, and completion gates. This root file adds none.
- Shared scripts do not transfer gate ownership between SVG and direct-PPTX
  families.
- Topic research, template creation, and post-route workflows load the next
  owner only when their own procedure declares a handoff.

## Font Policy (install-local, standing preference)

- Every SVG-authored deck uses **Pretendard** as the fixed font family — do not propose or pick other families unless the user explicitly asks in the current conversation. Hierarchy comes from weight/size, not family switching. Direct-PPTX routes preserve source fonts unless their selected owner says otherwise. Full contract: [`strategist.md §g` install-local font lock](.claude/skills/ppt-master/references/strategist.md).
- Stack: `Pretendard, "Malgun Gothic", sans-serif`; intermediate weights use installed family names (`"Pretendard Medium"`, `"Pretendard SemiBold"`, etc.).
- Font files are bundled at [`.claude/skills/ppt-master/assets/fonts/Pretendard/`](.claude/skills/ppt-master/assets/fonts/Pretendard/) (SIL OFL) and installed user-level on this machine. PPTX does not embed fonts — decks shared to other machines need Pretendard installed there.

## Required Conventions

- **Repo-wide style rules** — when editing prompt files under [`.claude/skills/ppt-master/references/`](.claude/skills/ppt-master/references/), Python under [`.claude/skills/ppt-master/scripts/`](.claude/skills/ppt-master/scripts/), or any other code/prose in the repo, follow the matching style rule in [`docs/rules/`](docs/rules/).
- **Markdown language consistency** — Markdown files under `.claude/skills/ppt-master/workflows/`, `.claude/skills/ppt-master/references/`, and `docs/` are currently single-language per directory. New files mirror the language of their siblings; do not mix English scaffolding with Chinese paragraphs (or vice versa) inside one file. Chat replies are unaffected.

## Compatibility Boundary

- The slide-master areas of this repository (`.claude/skills/`, `docs/`, `projects/`, `requirements.txt`) form a workflow/skill package, not an app or service scaffold. (The Next.js app under `src/` keeps its own conventions, including `tests/`.)
- Do NOT assume generic-project conventions like `.worktrees/`, `tests/`, or mandatory branch setup unless the user explicitly requests them.
- On conflict with a generic coding skill, prioritize the selected repo-local
  execution owner. The main [`ppt-master/SKILL.md`](.claude/skills/ppt-master/SKILL.md)
  has that role only when routing selected the main SVG family or an explicit
  shared-SVG handoff.

## Execution Pointers

Commands and defaults belong to the selected owner; use these pointers instead
of treating a root-level command list as a gate checklist.

| Work | Runtime authority |
|---|---|
| Route selection | [`routing.md`](.claude/skills/ppt-master/workflows/routing.md) |
| Main SVG generation and re-architecture | [`ppt-master/SKILL.md`](.claude/skills/ppt-master/SKILL.md) |
| Strict 1:1 SVG beautify | [`beautify-pptx.md`](.claude/skills/ppt-master/workflows/beautify-pptx.md) and only the shared main steps it invokes |
| Raw template fill | [`ppt-template-fill/SKILL.md`](.claude/skills/ppt-template-fill/SKILL.md) |
| Finished-PPTX native enhancement | [`native-enhance-pptx/SKILL.md`](.claude/skills/native-enhance-pptx/SKILL.md) |
| Standalone workflow inventory | [`workflows/index.md`](.claude/skills/ppt-master/workflows/index.md) |

## Core Directories

- `.claude/skills/ppt-master/SKILL.md` — main SVG workflow authority.
- `.claude/skills/ppt-template-fill/SKILL.md` — raw-template direct-PPTX authority.
- `.claude/skills/native-enhance-pptx/SKILL.md` — finished-PPTX enhancement entry owner.
- `.claude/skills/ppt-master/references/` — role definitions and technical specifications.
- `.claude/skills/ppt-master/scripts/` — runnable tool scripts.
- `.claude/skills/ppt-master/scripts/docs/` — topic-focused script docs.
- `.claude/skills/ppt-master/templates/` — layout templates, chart templates, icon library, brand presets.
- `.claude/skills/ppt-master/workflows/` — standalone workflow files.
- `docs/` — user-facing documentation (FAQ, installation, technical design, templates guide, audio narration).
- `docs/rules/` — repo-wide style rules.
- `projects/` — user project workspace.
