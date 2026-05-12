import { NextRequest, NextResponse } from "next/server";

import { errorEnvelope, successEnvelope } from "@/lib/api/envelope";
import { isSameOriginRequest } from "@/lib/auth/origin";
import {
  isAuthResponse,
  requireApiSession,
  writeAuthAuditEvent,
} from "@/lib/auth/session";
import { getPrismaClient } from "@/lib/db/prisma";
import { buildThemeSnapshots } from "@/lib/snapshots/runner";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    jobType: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireApiSession(request, true);
  if (isAuthResponse(auth)) {
    return auth.response;
  }

  if (!isSameOriginRequest(request)) {
    return NextResponse.json(
      errorEnvelope("FORBIDDEN", "Cross-origin admin mutation rejected."),
      { status: 403 },
    );
  }

  const { jobType } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    scopeId?: string;
    scopeType?: string;
  };

  if (jobType === "THEME_SCAN") {
    return NextResponse.json(
      errorEnvelope(
        "VALIDATION_FAILED",
        "Full theme scan manual trigger is not implemented in Phase 12. Use THEME_SNAPSHOT for dashboard snapshot refresh.",
        {
          jobType,
          supportedJobType: "THEME_SNAPSHOT",
        },
      ),
      { status: 422 },
    );
  }

  if (jobType !== "THEME_SNAPSHOT") {
    return NextResponse.json(
      errorEnvelope("VALIDATION_FAILED", "Unsupported manual job trigger.", {
        jobType,
      }),
      { status: 422 },
    );
  }

  try {
    const result = await buildThemeSnapshots(getPrismaClient(), {
      themeRef: body.scopeType === "theme" ? body.scopeId : undefined,
    });

    await writeAuthAuditEvent({
      eventType: "ADMIN_JOB_TRIGGERED",
      metadata: {
        executed_job_type: "THEME_SNAPSHOT",
        requested_job_type: jobType,
        scope_id: body.scopeId ?? null,
        scope_type: body.scopeType ?? null,
      },
      request,
      userId: auth.user.id,
    });

    return NextResponse.json(
      successEnvelope({
        executed_job_type: "THEME_SNAPSHOT",
        job_run_id: result.jobRunId,
        requested_job_type: jobType,
        snapshots_built: result.snapshotsBuilt,
        status: "SUCCEEDED",
        warnings: result.warnings.length,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job failed.";

    if (message.includes("already running")) {
      return NextResponse.json(errorEnvelope("JOB_ALREADY_RUNNING", message), {
        status: 409,
      });
    }

    return NextResponse.json(errorEnvelope("INTERNAL_ERROR", message), {
      status: 500,
    });
  }
}
