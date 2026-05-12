import type { NextRequest } from "next/server";

import { getEnv } from "@/lib/config/env";

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  const appOrigin = new URL(getEnv().APP_BASE_URL).origin;
  const requestOrigin = request.nextUrl.origin;

  return origin === appOrigin || origin === requestOrigin;
}
