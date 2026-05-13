import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { dismissAlert } from "@/lib/app/read-models";
import { isSameOriginRequest } from "@/lib/auth/origin";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    alertId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      errorEnvelope("FORBIDDEN", "Cross-origin alert mutation rejected."),
      { status: 403 },
    );
  }

  const { alertId } = await context.params;
  const updated = await dismissAlert(alertId);

  if (!updated) {
    return NextResponse.json(
      errorEnvelope("NOT_FOUND", "Alert not found.", {
        alertId,
      }),
      { status: 404 },
    );
  }

  return NextResponse.json(
    successEnvelope({
      alert_id: alertId,
      status: "DISMISSED",
    }),
  );
}
