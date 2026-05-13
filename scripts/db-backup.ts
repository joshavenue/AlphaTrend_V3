import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createPrismaClient } from "@/lib/db/prisma";

const DEFAULT_BACKUP_DIR = "backups/postgres";
const BACKUP_LOCK_TTL_MS = 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 512;

type BackupOptions = {
  dryRun: boolean;
  label?: string;
  outputDir: string;
};

function shortError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH
    ? `${message.slice(0, MAX_ERROR_LENGTH - 3)}...`
    : message;
}

function timestampForFilename(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function safeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function parseArgs(argv: string[]): BackupOptions {
  const options: BackupOptions = {
    dryRun: false,
    outputDir: process.env.ALPHATREND_BACKUP_DIR ?? DEFAULT_BACKUP_DIR,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.split("=").slice(1).join("=");
    } else if (arg.startsWith("--label=")) {
      options.label = arg.split("=").slice(1).join("=");
    } else {
      throw new Error(
        `Unknown db:backup option "${arg}". Use --output-dir=..., --label=..., or --dry-run.`,
      );
    }
  }

  return options;
}

function databaseEnv(databaseUrl: string) {
  const parsed = new URL(databaseUrl);

  return {
    PGDATABASE: parsed.pathname.replace(/^\//, ""),
    PGCONNECT_TIMEOUT: "30",
    PGHOST: parsed.hostname,
    PGPASSWORD: decodeURIComponent(parsed.password),
    PGPORT: parsed.port || "5432",
    PGSSLMODE: parsed.searchParams.get("sslmode") ?? undefined,
    PGUSER: decodeURIComponent(parsed.username),
  };
}

async function latestMigration(prisma: ReturnType<typeof createPrismaClient>) {
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name
      FROM "_prisma_migrations"
      WHERE finished_at IS NOT NULL
      ORDER BY finished_at DESC
      LIMIT 1
    `;

    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}

async function appCommit() {
  return new Promise<string | null>((resolveCommit) => {
    const child = spawn("git", ["rev-parse", "--short", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += String(chunk);
    });
    child.on("error", () => resolveCommit(null));
    child.on("close", (code) =>
      resolveCommit(code === 0 ? output.trim() || null : null),
    );
  });
}

async function acquireLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
  lockKey: string,
) {
  const now = new Date();

  await prisma.jobLock.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
      lockKey,
    },
  });

  try {
    await prisma.jobLock.create({
      data: {
        expiresAt: new Date(now.getTime() + BACKUP_LOCK_TTL_MS),
        jobRunId,
        lockKey,
        lockedAt: now,
        ownerId: `db-backup:${process.pid}`,
      },
    });
  } catch {
    throw new Error(`Database backup lock is already held: ${lockKey}`);
  }
}

async function releaseLock(
  prisma: ReturnType<typeof createPrismaClient>,
  jobRunId: string,
  lockKey: string,
) {
  await prisma.jobLock.deleteMany({
    where: {
      jobRunId,
      lockKey,
    },
  });
}

async function databaseHasJobType(
  prisma: ReturnType<typeof createPrismaClient>,
  jobType: string,
) {
  try {
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'JobType'
          AND e.enumlabel = ${jobType}
      ) AS exists
    `;

    return Boolean(rows[0]?.exists);
  } catch {
    return false;
  }
}

async function createBackupJobRun(
  prisma: ReturnType<typeof createPrismaClient>,
  scopeId: string,
) {
  const baseData = {
    scopeId,
    scopeType: "postgres_backup",
    status: "STARTED" as const,
  };

  if (!(await databaseHasJobType(prisma, "DATABASE_BACKUP"))) {
    return prisma.jobRun.create({
      data: {
        ...baseData,
        errorSummary:
          "Pre-Phase-16 backup audit fallback: DATABASE_BACKUP enum not migrated yet.",
        jobType: "BACKFILL",
      },
    });
  }

  try {
    return await prisma.jobRun.create({
      data: {
        ...baseData,
        jobType: "DATABASE_BACKUP",
      },
    });
  } catch (error) {
    const message = shortError(error);

    if (!message.includes("DATABASE_BACKUP")) {
      throw error;
    }

    return prisma.jobRun.create({
      data: {
        ...baseData,
        errorSummary:
          "Pre-Phase-16 backup audit fallback: DATABASE_BACKUP enum not migrated yet.",
        jobType: "BACKFILL",
      },
    });
  }
}

async function runPgDump(
  env: ReturnType<typeof databaseEnv>,
  backupPath: string,
) {
  return new Promise<void>((resolveDump, rejectDump) => {
    const child = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", "--file", backupPath],
      {
        env: {
          ...process.env,
          ...env,
        },
        stdio: ["ignore", "ignore", "pipe"],
      },
    );
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", rejectDump);
    child.on("close", (code) => {
      if (code === 0) {
        resolveDump();
      } else {
        rejectDump(new Error(stderr.trim() || `pg_dump exited with ${code}`));
      }
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for db:backup.");
  }

  const dbEnv = databaseEnv(databaseUrl);
  const now = new Date();
  const label = options.label ? `${safeFilenamePart(options.label)}-` : "";
  const outputDir = resolve(options.outputDir);
  const backupFilename = `alphatrend-${label}${safeFilenamePart(
    dbEnv.PGHOST,
  )}-${safeFilenamePart(dbEnv.PGDATABASE)}-${timestampForFilename(now)}.dump`;
  const backupPath = resolve(outputDir, backupFilename);
  const manifestPath = `${backupPath}.manifest.json`;
  const plan = {
    backup_file: backupPath,
    database: dbEnv.PGDATABASE,
    dry_run: options.dryRun,
    host: dbEnv.PGHOST,
    manifest_file: manifestPath,
    port: dbEnv.PGPORT,
    user: dbEnv.PGUSER,
  };

  if (options.dryRun) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const prisma = createPrismaClient(databaseUrl);

  await prisma.$connect();

  const jobRun = await createBackupJobRun(
    prisma,
    `${dbEnv.PGHOST}:${dbEnv.PGPORT}/${dbEnv.PGDATABASE}`,
  );
  const lockKey = `database_backup:${dbEnv.PGHOST}:${dbEnv.PGPORT}:${dbEnv.PGDATABASE}`;

  try {
    await acquireLock(prisma, jobRun.jobRunId, lockKey);
    await mkdir(outputDir, { recursive: true });
    await runPgDump(dbEnv, backupPath);

    const manifest = {
      app_commit: await appCommit(),
      app_env: process.env.APP_ENV ?? null,
      backup_file: basename(backupPath),
      created_at: now.toISOString(),
      database: dbEnv.PGDATABASE,
      format: "pg_dump_custom",
      host: dbEnv.PGHOST,
      job_run_id: jobRun.jobRunId,
      job_type: jobRun.jobType,
      latest_migration: await latestMigration(prisma),
      manifest_version: 1,
      port: dbEnv.PGPORT,
      user: dbEnv.PGUSER,
    };

    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    await prisma.jobRun.update({
      data: {
        finishedAt: new Date(),
        rowsWritten: 2,
        status: "SUCCEEDED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    console.log(
      JSON.stringify(
        {
          backup_file: backupPath,
          job_run_id: jobRun.jobRunId,
          manifest_file: manifestPath,
          status: "SUCCEEDED",
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await prisma.jobRun.update({
      data: {
        errorSummary: shortError(error),
        finishedAt: new Date(),
        status: "FAILED",
      },
      where: {
        jobRunId: jobRun.jobRunId,
      },
    });

    throw error;
  } finally {
    await releaseLock(prisma, jobRun.jobRunId, lockKey);
    await prisma.$disconnect();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
