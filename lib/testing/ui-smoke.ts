import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type UiSmokeFailure = {
  file: string;
  message: string;
  pattern?: string;
};

export type UiSmokeResult = {
  checkedFiles: number;
  failures: UiSmokeFailure[];
  ok: boolean;
  requiredFiles: string[];
};

const SOURCE_DIRS = ["app", "components", "lib/ui"];
const REQUIRED_UI_FILES = [
  "app/page.tsx",
  "app/themes/page.tsx",
  "app/themes/[themeSlug]/page.tsx",
  "app/themes/[themeSlug]/[ticker]/page.tsx",
  "app/evidence/page.tsx",
  "app/alerts/page.tsx",
  "app/admin/providers/page.tsx",
  "components/reason-chip.tsx",
  "components/state-badge.tsx",
  "components/ticker-report.tsx",
];

const FORBIDDEN_WORDING = [
  /\bstrong\s+buy\b/i,
  /\bbuy\s+now\b/i,
  /\bsell\s+now\b/i,
  /\bbuy\s+signal\b/i,
  /\bsell\s+signal\b/i,
  /\bentry\s+point\b/i,
  /\bprice\s+target\b/i,
  /\btrade\s+recommendation\b/i,
  /\bwe\s+recommend\b/i,
];

function readSourceFiles(root: string, dir: string): string[] {
  const absolute = join(root, dir);

  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return readSourceFiles(root, relative(root, path));
    }

    return path.endsWith(".tsx") || path.endsWith(".ts") ? [path] : [];
  });
}

export function runUiSmoke(root = process.cwd()): UiSmokeResult {
  const failures: UiSmokeFailure[] = [];
  const requiredFiles = REQUIRED_UI_FILES.map((file) => join(root, file));

  for (const file of requiredFiles) {
    try {
      statSync(file);
    } catch {
      failures.push({
        file: relative(root, file),
        message: "Required UI route/component file is missing.",
      });
    }
  }

  const sourceFiles = SOURCE_DIRS.flatMap((dir) => readSourceFiles(root, dir));

  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");

    for (const pattern of FORBIDDEN_WORDING) {
      if (pattern.test(source)) {
        failures.push({
          file: relative(root, file),
          message: "Forbidden advice-like wording found in UI source.",
          pattern: pattern.source,
        });
      }
    }

    if (
      /process\.env\.(MASSIVE|FMP|OPENFIGI|ALPHA_VANTAGE|FRED|BEA|BLS|EIA)_API_KEY/.test(
        source,
      )
    ) {
      failures.push({
        file: relative(root, file),
        message: "Provider API key env access must not appear in UI source.",
      });
    }
  }

  return {
    checkedFiles: sourceFiles.length,
    failures,
    ok: failures.length === 0,
    requiredFiles: REQUIRED_UI_FILES,
  };
}
