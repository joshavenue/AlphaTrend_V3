import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope } from "@/lib/api/envelope";
import { isSameOriginRequest } from "@/lib/auth/origin";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    watchlistItemId: string;
  }>;
};

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      errorEnvelope("FORBIDDEN", "Cross-origin watchlist mutation rejected."),
      { status: 403 },
    );
  }

  const { watchlistItemId } = await context.params;
  const result = await getPrismaClient().watchlistItem.updateMany({
    data: {
      archivedAt: new Date(),
      status: "ARCHIVED",
    },
    where: {
      status: "ACTIVE",
      userId: auth.user.id,
      watchlistItemId,
    },
  });

  if (result.count === 0) {
    return NextResponse.json(
      errorEnvelope("NOT_FOUND", "Watchlist item not found.", {
        watchlistItemId,
      }),
      { status: 404 },
    );
  }

  return new NextResponse(null, { status: 204 });
}
