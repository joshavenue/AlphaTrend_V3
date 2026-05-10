import type { EvidenceGrade, ProviderName } from "@/generated/prisma/client";

const primarySourceProviders = new Set<ProviderName>([
  "SEC",
  "NASDAQ_TRADER",
  "FRED",
  "BEA",
  "BLS",
  "EIA",
  "USA_SPENDING",
  "USPTO",
]);

export function reliabilityScoreForGrade(grade: EvidenceGrade) {
  const scores: Record<EvidenceGrade, number> = {
    A: 100,
    B: 80,
    C: 60,
    D: 30,
  };

  return scores[grade];
}

export function defaultEvidenceGradeForProvider(
  provider: ProviderName,
): EvidenceGrade {
  return primarySourceProviders.has(provider) ? "A" : "B";
}

export function freshnessScoreForDate(
  observedAt: Date,
  now: Date = new Date(),
) {
  const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
  const ageDays = ageMs / 86_400_000;

  if (ageDays <= 7) {
    return 100;
  }

  if (ageDays <= 30) {
    return 85;
  }

  if (ageDays <= 90) {
    return 60;
  }

  if (ageDays <= 180) {
    return 35;
  }

  return 10;
}
