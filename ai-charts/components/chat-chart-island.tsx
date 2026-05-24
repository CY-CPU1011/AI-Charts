"use client";

import EChartsReact from "echarts-for-react";
import { Download, SendHorizontal } from "lucide-react";
import { hasLocale, useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ChartErrorSchema,
  ChartSuccessSchema,
  type ChartError,
  type ChartRequest,
  type ChartSpec,
  type Turn,
} from "@/lib/contracts/chart";
import { normalizeChartOption } from "@/lib/echarts/presentation";
import { registerAIChartsTheme } from "@/lib/echarts/theme";
import { defaultLocale, locales } from "@/lib/i18n/config";

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
  const abortRef = useRef<AbortController | null>(null);
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

  useEffect(() => {
    registerAIChartsTheme();

    return () => {
      abortRef.current?.abort();
      requestIdRef.current += 1;
      if (retainedSession.status === "loading") {
        retainedSession = restorePendingPrompt(retainedSession);
      }
    };
  }, []);

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
      <section className="flex min-h-dvh items-center justify-center px-4 py-20">
        <div className="w-full max-w-3xl">{composer}</div>
      </section>
    );
  }

  return (
    <section className="flex min-h-dvh flex-col">
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 pt-20 sm:px-8 sm:pb-6 sm:pt-24">
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
    </section>
  );
}
