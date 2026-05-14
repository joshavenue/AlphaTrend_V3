console.log(
  [
    "AlphaTrend V3 database rollback is an operator-reviewed restore path, not an automatic reset command.",
    "Default to a forward-fix migration for schema mistakes.",
    "Use pg_restore from a verified npm run db:backup artifact only for destructive data corruption.",
    "See /srv/Markdowns/V3_Operations_Runbook.md or /Users/jojo/Desktop/V3/Markdowns/V3_Operations_Runbook.md for restore drill steps.",
    "Never run prisma reset/drop against hetzner-dev or production-like databases.",
  ].join("\n"),
);
