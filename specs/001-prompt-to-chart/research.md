# Phase 0 Research — Prompt-to-Chart Homepage

**Feature**: 001-prompt-to-chart
**Date**: 2026-05-24

Each section follows the format: **Decision / Rationale / Alternatives
considered**.

---

## 1. AI provider call shape

**Decision**: Use the official `openai` npm SDK pointed at
`https://api.deepseek.com` with model `deepseek-chat` and
`response_format: { type: "json_object" }`. The system prompt explicitly
instructs the model to return a JSON object whose top-level shape is
`{ chartType, title?, option }` where `option` is a verbatim ECharts
`option` object.

**Rationale**:

- User explicitly requested this SDK + this endpoint + this response
  format. The OpenAI SDK is DeepSeek-compatible because DeepSeek
  implements the OpenAI chat-completions wire protocol.
- `json_object` mode forces the model to return parseable JSON, which
  removes a whole class of "model wrapped JSON in markdown fences"
  failures. The system prompt MUST contain the literal word "JSON" for
  DeepSeek to accept `json_object`.
- Storing the model name in `DEEPSEEK_MODEL` env var (already in `.env`)
  keeps the choice flexible without code change.

**Alternatives considered**:

- Direct `fetch` against the DeepSeek REST endpoint — rejected; loses the
  SDK's typed message helpers and gains nothing.
- DeepSeek's native SDK — does not exist as a first-class npm package; the
  OpenAI SDK is the documented path.
- Streaming responses — rejected for v1. The chart can only render after
  the full `option` JSON is parsed, so streaming offers no UX win and
  complicates the Route Handler.

---

## 2. AI output contract (what the model must return)

**Decision**: The model returns a single JSON object:

```json
{
  "chartType": "bar",
  "title": "北京 vs 上海 一到六月销售额",
  "option": { /* a valid ECharts option object */ },
  "notice": "（可选）当系统回退到自动选型时填这里的简短中文/英文说明"
}
```

- `chartType` is a short string the AI chose (e.g., `"bar"`, `"line"`,
  `"pie"`, `"scatter"`, `"sankey"`, etc.) — used by the client for
  display/telemetry, not for rendering logic.
- `option` is the actual thing passed to `ECharts.setOption`. The
  frontend treats it as opaque except for Zod-level structural checks
  (must be a non-null object, must have either `series` or `dataset`).
- `notice` is optional; only set when the system fell back from a user-
  requested type to an auto-picked one — surfaces FR-010 / edge-case
  "tell the user which type it used and why".

**Rationale**: Keeping the rendering side dumb ("just pass `option` to
ECharts") is the simplest possible contract and aligns with Principle V.
ECharts' option schema is the universal language for every chart type in
the spec's vocabulary (FR-007), so we don't need a per-chart-type DTO.

**Alternatives considered**:

- Returning a high-level domain DTO (`{ type, series, categories, … }`)
  and translating to ECharts client-side — rejected: it would force us to
  re-implement ECharts' configuration vocabulary in our types and would
  cap the chart variety we support to whatever we bothered to map. With
  ~30+ ECharts chart families, this is a maintenance trap.
- Returning a string of JS code — rejected: hard XSS risk, can't validate.

---

## 3. Empty-data / error policy at the API boundary

**Decision**: If the model's JSON cannot be parsed, fails Zod validation,
or contains an obvious "no chartable data" signal (we standardize on a
single shape: `{ "error": "no_data" }` returned by the model when the
prompt has nothing to chart), the Route Handler responds with HTTP `400`
and a typed body `{ error: "no_data" | "model_error" | "validation_error" }`.
The client converts each into a localized toast and preserves the
existing chart, per FR-010.

**Rationale**: One response envelope, three terminal failure codes — the
client switch statement stays tiny. We don't expose raw model errors to
the user.

**Alternatives considered**:

- Always 200 with `{ ok: false, … }` — rejected: hides failures from
  network panels and CDN logs.
- 5xx for model failures — rejected: a user submitting "tell me about
  the weather" is not a server fault.

---

## 4. ECharts theming from Tailwind palette

**Decision**: Define a single `lib/echarts/theme.ts` that exports a
`registerAIChartsTheme()` function called once per client island mount.
The theme picks ~8 palette colors from Tailwind's default `slate` +
`blue` + `emerald` + `amber` + `rose` ramps (read as literal hex values
from `tailwindcss/colors`) and sets axis/tooltip defaults. The theme name
is `"ai-charts"`; every `<EChartsReact theme="ai-charts" … />` uses it.

**Rationale**: Constitution Principle III + Tech Stack §"ECharts theme
tokens MUST derive from the Tailwind palette". Importing
`tailwindcss/colors` (a plain JS export) is the lightest way; it avoids
parsing the user's compiled CSS.

**Alternatives considered**:

- Reading CSS custom properties at runtime — rejected: requires the chart
  container to be mounted into the DOM and styled before theming, which
  adds a flash of unstyled chart.
- Hard-coding hex palette in `theme.ts` — explicitly forbidden by the
  constitution.

---

## 5. shadcn/ui component set

**Decision**: Install these shadcn primitives in v1:

- `button` — submit, language switcher trigger
- `textarea` — the main prompt input (multi-line, auto-grow)
- `sonner` — toast notifications (FR-010, SC-007)
- `dropdown-menu` — language switcher
- `skeleton` — chart-area loading state (FR-009)

No `dialog`, no `form`, no `command`, no `data-table` for v1 (YAGNI).
Add later as features demand.

**Rationale**: Smallest set that satisfies every FR while leaving the
visual language consistent. `sonner` is shadcn/ui's official toast wrap.

**Alternatives considered**:

- Adding `input` instead of `textarea` — rejected: spec FR-002 requires
  multi-line.
- Installing the full shadcn block set — rejected: pollutes the repo
  with unused components, harder to audit.

---

## 6. i18n strategy

**Decision**: Use `next-intl` with App Router segment-based routing
(`/[locale]/...`). Supported locales for v1: `zh` (default) and `en`.
Locale is inferred from `Accept-Language` for the first visit and
overridable via a dropdown in the header; selection is persisted in a
cookie. Messages live as JSON in `lib/i18n/messages/{en,zh}.json`.

**Rationale**: `next-intl` is the de-facto i18n library for Next.js App
Router, integrates cleanly with RSC, and ships type-safe message keys.
Two locales satisfy FR-015 and SC-009 ("at least two human languages").

**Alternatives considered**:

- `react-i18next` — rejected: client-only, doesn't help RSC strings.
- Roll our own — rejected: locale-routing middleware is non-trivial.
- More locales out of the gate — deferred (YAGNI); the architecture
  supports adding locales by dropping new JSON files.

---

## 7. Session state shape and reducer

**Decision**: A single `useReducer` in `<ChatChartIsland />` holds:

```ts
type SessionState = {
  status: "idle" | "loading" | "error";
  turns: Turn[];          // chat history sent to the API for context
  current: ChartView | null;  // the one visible chart
  errorToastId?: string;  // dedupe rapid errors
};
```

Actions: `SUBMIT_PROMPT`, `RECEIVE_CHART`, `RECEIVE_ERROR`,
`CANCEL_INFLIGHT` (page-unmount), `RESET`. The reducer is pure; the
fetch call lives in a `useEffect`-guarded async wrapper that respects
`AbortController` for the rapid-submission edge case.

**Rationale**: Spec calls this state "ephemeral, in-memory, scoped to a
single browser tab" (Key Entities §Session). `useReducer` is built into
React, satisfies Principle V (no state library), and the AbortController
satisfies the "queue or cancel prior requests" edge case.

**Alternatives considered**:

- Zustand / Jotai — rejected by Principle V.
- Multiple `useState` calls — rejected: status/turns/current need to
  transition atomically.

---

## 8. Conversational refinement: how prior turns shape the next call

**Decision**: The client sends the full `turns: { role, content }[]`
array (user + assistant messages, where assistant content is the
serialized chart JSON the model previously returned) to `/api/chart` on
each turn. The system prompt instructs the model:

> 你正在维护一个会话状态：用户的最新输入既可能是全新的数据请求，也可能
> 是对当前图表的修改指令。如果是修改指令，请基于上一次返回的图表 JSON
> 进行最小化修改并返回完整新版 JSON；如果是全新数据，请丢弃旧上下文重新
> 生成。

(Full text in `lib/deepseek/system-prompt.ts`.)

**Rationale**: This is the cheapest implementation of FR-011's two modes
("modify in place" vs "replace with new dataset") — let the model
decide, send everything, trust the JSON contract. No server-side dialog-
state machine needed.

**Alternatives considered**:

- Client-side intent classifier ("is this a refinement or new chart?")
  — rejected: brittle, duplicates work the LLM already does well.
- Server-side conversation store (Redis / DB) — rejected by FR-014 (no
  persistence in v1).

---

## 9. Tailwind 4 + shadcn/ui interaction note

**Decision**: Install Tailwind CSS 4 via the official PostCSS plugin
(`@tailwindcss/postcss`) and `@import "tailwindcss"` in
`app/globals.css`. Then run `pnpm dlx shadcn@latest init` which (as of
its current release) will generate a minimal `tailwind.config.ts` and
the `components.json` shadcn manifest.

**Rationale**: Tailwind 4 changed the bootstrap (no longer needs the v3
`@tailwind base/components/utilities` triplet), but shadcn's CLI still
emits a config the CLI itself consumes — so we keep the file. This is
the documented path.

**Alternatives considered**:

- Tailwind 3 — rejected: greenfield project, prefer the current major.
- Skip shadcn and hand-write Radix wrappers — rejected by Principle II.

---

## 10. Next.js 16 breaking-change check (AGENTS.md warning)

**Decision**: Before writing each Next-touching file during
`/speckit-implement`, the implementer MUST consult the relevant guide in
`ai-charts/node_modules/next/dist/docs/01-app/` (specifically:
`01-getting-started/01-installation.md`,
`03-building-your-application/01-routing/13-route-handlers.md`, and the
middleware guide). Areas of known divergence from Next 13/14/15 docs:
caching defaults, `params` becoming `Promise<…>`, `cookies()`/`headers()`
returning promises, and middleware matcher format.

**Rationale**: `ai-charts/AGENTS.md` explicitly warns "This is NOT the
Next.js you know." The plan should not pretend it can pre-resolve every
Next 16 API surface — instead it records a hard requirement to check
the bundled docs at implementation time.

**Alternatives considered**:

- Inline every Next 16 API signature here — rejected: doc would rot the
  moment Next.js patches.
