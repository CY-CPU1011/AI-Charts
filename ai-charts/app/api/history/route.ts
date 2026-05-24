import {
  type ChartHistoryError,
  type ChartHistoryListResponse,
} from "@/lib/contracts/chart";
import { listChartHistory } from "@/lib/supabase/chart-history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(status: number): Response {
  const response: ChartHistoryError = {
    ok: false,
    error: "history_unavailable",
  };

  return Response.json(response, { status });
}

export async function GET(): Promise<Response> {
  try {
    const response: ChartHistoryListResponse = {
      ok: true,
      items: await listChartHistory(),
    };

    return Response.json(response);
  } catch {
    return errorResponse(503);
  }
}
