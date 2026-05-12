import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";
import { searchSecurities } from "@/lib/app/read-models";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 8);

  if (!q.trim()) {
    return NextResponse.json(successEnvelope([]));
  }

  try {
    return NextResponse.json(successEnvelope(await searchSecurities(q, limit)));
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to search securities."),
      { status: 500 },
    );
  }
}
