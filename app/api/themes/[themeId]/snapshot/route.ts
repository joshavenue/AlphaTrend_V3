import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildThemeSnapshotView } from "@/lib/snapshots/dashboard";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    themeId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { themeId } = await context.params;
  const generatedAt = new Date().toISOString();
  const data = await buildThemeSnapshotView(getPrismaClient(), themeId);

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
