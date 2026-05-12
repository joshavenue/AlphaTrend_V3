import type { NextRequest } from "next/server";

import { getEnv } from "@/lib/config/env";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  hashAdminPassword,
  validateAdminPassword,
  verifyAdminPassword,
} from "@/lib/auth/password";
import { createSession, writeAuthAuditEvent } from "@/lib/auth/session";

const failedEmailAttempts = new Map<
  string,
  {
    count: number;
    resetAt: number;
  }
>();
const failedIpAttempts = new Map<
  string,
  {
    count: number;
    resetAt: number;
  }
>();

const WINDOW_MS = 15 * 60 * 1_000;
const LOCKOUT_MS = 15 * 60 * 1_000;

function requestIp(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function attemptKey(map: typeof failedEmailAttempts, key: string) {
  const now = Date.now();
  const current = map.get(key);

  if (!current || current.resetAt < now) {
    const next = {
      count: 0,
      resetAt: now + WINDOW_MS,
    };
    map.set(key, next);
    return next;
  }

  return current;
}

function isRateLimited(email: string, request: NextRequest) {
  const emailAttempt = attemptKey(failedEmailAttempts, email);
  const ipAttempt = attemptKey(failedIpAttempts, requestIp(request));

  return emailAttempt.count >= 5 || ipAttempt.count >= 20;
}

function recordFailedAttempt(email: string, request: NextRequest) {
  const now = Date.now();
  const emailAttempt = attemptKey(failedEmailAttempts, email);
  const ipAttempt = attemptKey(failedIpAttempts, requestIp(request));

  emailAttempt.count += 1;
  ipAttempt.count += 1;

  if (emailAttempt.count >= 5) {
    emailAttempt.resetAt = now + LOCKOUT_MS;
  }

  if (ipAttempt.count >= 20) {
    ipAttempt.resetAt = now + LOCKOUT_MS;
  }
}

function clearFailedAttempt(email: string, request: NextRequest) {
  failedEmailAttempts.delete(email);
  failedIpAttempts.delete(requestIp(request));
}

export async function ensureBootstrapAdmin() {
  const env = getEnv();

  if (!env.ADMIN_EMAIL || !env.ADMIN_INITIAL_PASSWORD) {
    return null;
  }

  const prisma = getPrismaClient();
  const existingAdminCount = await prisma.user.count();

  if (existingAdminCount > 0) {
    return null;
  }

  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const passwordError = validateAdminPassword(
    env.ADMIN_INITIAL_PASSWORD,
    email,
  );

  if (passwordError) {
    throw new Error("ADMIN_INITIAL_PASSWORD does not satisfy policy.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordChangedAt: new Date(),
      passwordHash: await hashAdminPassword(env.ADMIN_INITIAL_PASSWORD),
      role: "ADMIN",
    },
  });

  await writeAuthAuditEvent({
    email,
    eventType: "ADMIN_CREATED",
    metadata: {
      source: "env_bootstrap",
    },
    userId: user.id,
  });

  return user;
}

export async function authenticateAdmin(input: {
  email: string;
  password: string;
  request: NextRequest;
}) {
  await ensureBootstrapAdmin();

  const email = input.email.trim().toLowerCase();

  if (isRateLimited(email, input.request)) {
    await writeAuthAuditEvent({
      email,
      eventType: "LOGIN_FAILED",
      metadata: {
        reason: "rate_limited",
      },
      request: input.request,
    });

    return {
      error: "rate_limited" as const,
    };
  }

  const prisma = getPrismaClient();
  const user = await prisma.user.findUnique({
    where: {
      email,
    },
  });
  const verified =
    user && !user.disabledAt
      ? await verifyAdminPassword(user.passwordHash, input.password)
      : false;

  if (!user || !verified) {
    recordFailedAttempt(email, input.request);
    await writeAuthAuditEvent({
      email,
      eventType: "LOGIN_FAILED",
      metadata: {
        reason: "invalid_credentials",
      },
      request: input.request,
      userId: user?.id,
    });

    return {
      error: "invalid_credentials" as const,
    };
  }

  clearFailedAttempt(email, input.request);

  const session = await createSession(user.id);

  await prisma.user.update({
    data: {
      lastLoginAt: new Date(),
    },
    where: {
      id: user.id,
    },
  });

  await writeAuthAuditEvent({
    email,
    eventType: "LOGIN_SUCCESS",
    request: input.request,
    userId: user.id,
  });

  return {
    session,
    user: {
      email: user.email,
      id: user.id,
      role: user.role,
    },
  };
}

export function isSafeCallbackUrl(value: string | null) {
  if (!value) {
    return "/";
  }

  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
