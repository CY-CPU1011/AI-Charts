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
      return errorResponse("model_error", 502);
    }

    let modelOutput: unknown;
    try {
      modelOutput = JSON.parse(content);
    } catch {
      return errorResponse("model_error", 502);
    }

    if (NoDataSchema.safeParse(modelOutput).success) {
      return errorResponse("no_data", 400);
    }

    const chartResult = ChartSpecSchema.safeParse(modelOutput);
    if (!chartResult.success) {
      return errorResponse("model_error", 502);
    }

    const response: ChartSuccess = { ok: true, spec: chartResult.data };
    return Response.json(response);
  } catch (error) {
    if (error instanceof OpenAI.APIError && error.status === 429) {
      return errorResponse("rate_limited", 429);
    }

    return errorResponse("model_error", 502);
  }
}
