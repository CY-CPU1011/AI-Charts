# Quickstart — Prompt-to-Chart Homepage

**Feature**: 001-prompt-to-chart

How to set up the dev environment and manually smoke-test the feature.
This is the Definition-of-Done checklist for the implementation phase.

---

## Prerequisites

- Node.js LTS, pnpm installed.
- A DeepSeek API key.

## One-time setup

```powershell
# from repo root
cd ai-charts
pnpm install
```

After `/speckit-implement` adds the new deps, the install will also pull
in: `tailwindcss`, `@tailwindcss/postcss`, `echarts`,
`echarts-for-react`, `openai`, `zod`, `next-intl`, plus the shadcn
primitives.

Then initialize shadcn (one-time, generates `components.json` and `lib/utils.ts`):

```powershell
cd ai-charts
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button textarea sonner dropdown-menu skeleton
```

## Configure secrets

`ai-charts/.env` already exists. Fill it:

```env
DEEPSEEK_API_KEY=sk-...your-real-key...
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

The Route Handler at `app/api/chart/route.ts` reads these via
`process.env`. Never reference them from a Client Component.

## Run the dev server

```powershell
cd ai-charts
pnpm dev
```

Open `http://localhost:3000`. You should land on a single centered
textarea with a language switcher in the corner.

---

## Manual smoke tests (covers all user stories)

### Test 1 — US1 (P1): centered input → first chart

1. Paste into the input:

   ```text
   帮我比较一下今年一到六月，北京和上海的月度销售额：北京是 120、130、150、170、180、200；上海是 100、140、160、150、190、210
   ```

2. Press `Cmd/Ctrl+Enter`.
3. **Expect**: within a few seconds the layout reflows (input drops to
   the bottom, chart area appears above) and a grouped/line bar chart
   shows two six-point series matching the numbers above.

### Test 2 — US2 (P2): user-specified chart type

1. From the empty state (reload), submit:

   ```text
   用饼图显示北京一到六月销售额：120、130、150、170、180、200
   ```

2. **Expect**: a pie chart with six slices appears. `chartType` in the
   response is `"pie"`.

### Test 3 — US3 (P2): conversational refinement

1. After Test 1's bar chart renders, type into the bottom input:

   ```text
   改成折线图
   ```

2. **Expect**: the same two series re-render as a line chart in the same
   chart area. The previous data is preserved.

3. Then type:

   ```text
   再加一条深圳：80,90,100,110,120,130
   ```

4. **Expect**: a third line is added; legend now has three entries.

### Test 4 — empty-data toast (FR-010 / SC-007)

1. Reload to reset session.
2. Submit:

   ```text
   tell me about the weather
   ```

3. **Expect**: a toast appears asking for valid data (in the active
   locale). The layout does NOT reflow; the centered input remains.

### Test 5 — language switching (FR-015 / SC-009)

1. Reload. Open the language switcher; pick the other locale.
2. **Expect**: all UI chrome (placeholder, toast text, loading) is now
   in the new language. URL path changes from `/zh` to `/en` (or vice
   versa).
3. Run Test 4 again in the new locale — the toast copy is in the active
   locale.

### Test 6 — responsive (FR-013 / SC-008)

1. Open browser devtools, switch to a 375-px-wide mobile viewport.
2. **Expect**: centered input fits the viewport without horizontal
   scroll. After submitting a prompt, the chart area scales to fit; the
   bottom input remains reachable above the soft keyboard.
3. Repeat at 768 px (tablet) and 1440 px (desktop).

---

## Pre-merge build check (Constitution §"Definition of done")

```powershell
cd ai-charts
pnpm run build
```

Build MUST succeed with zero type errors. If you added new shadcn
primitives, they must also typecheck. If `pnpm run build` fails, the
feature is NOT done regardless of whether the smoke tests pass.

---

## What to verify in the network panel

While running Test 1, open devtools → Network:

- One `POST /api/chart` request, content-type `application/json`.
- Request body matches `ChartRequestSchema` (single user turn).
- Response body matches `ChartSuccessSchema` (HTTP 200, `ok: true`,
  `spec.option.series` is an array of two entries).
- No request to `api.deepseek.com` from the browser (it must be
  server-side only — Principle I).
