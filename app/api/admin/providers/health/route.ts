import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildProviderHealth } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, true);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  try {
    return NextResponse.json(successEnvelope(await buildProviderHealth()));
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load provider health."),
      { status: 500 },
    );
  }
}
