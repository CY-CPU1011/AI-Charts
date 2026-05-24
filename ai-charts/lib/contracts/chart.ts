import { z } from "zod";

export const TurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1),
});

export const ChartRequestSchema = z.object({
  turns: z.array(TurnSchema).min(1).max(50),
  locale: z.enum(["zh", "en"]).default("zh"),
}).refine(({ turns }) => turns.at(-1)?.role === "user", {
  message: "The final turn must be a user prompt.",
  path: ["turns"],
});

function containsExecutableFormatter(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsExecutableFormatter);
  }

  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    if (
      key === "formatter" &&
      typeof nestedValue === "string" &&
      /^\s*(function\b|\(?[\w\s,]*\)?\s*=>)/.test(nestedValue)
    ) {
      return true;
    }

    return containsExecutableFormatter(nestedValue);
  });
}

export const ChartSpecSchema = z.object({
  chartType: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_-]+$/i),
  title: z.string().max(200).optional(),
  option: z
    .record(z.string(), z.unknown())
    .refine(
      (option) =>
        "series" in option || "dataset" in option || "visualMap" in option,
      "ECharts option must include series, dataset, or visualMap",
    )
    .refine(
      (option) => !containsExecutableFormatter(option),
      "ECharts formatter functions are not allowed",
    ),
  notice: z.string().max(200).optional(),
});

export const ChartHistoryItemSchema = z
  .object({
    id: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    description: z.string().trim().min(1),
    chartType: ChartSpecSchema.shape.chartType,
    spec: ChartSpecSchema,
  })
  .refine(({ chartType, spec }) => chartType === spec.chartType, {
    message: "Stored chart type must match its chart specification.",
    path: ["chartType"],
  });

export const ChartSuccessSchema = z.object({
  ok: z.literal(true),
  spec: ChartSpecSchema,
  history: ChartHistoryItemSchema.optional(),
  historyWarning: z.literal("save_failed").optional(),
});

export const ChartErrorSchema = z.object({
  ok: z.literal(false),
  error: z.enum([
    "no_data",
    "validation_error",
    "model_error",
    "rate_limited",
  ]),
  message: z.string().max(500).optional(),
});

export const ChartHistoryListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(ChartHistoryItemSchema),
});

export const ChartHistoryDeleteResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
});

export const ChartHistoryErrorSchema = z.object({
  ok: z.literal(false),
  error: z.enum(["history_unavailable", "validation_error", "not_found"]),
});

export type Turn = z.infer<typeof TurnSchema>;
export type ChartRequest = z.infer<typeof ChartRequestSchema>;
export type ChartSpec = z.infer<typeof ChartSpecSchema>;
export type ChartSuccess = z.infer<typeof ChartSuccessSchema>;
export type ChartError = z.infer<typeof ChartErrorSchema>;
export type ChartHistoryItem = z.infer<typeof ChartHistoryItemSchema>;
export type ChartHistoryListResponse = z.infer<typeof ChartHistoryListResponseSchema>;
export type ChartHistoryDeleteResponse = z.infer<
  typeof ChartHistoryDeleteResponseSchema
>;
export type ChartHistoryError = z.infer<typeof ChartHistoryErrorSchema>;
