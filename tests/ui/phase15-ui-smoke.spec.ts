import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { expect, test, type Page } from "@playwright/test";

import { PrismaClient } from "../../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
const suffix = randomUUID().slice(0, 8).toLowerCase();
const email = `phase15-${suffix}@example.com`;
const password = `phase15-password-${suffix}`;
const themeCode = `P15UI${suffix.toUpperCase()}`.slice(0, 12);
const themeSlug = `phase-15-ui-${suffix}`;
const themeName = `Phase 15 UI Theme ${suffix}`;
const ticker = `UI${suffix.toUpperCase()}`.slice(0, 10);

test.skip(!databaseUrl, "DATABASE_URL is required for UI smoke tests.");

const prisma = databaseUrl
  ? new PrismaClient({
      adapter: new PrismaPg({
        connectionString: databaseUrl,
      }),
      log: [],
    })
  : null;

let themeId: string | undefined;
let securityId: string | undefined;
let candidateId: string | undefined;

async function hashPassword(value: string) {
  return hash(value, {
    algorithm: 2,
    memoryCost: 19_456,
    parallelism: 1,
    timeCost: 2,
  });
}

async function seedUiFixture() {
  if (!prisma) {
    return;
  }

  await prisma.$connect();

  const user = await prisma.user.create({
    data: {
      email,
      passwordChangedAt: new Date(),
      passwordHash: await hashPassword(password),
      role: "ADMIN",
    },
  });

  await prisma.authAuditEvent.create({
    data: {
      email,
      eventType: "ADMIN_CREATED",
      metadataJson: {
        source: "phase15_ui_smoke",
      },
      userId: user.id,
    },
  });

  const theme = await prisma.themeDefinition.create({
    data: {
      candidateIndustries: [],
      candidateScreenerRules: [
        {
          rule_type: "fixture",
        },
      ],
      defaultDashboardState: "EARLY_WATCHLIST",
      directBeneficiaryCategories: [
        {
          display_label: "accelerator",
          normalized_label: "accelerator",
        },
      ],
      economicMechanism: {
        summary:
          "Fixture demand maps to constrained accelerator supply and directly measurable revenue exposure.",
      },
      excludedCategories: [
        {
          display_label: "generic software",
          normalized_label: "generic software",
        },
      ],
      indirectBeneficiaryCategories: [],
      invalidationRules: [
        {
          rule: "fixture_invalidated",
        },
      ],
      primaryDemandDrivers: [
        {
          label: "fixture",
        },
      ],
      requiredEconomicProof: [
        {
          metric: "fixture",
        },
      ],
      requiredFundamentalProof: [
        {
          metric: "revenue_growth",
        },
      ],
      seedEtfs: ["P15ETF"],
      shortDescription: "Fixture theme for Phase 15 browser smoke.",
      sourceThemeCode: themeCode,
      status: "ACTIVE_UNSCANNED",
      themeName,
      themeSlug,
    },
  });
  themeId = theme.themeId;

  const security = await prisma.security.create({
    data: {
      canonicalTicker: ticker,
      cik: "0000320193",
      companyName: "Phase Fifteen UI Inc.",
      exchange: "NASDAQ",
      isActive: true,
      isEtf: false,
      securityType: "COMMON_STOCK",
      universeBucket: "US_COMMON_ALL",
    },
  });
  securityId = security.securityId;

  const candidate = await prisma.themeCandidate.create({
    data: {
      beneficiaryType: "DIRECT_BENEFICIARY",
      candidateStatus: "WATCH_ONLY",
      dashboardVisible: true,
      displayGroup: "Direct beneficiaries",
      finalState: "LEADER_BUT_EXTENDED",
      lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
      securityId,
      sourceDetail: {
        generator_version: "phase15_ui_fixture",
        source_count: 1,
        source_types: ["MANUAL_SEED_FOR_API_VALIDATION"],
      },
      sourceOfInclusion: "MANUAL_SEED_FOR_API_VALIDATION",
      themeId,
      tickerReviewPriorityScore: 72,
      topPassReason: "DECISION_LEADER_BUT_EXTENDED",
    },
  });
  candidateId = candidate.themeCandidateId;

  const evidence = await prisma.evidenceLedger.create({
    data: {
      entityId: candidateId,
      entityType: "theme_candidate",
      evidenceGrade: "B",
      metricName: "t8.expression_decision_detail",
      metricValueText: "LEADER_BUT_EXTENDED:72",
      metricValueNum: 72,
      provider: "ALPHATREND_INTERNAL",
      reasonCode: "DECISION_LEADER_BUT_EXTENDED",
      securityId,
      sourcePayloadHash: `phase15-ui-${suffix}`,
      themeId,
    },
  });

  await prisma.candidateSignalScore.createMany({
    data: [
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        maxScore: 100,
        reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
        score: 78,
        scoreVersion: "phase15_fixture",
        signalLayer: "T1_EXPOSURE_PURITY",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        maxScore: 100,
        reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
        score: 75,
        scoreVersion: "phase15_fixture",
        signalLayer: "T3_FUNDAMENTALS",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        maxScore: 100,
        reasonCodes: ["PRICE_LEADER_EXTENDED"],
        score: 82,
        scoreVersion: "phase15_fixture",
        signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        maxScore: 100,
        reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE"],
        score: 0,
        scoreVersion: "phase15_fixture",
        signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        maxScore: 100,
        reasonCodes: ["DECISION_LEADER_BUT_EXTENDED"],
        score: 72,
        scoreVersion: "phase15_fixture",
        signalLayer: "T8_EXPRESSION_DECISION",
        themeCandidateId: candidateId,
      },
    ],
  });

  await prisma.candidateSignalState.createMany({
    data: [
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        reasonCodes: ["EXPOSURE_DIRECT_CATEGORY_MATCH"],
        signalLayer: "T1_EXPOSURE_PURITY",
        state: "DIRECT_BENEFICIARY",
        stateVersion: "phase15_fixture",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        reasonCodes: ["FUNDAMENTAL_REVENUE_GROWING"],
        signalLayer: "T3_FUNDAMENTALS",
        state: "VALIDATED",
        stateVersion: "phase15_fixture",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        reasonCodes: ["PRICE_LEADER_EXTENDED"],
        signalLayer: "T4_PRICE_VALUATION_PARTICIPATION",
        state: "LEADER_BUT_EXTENDED",
        stateVersion: "phase15_fixture",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        reasonCodes: ["LIQUIDITY_CORE_ELIGIBLE"],
        signalLayer: "T6_LIQUIDITY_DILUTION_FRAGILITY",
        state: "CORE_ELIGIBLE",
        stateVersion: "phase15_fixture",
        themeCandidateId: candidateId,
      },
      {
        computedAt: new Date("2026-05-12T00:00:00.000Z"),
        evidenceIds: [evidence.evidenceId],
        reasonCodes: ["DECISION_LEADER_BUT_EXTENDED"],
        signalLayer: "T8_EXPRESSION_DECISION",
        state: "LEADER_BUT_EXTENDED",
        stateVersion: "phase15_fixture",
        themeCandidateId: candidateId,
      },
    ],
  });

  await prisma.themeSnapshot.create({
    data: {
      basketPreferred: false,
      cautionReasonCodes: ["PRICE_LEADER_EXTENDED"],
      dashboardState: "EARLY_WATCHLIST",
      dataQualityScore: 80,
      delayedCatchupCount: 0,
      directBeneficiaryCount: 1,
      etfPreferred: false,
      highlightReasonCodes: ["DEMAND_MECHANISM_SPECIFIC"],
      investableCandidateCount: 0,
      lastScannedAt: new Date("2026-05-12T00:00:00.000Z"),
      leaderButExtendedCount: 1,
      leaderCount: 0,
      noTradeCount: 0,
      snapshotDate: new Date("2026-05-12T00:00:00.000Z"),
      themeId,
      themeRealityScore: 55,
      themeReviewPriorityScore: 48,
      topDirectBeneficiaries: [
        {
          ticker,
        },
      ],
      topRejectedTickers: [],
      watchlistOnlyCount: 0,
      wrongTickerCount: 0,
    },
  });
}

async function cleanupUiFixture() {
  if (!prisma) {
    return;
  }

  await prisma.session.deleteMany({
    where: {
      user: {
        email,
      },
    },
  });
  await prisma.authAuditEvent.deleteMany({
    where: {
      email,
    },
  });
  await prisma.user.deleteMany({
    where: {
      email,
    },
  });

  if (themeId || candidateId || securityId) {
    await prisma.watchlistItem.deleteMany({
      where: {
        OR: [{ themeId }, { themeCandidateId: candidateId }, { securityId }],
      },
    });
    await prisma.alert.deleteMany({
      where: {
        OR: [{ themeId }, { themeCandidateId: candidateId }, { securityId }],
      },
    });
    await prisma.signalState.deleteMany({
      where: {
        OR: [{ themeId }, { themeCandidateId: candidateId }, { securityId }],
      },
    });
  }

  if (candidateId) {
    await prisma.candidateSignalScore.deleteMany({
      where: {
        themeCandidateId: candidateId,
      },
    });
    await prisma.candidateSignalState.deleteMany({
      where: {
        themeCandidateId: candidateId,
      },
    });
  }

  if (themeId) {
    await prisma.themeSnapshot.deleteMany({
      where: {
        themeId,
      },
    });
    await prisma.evidenceLedger.deleteMany({
      where: {
        themeId,
      },
    });
    await prisma.themeCandidate.deleteMany({
      where: {
        themeId,
      },
    });
    await prisma.themeDefinition.deleteMany({
      where: {
        themeId,
      },
    });
  }

  if (securityId) {
    await prisma.security.deleteMany({
      where: {
        securityId,
      },
    });
  }

  await prisma.$disconnect();
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth + 1,
  );

  expect(hasOverflow).toBe(false);
}

async function expectResponsiveRoute(
  page: Page,
  width: number,
  path: string,
  assertRoute: () => Promise<void>,
) {
  await page.setViewportSize({
    height: 844,
    width,
  });
  await page.goto(path);
  await assertRoute();
  await expectNoHorizontalOverflow(page);
}

test.beforeAll(seedUiFixture);
test.afterAll(cleanupUiFixture);

test("dashboard, theme detail, ticker report, evidence, and provider health load without advice wording", async ({
  page,
}) => {
  await page.goto("/sign-in?callbackUrl=/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(
    page.getByRole("heading", { name: "All active AlphaTrend themes" }),
  ).toBeVisible();
  await expect(page.getByText(themeName)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  for (const width of [320, 375, 390]) {
    await expectResponsiveRoute(page, width, "/", async () => {
      await expect(page.getByText(themeName)).toBeVisible();
    });

    await expectResponsiveRoute(
      page,
      width,
      `/themes/${themeSlug}`,
      async () => {
        await expect(
          page.getByRole("heading", { name: themeName }),
        ).toBeVisible();
        await expect(page.getByText(ticker)).toBeVisible();
      },
    );

    await expectResponsiveRoute(
      page,
      width,
      `/themes/${themeSlug}/${ticker}`,
      async () => {
        await expect(page.getByText("Ticker report")).toBeVisible();
        await expect(page.getByText("Evidence summary")).toBeVisible();
      },
    );

    await expectResponsiveRoute(
      page,
      width,
      `/evidence?themeId=${themeCode}&securityId=${ticker}`,
      async () => {
        await expect(
          page.getByRole("heading", { name: "Evidence ledger" }),
        ).toBeVisible();
      },
    );

    await expectResponsiveRoute(page, width, "/alerts", async () => {
      await expect(
        page.getByRole("heading", { name: "Monitor state changes" }),
      ).toBeVisible();
    });

    await expectResponsiveRoute(page, width, "/admin/providers", async () => {
      await expect(
        page.getByRole("heading", { name: "Provider health" }),
      ).toBeVisible();
    });

    await expectResponsiveRoute(page, width, "/admin/jobs", async () => {
      await expect(
        page.getByRole("heading", { name: "Job runs" }),
      ).toBeVisible();
    });
  }

  await page.setViewportSize({
    height: 900,
    width: 1440,
  });
  await page.goto(`/themes/${themeSlug}`);
  await expect(page.getByRole("heading", { name: themeName })).toBeVisible();
  await expect(page.getByText("Direct beneficiaries")).toBeVisible();
  await expect(page.getByText(ticker)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto(`/themes/${themeSlug}/${ticker}`);
  await expect(page.getByText("Ticker report")).toBeVisible();
  await expect(page.getByText("Evidence summary")).toBeVisible();
  await expect(
    page.getByText("T5 Ownership Flow and T7 Base Rate"),
  ).toBeVisible();

  await page.goto(`/evidence?themeId=${themeCode}&securityId=${ticker}`);
  await expect(
    page.getByRole("heading", { name: "Evidence ledger" }),
  ).toBeVisible();
  await expect(page.getByText("t8.expression_decision_detail")).toBeVisible();

  await page.goto("/admin/providers");
  await expect(
    page.getByRole("heading", { name: "Provider health" }),
  ).toBeVisible();

  const visibleText = await page.locator("body").innerText();
  expect(visibleText).not.toMatch(/\bStrong Buy\b|\bBuy now\b|\bSell now\b/);
  expect(visibleText).not.toContain("phase15-secret-not-displayed");
});
