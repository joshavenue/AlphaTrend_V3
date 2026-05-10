import { describe, expect, it } from "vitest";

import { buildSecurityMaster } from "@/lib/security-master/builder";
import {
  classifySecurityType,
  normalizeCik,
  normalizeTicker,
} from "@/lib/security-master/normalize";
import { SECURITY_MASTER_REASON_CODES } from "@/lib/security-master/reason-codes";

describe("security master normalization and merge", () => {
  it("normalizes ticker and CIK values deterministically", () => {
    expect(normalizeTicker(" aapl ")).toBe("AAPL");
    expect(normalizeTicker(" brk b ")).toBe("BRKB");
    expect(normalizeCik("320193")).toBe("0000320193");
    expect(normalizeCik("CIK0000320193")).toBe("0000320193");
  });

  it("classifies common stock, ETF, ADR, and excluded instrument types", () => {
    expect(
      classifySecurityType({
        companyName: "Apple Inc. - Common Stock",
        nasdaq: {
          etf: false,
          securityName: "Apple Inc. - Common Stock",
          symbol: "AAPL",
          testIssue: false,
        },
      }),
    ).toBe("COMMON_STOCK");
    expect(
      classifySecurityType({
        companyName: "VanEck Semiconductor ETF",
        nasdaq: {
          etf: true,
          securityName: "VanEck Semiconductor ETF",
          symbol: "SMH",
          testIssue: false,
        },
      }),
    ).toBe("ETF");
    expect(
      classifySecurityType({
        companyName: "Taiwan Semiconductor Manufacturing Company Ltd. ADR",
      }),
    ).toBe("ADR");
    expect(
      classifySecurityType({
        companyName: "Example Acquisition Corp. Unit",
      }),
    ).toBe("SPAC_UNIT");
  });

  it("builds common-stock, ETF, ADR, and test-issue outcomes from provider fixtures", () => {
    const build = buildSecurityMaster({
      nasdaqListed: [
        {
          etf: false,
          marketCategory: "Q",
          securityName: "Apple Inc. - Common Stock",
          symbol: "AAPL",
          testIssue: false,
        },
        {
          etf: true,
          marketCategory: "Q",
          securityName: "VanEck Semiconductor ETF",
          symbol: "SMH",
          testIssue: false,
        },
        {
          etf: false,
          marketCategory: "Q",
          securityName: "Nasdaq Test Issue",
          symbol: "ZZTEST",
          testIssue: true,
        },
      ],
      openFigiMappings: [
        {
          compositeFigi: "BBG000B9XRY4",
          figi: "BBG000B9XRY4",
          securityType: "Common Stock",
          shareClassFigi: "BBG001S5N8V8",
          ticker: "AAPL",
        },
        {
          compositeFigi: "BBG000BDTBL9",
          figi: "BBG000BDTBL9",
          securityType: "ETF",
          ticker: "SMH",
        },
      ],
      otherListed: [
        {
          etf: false,
          exchange: "N",
          securityName: "Taiwan Semiconductor Manufacturing Company Ltd. ADR",
          symbol: "TSM",
          testIssue: false,
        },
      ],
      secTickers: [
        {
          cik: "0000320193",
          companyName: "Apple Inc.",
          ticker: "AAPL",
        },
        {
          cik: "0001046179",
          companyName: "Taiwan Semiconductor Manufacturing Co Ltd",
          ticker: "TSM",
        },
      ],
    });

    const aapl = build.records.find(
      (record) => record.canonicalTicker === "AAPL",
    );
    const smh = build.records.find(
      (record) => record.canonicalTicker === "SMH",
    );
    const tsm = build.records.find(
      (record) => record.canonicalTicker === "TSM",
    );

    expect(aapl).toMatchObject({
      cik: "0000320193",
      exchange: "NASDAQ",
      figi: "BBG000B9XRY4",
      securityType: "COMMON_STOCK",
      universeBucket: "US_COMMON_ALL",
    });
    expect(smh).toMatchObject({
      isEtf: true,
      securityType: "ETF",
      universeBucket: "US_ETF_ALL",
    });
    expect(tsm).toMatchObject({
      isAdr: true,
      securityType: "ADR",
      universeBucket: "US_ADR_ALL",
    });
    expect(
      build.records.some((record) => record.canonicalTicker === "ZZTEST"),
    ).toBe(false);
    expect(build.summary.skippedTestIssues).toBe(1);
    expect(build.summary.activeCommonStocks).toBe(1);
  });

  it("surfaces reconciliation warnings without blocking canonical rows", () => {
    const build = buildSecurityMaster({
      massiveTickers: [
        {
          active: false,
          cik: "0000000002",
          compositeFigi: "BBG_MASSIVE",
          locale: "ca",
          ticker: "AAPL",
          type: "ETF",
        },
      ],
      nasdaqListed: [
        {
          etf: false,
          marketCategory: "Q",
          securityName: "Apple Inc. - Common Stock",
          symbol: "AAPL",
          testIssue: false,
        },
      ],
      openFigiMappings: [
        {
          compositeFigi: "BBG_OPENFIGI",
          figi: "BBG_FIGI",
          securityType: "Common Stock",
          ticker: "AAPL",
        },
      ],
      secTickers: [
        {
          cik: "0000000001",
          companyName: "Apple Inc.",
          ticker: "AAPL",
        },
      ],
    });
    const warningCodes = new Set(build.warnings.map((item) => item.code));

    expect(warningCodes).toContain(SECURITY_MASTER_REASON_CODES.CIK_CONFLICT);
    expect(warningCodes).toContain(
      SECURITY_MASTER_REASON_CODES.ETF_FLAG_CONFLICT,
    );
    expect(warningCodes).toContain(
      SECURITY_MASTER_REASON_CODES.STATUS_CONFLICT,
    );
    expect(warningCodes).toContain(SECURITY_MASTER_REASON_CODES.FIGI_CONFLICT);
    expect(warningCodes).toContain(SECURITY_MASTER_REASON_CODES.NON_US_LOCALE);
    expect(build.records).toHaveLength(1);
  });
});
