import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildThemeCandidatesView } from "@/lib/snapshots/dashboard";
import { parseFinalState, parsePositiveInt } from "@/lib/snapshots/query";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    themeId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { themeId } = await context.params;
  const generatedAt = new Date().toISOString();
  const searchParams = request.nextUrl.searchParams;
  const finalStateParam = searchParams.get("finalState");
  const finalState = parseFinalState(finalStateParam);

  if (finalStateParam && !finalState) {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Unsupported finalState filter.", {
        finalState: finalStateParam,
      }),
      { status: 422 },
    );
  }

  const data = await buildThemeCandidatesView(getPrismaClient(), themeId, {
    displayGroup: searchParams.get("displayGroup") ?? undefined,
    finalState,
    limit: parsePositiveInt(searchParams.get("limit")),
  });

  if (!data) {
    return NextResponse.json(
      errorEnvelope("NOT_FOUND", "Theme not found.", {
        themeId,
      }),
      { status: 404 },
    );
  }

  return NextResponse.json(
    successEnvelope(data, {
      asOf: generatedAt,
      generatedAt,
    }),
  );
}
