import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildTickerReport } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    ticker: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const { ticker } = await context.params;

  try {
    const data = await buildTickerReport({
      themeRef:
        request.nextUrl.searchParams.get("themeId") ??
        request.nextUrl.searchParams.get("themeSlug"),
      ticker,
    });

    if (!data) {
      return NextResponse.json(
        errorEnvelope("NOT_FOUND", "Ticker not found.", { ticker }),
        { status: 404 },
      );
    }

    return NextResponse.json(successEnvelope(data));
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load ticker report."),
      { status: 500 },
    );
  }
}
