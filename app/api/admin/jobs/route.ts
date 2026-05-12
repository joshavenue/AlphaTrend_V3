import { NextRequest, NextResponse } from "next/server";

import type { JobStatus, JobType } from "@/generated/prisma/client";
import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { buildJobRuns } from "@/lib/app/read-models";
import { isAuthResponse, requireApiSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiSession(request, true);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;

  try {
    return NextResponse.json(
      successEnvelope(
        await buildJobRuns({
          jobType: params.get("jobType") as JobType | null,
          limit: Number(params.get("limit") ?? 50),
          status: params.get("status") as JobStatus | null,
        }),
      ),
    );
  } catch {
    return NextResponse.json(
      errorEnvelope("INTERNAL_ERROR", "Unable to load job runs."),
      { status: 500 },
    );
  }
}
