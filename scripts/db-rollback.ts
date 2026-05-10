console.log(
  [
    "Prisma does not provide automatic destructive rollback for the MVP path.",
    "Use a forward-fix migration in development and confirm backup/restore before production schema changes.",
    "Phase 1 will add concrete migration runbooks once real tables exist.",
  ].join("\n"),
);
