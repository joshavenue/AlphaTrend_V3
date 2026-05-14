import { resolve4, resolveCname } from "node:dns/promises";

type HealthData = {
  database?: string;
  environment?: string;
  service?: string;
  status?: string;
  version?: string;
};

type HealthResult = {
  database?: string;
  environment?: string;
  error?: string;
  ok: boolean;
  server?: string;
  statusCode?: number;
  url: string;
  vercelId?: string;
};

type RuntimeAuthorityReport = {
  authority:
    | "PUBLIC_URL"
    | "HETZNER_VERIFIED_RUNTIME"
    | "NO_DB_BACKED_RUNTIME_VERIFIED";
  dns: {
    a: string[];
    cname: string[];
    hostname: string;
  };
  hetzner: HealthResult;
  public: HealthResult;
  warnings: string[];
};

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(name);
}

function healthUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/api/health";
  }

  return url.toString();
}

async function fetchHealth(rawUrl: string): Promise<HealthResult> {
  const url = healthUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as {
      data?: HealthData;
      ok?: boolean;
    } | null;

    return {
      database: body?.data?.database,
      environment: body?.data?.environment,
      ok: response.ok && body?.ok === true,
      server: response.headers.get("server") ?? undefined,
      statusCode: response.status,
      url,
      vercelId: response.headers.get("x-vercel-id") ?? undefined,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolvePublicDns(
  rawUrl: string,
): Promise<RuntimeAuthorityReport["dns"]> {
  const hostname = new URL(rawUrl).hostname;
  const [cname, a] = await Promise.all([
    resolveCname(hostname).catch(() => [] as string[]),
    resolve4(hostname).catch(() => [] as string[]),
  ]);

  return { a, cname, hostname };
}

function classify(
  report: Omit<RuntimeAuthorityReport, "authority" | "warnings">,
): Pick<RuntimeAuthorityReport, "authority" | "warnings"> {
  const warnings: string[] = [];
  const publicDbBacked =
    report.public.ok &&
    report.public.database !== undefined &&
    report.public.database !== "unconfigured";
  const hetznerDbBacked = report.hetzner.ok && report.hetzner.database === "ok";
  const publicLooksVercel =
    report.public.server?.toLowerCase().includes("vercel") ||
    report.dns.cname.some((entry) => entry.toLowerCase().includes("vercel"));

  if (publicLooksVercel) {
    warnings.push("PUBLIC_URL_SERVED_BY_VERCEL");
  }

  if (!publicDbBacked) {
    warnings.push("PUBLIC_URL_DATABASE_NOT_VERIFIED");
  }

  if (!hetznerDbBacked) {
    warnings.push("HETZNER_DATABASE_NOT_VERIFIED");
  }

  if (report.public.environment && report.hetzner.environment) {
    if (report.public.environment === report.hetzner.environment) {
      warnings.push("PUBLIC_AND_HETZNER_ENVIRONMENT_MATCH_UNEXPECTEDLY");
    }
  }

  const authority = publicDbBacked
    ? "PUBLIC_URL"
    : hetznerDbBacked
      ? "HETZNER_VERIFIED_RUNTIME"
      : "NO_DB_BACKED_RUNTIME_VERIFIED";

  return { authority, warnings };
}

function printText(report: RuntimeAuthorityReport) {
  console.log("Runtime authority check");
  console.log(`public: ${report.public.url}`);
  console.log(
    `  status=${report.public.statusCode ?? "n/a"} env=${report.public.environment ?? "n/a"} db=${report.public.database ?? "n/a"} server=${report.public.server ?? "n/a"}`,
  );
  console.log(`hetzner: ${report.hetzner.url}`);
  console.log(
    `  status=${report.hetzner.statusCode ?? "n/a"} env=${report.hetzner.environment ?? "n/a"} db=${report.hetzner.database ?? "n/a"} server=${report.hetzner.server ?? "n/a"}`,
  );
  console.log(`dns: ${report.dns.hostname}`);
  console.log(`  cname=${report.dns.cname.join(", ") || "n/a"}`);
  console.log(`  a=${report.dns.a.join(", ") || "n/a"}`);
  console.log(`authority: ${report.authority}`);

  if (report.warnings.length > 0) {
    console.log("warnings:");
    for (const warning of report.warnings) {
      console.log(`  - ${warning}`);
    }
  }
}

async function main() {
  const publicUrl = argValue("--public-url") ?? "https://alpha.solidmetrics.co";
  const hetznerUrl = argValue("--hetzner-url") ?? "http://100.79.23.21:420";
  const [publicHealth, hetznerHealth, dns] = await Promise.all([
    fetchHealth(publicUrl),
    fetchHealth(hetznerUrl),
    resolvePublicDns(publicUrl),
  ]);
  const classification = classify({
    dns,
    hetzner: hetznerHealth,
    public: publicHealth,
  });
  const report: RuntimeAuthorityReport = {
    ...classification,
    dns,
    hetzner: hetznerHealth,
    public: publicHealth,
  };

  if (hasArg("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }

  if (hasArg("--require-public-db") && report.authority !== "PUBLIC_URL") {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
