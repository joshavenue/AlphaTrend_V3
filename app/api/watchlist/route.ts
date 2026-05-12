import { NextRequest, NextResponse } from "next/server";

import type { WatchlistStatus, WatchType } from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildWatchlistPage } from "@/lib/app/read-models";
import { isSameOriginRequest } from "@/lib/auth/origin";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { isUuid } from "@/lib/util/uuid";

export const dynamic = "force-dynamic";

function themeWhere(themeRef: string) {
  return {
    OR: [
      ...(isUuid(themeRef) ? [{ themeId: themeRef }] : []),
      { sourceThemeCode: themeRef },
      { themeSlug: themeRef },
    ],
  };
}

function securityWhere(securityRef: string) {
  return {
    OR: [
      ...(isUuid(securityRef) ? [{ securityId: securityRef }] : []),
      { canonicalTicker: securityRef.toUpperCase() },
    ],
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;

  try {
    return NextResponse.json(
      successEnvelope(
        await buildWatchlistPage({
          limit: Number(params.get("limit") ?? 100),
          securityId: params.get("securityId"),
          status: params.get("status") as WatchlistStatus | null,
          themeId: params.get("themeId"),
          userId: auth.user.id,
          watchType: params.get("watchType") as WatchType | null,
        }),
      ),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load watchlist."),
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

  const body = (await request.json().catch(() => ({}))) as {
    securityId?: string;
    themeCandidateId?: string;
    themeId?: string;
    watchType?: WatchType;
  };

  if (
    !body.watchType ||
    !["THEME", "TICKER_THEME_PAIR", "TICKER_GLOBAL"].includes(body.watchType)
  ) {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Unsupported watchType.", {
        watchType: body.watchType,
      }),
      { status: 422 },
    );
  }

  const prisma = getPrismaClient();
  const theme = body.themeId
    ? await prisma.themeDefinition.findFirst({
        select: {
          themeId: true,
        },
        where: themeWhere(body.themeId),
      })
    : null;
  const security = body.securityId
    ? await prisma.security.findFirst({
        select: {
          securityId: true,
        },
        where: securityWhere(body.securityId),
      })
    : null;

  if (body.watchType === "THEME" && !theme) {
    return NextResponse.json(
      errorEnvelope(
        "VALIDATION_FAILED",
        "Theme watch requires a valid themeId.",
      ),
      { status: 422 },
    );
  }

  if (body.watchType === "TICKER_THEME_PAIR" && (!theme || !security)) {
    return NextResponse.json(
      errorEnvelope(
        "VALIDATION_FAILED",
        "Ticker-theme watch requires valid themeId and securityId.",
      ),
      { status: 422 },
    );
  }

  if (body.watchType === "TICKER_GLOBAL" && !security) {
    return NextResponse.json(
      errorEnvelope(
        "VALIDATION_FAILED",
        "Global ticker watch requires a valid securityId.",
      ),
      { status: 422 },
    );
  }

  const existing = await prisma.watchlistItem.findFirst({
    where: {
      securityId: security?.securityId ?? null,
      status: "ACTIVE",
      themeId: theme?.themeId ?? null,
      userId: auth.user.id,
      watchType: body.watchType,
    },
  });

  if (existing) {
    return NextResponse.json(
      successEnvelope({
        status: existing.status,
        watchlistItemId: existing.watchlistItemId,
      }),
    );
  }

  const item = await prisma.watchlistItem.create({
    data: {
      securityId: security?.securityId,
      status: "ACTIVE",
      themeCandidateId: body.themeCandidateId,
      themeId: theme?.themeId,
      userId: auth.user.id,
      watchType: body.watchType,
    },
  });

  return NextResponse.json(
    successEnvelope({
      status: item.status,
      watchlistItemId: item.watchlistItemId,
    }),
    { status: 201 },
  );
}
