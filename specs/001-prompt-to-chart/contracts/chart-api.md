# API Contract — `POST /api/chart`

**Feature**: 001-prompt-to-chart
**Owner**: `ai-charts/app/api/chart/route.ts`
**Authoritative schema**: `ai-charts/lib/contracts/chart.ts` (Zod)

This is the single backend surface for the feature, per Constitution
Principle I. It accepts the conversation history, calls DeepSeek, and
returns a validated `ChartSpec`.

---

## Request

```http
POST /api/chart
Content-Type: application/json
```

### Body schema (Zod)

```ts
import { z } from "zod";

export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1), // FR-002: no prompt-length limit in v1
});

export const ChartRequestSchema = z.object({
  turns: z.array(TurnSchema).min(1).max(50),
  locale: z.enum(["zh", "en"]).default("zh"),
});

export type ChartRequest = z.infer<typeof ChartRequestSchema>;
```

### Body example

```json
{
  "turns": [
    {
      "role": "user",
      "content": "帮我比较一下今年一到六月，北京和上海的月度销售额：北京是 120、130、150、170、180、200；上海是 100、140、160、150、190、210"
    }
  ],
  "locale": "zh"
}
```

### Behavior

1. Validate body against `ChartRequestSchema`. On fail → `400`
   `{ ok: false, error: "validation_error" }`.
2. Build the OpenAI-SDK `messages` array:
   - Prepend the chart-generation system prompt
     (`lib/deepseek/system-prompt.ts`).
   - Append `turns` verbatim.
3. Call DeepSeek:

   ```ts
   const completion = await openai.chat.completions.create({
     model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
     messages,
     response_format: { type: "json_object" },
   });
   ```

4. Parse `completion.choices[0].message.content` as JSON. On parse fail
   → `502` `{ ok: false, error: "model_error" }`.
5. If parsed body equals `{ "error": "no_data" }` → `400`
   `{ ok: false, error: "no_data" }`.
6. Validate parsed body against `ChartSpecSchema` (below). On fail →
   `502` `{ ok: false, error: "validation_error" }`.
7. Return `200 { ok: true, spec }`.

### Runtime

- **Runtime**: `nodejs` (NOT `edge`). Required by the `openai` SDK.
- **Timeout**: Use the SDK's default. Client-side AbortController is the
  cancellation path.

---

## Response

### Success — HTTP 200

```ts
export const ChartSpecSchema = z.object({
  chartType: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/i),
  title: z.string().max(200).optional(),
  option: z
    .record(z.unknown())
    .refine(
      (o) => "series" in o || "dataset" in o || "visualMap" in o,
      "ECharts option must include series, dataset, or visualMap",
    ),
  notice: z.string().max(200).optional(),
});

export const ChartSuccessSchema = z.object({
  ok: z.literal(true),
  spec: ChartSpecSchema,
});

export type ChartSuccess = z.infer<typeof ChartSuccessSchema>;
```

### Error — HTTP 400 / 502 / 429

```ts
export const ChartErrorSchema = z.object({
  ok: z.literal(false),
  error: z.enum(["no_data", "validation_error", "model_error", "rate_limited"]),
  message: z.string().max(500).optional(),
});

export type ChartError = z.infer<typeof ChartErrorSchema>;
```

| HTTP | `error` value | When |
| --- | --- | --- |
| 400 | `validation_error` | Request body failed Zod validation |
| 400 | `no_data` | Model signaled `{"error":"no_data"}` (prompt had nothing to chart) |
| 429 | `rate_limited` | DeepSeek returned 429 (passthrough) |
| 502 | `model_error` | DeepSeek call threw, or returned non-JSON, or returned JSON the schema rejected |

### Response examples

Success:

```json
{
  "ok": true,
  "spec": {
    "chartType": "bar",
    "title": "北京 vs 上海 一到六月销售额",
    "option": {
      "xAxis": { "type": "category", "data": ["1月","2月","3月","4月","5月","6月"] },
      "yAxis": { "type": "value" },
      "series": [
        { "name": "北京", "type": "bar", "data": [120,130,150,170,180,200] },
        { "name": "上海", "type": "bar", "data": [100,140,160,150,190,210] }
      ],
      "legend": { "data": ["北京","上海"] },
      "tooltip": { "trigger": "axis" }
    }
  }
}
```

No-data error:

```json
{
  "ok": false,
  "error": "no_data",
  "message": "请输入有效的数据"
}
```

---

## Client consumption

```ts
// in ai-charts/components/chat-chart-island.tsx
const res = await fetch("/api/chart", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ turns, locale } satisfies ChartRequest),
  signal: abortController.signal,
});

const json: ChartSuccess | ChartError = await res.json();
if (!json.ok) {
  dispatch({ type: "RECEIVE_ERROR", code: json.error, message: json.message });
  return;
}
dispatch({ type: "RECEIVE_CHART", spec: json.spec });
```

The fetch helper MUST be typed with `ChartSuccess | ChartError` — no
`any`, no `as` (Principle IV).

---

## Non-goals (explicitly out of scope for v1)

- Streaming responses.
- Authentication / rate-limiting per user.
- Server-side conversation persistence.
- A second endpoint (e.g., `/api/locale-detect`) — locale ships in the
  request body.
