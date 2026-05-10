import { secretEnvKeys } from "@/lib/config/env";

const SECRET_CENSOR = "[REDACTED]";

const secretValuePatterns = [
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /(?:ghp|github_pat)_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function redactText(input: unknown): string {
  let output =
    typeof input === "string" ? input : (JSON.stringify(input, null, 2) ?? "");

  for (const key of secretEnvKeys) {
    const escaped = escapeRegExp(key);
    output = output.replace(
      new RegExp(`(${escaped}\\s*[:=]\\s*)([^\\s"',]+)`, "gi"),
      `$1${SECRET_CENSOR}`,
    );
    output = output.replace(
      new RegExp(`("${escaped}"\\s*:\\s*")([^"]+)(")`, "gi"),
      `$1${SECRET_CENSOR}$3`,
    );
  }

  for (const pattern of secretValuePatterns) {
    output = output.replace(pattern, SECRET_CENSOR);
  }

  return output;
}

export function redactRecord<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => redactRecord(item)) as T;
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const entries = Object.entries(input).map(([key, value]) => {
    if (secretEnvKeys.some((secretKey) => secretKey === key)) {
      return [key, SECRET_CENSOR];
    }

    if (typeof value === "string") {
      return [key, redactText(value)];
    }

    return [key, redactRecord(value)];
  });

  return Object.fromEntries(entries) as T;
}
