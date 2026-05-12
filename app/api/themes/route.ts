import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildDashboardThemes } from "@/lib/snapshots/dashboard";
import {
  parseDashboardState,
  parsePositiveInt,
  parseThemeStatus,
} from "@/lib/snapshots/query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const generatedAt = new Date().toISOString();
  const searchParams = request.nextUrl.searchParams;
  const dashboardStateParam = searchParams.get("dashboardState");
  const statusParam = searchParams.get("status");
  const dashboardState = parseDashboardState(dashboardStateParam);
  const status = parseThemeStatus(statusParam);

  if (dashboardStateParam && !dashboardState) {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Unsupported dashboardState filter.", {
        dashboardState: dashboardStateParam,
      }),
      { status: 422 },
    );
  }

  if (statusParam && !status) {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Unsupported status filter.", {
        status: statusParam,
      }),
      { status: 422 },
    );
  }

  const rows = await buildDashboardThemes(getPrismaClient(), {
    dashboardState,
    limit: parsePositiveInt(searchParams.get("limit")),
    status,
  });

  return NextResponse.json(
    successEnvelope(rows, {
      asOf: generatedAt,
      generatedAt,
    }),
  );
}
