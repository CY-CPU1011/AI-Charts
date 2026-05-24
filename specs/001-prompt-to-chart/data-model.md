# Phase 1 Data Model — Prompt-to-Chart Homepage

**Feature**: 001-prompt-to-chart
**Date**: 2026-05-24

Scope note: this feature has **no persistent storage**. All entities live
in client memory for the lifetime of one browser tab (spec FR-014, Key
Entities §Session). The "data model" below is the runtime TypeScript
shape that crosses the wire and the in-memory reducer state.

---

## Entities

### 1. `Turn`

A single exchange in the conversation. Mirrors the OpenAI chat-completions
message shape so it can be sent to DeepSeek as-is.

| Field | Type | Notes |
| --- | --- | --- |
| `role` | `"user" \| "assistant"` | `system` is added server-side, never client-side |
| `content` | `string` | For `user`: the raw prompt. For `assistant`: the serialized JSON the model returned on that turn |

**Validation**:

- `role` is a closed enum.
- `content` MUST be a non-empty string after trim.

**Lifecycle**:

- Appended on `SUBMIT_PROMPT` (user) and on successful `RECEIVE_CHART`
  (assistant).
- Cleared on page reload.
- Cleared on a user action that explicitly resets the chart (deferred —
  no UI for this in v1; reload is the reset).

---

### 2. `ChartSpec`

The validated, parsed AI response that becomes the renderable chart.

| Field | Type | Notes |
| --- | --- | --- |
| `chartType` | `string` | Short label the AI chose (`"bar"`, `"line"`, `"pie"`, …). Display/telemetry only |
| `title` | `string \| undefined` | Optional AI-generated chart title |
| `option` | `object` | ECharts `option` object — passed verbatim to `ECharts.setOption` |
| `notice` | `string \| undefined` | Optional message when the system fell back from a requested chart type to an auto-chosen one |

**Validation** (Zod):

- `chartType`: 1–32 chars, `/^[a-z0-9_-]+$/i`.
- `option`: non-null object; MUST contain at least one of `series`
  (array), `dataset`, or `visualMap`. Rejected if `option` has script-
  evaluating fields like `formatter` set to a string starting with
  `function` (defensive — ECharts allows function strings but we don't).
- `notice`: ≤ 200 chars when present.

**Lifecycle**:

- Produced by `POST /api/chart` on success.
- Stored as the single `current` field of `SessionState` (no history of
  past charts in v1; conversational refinement replaces in place).
- Replaced wholesale on each successful turn.

---

### 3. `SessionState` (client-only)

The single source of truth for the chat-chart island.

```ts
type SessionStatus = "idle" | "loading" | "error";

type SessionState = {
  status: SessionStatus;
  turns: Turn[];               // length 0 ⇒ "centered-input" layout
  current: ChartSpec | null;   // null while idle and on first error
  inflightAbort?: AbortController;
};
```

**State transitions** (driven by reducer actions):

| From | Action | To | Side effects |
| --- | --- | --- | --- |
| `idle`, `error` | `SUBMIT_PROMPT(text)` | `loading` | Append `Turn{user,text}`; create `AbortController`; layout reflows if first submit |
| `loading` | `RECEIVE_CHART(spec)` | `idle` | Append `Turn{assistant, JSON.stringify(spec)}`; set `current=spec`; show toast if `spec.notice` |
| `loading` | `RECEIVE_ERROR(code)` | `error` | Pop the last user turn (so retry can re-send); show localized toast |
| any | `CANCEL_INFLIGHT` | `idle` | Call `inflightAbort.abort()`; preserve `current` |
| any | `RESET` | `idle` | Clear `turns`, `current`; layout returns to centered-input |

**Invariants**:

- If `status === "loading"`, `inflightAbort` MUST be set.
- The last entry in `turns` always has `role === "user"` when `status` is
  `loading` or `error`.
- `current === null` ⟺ no successful turn has occurred this session.

---

### 4. `ChartRequestBody` (wire)

What the client POSTs to `/api/chart`. Defined as the canonical Zod
schema in [contracts/chart-api.md](./contracts/chart-api.md) and
re-imported here for cross-reference.

| Field | Type | Notes |
| --- | --- | --- |
| `turns` | `Turn[]` | The full history including the just-submitted user turn. Max 50 turns (defensive cap) |
| `locale` | `"zh" \| "en"` | So the model can localize `title` / `notice` |

---

### 5. `ChartResponseBody` (wire)

What `/api/chart` returns on success (HTTP 200).

```ts
type ChartResponseBody = { ok: true; spec: ChartSpec };
```

On failure (HTTP 4xx/5xx):

```ts
type ChartErrorBody = {
  ok: false;
  error: "no_data" | "validation_error" | "model_error" | "rate_limited";
  message?: string;   // human-readable, localized to request locale
};
```

---

## Cross-references

- Wire contract details (status codes, headers, request examples) →
  [contracts/chart-api.md](./contracts/chart-api.md).
- Renderable ECharts library wrap → `ai-charts/components/chart-chart-island.tsx`
  (created in `/speckit-implement`).
- The system prompt that produces a valid `ChartSpec` →
  `ai-charts/lib/deepseek/system-prompt.ts` (created in `/speckit-implement`).
