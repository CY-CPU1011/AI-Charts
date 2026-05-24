# AI Charts

Generate ECharts visualizations from natural-language data prompts with DeepSeek,
and keep a reloadable chart history in Supabase.

## Local Development

Create `ai-charts/.env.local` or keep equivalent values in your local
`ai-charts/.env` file:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

`SUPABASE_URL` must be the project base URL, such as
`https://your-project.supabase.co`. Do not append `/rest/v1`; the Supabase
client adds its API path automatically.

Optional DeepSeek overrides:

```env
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

Use the Supabase **secret** API key for `SUPABASE_SECRET_KEY`. It is consumed
only inside Next.js route handlers and must never use a `NEXT_PUBLIC_` prefix
or be committed to Git.

Run the development server:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/zh](http://localhost:3000/zh).

## Supabase History Table

The application expects `public.chart_history` with these fields:

```sql
create table if not exists public.chart_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  description text not null
    check (length(btrim(description)) > 0),
  chart_config jsonb not null
    check (jsonb_typeof(chart_config) = 'object'),
  chart_type text not null
    check (length(btrim(chart_type)) > 0)
);

create index if not exists chart_history_created_at_idx
  on public.chart_history (created_at desc);

alter table public.chart_history enable row level security;

revoke all on table public.chart_history from anon, authenticated;
grant select, insert, update, delete
  on table public.chart_history
  to service_role;
```

`chart_config` stores the validated ECharts `option` object returned by the
model. Combined with `chart_type`, it allows a saved record to reload the
rendered chart.

## Vercel Deployment

When importing the GitHub repository in Vercel, set the project root directory
to `ai-charts`, then configure these server-side environment variables for
Production and Preview:

```env
DEEPSEEK_API_KEY=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
```
