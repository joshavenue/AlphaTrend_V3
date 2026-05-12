import { NextRequest, NextResponse } from "next/server";

import type { ProviderName } from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { hasInvalidPageCursor } from "@/lib/api/pagination";
import { buildEvidencePage } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;
  const cursor = params.get("cursor");

  if (hasInvalidPageCursor(cursor)) {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Invalid pagination cursor."),
      { status: 422 },
    );
  }

  try {
    const page = await buildEvidencePage({
      cursor,
      limit: Number(params.get("limit") ?? 50),
      metricName: params.get("metricName"),
      provider: params.get("provider") as ProviderName | null,
      reasonCode: params.get("reasonCode"),
      securityId: params.get("securityId") ?? params.get("ticker"),
      themeId: params.get("themeId"),
    });

    return NextResponse.json(
      successEnvelope(page.rows, {
        pagination: page.pagination,
      }),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load evidence."),
      { status: 500 },
    );
  }
}
