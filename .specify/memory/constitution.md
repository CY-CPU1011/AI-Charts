<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Rationale: Initial ratification of the AI Charts constitution. MAJOR bump from
unversioned template state to first formally adopted version.

Modified principles (placeholder → concrete):
- [PRINCIPLE_1_NAME] → I. Next.js API Route as the Sole Backend Surface
- [PRINCIPLE_2_NAME] → II. Tailwind CSS + shadcn/ui for All UI
- [PRINCIPLE_3_NAME] → III. ECharts as the Single Charting Engine
- [PRINCIPLE_4_NAME] → IV. Type-Safe, Contract-First API Boundary
- [PRINCIPLE_5_NAME] → V. Simplicity, YAGNI, and Server-First Defaults

Added sections:
- Technology Stack & Constraints (replaces [SECTION_2_NAME])
- Development Workflow & Quality Gates (replaces [SECTION_3_NAME])

Removed sections: none.

Templates requiring updates:
- ✅ .specify/memory/constitution.md (this file, overwritten)
- ⚠ .specify/templates/plan-template.md — "Constitution Check" gate still
  reads `[Gates determined based on constitution file]`. Plan authors must
  enumerate principle-derived gates (API Route boundary, shadcn/ui usage,
  ECharts-only charts, contract-first API types) when filling the template.
  No template wording change required for v1.0.0 because the placeholder
  intentionally defers to whichever constitution is active.
- ⚠ .specify/templates/spec-template.md — No principle currently mandates
  spec-level changes; review on next amendment.
- ⚠ .specify/templates/tasks-template.md — Consider adding standing task
  categories for "shadcn/ui component install" and "API Route contract
  definition" when a feature touches new UI surfaces or endpoints.
- ✅ .claude/skills/speckit-* — No agent-name references requiring rewrite.

Deferred / follow-up TODOs: none. RATIFICATION_DATE set to today; project
is greenfield (initial Next.js scaffold present at ai-charts/).
-->

# AI Charts Constitution

## Core Principles

### I. Next.js API Route as the Sole Backend Surface

All server-side functionality MUST be exposed through Next.js App Router Route
Handlers under `app/api/**/route.ts` (or co-located segment handlers). The
frontend MUST reach the backend exclusively via these endpoints; direct
database, third-party API, or filesystem access from Client Components is
forbidden. Server Components MAY call internal service modules directly, but
any data path consumed by Client Components MUST traverse an API Route so the
contract is explicit, cacheable, and testable.

**Rationale**: A single backend surface keeps authentication, validation,
rate-limiting, logging, and AI-provider secret handling in one auditable
layer. Mixing direct fetches and ad-hoc server calls across components is the
primary cause of leaked keys and inconsistent error shapes in Next.js apps.

### II. Tailwind CSS + shadcn/ui for All UI

All visual components MUST be built with Tailwind CSS utility classes plus
shadcn/ui primitives. Hand-authored CSS files, CSS-in-JS runtimes (styled-
components, Emotion), and competing component libraries (MUI, Ant Design,
Chakra, Mantine, etc.) are forbidden. New UI primitives MUST be added via
`pnpm dlx shadcn@latest add <component>` and then composed locally; do not
fork shadcn sources unless customization is impossible through props or the
`cn()` utility.

**Rationale**: One styling system and one component vocabulary eliminate
visual drift, halve the dependency surface, and make AI-assisted refactors
reliable because class names — not opaque runtime objects — are the source of
truth.

### III. ECharts as the Single Charting Engine

Every chart, graph, or data-visualization widget MUST be rendered with Apache
ECharts (via `echarts` + a thin React wrapper such as `echarts-for-react` or
a project-local hook). Recharts, Chart.js, D3 selections rendered as charts,
Nivo, Visx, and other charting libraries are forbidden. Custom SVG drawings
are permitted only for decorative or non-data graphics; anything that
visualizes a dataset MUST go through ECharts.

**Rationale**: ECharts covers the breadth (statistical, geo, 3D, large-scale
streaming) this project needs, and standardizing on one engine means one
theming layer, one a11y story, one bundle-size budget, and reusable option-
builder utilities.

### IV. Type-Safe, Contract-First API Boundary

Every API Route MUST define and export its request/response types (or a
schema using Zod or an equivalent runtime validator). Client-side fetch
helpers MUST consume those types; `any`, untyped `fetch().then(r => r.json())`,
and silent shape coercion are forbidden at the API boundary. Runtime
validation MUST run on every request handler — never trust client input.

**Rationale**: Contract drift between frontend and backend is the single
biggest source of production regressions in full-stack TypeScript apps.
Sharing types + runtime validation catches both compile-time and wire-time
mismatches before users see them.

### V. Simplicity, YAGNI, and Server-First Defaults

Default to React Server Components; opt into `"use client"` only when an
interaction, browser API, or state hook genuinely requires it. Do not
introduce state libraries (Redux, Zustand, Jotai), data-fetching libraries
(SWR, TanStack Query), or ORMs until a concrete feature in the current sprint
demonstrably needs them — and then justify the addition in the plan's
Complexity Tracking table. Three similar lines is preferable to a premature
abstraction.

**Rationale**: Next.js 16 + RSC already provide caching, streaming, and data
fetching out of the box. Each added abstraction multiplies bundle size,
cognitive load, and the surface where the three preceding principles can be
quietly violated.

## Technology Stack & Constraints

The following stack is **normative**. Substitutions require a constitutional
amendment (MINOR bump minimum).

- **Runtime / framework**: Next.js 16 (App Router) on Node.js LTS.
- **Language**: TypeScript in `strict` mode; no untyped JavaScript files in
  application code.
- **Package manager**: pnpm. Do not commit `package-lock.json` or `yarn.lock`.
- **Styling**: Tailwind CSS. Configuration lives at the Next.js app root.
- **UI primitives**: shadcn/ui (Radix-based). Installed components are owned
  by this repo and committed.
- **Charts**: Apache ECharts via a React wrapper. Theme tokens MUST be
  derived from the Tailwind palette, not hard-coded hex values.
- **Validation**: Zod (or equivalent) at every API Route boundary.
- **Repository layout**: The Next.js application lives at `ai-charts/`.
  Spec Kit artifacts (`.specify/`, `specs/`, `.claude/`) live at the repo
  root. Do not nest one inside the other.
- **Secrets**: Never read from `process.env` in Client Components. AI-
  provider keys and database credentials are server-only.

## Development Workflow & Quality Gates

- **Branch & spec flow**: Use the Spec Kit slash commands (`/speckit-specify`,
  `/speckit-plan`, `/speckit-tasks`, `/speckit-implement`). Each feature
  lives on its own branch created by `speckit-git-feature`.
- **Constitution Check (in `plan.md`)**: Every plan MUST explicitly confirm
  that the proposed design satisfies Principles I–V, or fill the Complexity
  Tracking table with a justification.
- **Definition of done for any UI feature**:
  1. Renders with Tailwind + shadcn/ui only.
  2. Any data view uses ECharts.
  3. All data comes from an API Route with typed + validated I/O.
  4. `pnpm --dir ai-charts run build` succeeds (no type errors).
  5. The change is verified in the running dev server (manual smoke check)
     before the task is marked complete.
- **Reviews**: Pull requests MUST cite the principles affected; violations
  require either a fix or a constitutional amendment merged first.

## Governance

This constitution supersedes ad-hoc conventions, prior README guidance, and
any contradictory instructions in agent memory. Amendments follow this
process:

1. Propose the change as a PR that edits this file and bumps the version
   header per the rules below.
2. Update every dependent template flagged in the Sync Impact Report.
3. Require at least one human reviewer's approval; agents MAY draft but MAY
   NOT self-approve a constitutional change.

**Versioning policy** (semantic):

- **MAJOR**: A principle is removed, inverted, or its scope materially
  narrowed in a backward-incompatible way.
- **MINOR**: A new principle or normative section is added, or an existing
  principle is expanded with new mandates.
- **PATCH**: Wording, typo, or clarification changes that do not alter the
  set of MUST/SHOULD/MAY obligations.

**Compliance review**: At the start of every `/speckit-plan` and
`/speckit-analyze` run, the agent MUST re-read this file and surface any
drift between the plan/spec/tasks and the principles above.

**Version**: 1.0.0 | **Ratified**: 2026-05-24 | **Last Amended**: 2026-05-24
