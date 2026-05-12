import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { hashAdminPassword, validateAdminPassword } from "@/lib/auth/password";
import { writeAuthAuditEvent } from "@/lib/auth/session";
import { createPrismaClient } from "@/lib/db/prisma";

function parseEmail(argv: string[]) {
  const emailArg = argv.find((arg) => arg.startsWith("--email="));
  return emailArg?.split("=").slice(1).join("=").trim().toLowerCase();
}

async function promptPassword() {
  const terminal = createInterface({
    input,
    output,
  });

  try {
    return await terminal.question("Admin password: ");
  } finally {
    terminal.close();
  }
}

async function main() {
  const email = parseEmail(process.argv.slice(2));

  if (!email) {
    throw new Error("Usage: npm run admin:create -- --email=user@example.com");
  }

  const password =
    process.env.ADMIN_INITIAL_PASSWORD ?? (await promptPassword());
  const passwordError = validateAdminPassword(password, email);

  if (passwordError) {
    throw new Error(passwordError);
  }

  const prisma = createPrismaClient();

  await prisma.$connect();

  try {
    const existing = await prisma.user.findFirst();

    if (existing) {
      console.log("Admin already exists. No changes made.");
      return;
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordChangedAt: new Date(),
        passwordHash: await hashAdminPassword(password),
        role: "ADMIN",
      },
    });

    await writeAuthAuditEvent({
      email,
      eventType: "ADMIN_CREATED",
      metadata: {
        source: "admin_create_cli",
      },
      userId: user.id,
    });

    console.log(`Admin created for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

await main();
