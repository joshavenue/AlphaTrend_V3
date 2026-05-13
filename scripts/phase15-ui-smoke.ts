import { runUiSmoke } from "@/lib/testing/ui-smoke";

const result = runUiSmoke();

console.log(
  JSON.stringify(
    {
      checked_files: result.checkedFiles,
      failures: result.failures,
      ok: result.ok,
      required_files: result.requiredFiles,
    },
    null,
    2,
  ),
);

if (!result.ok) {
  process.exit(1);
}
