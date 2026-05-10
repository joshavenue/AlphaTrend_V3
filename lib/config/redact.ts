import { secretEnvKeys } from "@/lib/config/env";

export const SECRET_CENSOR = "[REDACTED]";

const secretFieldNames = new Set([
  "apikey",
  "api_key",
  "api-key",
  "authorization",
  "key",
  "password",
  "registrationkey",
  "secret",
  "token",
  "access_token",
  "access-token",
  "x-openfigi-apikey",
]);

const compactSecretFieldNames = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "key",
  "password",
  "registrationkey",
  "secret",
  "token",
  "xopenfigiapikey",
]);

const secretValuePatterns = [
  /postgres(?:ql)?:\/\/[^\s"']+/gi,
  /(?:ghp|github_pat)_[A-Za-z0-9_]+/g,
  /sk-[A-Za-z0-9_-]+/g,
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeFieldName(key: string) {
  return key.trim().toLowerCase();
}

function compactFieldName(key: string) {
  return normalizeFieldName(key).replace(/[-_\s]/g, "");
}

function isSecretEnvFieldName(key: string) {
  const normalized = normalizeFieldName(key);
  const compacted = compactFieldName(key);

  return secretEnvKeys.some((secretKey) => {
    const normalizedSecret = normalizeFieldName(secretKey);

    return (
      normalizedSecret === normalized ||
      normalizedSecret.replace(/[-_\s]/g, "") === compacted
    );
  });
}

function isSecretFieldName(key: string) {
  const normalized = normalizeFieldName(key);
  const compacted = compactFieldName(key);

  return (
    secretFieldNames.has(normalized) ||
    compactSecretFieldNames.has(compacted) ||
    compacted.includes("apikey") ||
    isSecretEnvFieldName(key)
  );
}

function isSecretQueryParamName(key: string) {
  const compacted = compactFieldName(key);

  return (
    isSecretFieldName(key) || compacted === "userid" || compacted === "userkey"
  );
}

function canonicalizeSearchParams(searchParams: URLSearchParams) {
  return [...searchParams.entries()]
    .map(([key, value]) => [
      key,
      isSecretQueryParamName(key) ? SECRET_CENSOR : value,
    ])
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey
        ? leftValue.localeCompare(rightValue)
        : leftKey.localeCompare(rightKey),
    );
}

export function redactUrlSecrets(input: string): string {
  if (!input.includes("?")) {
    return input;
  }

  try {
    const hasProtocol = /^[a-z][a-z\d+\-.]*:/i.test(input);
    const url = new URL(
      input,
      hasProtocol ? undefined : "https://alphatrend.local",
    );
    const sanitizedParams = new URLSearchParams();

    for (const [key, value] of canonicalizeSearchParams(url.searchParams)) {
      sanitizedParams.append(key, value);
    }

    url.search = sanitizedParams.toString();

    if (!hasProtocol) {
      return `${url.pathname}${url.search}${url.hash}`;
    }

    return url.toString();
  } catch {
    return input;
  }
}

export function redactText(input: unknown): string {
  let output =
    typeof input === "string" ? input : (JSON.stringify(input, null, 2) ?? "");

  output = redactUrlSecrets(output);

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
    if (isSecretFieldName(key)) {
      return [key, SECRET_CENSOR];
    }

    if (typeof value === "string") {
      return [key, redactText(value)];
    }

    return [key, redactRecord(value)];
  });

  return Object.fromEntries(entries) as T;
}
