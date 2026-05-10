import { existsSync } from "node:fs";
import { join } from "node:path";

const requiredFiles = [
  "docs/README.md",
  "README.md",
  ".env.example",
  "prisma/schema.prisma",
];

const missing = requiredFiles.filter(
  (file) => !existsSync(join(process.cwd(), file)),
);

if (missing.length > 0) {
  console.error(`Missing required Phase 0 files: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("Phase 0 documentation pointers are present.");
