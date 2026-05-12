import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildDashboardThemesPage } from "@/lib/snapshots/dashboard";
import {
  parseDashboardState,
  parsePositiveInt,
  parseThemeStatus,
} from "@/lib/snapshots/query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const generatedAt = new Date().toISOString();
  const searchParams = request.nextUrl.searchParams;
  const dashboardStateParam = searchParams.get("dashboardState");
  const statusParam = searchParams.get("status");
  const limit = parsePositiveInt(searchParams.get("limit"));
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

  try {
    const page = await buildDashboardThemesPage(getPrismaClient(), {
      cursor: searchParams.get("cursor") ?? undefined,
      dashboardState,
      limit,
      status,
    });

    return NextResponse.json(
      successEnvelope(page.rows, {
        asOf: generatedAt,
        generatedAt,
        pagination: page.pagination,
      }),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load theme dashboard."),
      { status: 500 },
    );
  }
}
