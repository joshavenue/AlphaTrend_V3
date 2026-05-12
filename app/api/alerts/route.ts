import { NextRequest, NextResponse } from "next/server";

import type {
  AlertDeliveryStatus,
  AlertSeverity,
} from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildAlertsPage } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;

  try {
    return NextResponse.json(
      successEnvelope(
        await buildAlertsPage({
          deliveryStatus: params.get(
            "deliveryStatus",
          ) as AlertDeliveryStatus | null,
          limit: Number(params.get("limit") ?? 50),
          readStatus: params.get("readStatus") as "read" | "unread" | null,
          severity: params.get("severity") as AlertSeverity | null,
          themeId: params.get("themeId"),
        }),
      ),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load alerts."),
      { status: 500 },
    );
  }
}
