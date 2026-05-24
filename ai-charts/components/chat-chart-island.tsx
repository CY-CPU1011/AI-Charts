"use client";

import EChartsReact from "echarts-for-react";
import {
  BarChart3,
  Download,
  History,
  LayoutGrid,
  LineChart,
  PieChart,
  Radar,
  RefreshCw,
  ScatterChart,
  SendHorizontal,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { hasLocale, useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartErrorSchema,
  ChartHistoryDeleteResponseSchema,
  ChartHistoryListResponseSchema,
  ChartSuccessSchema,
  type ChartError,
  type ChartHistoryItem,
  type ChartRequest,
  type ChartSpec,
  type Turn,
} from "@/lib/contracts/chart";
import { normalizeChartOption } from "@/lib/echarts/presentation";
import { registerAIChartsTheme } from "@/lib/echarts/theme";
import { defaultLocale, locales } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type SessionState = {
  status: "idle" | "loading" | "error";
  turns: Turn[];
  current: ChartSpec | null;
  draft: string;
  pendingPrompt?: string;
};

type SessionAction =
  | { type: "UPDATE_DRAFT"; value: string }
  | { type: "SUBMIT_PROMPT"; prompt: string }
  | { type: "RECEIVE_CHART"; spec: ChartSpec }
  | { type: "LOAD_HISTORY_CHART"; item: ChartHistoryItem }
  | { type: "RECEIVE_ERROR"; code: ChartError["error"] }
  | { type: "CANCEL_INFLIGHT" }
  | { type: "RESET" };

const emptySession: SessionState = {
  status: "idle",
  turns: [],
  current: null,
  draft: "",
};

let retainedSession: SessionState = emptySession;
const chartStyle = { height: "100%", width: "100%" };
const chartFrameOuterClassName =
  "relative flex aspect-[5/6] w-full max-w-4xl animate-fade-in-up flex-col rounded-2xl border border-[#e5e5e5] bg-white p-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] sm:aspect-video sm:p-4";
const chartFrameInnerClassName =
  "flex h-full w-full flex-col";

function buildDownloadFilename(title: string | undefined): string {
  const normalizedTitle = title
    ?.trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  return `${normalizedTitle || "ai-chart"}.png`;
}

function appendPrompt(turns: Turn[], prompt: string): Turn[] {
  const history = turns.length >= 50 ? turns.slice(2) : turns;
  return [...history, { role: "user", content: prompt }];
}

function getChartIcon(chartType: string): LucideIcon {
  const t = chartType.toLowerCase();
  if (t.includes("bar") || t.includes("histogram") || t.includes("pictorial")) {
    return BarChart3;
  }
  if (t.includes("line") || t.includes("area")) return LineChart;
  if (t.includes("pie") || t.includes("doughnut") || t.includes("donut")) {
    return PieChart;
  }
  if (t.includes("radar") || t.includes("spider")) return Radar;
  if (t.includes("scatter") || t.includes("bubble")) return ScatterChart;
  if (
    t.includes("heatmap") ||
    t.includes("treemap") ||
    t.includes("sunburst") ||
    t.includes("map")
  ) {
    return LayoutGrid;
  }
  return BarChart3;
}

function truncateDescription(text: string, max = 15): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type HistoryGroup = {
  key: string;
  label: string;
  items: ChartHistoryItem[];
};

function groupHistoryByDay(
  items: ChartHistoryItem[],
  locale: string,
  todayLabel: string,
  yesterdayLabel: string,
): HistoryGroup[] {
  if (items.length === 0) return [];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const groups: HistoryGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex !== undefined) {
      groups[existingIndex].items.push(item);
      continue;
    }

    let label: string;
    if (isSameDay(d, today)) label = todayLabel;
    else if (isSameDay(d, yesterday)) label = yesterdayLabel;
    else label = dateFmt.format(d);

    indexByKey.set(key, groups.length);
    groups.push({ key, label, items: [item] });
  }

  return groups;
}

function persist(nextState: SessionState): SessionState {
  retainedSession = nextState;
  return nextState;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function restorePendingPrompt(state: SessionState): SessionState {
  return {
    ...state,
    status: "error",
    turns:
      state.turns.at(-1)?.role === "user"
        ? state.turns.slice(0, -1)
        : state.turns,
    draft: state.pendingPrompt ?? state.draft,
    pendingPrompt: undefined,
  };
}

function sessionReducer(
  state: SessionState,
  action: SessionAction,
): SessionState {
  switch (action.type) {
    case "UPDATE_DRAFT":
      return persist({ ...state, draft: action.value });
    case "SUBMIT_PROMPT":
      return persist({
        ...state,
        status: "loading",
        turns: appendPrompt(state.turns, action.prompt),
        draft: "",
        pendingPrompt: action.prompt,
      });
    case "RECEIVE_CHART":
      return persist({
        ...state,
        status: "idle",
        turns: [
          ...state.turns,
          { role: "assistant", content: JSON.stringify(action.spec) },
        ],
        current: action.spec,
        pendingPrompt: undefined,
      });
    case "LOAD_HISTORY_CHART":
      return persist({
        ...state,
        status: "idle",
        turns: [
          { role: "user", content: action.item.description },
          { role: "assistant", content: JSON.stringify(action.item.spec) },
        ],
        current: action.item.spec,
        draft: "",
        pendingPrompt: undefined,
      });
    case "RECEIVE_ERROR":
      return persist(restorePendingPrompt(state));
    case "CANCEL_INFLIGHT":
      return persist(restorePendingPrompt(state));
    case "RESET":
      return persist(emptySession);
  }
}

export default function ChatChartIsland() {
  const [state, dispatch] = useReducer(sessionReducer, retainedSession);
  const [history, setHistory] = useState<ChartHistoryItem[]>([]);
  const [historyStatus, setHistoryStatus] = useState<
    "loading" | "idle" | "error"
  >("loading");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const chartRef = useRef<EChartsReact | null>(null);
  const requestIdRef = useRef(0);
  const historyRequestIdRef = useRef(0);
  const currentLocale = useLocale();
  const locale = hasLocale(locales, currentLocale)
    ? currentLocale
    : defaultLocale;
  const t = useTranslations();
  const chartOption = useMemo(
    () => (state.current ? normalizeChartOption(state.current.option) : null),
    [state.current],
  );
  const todayLabel = t("history.today");
  const yesterdayLabel = t("history.yesterday");
  const historyGroups = useMemo(
    () => groupHistoryByDay(history, locale, todayLabel, yesterdayLabel),
    [history, locale, todayLabel, yesterdayLabel],
  );

  const loadHistory = useCallback(async () => {
    const requestId = ++historyRequestIdRef.current;
    setHistoryStatus("loading");

    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (requestId !== historyRequestIdRef.current) return;

      const payload: unknown = await response.json();
      if (requestId !== historyRequestIdRef.current) return;

      const result = ChartHistoryListResponseSchema.safeParse(payload);

      if (!response.ok || !result.success) {
        throw new Error("Unable to load chart history.");
      }

      setHistory(result.data.items);
      setHistoryStatus("idle");
    } catch {
      if (requestId !== historyRequestIdRef.current) return;
      setHistoryStatus("error");
    }
  }, []);

  useEffect(() => {
    registerAIChartsTheme();
    void loadHistory();

    return () => {
      requestIdRef.current += 1;
      if (retainedSession.status === "loading") {
        retainedSession = restorePendingPrompt(retainedSession);
      }
    };
  }, [loadHistory]);

  async function submitPrompt(prompt: string) {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || state.status === "loading") {
      return;
    }

    abortRef.current?.abort(
      new DOMException("Replaced by newer request", "AbortError"),
    );
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const turns = appendPrompt(state.turns, trimmedPrompt);
    const body: ChartRequest = { turns, locale };

    dispatch({ type: "SUBMIT_PROMPT", prompt: trimmedPrompt });

    try {
      const response = await fetch("/api/chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload: unknown = await response.json();

      if (requestId !== requestIdRef.current) {
        return;
      }

      const successResult = ChartSuccessSchema.safeParse(payload);
      if (successResult.success) {
        dispatch({ type: "RECEIVE_CHART", spec: successResult.data.spec });
        if (successResult.data.history) {
          const storedHistory = successResult.data.history;
          setHistory((items) => [
            storedHistory,
            ...items.filter((item) => item.id !== storedHistory.id),
          ]);
          setHistoryStatus("idle");
          setSelectedHistoryId(storedHistory.id);
        } else if (successResult.data.historyWarning) {
          setSelectedHistoryId(null);
          toast.error(t("history.saveError"));
        }

        if (successResult.data.spec.notice) {
          toast.info(successResult.data.spec.notice);
        }
        return;
      }

      const errorResult = ChartErrorSchema.safeParse(payload);
      const errorCode = errorResult.success
        ? errorResult.data.error
        : "model_error";
      dispatch({ type: "RECEIVE_ERROR", code: errorCode });
      toast.error(t(`error.${errorCode}`));
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        return;
      }

      dispatch({ type: "RECEIVE_ERROR", code: "model_error" });
      toast.error(t("error.model_error"));
    } finally {
      if (requestId === requestIdRef.current) {
        abortRef.current = null;
      }
    }
  }

  function loadHistoryChart(item: ChartHistoryItem) {
    dispatch({ type: "LOAD_HISTORY_CHART", item });
    setSelectedHistoryId(item.id);
  }

  async function deleteHistoryItem(item: ChartHistoryItem) {
    if (!window.confirm(t("history.deleteConfirm"))) {
      return;
    }

    setDeletingHistoryId(item.id);

    try {
      const response = await fetch(`/api/history/${item.id}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json();
      const result = ChartHistoryDeleteResponseSchema.safeParse(payload);

      if (!response.ok || !result.success) {
        throw new Error("Unable to delete chart history.");
      }

      setHistory((items) => items.filter(({ id }) => id !== item.id));
      if (selectedHistoryId === item.id) {
        setSelectedHistoryId(null);
      }
      toast.success(t("history.deleteSuccess"));
    } catch {
      toast.error(t("history.deleteError"));
    } finally {
      setDeletingHistoryId(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitPrompt(state.draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submitPrompt(state.draft);
    }
  }

  function downloadChart() {
    const chart = chartRef.current?.getEchartsInstance();
    if (!chart || !state.current) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = chart.getDataURL({
      type: "png",
      pixelRatio: 2,
      backgroundColor: "#ffffff",
    });
    anchor.download = buildDownloadFilename(state.current.title);
    anchor.click();
  }

  const hasChartArea = state.current !== null || state.status === "loading";
  const historySidebar = (
    <aside className="flex max-h-[20rem] shrink-0 animate-fade-in-up flex-col border-b border-[#e5e5e5] bg-[#f5f5f5] px-3 pb-3 pt-20 md:max-h-dvh md:min-h-dvh md:w-80 md:border-b-0 md:border-r md:border-[#e5e5e5] md:pt-20">
      <div className="mb-3 flex items-center justify-between px-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-md bg-[#f0f0f0] text-[#1a1a1a]"
          >
            <History className="size-3.5" />
          </span>
          <span>{t("history.title")}</span>
        </h2>
        <Button
          aria-label={t("history.refresh")}
          className="text-[#737373] hover:bg-[#e5e5e5] hover:text-[#1a1a1a]"
          disabled={historyStatus === "loading"}
          onClick={() => void loadHistory()}
          size="icon"
          type="button"
          variant="ghost"
        >
          <RefreshCw
            className={cn("size-4", historyStatus === "loading" && "animate-spin")}
          />
        </Button>
      </div>
      <nav
        aria-label={t("history.title")}
        className="relative min-h-0 flex-1 overflow-y-auto pr-1"
      >
        {historyStatus === "loading" ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-9 w-full rounded-lg bg-[#e5e5e5]" />
            <Skeleton className="h-9 w-full rounded-lg bg-[#e5e5e5]" />
            <Skeleton className="h-9 w-full rounded-lg bg-[#e5e5e5]" />
          </div>
        ) : historyStatus === "error" ? (
          <div className="rounded-xl border border-[#e5e5e5] bg-white p-3 text-sm text-[#737373]">
            <p>{t("history.loadError")}</p>
            <Button
              className="mt-3"
              onClick={() => void loadHistory()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("history.retry")}
            </Button>
          </div>
        ) : history.length === 0 ? (
          <p className="px-2 py-3 text-sm text-[#737373]">
            {t("history.empty")}
          </p>
        ) : (
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-1 left-[12px] top-2 w-px bg-[#e5e5e5]"
            />
            <div className="space-y-5">
              {historyGroups.map((group) => (
                <section className="space-y-2" key={group.key}>
                  <h3 className="relative flex items-center pl-8 text-[11px] font-semibold uppercase tracking-wider text-[#737373]">
                    <span
                      aria-hidden="true"
                      className="absolute left-[6px] top-1/2 size-3 -translate-y-1/2 rounded-full bg-[#1a1a1a] shadow-[0_0_0_3px_#f5f5f5]"
                    />
                    {group.label}
                  </h3>
                  <ul className="space-y-1.5 pl-8">
                    {group.items.map((item) => {
                      const Icon = getChartIcon(item.chartType);
                      return (
                        <li className="group flex items-center gap-1" key={item.id}>
                          <button
                            aria-current={
                              selectedHistoryId === item.id ? "true" : undefined
                            }
                            className={cn(
                              "group/item relative flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:border-[#d4d4d4] hover:bg-[#fafafa]",
                              selectedHistoryId === item.id &&
                                "border-[#1a1a1a] bg-[#fafafa]",
                            )}
                            onClick={() => loadHistoryChart(item)}
                            title={item.description}
                            type="button"
                          >
                            <span
                              aria-hidden="true"
                              className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#f0f0f0] text-[#1a1a1a]"
                            >
                              <Icon className="size-3.5" />
                            </span>
                            <span className="truncate text-sm text-[#737373]">
                              {truncateDescription(item.description)}
                            </span>
                          </button>
                          <Button
                            aria-label={t("history.delete")}
                            className="opacity-100 hover:bg-destructive/10 hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            disabled={deletingHistoryId === item.id}
                            onClick={() => void deleteHistoryItem(item)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
  const composer = (
    <div className="group/composer relative animate-fade-in-up rounded-2xl border border-[#e5e5e5] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-colors duration-200 focus-within:border-[#1a1a1a]">
      <form className="relative rounded-2xl" onSubmit={handleSubmit}>
        <Textarea
          aria-label={state.current ? t("placeholder.followup") : t("placeholder.empty")}
          className="min-h-28 w-full resize-none border-0 bg-transparent pb-16 pr-4 text-[#1a1a1a] shadow-none placeholder:text-[#737373] focus-visible:border-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={state.status === "loading"}
          onChange={(event) =>
            dispatch({ type: "UPDATE_DRAFT", value: event.target.value })
          }
          onKeyDown={handleKeyDown}
          placeholder={
            state.current ? t("placeholder.followup") : t("placeholder.empty")
          }
          value={state.draft}
        />
        <Button
          aria-label={t("button.submit")}
          className="absolute bottom-3 right-3 h-11 gap-2 border-0 bg-[#1a1a1a] px-4 text-white shadow-sm transition-colors duration-200 hover:bg-[#333333]"
          disabled={!state.draft.trim() || state.status === "loading"}
          type="submit"
        >
          <SendHorizontal />
          <span className="hidden sm:inline">{t("button.submit")}</span>
        </Button>
      </form>
    </div>
  );

  if (!hasChartArea) {
    return (
      <section className="flex min-h-dvh flex-col md:flex-row">
        {historySidebar}
        <div className="flex min-h-[50dvh] flex-1 items-center justify-center px-4 py-12 md:py-20">
          <div className="w-full max-w-3xl space-y-8">
            <div className="animate-fade-in-up space-y-3 text-center">
              <h2 className="text-balance text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-5xl">
                {t("hero.title")}
              </h2>
              <p className="text-balance text-sm text-[#737373] sm:text-base">
                {t("hero.subtitle")}
              </p>
            </div>
            {composer}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-dvh flex-col md:flex-row">
      {historySidebar}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 pt-8 sm:px-8 sm:pb-6 md:pt-24">
          {state.status === "loading" ? (
            <div
              aria-label={t("loading.label")}
              aria-live="polite"
              className="relative aspect-[5/6] w-full max-w-4xl animate-fade-in-up sm:aspect-video"
            >
              <div className="h-full w-full rounded-2xl border border-[#e5e5e5] bg-white p-px shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <Skeleton className="h-full w-full rounded-2xl bg-[#f0f0f0]" />
              </div>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-[#1a1a1a]">
                {t("loading.label")}
              </span>
            </div>
          ) : state.current && chartOption ? (
            <div className={chartFrameOuterClassName}>
              <div className={chartFrameInnerClassName}>
                <div className="flex justify-end pb-2">
                  <Button
                    aria-label={t("button.download")}
                    className="h-11 gap-2 border-[#e5e5e5] bg-white text-[#1a1a1a] transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa]"
                    onClick={downloadChart}
                    type="button"
                    variant="outline"
                  >
                    <Download />
                    <span>{t("button.download")}</span>
                  </Button>
                </div>
                <div className="min-h-0 flex-1">
                  <EChartsReact
                    notMerge
                    option={chartOption}
                    ref={chartRef}
                    style={chartStyle}
                    theme="ai-charts"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="sticky bottom-0 border-t border-[#e5e5e5] bg-white px-4 py-3 sm:px-8 sm:py-4">
          <div className="mx-auto w-full max-w-4xl">{composer}</div>
        </div>
      </div>
    </section>
  );
}
