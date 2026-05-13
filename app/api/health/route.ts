import { NextResponse } from "next/server";

import { successEnvelope } from "@/lib/api/envelope";
import { getEnv } from "@/lib/config/env";
import { checkDatabase } from "@/lib/db/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  const database = await checkDatabase();
  const generatedAt = new Date().toISOString();

  return NextResponse.json(
    successEnvelope(
      {
        status: "ok",
        service: "alphatrend-v3",
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.APP_ENV,
        database: database.status,
        time: generatedAt,
      },
      {
        generatedAt,
        asOf: generatedAt,
      },
    ),
  );
}
