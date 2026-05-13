import { NextRequest, NextResponse } from "next/server";

import { authenticateAdmin, isSafeCallbackUrl } from "@/lib/auth/admin";
import { isSameOriginRequest } from "@/lib/auth/origin";
import { sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function requestPublicOrigin(request: NextRequest) {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) {
    return request.nextUrl.origin;
  }

  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(/:$/, "");

  return `${proto}://${host}`;
}

function redirectWithError(request: NextRequest, callbackUrl: string) {
  const url = new URL("/sign-in", requestPublicOrigin(request));
  url.searchParams.set("error", "1");
  url.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = isSafeCallbackUrl(
    String(formData.get("callbackUrl") ?? ""),
  );

  if (!isSameOriginRequest(request)) {
    return redirectWithError(request, callbackUrl);
  }

  const result = await authenticateAdmin({
    email,
    password,
    request,
  });

  if ("error" in result) {
    return redirectWithError(request, callbackUrl);
  }

  const response = NextResponse.redirect(
    new URL(callbackUrl, requestPublicOrigin(request)),
    {
      status: 303,
    },
  );
  response.cookies.set(
    "alphatrend_session",
    result.session.token,
    sessionCookieOptions(),
  );

  return response;
}
