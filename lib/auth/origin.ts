import type { NextRequest } from "next/server";

import { getEnv } from "@/lib/config/env";

function normalizedOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function allowsMissingOriginHeaders(appEnv: string, requestOrigin: string) {
  const normalizedEnv = appEnv.toLowerCase();

  if (
    normalizedEnv.includes("dev") ||
    normalizedEnv.includes("local") ||
    normalizedEnv.includes("test")
  ) {
    return true;
  }

  const hostname = new URL(requestOrigin).hostname;

  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

export function isAllowedMutationOrigin(input: {
  appBaseUrl: string;
  appEnv: string;
  origin?: string | null;
  referer?: string | null;
  requestOrigin: string;
}) {
  const appOrigin = normalizedOrigin(input.appBaseUrl);
  const requestOrigin = normalizedOrigin(input.requestOrigin);

  if (!appOrigin || !requestOrigin) {
    return false;
  }

  const allowedOrigins = new Set([appOrigin, requestOrigin]);

  if (input.origin) {
    const origin = normalizedOrigin(input.origin);
    return Boolean(origin && allowedOrigins.has(origin));
  }

  if (input.referer) {
    const refererOrigin = normalizedOrigin(input.referer);
    return Boolean(refererOrigin && allowedOrigins.has(refererOrigin));
  }

  return allowsMissingOriginHeaders(input.appEnv, requestOrigin);
}

export function isSameOriginRequest(request: NextRequest) {
  const env = getEnv();

  return isAllowedMutationOrigin({
    appBaseUrl: env.APP_BASE_URL,
    appEnv: env.APP_ENV,
    origin: request.headers.get("origin"),
    referer: request.headers.get("referer"),
    requestOrigin: request.nextUrl.origin,
  });
}
