import type { NextRequest } from "next/server";

import { GET as getThemes } from "@/app/api/themes/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return getThemes(request);
}
