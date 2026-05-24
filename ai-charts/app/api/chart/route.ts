import OpenAI from "openai";
import { z } from "zod";

import {
  ChartRequestSchema,
  ChartSpecSchema,
  type ChartError,
  type ChartSuccess,
} from "@/lib/contracts/chart";
import { getOpenAIClient } from "@/lib/deepseek/client";
import { buildSystemPrompt } from "@/lib/deepseek/system-prompt";
import { createChartHistory } from "@/lib/supabase/chart-history";

export const runtime = "nodejs";

const NoDataSchema = z.object({ error: z.literal("no_data") }).strict();

function errorResponse(
  error: ChartError["error"],
  status: number,
): Response {
  const response: ChartError = { ok: false, error };
  return Response.json(response, { status });
}

export async function POST(request: Request): Promise<Response> {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return errorResponse("validation_error", 400);
  }

  const requestResult = ChartRequestSchema.safeParse(requestBody);
  if (!requestResult.success) {
    return errorResponse("validation_error", 400);
  }

  const { locale, turns } = requestResult.data;

  try {
    const completion = await getOpenAIClient().chat.completions.create({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat",
      messages: [
        { role: "system", content: buildSystemPrompt(locale) },
        ...turns,
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message.content;
    if (!content) {
      console.error("[api/chart] DeepSeek returned empty content.");
      return errorResponse("model_error", 502);
    }

    let modelOutput: unknown;
    try {
      modelOutput = JSON.parse(content);
    } catch {
      console.error("[api/chart] DeepSeek returned invalid JSON.");
      return errorResponse("model_error", 502);
    }

    if (NoDataSchema.safeParse(modelOutput).success) {
      return errorResponse("no_data", 400);
    }

    const chartResult = ChartSpecSchema.safeParse(modelOutput);
    if (!chartResult.success) {
      console.error("[api/chart] DeepSeek response failed chart validation.", {
        issues: chartResult.error.issues.map(({ code, path }) => ({
          code,
          path: path.join("."),
        })),
      });
      return errorResponse("model_error", 502);
    }

    let history: ChartSuccess["history"];
    let historyWarning: ChartSuccess["historyWarning"];

    try {
      history = await createChartHistory(
        turns.at(-1)?.content ?? "",
        chartResult.data,
      );
    } catch (error) {
      console.error("[api/chart] Supabase history save failed.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      historyWarning = "save_failed";
    }

    const response: ChartSuccess = {
      ok: true,
      spec: chartResult.data,
      ...(history ? { history } : {}),
      ...(historyWarning ? { historyWarning } : {}),
    };
    return Response.json(response);
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.error("[api/chart] DeepSeek API request failed.", {
        code: error.code,
        status: error.status,
        type: error.name,
      });

      if (error.status === 429) {
        return errorResponse("rate_limited", 429);
      }
    } else {
      console.error("[api/chart] Unexpected request failure.", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }

    return errorResponse("model_error", 502);
  }
}
