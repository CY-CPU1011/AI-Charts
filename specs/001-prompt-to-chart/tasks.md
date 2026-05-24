---
description: "Task list for feature implementation: Prompt-to-Chart Homepage"
---

# Tasks: Prompt-to-Chart Homepage

**Input**: Design documents from `specs/001-prompt-to-chart/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/chart-api.md](./contracts/chart-api.md), [quickstart.md](./quickstart.md)

**Tests**: NOT requested. Per Constitution Principle V (YAGNI) the plan defers a test framework. Validation is via the manual smoke tests in [quickstart.md](./quickstart.md) and the build-must-pass gate.

**Organization**: Tasks are grouped by user story to enable independent implementation and delivery. MVP = Phase 1 + Phase 2 + Phase 3 (US1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on an incomplete task — can run in parallel
- **[Story]**: User story label (US1, US2, US3) — required only inside user-story phases
- All paths are relative to repo root `e:\code project\AI Charts\`

## Path conventions

- Next.js app: `ai-charts/`
- Spec Kit artifacts: `specs/`, `.specify/`
- The constitution forbids nesting one inside the other

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Strip create-next-app boilerplate and install all stack dependencies so every later phase starts from a known-good base.

- [x] T001 Remove create-next-app demo: delete `ai-charts/app/page.module.css`, clear `ai-charts/app/page.tsx` to `export default function Page() { return null }` (will be deleted in Phase 2 T020 after the locale segment exists), and strip the demo body and `<Image>`/`<a>` markup from `ai-charts/app/layout.tsx` leaving only the minimal `html` + `body` shell
- [x] T002 Install Tailwind CSS 4 via `pnpm --dir ai-charts add -D tailwindcss @tailwindcss/postcss`
- [x] T003 [P] Create `ai-charts/postcss.config.mjs` exporting `{ plugins: { "@tailwindcss/postcss": {} } }`
- [x] T004 Initialize Radix-based shadcn/ui non-interactively by running `pnpm dlx shadcn@latest init -d --base radix` inside `ai-charts/` (current Tailwind v4 CLI generates `ai-charts/components.json` and `ai-charts/lib/utils.ts`, with CSS-based configuration rather than `tailwind.config.ts`)
- [x] T005 Rewrite `ai-charts/app/globals.css` so it begins with `@import "tailwindcss";` and contains the shadcn CSS-variable tokens emitted by `shadcn@latest init`; remove every rule left over from create-next-app
- [x] T006 Add shadcn primitives by running `pnpm dlx shadcn@latest add button textarea sonner dropdown-menu skeleton` inside `ai-charts/`; verify each appears under `ai-charts/components/ui/`
- [x] T007 Install runtime dependencies via `pnpm --dir ai-charts add echarts echarts-for-react openai zod next-intl`
- [x] T008 Sanity gate: run `pnpm --dir ai-charts run build` and confirm zero type errors against the still-empty shell

**Checkpoint**: Stack is installed, primitives are in `components/ui/`, build is green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Wire i18n, contracts, DeepSeek client, ECharts theme, layout shell, and the empty Route Handler / island skeleton — everything that US1/US2/US3 all need.

**CRITICAL**: No user-story work begins until this phase is complete.

- [x] T009 [P] Create `ai-charts/lib/contracts/chart.ts` exporting `TurnSchema`, `ChartRequestSchema`, `ChartSpecSchema`, `ChartSuccessSchema`, `ChartErrorSchema` exactly as defined in [contracts/chart-api.md](./contracts/chart-api.md), plus the inferred TS types (`Turn`, `ChartRequest`, `ChartSpec`, `ChartSuccess`, `ChartError`)
- [x] T010 [P] Create `ai-charts/lib/deepseek/client.ts` exposing a server-only lazy `getOpenAIClient()` configured with `DEEPSEEK_API_KEY` and `DEEPSEEK_BASE_URL`; throw only when a model request is attempted without a key so `next build` remains valid without runtime secrets
- [x] T011 [P] Create `ai-charts/lib/echarts/theme.ts` exporting `registerAIChartsTheme()` that imports `tailwindcss/colors`, registers a theme named `"ai-charts"` via `echarts.registerTheme`, and is idempotent across multiple calls
- [x] T012 [P] Create `ai-charts/lib/i18n/config.ts` exporting `export const locales = ["zh", "en"] as const; export const defaultLocale = "zh"; export type Locale = (typeof locales)[number]`
- [x] T013 [P] Create `ai-charts/lib/i18n/messages/en.json` with keys for every UI string the feature renders: `placeholder.empty`, `placeholder.followup`, `button.submit`, `loading.label`, `error.no_data`, `error.model`, `error.validation`, `error.rate_limited`, `language.switcher.label`, `language.zh`, `language.en`
- [x] T014 [P] Create `ai-charts/lib/i18n/messages/zh.json` mirroring every key in `en.json` with Simplified-Chinese translations (e.g., `error.no_data: "请输入有效的数据"`)
- [x] T015 Create `ai-charts/lib/i18n/request.ts` (next-intl `getRequestConfig`) that validates `requestLocale`, dynamically imports the matching JSON from `lib/i18n/messages/`, and returns `{ locale, messages }`; depends on T012, T013, T014
- [x] T016 Create `ai-charts/proxy.ts` using `createMiddleware` from `next-intl/middleware` with `locales` + `defaultLocale` from `lib/i18n/config.ts`; export the matcher `["/((?!api|_next|.*\\..*).*)"]` so it does not intercept `/api/chart` (Next.js 16 renamed `middleware.ts` to `proxy.ts`)
- [x] T017 Modify `ai-charts/next.config.ts` to wrap the exported config with `createNextIntlPlugin("./lib/i18n/request.ts")` from `next-intl/plugin`
- [x] T018 Move the root `html` + `body` shell from `ai-charts/app/layout.tsx` into `ai-charts/app/[locale]/layout.tsx` so the root document can render a correct dynamic `lang` attribute, per the Next.js 16 internationalization guide
- [x] T019 Create `ai-charts/app/[locale]/layout.tsx` as the locale-aware root Server Component: validate async `params`, call `setRequestLocale(locale)`, wrap `{children}` in `<NextIntlClientProvider messages={await getMessages()}>`, and render the shadcn `<Toaster />` at the root
- [x] T020 Delete `ai-charts/app/page.tsx`. Create `ai-charts/app/[locale]/page.tsx` as a Server Component that imports `<ChatChartIsland />` from `@/components/chat-chart-island` and renders it inside a full-viewport `<main className="min-h-dvh">` container (the island will be implemented in US1; for now stub it as `export default function ChatChartIsland() { return null }` in `ai-charts/components/chat-chart-island.tsx` marked `"use client"` so the import resolves)
- [x] T021 Build sanity gate after foundational wiring: run `pnpm --dir ai-charts run build` and confirm zero type errors and that `/zh` + `/en` routes both resolve (start `pnpm dev` briefly if needed)

**Checkpoint**: Foundation ready. `/api/chart` is not yet implemented but every wire (i18n, theme, contracts, layout shell, client) is in place. US1, US2, US3 can now start.

---

## Phase 3: User Story 1 — First chart from a prompt (Priority: P1) 🎯 MVP

**Goal**: A first-time visitor pastes a data-bearing prompt into the centered input, presses submit, the layout reflows to bottom-anchored input + chart-area-above, and a correct ECharts chart appears built from the AI-chosen `option`.

**Independent Test**: Run [quickstart.md](./quickstart.md) **Test 1** — Beijing/Shanghai prompt produces a two-series, six-point chart and the input has moved to the bottom of the viewport.

### Implementation for User Story 1

- [x] T022 [US1] Create `ai-charts/lib/deepseek/system-prompt.ts` exporting `buildSystemPrompt(locale: Locale): string`. The v1 prompt MUST: (a) state that the assistant outputs **only** a single JSON object — no markdown, no prose; (b) contain the literal word "JSON" (DeepSeek requires this for `response_format: { type: "json_object" }`); (c) enumerate the response contract `{ chartType, title?, option, notice? }` with `option` defined as a valid ECharts `option` consumable by `setOption`; (d) instruct the model to choose the chart type that best fits the data shape across the chart families listed in spec FR-007; (e) define the no-data escape hatch: if the prompt contains nothing chartable, return exactly `{ "error": "no_data" }`; (f) tell the model to localize `title` and `notice` to the requested `locale`
- [x] T023 [US1] Implement `ai-charts/app/api/chart/route.ts` as a `POST` Route Handler that: parses the body with `ChartRequestSchema` (return HTTP 400 `validation_error` on fail); composes `messages = [{ role: "system", content: buildSystemPrompt(locale) }, ...turns]`; calls `openai.chat.completions.create({ model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat", messages, response_format: { type: "json_object" } })`; parses `choices[0].message.content` as JSON; if the parsed object equals `{ "error": "no_data" }` returns HTTP 400 `no_data`; otherwise validates with `ChartSpecSchema` and returns `{ ok: true, spec }` on success or HTTP 502 `model_error` / `validation_error` on failure. Set `export const runtime = "nodejs"`. **Before writing this file, read `ai-charts/node_modules/next/dist/docs/01-app/03-building-your-application/01-routing/13-route-handlers.md` to confirm Next 16 Route Handler exports and request/response shapes**
- [x] T024 [US1] Implement `ai-charts/components/chat-chart-island.tsx` (already stubbed in T020) as a `"use client"` component with `useReducer<SessionState, SessionAction>` matching [data-model.md §3](./data-model.md). The reducer handles `SUBMIT_PROMPT`, `RECEIVE_CHART`, `RECEIVE_ERROR`, `CANCEL_INFLIGHT`, `RESET`. Submit is via Cmd/Ctrl+Enter or the shadcn `<Button>`. When `turns.length === 0`, render a centered `<Textarea>` + `<Button>` using Tailwind `flex min-h-dvh items-center justify-center`. When `current` is non-null, render `<main className="flex min-h-dvh flex-col">` with the chart area `flex-1` on top and a `sticky bottom-0` input bar below
- [x] T025 [US1] In `ai-charts/components/chat-chart-island.tsx`, implement the fetch flow inside an async helper triggered by `SUBMIT_PROMPT`: create an `AbortController`, POST `JSON.stringify({ turns, locale } satisfies ChartRequest)` to `/api/chart`, narrow the response as `ChartSuccess | ChartError`, dispatch `RECEIVE_CHART` on success and `RECEIVE_ERROR` with the `error` code on failure. On unmount or new submit, call `abort()` on any prior controller (covers the rapid-submission edge case)
- [x] T026 [US1] In `ai-charts/components/chat-chart-island.tsx`, render the chart by importing `EChartsReact from "echarts-for-react"`, calling `registerAIChartsTheme()` once in a `useEffect`, and rendering `<EChartsReact theme="ai-charts" option={current.option} style={{ height: "100%", width: "100%" }} />`. While `status === "loading"`, render the shadcn `<Skeleton className="w-full h-full" />` in the chart area instead
- [x] T027 [US1] In `ai-charts/components/chat-chart-island.tsx`, disable the submit `<Button>` when the trimmed input value is empty (FR-003) and when `status === "loading"` (FR-009); on `RECEIVE_ERROR`, restore the input contents from the last user turn (FR-010) and call `toast.error(t(\`error.${code}\`))` from `sonner` using `useTranslations()` from `next-intl`
- [x] T028 [US1] Build + smoke test: `pnpm --dir ai-charts run build` succeeds; Test 1 was run through the production app and `/api/chart` against a temporary local OpenAI-compatible mock because no DeepSeek API key is configured, confirming a two-series chart and bottom composer layout

**Checkpoint**: MVP demoable. Single-turn flow works end-to-end. US2 and US3 build on this same plumbing without rewriting it.

---

## Phase 4: User Story 2 — User-specified chart type (Priority: P2)

**Goal**: When the prompt explicitly names a chart type (e.g., "用饼图"), the system renders that exact type instead of auto-selecting. When the named type is unknown or awkward for the data shape, fall back and tell the user.

**Independent Test**: Run [quickstart.md](./quickstart.md) **Test 2** — pie-chart prompt produces a pie chart; response `chartType === "pie"`.

### Implementation for User Story 2

- [x] T029 [US2] Extend `ai-charts/lib/deepseek/system-prompt.ts` (same file as T022): append a section to the prompt instructing the model that **if** the user names a chart type the model can render, it MUST set `option` to that type even when auto-selection would have chosen differently; **if** the named type does not exist in the model's chart vocabulary, fall back to auto-selection AND populate `notice` with a one-line localized message naming the type actually used
- [x] T030 [US2] Extend `ai-charts/lib/deepseek/system-prompt.ts` again: instruct that when the user-requested type is awkward for the data shape (e.g., pie for a long time series), the model attempts a best-effort render of the requested type per spec Assumptions, rather than silently overriding
- [x] T031 [US2] In `ai-charts/components/chat-chart-island.tsx`, on `RECEIVE_CHART` if `spec.notice` is a non-empty string, call `toast.info(spec.notice)` (already localized by the model). The chart still renders normally
- [x] T032 [US2] Smoke test: Test 2 ran through the production app and local compatible mock; `spec.chartType === "pie"` rendered a pie, and an unsupported requested type produced the localized fallback notice toast

**Checkpoint**: US2 demoable; US1 still works.

---

## Phase 5: User Story 3 — Conversational refinement (Priority: P2)

**Goal**: After the first chart appears, follow-up prompts modify the current chart in place using prior turns as context. A clearly unrelated new dataset replaces the chart.

**Independent Test**: Run [quickstart.md](./quickstart.md) **Test 3** — bar chart → "改成折线图" → "再加一条深圳" updates the same chart area across three turns.

### Implementation for User Story 3

- [x] T033 [US3] Extend `ai-charts/lib/deepseek/system-prompt.ts` (same file as T022/T029/T030) with the conversational-refinement clause from [research.md §8](./research.md): tell the model it is maintaining session state; if the new user turn looks like a refinement, modify the previous chart JSON minimally and return the complete new JSON; if the new turn introduces a clearly unrelated dataset, discard prior chart context and generate fresh
- [x] T034 [US3] Update the reducer in `ai-charts/components/chat-chart-island.tsx` so `RECEIVE_CHART` pushes `{ role: "assistant", content: JSON.stringify(spec) }` onto `turns`. The next `SUBMIT_PROMPT` therefore sends the full conversation history to `/api/chart` (US1's fetch flow already serializes `turns` as-is, so no fetch change is needed)
- [x] T035 [US3] Defensive cap in `ai-charts/components/chat-chart-island.tsx`: before `SUBMIT_PROMPT` appends the new user turn, if `turns.length >= 50` drop the oldest user+assistant pair (FIFO) so the request never exceeds `ChartRequestSchema.max(50)`
- [x] T036 [US3] Smoke test: Test 3 ran through the production app and local compatible mock; line conversion preserved two series, adding Shenzhen produced a third series, and a new department dataset replaced the current chart

**Checkpoint**: All three user stories independently functional and composable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: i18n switcher UI, responsive QA, empty-data toast verification, and the final build gate.

- [x] T037 [P] Create `ai-charts/components/language-switcher.tsx` as a `"use client"` component using shadcn `<DropdownMenu>` populated from `lib/i18n/config.locales`; on selection, call the next-intl typed `useRouter()` navigation helper to replace the current pathname under the chosen locale segment (e.g., `/zh/...` -> `/en/...`)
- [x] T038 [P] Wire `<LanguageSwitcher />` into `ai-charts/app/[locale]/layout.tsx` (top-right header area). Add the matching `language.switcher.label` strings to `lib/i18n/messages/{en,zh}.json` if any new keys are needed
- [x] T039 [P] Responsive QA pass on `ai-charts/components/chat-chart-island.tsx`: at 375px (mobile), 768px (tablet), and 1440px (desktop) Test 6 passed with no horizontal overflow, a scaled chart area, and reachable bottom composer
- [x] T040 [P] Run [quickstart.md](./quickstart.md) **Test 4** (empty-data toast - "tell me about the weather"): verified localized `error.no_data`, restored input, and preserved empty/chart layouts on both `/zh` and `/en` routes through the local compatible mock
- [x] T041 [P] Run [quickstart.md](./quickstart.md) **Test 5** (language switching): verified translated placeholder/button/toast copy, updated locale URL, and preservation of the current chart in session
- [x] T042 Final build gate: `pnpm --dir ai-charts run build` succeeded with zero type errors. This is the Constitution Definition of Done for any UI feature
- [x] T043 Full end-to-end smoke pass: all six quickstart scenarios passed in a fresh Playwright session through the real app and API route using a temporary local OpenAI-compatible mock; live DeepSeek validation remains dependent on a configured API key

---

## Dependencies & Execution Order

### Phase dependencies

- Phase 1 (Setup): no dependencies — start immediately
- Phase 2 (Foundational): depends on Phase 1; **blocks** all user stories
- Phase 3 (US1, P1, MVP): depends on Phase 2; first to deliver
- Phase 4 (US2, P2): depends on Phase 3 (extends the same system prompt and reducer)
- Phase 5 (US3, P2): depends on Phase 3 (extends the same reducer); independent of Phase 4
- Phase 6 (Polish): depends on Phase 3 at minimum (T040 requires the API Route); ideally runs after all three stories land

### Story dependencies (intra-feature)

- US1 is the MVP slice — implements every wire end-to-end
- US2 is a pure additive change to one file (the system prompt) plus a small toast hook; can run in parallel with US3 by a second developer
- US3 modifies the same reducer file (`chat-chart-island.tsx`) US1 created; if US2 and US3 are parallelized, US3's reducer edit and US2's toast-on-notice edit both touch `chat-chart-island.tsx` and must be sequenced

### Within each phase

- Each task names the exact file path it modifies; tasks marked [P] never share a file with another [P] task in the same phase
- The build sanity gates (T008, T021, T028, T042) are intentional checkpoints — DO NOT skip them; they catch Next 16 / Tailwind 4 / shadcn surprises early

### Parallel opportunities

- Phase 1 `T003` runs in parallel with `T004` setup work in different files
- Phase 2 `T009`–`T014` are all `[P]` — six independent files, all the cross-cutting infrastructure
- Phase 6 `T037`/`T038`/`T039`/`T040`/`T041` are all `[P]` — different files and different smoke tests

---

## Parallel example: Phase 2 (Foundational) starts

```text
# Spin up these six together — different files, no inter-task deps:
Task: T009 — lib/contracts/chart.ts (Zod schemas)
Task: T010 — lib/deepseek/client.ts (OpenAI SDK instance)
Task: T011 — lib/echarts/theme.ts (Tailwind-derived theme)
Task: T012 — lib/i18n/config.ts (locale list)
Task: T013 — lib/i18n/messages/en.json (UI strings)
Task: T014 — lib/i18n/messages/zh.json (UI strings)

# Then sequentially as their dependencies land:
Task: T015 — lib/i18n/request.ts (needs T012, T013, T014)
Task: T016 — middleware.ts (needs T012)
Task: T017 — next.config.ts wrap (needs T015)
Task: T018 — app/layout.tsx (root, minimal)
Task: T019 — app/[locale]/layout.tsx (needs T015, T018)
Task: T020 — app/[locale]/page.tsx + island stub (needs T019)
Task: T021 — build sanity gate (needs everything above)
```

---

## Implementation Strategy

### MVP first (Phase 1 + 2 + 3 only)

1. Complete Phase 1 (Setup) — environment + deps installed.
2. Complete Phase 2 (Foundational) — i18n, contracts, client, theme, layout shell wired.
3. Complete Phase 3 (US1) — single-turn prompt → chart works end-to-end.
4. **STOP and VALIDATE**: run [quickstart.md](./quickstart.md) Test 1.
5. Demo or ship the MVP.

### Incremental delivery

After MVP, US2 and US3 each take one short pass each:

- US2 = ~3 tasks (system prompt extension + notice toast).
- US3 = ~3 tasks (system prompt extension + reducer change + cap).

Each story is independently demoable and ships value without breaking earlier ones.

### Parallel team strategy

With two developers after Phase 2:

- Dev A: US1 (T022–T028) — the only true critical path.
- After Dev A finishes T024 (the island skeleton), Dev B can take US2 (T029–T032) and US3 (T033–T036) in series. They both touch `chat-chart-island.tsx`, so true parallelism is limited.

Polish (Phase 6) can fan out across multiple developers since every Phase-6 [P] task touches a different file or runs a different smoke test.

---

## Notes

- **No test framework in v1**: validation is build + manual smoke tests (Constitution V, plan §Testing).
- **Build sanity gates** (T008, T021, T028, T042) are checkpoints: stop and fix immediately if any fails.
- **Next 16 docs check**: T019 and T023 both call out specific `node_modules/next/dist/docs/...` files to consult before implementing — do NOT skip this step.
- **DeepSeek key**: a configured `DEEPSEEK_API_KEY` is required for live-provider validation. The completed smoke tests exercised the real app and API route against a temporary local OpenAI-compatible mock without reading or exposing local secret contents.
- **Single source of truth for wire types**: `ai-charts/lib/contracts/chart.ts` (T009). Both Route Handler and client island import from there — no duplicate type definitions anywhere.
- **Commit cadence**: commit at every checkpoint (end of Phase 1, end of Phase 2, end of each US, end of polish). The `after_implement` git hook offers this automatically.
