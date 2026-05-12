import { createHash, randomBytes } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  type AuthAuditEventType,
  type AuthRole,
  type Prisma,
} from "@/generated/prisma/client";
import { errorEnvelope } from "@/lib/api/envelope";
import { getEnv } from "@/lib/config/env";
import { getPrismaClient } from "@/lib/db/prisma";

export const SESSION_COOKIE_NAME = "alphatrend_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1_000;

export type AuthUser = {
  id: string;
  email: string;
  role: AuthRole;
};

export type ApiAuthResult =
  | {
      user: AuthUser;
    }
  | {
      response: NextResponse;
    };

export function isAuthResponse(result: ApiAuthResult): result is {
  response: NextResponse;
} {
  return "response" in result;
}

function authSecret() {
  const env = getEnv();
  return env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "alphatrend-local-dev";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashAuditValue(value: string | null) {
  if (!value) {
    return null;
  }

  return createHash("sha256")
    .update(authSecret())
    .update(":")
    .update(value)
    .digest("hex");
}

function isSecureCookie() {
  const env = getEnv();
  return (
    env.APP_BASE_URL.startsWith("https://") ||
    env.APP_ENV.includes("production")
  );
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureCookie(),
  };
}

export function expiredSessionCookieOptions() {
  return {
    ...sessionCookieOptions(),
    maxAge: 0,
  };
}

function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

export async function writeAuthAuditEvent(input: {
  email?: string | null;
  eventType: AuthAuditEventType;
  metadata?: Prisma.InputJsonValue;
  request?: NextRequest;
  userId?: string | null;
}) {
  const prisma = getPrismaClient();
  const userAgent = input.request?.headers.get("user-agent") ?? null;

  await prisma.authAuditEvent.create({
    data: {
      email: input.email ? input.email.toLowerCase() : undefined,
      eventType: input.eventType,
      ipHash: hashAuditValue(input.request ? requestIp(input.request) : null),
      metadataJson: input.metadata,
      userAgentHash: hashAuditValue(userAgent),
      userId: input.userId ?? undefined,
    },
  });
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_MAX_AGE_MS);

  await getPrismaClient().session.create({
    data: {
      expires,
      sessionToken: hashToken(token),
      userId,
    },
  });

  return {
    expires,
    token,
  };
}

export async function deleteSessionToken(token: string | undefined) {
  if (!token) {
    return;
  }

  await getPrismaClient().session.deleteMany({
    where: {
      sessionToken: hashToken(token),
    },
  });
}

export async function getSessionUserFromToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const prisma = getPrismaClient();
  const session = await prisma.session.findUnique({
    include: {
      user: true,
    },
    where: {
      sessionToken: hashToken(token),
    },
  });

  if (!session || session.expires.getTime() <= Date.now()) {
    if (session) {
      await prisma.session.delete({
        where: {
          sessionToken: session.sessionToken,
        },
      });
    }

    return null;
  }

  if (session.user.disabledAt) {
    return null;
  }

  return {
    email: session.user.email,
    id: session.user.id,
    role: session.user.role,
  } satisfies AuthUser;
}

export async function getSessionUserFromRequest(request: NextRequest) {
  return getSessionUserFromToken(
    request.cookies.get(SESSION_COOKIE_NAME)?.value,
  );
}

export async function requireApiSession(
  request: NextRequest,
  adminOnly = false,
): Promise<ApiAuthResult> {
  const user = await getSessionUserFromRequest(request);

  if (!user) {
    return {
      response: NextResponse.json(
        errorEnvelope("UNAUTHORIZED", "Authentication required."),
        { status: 401 },
      ),
    };
  }

  if (adminOnly && user.role !== "ADMIN") {
    return {
      response: NextResponse.json(
        errorEnvelope("FORBIDDEN", "Admin access required."),
        { status: 403 },
      ),
    };
  }

  return { user };
}
