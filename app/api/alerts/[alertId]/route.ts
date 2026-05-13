import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildAlertDetail } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    alertId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const { alertId } = await context.params;
  const alert = await buildAlertDetail(alertId);

  if (!alert) {
    return NextResponse.json(
      errorEnvelope("NOT_FOUND", "Alert not found.", {
        alertId,
      }),
      { status: 404 },
    );
  }

  return NextResponse.json(successEnvelope(alert));
}
