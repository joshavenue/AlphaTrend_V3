import { NextRequest, NextResponse } from "next/server";

import type { ProviderName } from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildEvidencePage } from "@/lib/app/read-models";
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
        await buildEvidencePage({
          limit: Number(params.get("limit") ?? 50),
          metricName: params.get("metricName"),
          provider: params.get("provider") as ProviderName | null,
          reasonCode: params.get("reasonCode"),
          securityId: params.get("securityId") ?? params.get("ticker"),
          themeId: params.get("themeId"),
        }),
      ),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load evidence."),
      { status: 500 },
    );
  }
}
