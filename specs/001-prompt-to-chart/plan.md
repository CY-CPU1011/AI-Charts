# Implementation Plan: Prompt-to-Chart Homepage

**Branch**: `001-prompt-to-chart` | **Date**: 2026-05-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-prompt-to-chart/spec.md`

## Summary

A single-page Next.js app at [ai-charts/](../../ai-charts/) where the user
types a data-bearing natural-language prompt into a centered input. On
submit, the page reflows (input anchored to bottom, chart area above) and
an ECharts visualization renders. Follow-up turns refine the same chart in
place via conversational context.

**Technical approach (locked by user input + constitution):**

- **Frontend**: Tailwind CSS + shadcn/ui only. Page shell is a React
  Server Component; the chat/chart panel is a single `"use client"` island
  that holds session state in `useReducer`.
- **Charts**: Apache ECharts via `echarts-for-react`. The frontend renders
  the raw ECharts `option` object verbatim — it does **not** translate the
  AI output into anything.
- **AI call**: A single Next.js Route Handler `POST /api/chart` proxies
  the conversation to DeepSeek using the `openai` SDK pointed at
  `https://api.deepseek.com`, with `response_format: { type: "json_object" }`
  and a carefully engineered system prompt that constrains the output to
  a top-level JSON object containing a `chartType`, the raw `option`, and
  optional metadata. Zod validates the parsed JSON before returning.
- **Secrets**: `DEEPSEEK_API_KEY` is read only inside the Route Handler.
- **No persistence**: session state lives in client memory only.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), Node.js LTS, React 19.2.4

**Primary Dependencies**:
- Next.js 16.2.6 (App Router, Turbopack dev) — already installed
- Tailwind CSS 4.x (+ `@tailwindcss/postcss`) — to install
- shadcn/ui (Radix-based primitives) — to install via `pnpm dlx shadcn@latest init`
- `echarts` + `echarts-for-react` — to install
- `openai` (OpenAI SDK, used against DeepSeek endpoint) — to install
- `zod` — to install (Constitution Principle IV)
- `next-intl` for i18n — to install (FR-015)
- `sonner` for toast notifications (shadcn/ui's official toast pick) — installed via shadcn add

**Storage**: None. Conversation state is in-memory in the client; reload
resets per spec FR-014.

**Testing**: None mandated by the constitution for v1; we will rely on
type checks (`pnpm --dir ai-charts run build`) and a manual smoke test
(quickstart.md) for the Definition of Done. Adding a test framework is
explicitly deferred under Principle V (YAGNI) until a concrete need
appears.

**Target Platform**: Modern evergreen browsers on mobile, tablet, and
desktop viewports (per FR-013 / SC-008). Server runtime: Node.js (the
Route Handler needs the `openai` SDK; Edge runtime is **not** suitable
because of streaming-helper compatibility and SDK size).

**Project Type**: Single Next.js web application at `ai-charts/`.

**Performance Goals**: None enforced (spec Assumptions). The DeepSeek
round-trip dominates; UI must remain interactive during the request.

**Constraints**:
- No new top-level project; everything lives under `ai-charts/`.
- No state library, no data-fetching library — `fetch` from the client
  island directly is sufficient (Principle V).
- ECharts theme tokens MUST derive from the Tailwind palette
  (Constitution: Technology Stack & Constraints).

**Scale/Scope**: Single page, one API Route, ~6–10 client components,
~2 server modules. One concurrent user per session; expected dev-grade
load.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Enumerated against `.specify/memory/constitution.md` v1.0.0:

| # | Principle | Status | Evidence |
|---|---|---|---|
| I | Next.js API Route as sole backend | ✅ Pass | Client only ever calls `POST /api/chart`. The Route Handler owns the DeepSeek call and the API key. |
| II | Tailwind + shadcn/ui only | ✅ Pass | Page tree built from shadcn primitives (`Textarea`, `Button`, `Toaster`, `Select`) + Tailwind classes. Existing `page.module.css` and `globals.css` will be replaced. |
| III | ECharts as single charting engine | ✅ Pass | All chart rendering goes through `echarts-for-react`. No competing chart libs introduced. |
| IV | Type-safe contract-first API boundary | ✅ Pass | Request/response types live in `lib/contracts/chart.ts`, validated with Zod on both sides of the wire. The AI's JSON is also validated against a Zod schema before being trusted as an ECharts `option`. |
| V | Simplicity / RSC default | ✅ Pass | Only the chat island is `"use client"`. No state library, no data-fetching library, no ORM. `next-intl` is the only "extra" runtime dep and is required by FR-015 + SC-009. |

**Tech-stack constraints check** (constitution §"Technology Stack &
Constraints"):

- pnpm ✅ — already in use.
- TypeScript strict ✅ — already enabled.
- Tailwind config at app root ✅ — will be `ai-charts/postcss.config.mjs`
  + `tailwind.config.ts` (Tailwind 4 only needs the PostCSS plugin and
  `@import "tailwindcss"` in CSS, but shadcn still expects a config file —
  see research.md §3).
- shadcn primitives committed in repo ✅ — `ai-charts/components/ui/`.
- ECharts theme from Tailwind palette ✅ — see research.md §4.
- Zod at every Route boundary ✅.
- Secrets server-only ✅ — `process.env.DEEPSEEK_API_KEY` only read in
  `app/api/chart/route.ts`.
- App lives at `ai-charts/`, Spec Kit at repo root ✅.

**Result**: No violations. **Complexity Tracking table not required.**

## Project Structure

### Documentation (this feature)

```text
specs/001-prompt-to-chart/
├── plan.md                 # This file
├── research.md             # Phase 0: decisions, alternatives, rationale
├── data-model.md           # Phase 1: in-app entities (Session, Turn, ChartSpec)
├── quickstart.md           # Phase 1: how to run + manual smoke test
├── contracts/
│   └── chart-api.md        # Phase 1: POST /api/chart request/response contract
└── checklists/
    └── requirements.md     # From /speckit-specify (spec quality)
```

### Source Code (repository root)

The Next.js application is the only source tree. New paths created by
this feature are marked **NEW**.

```text
ai-charts/
├── app/
│   ├── api/
│   │   └── chart/
│   │       └── route.ts                 # NEW — POST /api/chart (DeepSeek proxy)
│   ├── (locale)/[locale]/               # NEW — next-intl segment wrapper (FR-015)
│   │   ├── layout.tsx                   # NEW — locale provider; replaces root layout role
│   │   └── page.tsx                     # NEW — RSC shell hosting <ChatChartIsland />
│   ├── layout.tsx                       # MODIFIED — strip create-next-app boilerplate
│   ├── globals.css                      # REWRITE — `@import "tailwindcss"` + shadcn tokens
│   ├── page.tsx                         # DELETE (logic moves into [locale]/page.tsx)
│   └── page.module.css                  # DELETE
├── components/
│   ├── ui/                              # NEW — shadcn primitives (button, textarea, toast trigger…)
│   └── chat-chart-island.tsx            # NEW — single client component, owns session reducer
├── lib/
│   ├── contracts/
│   │   └── chart.ts                     # NEW — Zod schemas + inferred TS types (request/response/ECharts option)
│   ├── deepseek/
│   │   ├── client.ts                    # NEW — OpenAI SDK instance pointed at DeepSeek
│   │   └── system-prompt.ts             # NEW — the chart-generation system prompt
│   ├── echarts/
│   │   └── theme.ts                     # NEW — Tailwind-derived palette tokens
│   └── i18n/
│       ├── config.ts                    # NEW — supported locales (zh, en)
│       ├── request.ts                   # NEW — next-intl request config
│       └── messages/
│           ├── en.json                  # NEW
│           └── zh.json                  # NEW
├── middleware.ts                        # NEW — next-intl locale-routing middleware
├── tailwind.config.ts                   # NEW
├── postcss.config.mjs                   # NEW
├── components.json                      # NEW — shadcn CLI config
├── .env                                 # EXISTS — DEEPSEEK_API_KEY etc.
├── next.config.ts                       # MODIFIED — wrap with `createNextIntlPlugin`
├── package.json                         # MODIFIED — add deps
└── …                                    # existing files unchanged
```

**Structure Decision**: Single-app layout per Constitution §"Repository
layout". No `frontend/` + `backend/` split — the Route Handler is the
"backend" and lives inside the same Next.js app. No separate `src/` —
Next.js 16 conventions place `app/`, `components/`, and `lib/` at the
app root.

## Complexity Tracking

> Not required — Constitution Check passes with no violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  |            |                                     |
