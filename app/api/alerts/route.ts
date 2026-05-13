import { NextRequest, NextResponse } from "next/server";

import type {
  AlertDeliveryStatus,
  AlertSeverity,
} from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { hasInvalidPageCursor } from "@/lib/api/pagination";
import { buildAlertsPage } from "@/lib/app/read-models";
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
    const page = await buildAlertsPage({
      alertType: params.get("alertType"),
      cursor,
      deliveryStatus: params.get(
        "deliveryStatus",
      ) as AlertDeliveryStatus | null,
      limit: Number(params.get("limit") ?? 50),
      readStatus: params.get("readStatus") as "read" | "unread" | null,
      securityId: params.get("securityId") ?? params.get("ticker"),
      severity: params.get("severity") as AlertSeverity | null,
      themeId: params.get("themeId"),
    });

    return NextResponse.json(
      successEnvelope(page.rows, {
        pagination: page.pagination,
      }),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load alerts."),
      { status: 500 },
    );
  }
}
