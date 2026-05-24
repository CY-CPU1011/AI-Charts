# Feature Specification: Prompt-to-Chart Homepage

**Feature Branch**: `001-prompt-to-chart`

**Created**: 2026-05-24

**Status**: Draft

**Input**: User description: "我要创建一个叫做AI Charts的官网。该官网首页是一个居中输入框，用户可以输入任意和数据相关的提示词（例如：帮我比较一下今年一到六月，北京和上海的月度销售额：北京是 120、130、150、170、180、200；上海是 100、140、160、150、190、210）。然后发送给AI后，网站的布局就会发生变化。输入框在最底部，上方变成一个显示图表的区域。LLM能够自动的提取这段提示词中的数据和文本，选择一个最佳的图表进行渲染。如果用户指定了某个图表类型，那么就使用用户指定的该图表类型进行渲染。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First-time visitor turns a data prompt into a chart (Priority: P1)

A first-time visitor lands on the homepage and sees a single, prominent,
centered text input. They type a natural-language prompt that contains data
they want to visualize (numbers, labels, and an implied comparison or trend)
and submit it. Within a few seconds, the page reorganizes: the input drops
to the bottom of the screen, and the area above it now displays a chart
built from the data they described. They did not need to choose a chart
type, format the data, or learn any syntax — the system inferred everything
from plain language.

**Why this priority**: This is the entire product hypothesis. If this single
flow does not work, nothing else matters. It is the minimum slice that
delivers user value.

**Independent Test**: Open the site in an empty browser, paste the example
prompt about Beijing/Shanghai monthly sales, press Enter. Confirm a chart
appears that shows two series across six months matching the numbers in the
prompt, and the input has moved to the bottom of the viewport.

**Acceptance Scenarios**:

1. **Given** an empty homepage with a centered input, **When** the user
   submits a prompt that contains clearly labelled numeric series, **Then**
   the layout reflows (input to bottom, chart area above) and a chart
   visualizing those series appears.
2. **Given** the user submitted the Beijing/Shanghai example prompt, **When**
   the chart renders, **Then** it shows two series of six points each whose
   values match the numbers in the prompt, with the city names as series
   labels and the months as the category axis.
3. **Given** the user submits a prompt that contains data but no chart-type
   hint, **When** the response arrives, **Then** the system selects a chart
   type appropriate to the data shape (e.g., line or grouped bar for a
   multi-series time comparison) and renders it.

---

### User Story 2 - User dictates the chart type (Priority: P2)

A user includes an explicit chart-type instruction in their prompt (e.g.,
"用饼图展示…", "make a pie chart of…", "as a bar chart"). The system honors
that instruction and renders that specific chart type instead of auto-
selecting one.

**Why this priority**: Once auto-selection works, allowing the user to
override it is the most-requested next step and is essential for users who
have a presentation or stylistic intent.

**Independent Test**: Submit a prompt that names a chart type (e.g., "用饼
图显示北京一到六月销售额：120、130、150、170、180、200"). Confirm the
rendered chart is a pie chart with six slices matching those values.

**Acceptance Scenarios**:

1. **Given** a prompt that names a supported chart type, **When** the
   response renders, **Then** that exact chart type is used.
2. **Given** the named chart type is structurally awkward for the data
   shape (e.g., pie for a long time series), **When** the response renders,
   **Then** the system still attempts to render the user-requested type on a
   best-effort basis rather than silently overriding it.

---

### User Story 3 - Conversational refinement of the current chart (Priority: P2)

After the first chart appears, the input remains at the bottom of the
screen. The user can continue the conversation: each follow-up prompt is
interpreted in the context of the prior turns and modifies the currently
displayed chart (e.g., "改成饼图", "再加一条深圳：80,90,100,110,120,130",
"把柱子改成横向", "去掉北京"). The chart updates in place.

**Why this priority**: Conversational iteration is what turns the site from
a one-shot demo into a usable exploration tool. It also turns the bottom-
anchored input into a real chat affordance rather than a re-submit box.

**Independent Test**: After rendering the Beijing/Shanghai bar chart,
submit "改成折线图". Confirm the same data renders as a line chart in the
same chart area, without losing the data the user already provided.

**Acceptance Scenarios**:

1. **Given** a chart is on screen, **When** the user submits a follow-up
   that only references a chart-type change (e.g., "用饼图展示"), **Then**
   the current chart's data is preserved and re-rendered with the new
   type.
2. **Given** a chart is on screen, **When** the user submits a follow-up
   that adds, removes, or edits a data series (e.g., "再加一条深圳"），
   **Then** the chart updates in place to reflect the new dataset.
3. **Given** a chart is on screen, **When** the user submits a prompt
   that introduces a clearly unrelated new dataset, **Then** the chart
   area is replaced with a new chart built from the new data, and prior
   conversation context that no longer applies is dropped.
4. **Given** the user has had several conversational turns, **When** they
   reload the page, **Then** the session resets to the empty centered-
   input state (no persistence across reloads in v1).

---

### Edge Cases

- The prompt contains no parseable numeric data (e.g., "tell me about the
  weather"). System MUST surface a toast notification asking the user to
  provide valid data, and keep the current layout unchanged (no reflow on
  first turn; no chart change on follow-up turns).
- The prompt mixes multiple unrelated datasets. System SHOULD render one
  chart that captures the dominant comparison the user expressed.
- The prompt names a chart type that is not understood by the system. The
  system SHOULD fall back to auto-selection and surface a toast telling
  the user which type it used instead.
- The AI service is unavailable, returns an error, or returns a malformed
  response. System MUST keep the previous chart (if any) visible, restore
  the input contents, and surface a retryable error toast.
- The user submits an empty or whitespace-only prompt. System MUST reject
  the submission inline without contacting the AI.
- The user submits a prompt of any length. The system does NOT enforce a
  length limit; very long prompts are passed through to the AI.
- The user reloads the page mid-render. System MUST cancel the in-flight
  request cleanly and return to the empty centered-input state.
- The user submits prompts in rapid succession. System MUST queue or cancel
  prior requests so the chart reflects the most recent submission without
  races or stale-write flicker.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The homepage MUST initially display a single, centered prompt
  input as the dominant element, with no chart area visible.
- **FR-002**: The prompt input MUST accept multi-line natural-language text
  of any length, including numbers, lists, punctuation, and chart-type
  hints, in any human language the underlying AI model understands.
- **FR-003**: The system MUST reject empty or whitespace-only submissions
  inline, without dispatching an AI call.
- **FR-004**: On the first successful submission, the page layout MUST
  reflow so that the input is anchored to the bottom of the viewport and a
  chart display area occupies the space above it.
- **FR-005**: The system MUST send each submitted prompt — together with
  the conversational context of prior turns in the current session — to an
  AI model whose response provides a structured chart specification
  including chart type, title (optional), category/axis labels, series
  names, and numeric data points.
- **FR-006**: If the prompt explicitly names a chart type the system can
  render, the system MUST render that chart type.
- **FR-007**: If the prompt does not name a chart type, the system MUST
  select the chart type that best fits the data shape, choosing from a
  comprehensive vocabulary covering at least: categorical (bar, column,
  stacked, grouped), temporal (line, area), part-of-whole (pie, donut,
  sunburst, treemap), distribution (histogram, box, candlestick),
  relational (scatter, bubble, heatmap, parallel coordinates), hierarchical
  (tree, treemap, sankey), and geographic chart families.
- **FR-008**: The system MUST render the resulting chart inside the chart
  display area using the data and labels returned by the AI.
- **FR-009**: While a request is in flight, the system MUST show a visible
  loading state in the chart area and disable submission of further
  prompts.
- **FR-010**: On AI failure, malformed response, missing-data response, or
  unknown-chart-type response, the system MUST surface a toast notification
  to the user (e.g., "请输入有效数据" / "Please provide valid data" or a
  retry-prompt message), preserve the previously rendered chart (if any),
  restore the input contents, and allow the user to retry without
  retyping.
- **FR-011**: After the first chart is rendered, follow-up prompts in the
  same session MUST be interpreted in the context of prior turns and
  modify the current chart in place (changing chart type, adding/removing/
  editing series, relabeling, etc.). A follow-up prompt that introduces a
  clearly unrelated dataset MUST replace the current chart with a new one
  built from that dataset.
- **FR-012**: The system MUST render charts with a visual style consistent
  across types (shared color palette, typography, and spacing).
- **FR-013**: The system MUST be responsive: the layout, input, and chart
  area MUST remain usable across common mobile, tablet, and desktop
  viewport sizes.
- **FR-014**: The system MUST treat each browser tab as an ephemeral
  session: no prompts or charts persist across page reloads or across
  devices in v1.
- **FR-015**: The user interface (input placeholder, toasts, loading,
  error messages, and any chrome) MUST be available in multiple human
  languages, with the active language selectable by the user or inferred
  from the browser locale.

### Key Entities *(include if feature involves data)*

- **Prompt**: The free-form natural-language text a user submits. Carries
  data values, contextual labels, and optionally an explicit chart-type
  instruction.
- **Chart Specification**: The structured description returned by the AI
  for a given prompt. Identifies the chart type, an optional title, the
  category/axis labels, one or more named data series, and the numeric
  values for each series.
- **Chart**: The rendered visualization shown to the user, produced from a
  Chart Specification.
- **Session**: An ephemeral, in-memory conversation scoped to a single
  browser tab. Holds the ordered list of prior prompts (for context that
  the AI uses to interpret follow-up turns) and the current Chart
  Specification / Chart pair being displayed. Discarded on reload.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time visitor pasting the Beijing/Shanghai example
  prompt arrives at a correctly rendered two-series, six-point chart on
  their first attempt.
- **SC-002**: For prompts that contain clearly labelled numeric series,
  the rendered chart reflects the correct values and labels at least 95%
  of the time across a representative test set.
- **SC-003**: When the user names a chart type the system can render, the
  rendered chart uses that exact type 100% of the time.
- **SC-004**: The layout transition from "centered input" to "input
  anchored to bottom + chart above" happens in a single visible step with
  no flash of unstyled content and no intermediate broken layout.
- **SC-005**: Within a single browser session, conversational follow-up
  prompts (chart-type change, add/remove series, relabel) correctly
  modify the displayed chart in place at least 90% of the time across a
  representative test set.
- **SC-006**: 90% of first-time visitors who type any data-bearing prompt
  arrive at a correctly rendered chart on their first attempt, measured by
  task-completion test sessions.
- **SC-007**: When the user submits a prompt with no chartable data, a
  toast asking for valid data appears 100% of the time and the layout
  state is preserved (no spurious reflow, no broken empty chart).
- **SC-008**: The interface remains usable (input reachable, chart
  readable, no horizontal scroll, no cut-off text) across at least one
  representative mobile, tablet, and desktop viewport width.
- **SC-009**: The user interface is rendered in at least two human
  languages, with the active language switchable without losing the
  current session state.

## Assumptions

- Anonymous use only in v1; no sign-up, login, or per-user settings. No
  special data-privacy controls are required beyond not persisting any
  user data across reloads.
- Single browser-tab session; no cross-tab, cross-device, or persistent
  storage of prompts or charts in v1.
- Multi-turn behavior is conversational refinement of a single active
  chart: follow-up prompts modify the current chart in place using prior
  turns as context, and an obviously unrelated new dataset replaces it.
  There is no scrollable history of past charts in v1; reload resets.
- The AI returns a chart specification only; it does not return long
  conversational explanations. A short AI-generated chart title is
  acceptable.
- The supported chart vocabulary is broad and covers the common families
  (categorical, temporal, part-of-whole, distribution, relational,
  hierarchical, geographic). The concrete library and the exact mapping
  from AI-named types to renderable types is an implementation decision
  for the plan phase.
- When a user-named chart type is structurally awkward for the data shape,
  the system attempts a best-effort render of the requested type rather
  than silently overriding the user's choice.
- A single AI provider/model is sufficient for v1; provider failover is
  out of scope.
- The application is responsive across mobile, tablet, and desktop
  viewports from v1.
- No explicit performance targets in v1; the system should feel
  responsive on a typical broadband connection but no latency budget is
  enforced.
- The user interface ships with multi-language support; the initial
  language set and language switcher mechanism are implementation
  decisions for the plan phase (at minimum the locales the target
  audience uses, e.g., Chinese and English).
- The example prompt in the user input is representative of the target use
  case, not an exhaustive grammar; any reasonably structured data-bearing
  prompt should work.
