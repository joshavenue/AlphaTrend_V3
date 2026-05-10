import pino from "pino";

import { getEnv, secretEnvKeys } from "@/lib/config/env";
import { redactRecord, redactText } from "@/lib/config/redact";

const env = getEnv();

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "alphatrend-v3",
    app_env: env.APP_ENV,
  },
  redact: {
    paths: [
      ...secretEnvKeys,
      "headers.authorization",
      "headers.cookie",
      "cookie",
      "password",
      "password_hash",
      "session",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function sanitizeLogPayload<T>(payload: T): T {
  return redactRecord(payload);
}

export function sanitizeError(error: unknown): string {
  if (error instanceof Error) {
    return redactText(error.message);
  }

  return redactText(error);
}
