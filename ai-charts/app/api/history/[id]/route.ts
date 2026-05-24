import { z } from "zod";

import {
  type ChartHistoryDeleteResponse,
  type ChartHistoryError,
} from "@/lib/contracts/chart";
import { deleteChartHistory } from "@/lib/supabase/chart-history";

export const runtime = "nodejs";

function errorResponse(
  error: ChartHistoryError["error"],
  status: number,
): Response {
  const response: ChartHistoryError = { ok: false, error };
  return Response.json(response, { status });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const idResult = z.string().uuid().safeParse((await params).id);
  if (!idResult.success) {
    return errorResponse("validation_error", 400);
  }

  try {
    const deleted = await deleteChartHistory(idResult.data);
    if (!deleted) {
      return errorResponse("not_found", 404);
    }

    const response: ChartHistoryDeleteResponse = {
      ok: true,
      id: idResult.data,
    };

    return Response.json(response);
  } catch {
    return errorResponse("history_unavailable", 503);
  }
}
