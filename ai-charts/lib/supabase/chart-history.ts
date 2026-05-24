import "server-only";

import { z } from "zod";

import {
  ChartHistoryItemSchema,
  ChartSpecSchema,
  type ChartHistoryItem,
  type ChartSpec,
} from "@/lib/contracts/chart";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const historyFields = "id, created_at, description, chart_config, chart_type";

const ChartHistoryRowSchema = z.object({
  id: z.string().uuid(),
  created_at: z.string().datetime({ offset: true }),
  description: z.string().trim().min(1),
  chart_config: z.unknown(),
  chart_type: ChartSpecSchema.shape.chartType,
});

function parseHistoryRow(value: unknown): ChartHistoryItem {
  const row = ChartHistoryRowSchema.parse(value);
  const storedSpec = ChartSpecSchema.safeParse(row.chart_config);
  const spec = storedSpec.success
    ? storedSpec.data
    : ChartSpecSchema.parse({
        chartType: row.chart_type,
        option: row.chart_config,
      });

  return ChartHistoryItemSchema.parse({
    id: row.id,
    createdAt: row.created_at,
    description: row.description,
    chartType: row.chart_type,
    spec,
  });
}

export async function createChartHistory(
  description: string,
  spec: ChartSpec,
): Promise<ChartHistoryItem> {
  const { data, error } = await getSupabaseAdminClient()
    .from("chart_history")
    .insert({
      description,
      chart_config: spec.option,
      chart_type: spec.chartType,
    })
    .select(historyFields)
    .single();

  if (error) {
    throw new Error("Unable to save chart history.", { cause: error });
  }

  return parseHistoryRow(data);
}

export async function listChartHistory(): Promise<ChartHistoryItem[]> {
  const { data, error } = await getSupabaseAdminClient()
    .from("chart_history")
    .select(historyFields)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Unable to load chart history.", { cause: error });
  }

  return data.map(parseHistoryRow);
}

export async function deleteChartHistory(id: string): Promise<boolean> {
  const { count, error } = await getSupabaseAdminClient()
    .from("chart_history")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    throw new Error("Unable to delete chart history.", { cause: error });
  }

  return (count ?? 0) > 0;
}
