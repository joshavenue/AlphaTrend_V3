export type TestDatabaseGuardInput = {
  allowNonLocalTestDatabase?: string;
  allowProductionDatabaseTests?: string;
  appEnv?: string;
  databaseUrl?: string;
  databaseUrlTest?: string;
  nodeEnv?: string;
  requireDatabase?: boolean;
};

export type TestDatabaseGuardResult =
  | {
      ok: true;
      databaseConfigured: boolean;
      databaseName?: string;
      host?: string;
      warnings: string[];
    }
  | {
      ok: false;
      reason: string;
    };

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function isTrue(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function normalizedDatabaseName(url: URL) {
  return decodeURIComponent(url.pathname.replace(/^\//, ""));
}

function isLocalTestHost(hostname: string) {
  return LOCAL_HOSTS.has(hostname) || hostname.startsWith("100.");
}

export function evaluateTestDatabaseGuard(
  input: TestDatabaseGuardInput = {},
): TestDatabaseGuardResult {
  const warnings: string[] = [];
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV;
  const appEnv = input.appEnv ?? process.env.APP_ENV ?? "";
  const databaseUrl =
    input.databaseUrlTest !== undefined
      ? input.databaseUrlTest
      : input.databaseUrl !== undefined
        ? input.databaseUrl
        : (process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL);
  const allowProductionDatabaseTests = isTrue(
    input.allowProductionDatabaseTests ??
      process.env.ALLOW_PRODUCTION_DATABASE_TESTS,
  );
  const allowNonLocalTestDatabase = isTrue(
    input.allowNonLocalTestDatabase ?? process.env.ALLOW_NONLOCAL_TEST_DATABASE,
  );

  if (
    !allowProductionDatabaseTests &&
    (nodeEnv === "production" || appEnv.toLowerCase().includes("production"))
  ) {
    return {
      ok: false,
      reason:
        "Refusing to run tests in a production environment. Set a non-production NODE_ENV/APP_ENV.",
    };
  }

  if (!databaseUrl) {
    if (input.requireDatabase) {
      return {
        ok: false,
        reason:
          "DATABASE_URL or DATABASE_URL_TEST is required for this test command.",
      };
    }

    return {
      ok: true,
      databaseConfigured: false,
      warnings: ["No database URL configured; DB-backed tests may skip."],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return {
      ok: false,
      reason: "Configured database URL is not a valid URL.",
    };
  }

  const databaseName = normalizedDatabaseName(parsed);
  const hostname = parsed.hostname;
  const lowerDatabaseName = databaseName.toLowerCase();

  if (
    !allowProductionDatabaseTests &&
    /(^|[_-])(prod|production)([_-]|$)/.test(lowerDatabaseName)
  ) {
    return {
      ok: false,
      reason: "Refusing to run tests against a production-named database.",
    };
  }

  if (!allowNonLocalTestDatabase && !isLocalTestHost(hostname)) {
    return {
      ok: false,
      reason:
        "Refusing to run tests against a non-local database host without ALLOW_NONLOCAL_TEST_DATABASE=1.",
    };
  }

  if (!input.databaseUrlTest && !process.env.DATABASE_URL_TEST) {
    warnings.push(
      "DATABASE_URL_TEST is not set; tests will use DATABASE_URL with fixture cleanup.",
    );
  }

  return {
    ok: true,
    databaseConfigured: true,
    databaseName,
    host: hostname,
    warnings,
  };
}
