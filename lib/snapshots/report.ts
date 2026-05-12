import {
  buildDashboardThemes,
  buildThemeCandidatesView,
  buildThemeSnapshotView,
} from "@/lib/snapshots/dashboard";
import type { SnapshotDbClient } from "@/lib/snapshots/types";

export async function buildSnapshotReport(
  prisma: SnapshotDbClient,
  themeRef?: string,
) {
  if (themeRef) {
    const snapshot = await buildThemeSnapshotView(prisma, themeRef);

    if (!snapshot) {
      throw new Error(`No theme snapshot view found for ${themeRef}.`);
    }

    const candidates = await buildThemeCandidatesView(prisma, themeRef);

    return {
      candidate_groups: candidates?.groups ?? {},
      candidate_rows: candidates?.rows ?? [],
      theme_filter: themeRef,
      theme_snapshot: snapshot,
    };
  }

  const themes = await buildDashboardThemes(prisma);

  return {
    theme_filter: "all-active",
    theme_count: themes.length,
    themes,
  };
}
