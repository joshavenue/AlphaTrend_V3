import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildThemeSnapshotView } from "@/lib/snapshots/dashboard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    themeId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const { themeId } = await context.params;
  const generatedAt = new Date().toISOString();
  let data: Awaited<ReturnType<typeof buildThemeSnapshotView>>;

  try {
    data = await buildThemeSnapshotView(getPrismaClient(), themeId);
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load theme snapshot."),
      { status: 500 },
    );
  }

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
