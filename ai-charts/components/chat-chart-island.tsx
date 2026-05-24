"use client";

import EChartsReact from "echarts-for-react";
import { Download, History, RefreshCw, SendHorizontal, Trash2 } from "lucide-react";
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
const chartFrameClassName =
  "flex aspect-[5/6] w-full max-w-4xl flex-col rounded-2xl border bg-card p-3 shadow-sm sm:aspect-video sm:p-4";

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

function formatHistoryTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function persist(nextState: SessionState): SessionState {
  retainedSession = nextState;
  return nextState;
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
  const historyAbortRef = useRef<AbortController | null>(null);
  const chartRef = useRef<EChartsReact | null>(null);
  const requestIdRef = useRef(0);
  const currentLocale = useLocale();
  const locale = hasLocale(locales, currentLocale)
    ? currentLocale
    : defaultLocale;
  const t = useTranslations();
  const chartOption = useMemo(
    () => (state.current ? normalizeChartOption(state.current.option) : null),
    [state.current],
  );

  const loadHistory = useCallback(async () => {
    historyAbortRef.current?.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    setHistoryStatus("loading");

    try {
      const response = await fetch("/api/history", {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload: unknown = await response.json();
      const result = ChartHistoryListResponseSchema.safeParse(payload);

      if (!response.ok || !result.success) {
        throw new Error("Unable to load chart history.");
      }

      setHistory(result.data.items);
      setHistoryStatus("idle");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setHistoryStatus("error");
    } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    registerAIChartsTheme();
    void loadHistory();

    return () => {
      abortRef.current?.abort();
      historyAbortRef.current?.abort();
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

    abortRef.current?.abort();
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
      if (error instanceof DOMException && error.name === "AbortError") {
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
    <aside className="flex max-h-[20rem] shrink-0 flex-col border-b bg-sidebar px-3 pb-3 pt-20 md:max-h-dvh md:min-h-dvh md:w-80 md:border-b-0 md:border-r md:pt-20">
      <div className="mb-3 flex items-center justify-between px-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4" />
          {t("history.title")}
        </h2>
        <Button
          aria-label={t("history.refresh")}
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
        className="min-h-0 flex-1 overflow-y-auto px-1"
      >
        {historyStatus === "loading" ? (
          <div className="space-y-2 px-1">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : historyStatus === "error" ? (
          <div className="rounded-xl border bg-background p-3 text-sm text-muted-foreground">
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
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t("history.empty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map((item) => (
              <li className="group flex gap-1" key={item.id}>
                <button
                  aria-current={selectedHistoryId === item.id ? "true" : undefined}
                  className={cn(
                    "min-w-0 flex-1 rounded-xl border p-3 text-left transition-colors hover:bg-sidebar-accent",
                    selectedHistoryId === item.id &&
                      "border-foreground/20 bg-sidebar-accent",
                  )}
                  onClick={() => loadHistoryChart(item)}
                  type="button"
                >
                  <span className="line-clamp-2 block text-sm font-medium">
                    {item.description}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {formatHistoryTime(item.createdAt, locale)} · {item.chartType}
                  </span>
                </button>
                <Button
                  aria-label={t("history.delete")}
                  className="mt-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                  disabled={deletingHistoryId === item.id}
                  onClick={() => void deleteHistoryItem(item)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </nav>
    </aside>
  );
  const composer = (
    <form className="relative" onSubmit={handleSubmit}>
      <Textarea
        aria-label={state.current ? t("placeholder.followup") : t("placeholder.empty")}
        className="min-h-28 w-full resize-none bg-background pb-16 pr-4 shadow-sm"
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
        className="absolute bottom-3 right-3 h-11 px-4"
        disabled={!state.draft.trim() || state.status === "loading"}
        type="submit"
      >
        <SendHorizontal />
        <span className="hidden sm:inline">{t("button.submit")}</span>
      </Button>
    </form>
  );

  if (!hasChartArea) {
    return (
      <section className="flex min-h-dvh flex-col md:flex-row">
        {historySidebar}
        <div className="flex min-h-[50dvh] flex-1 items-center justify-center px-4 py-12 md:py-20">
          <div className="w-full max-w-3xl">{composer}</div>
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
              className="relative aspect-[5/6] w-full max-w-4xl sm:aspect-video"
            >
              <Skeleton className="h-full w-full rounded-2xl" />
              <span className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {t("loading.label")}
              </span>
            </div>
          ) : state.current && chartOption ? (
            <div className={chartFrameClassName}>
              <div className="flex justify-end pb-2">
                <Button
                  aria-label={t("button.download")}
                  className="h-11 gap-2"
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
                  option={chartOption}
                  ref={chartRef}
                  style={chartStyle}
                  theme="ai-charts"
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
          <div className="mx-auto w-full max-w-4xl">{composer}</div>
        </div>
      </div>
    </section>
  );
}
