import { NextRequest, NextResponse } from "next/server";

import { isSameOriginRequest } from "@/lib/auth/origin";
import {
  deleteSessionToken,
  expiredSessionCookieOptions,
  SESSION_COOKIE_NAME,
  writeAuthAuditEvent,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  await deleteSessionToken(token);
  await writeAuthAuditEvent({
    eventType: "LOGOUT",
    request,
  });

  const response = NextResponse.redirect(new URL("/sign-in", request.url), {
    status: 303,
  });
  response.cookies.set(SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());

  return response;
}
