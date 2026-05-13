import { describe, expect, it } from "vitest";

import {
  findSecRevenueFactTags,
  parseAlphaVantageListingCsv,
  parseBeaDatasets,
  parseBlsObservations,
  parseEiaDataPoints,
  parseEiaRoutes,
  parseFmpProfile,
  parseFmpRows,
  parseFredObservations,
  parseMassiveAggregateBars,
  parseMassiveTickers,
  parseNasdaqListedSymbols,
  parseOpenFigiMappings,
  parseOtherListedSymbols,
  parseSecCompanyFactsPayload,
  parseSecCompanySubmissions,
  parseSecCompanyTickers,
  parseUsaSpendingAwards,
} from "@/lib/providers/parsers";

describe("provider parsers", () => {
  it("parses SEC ticker maps and revenue-like tags", () => {
    const tickers = parseSecCompanyTickers({
      0: {
        cik_str: 320193,
        ticker: "AAPL",
        title: "Apple Inc.",
      },
    });

    expect(tickers).toEqual([
      {
        cik: "0000320193",
        companyName: "Apple Inc.",
        ticker: "AAPL",
      },
    ]);
    expect(
      findSecRevenueFactTags({
        facts: {
          "us-gaap": {
            RevenueFromContractWithCustomerExcludingAssessedTax: {},
          },
        },
      }),
    ).toContain("RevenueFromContractWithCustomerExcludingAssessedTax");

    expect(
      parseSecCompanyFactsPayload({
        cik: "0000320193",
        entityName: "Apple Inc.",
        facts: {
          "us-gaap": {
            RevenueFromContractWithCustomerExcludingAssessedTax: {
              units: {
                USD: [
                  {
                    end: "2026-03-31",
                    filed: "2026-04-30",
                    form: "10-Q",
                    fp: "Q2",
                    frame: "CY2026Q1",
                    fy: 2026,
                    start: "2026-01-01",
                    val: 123,
                  },
                ],
              },
            },
          },
        },
      }).facts,
    ).toEqual([
      expect.objectContaining({
        end: "2026-03-31",
        fiscalPeriod: "Q2",
        fiscalYear: 2026,
        tag: "RevenueFromContractWithCustomerExcludingAssessedTax",
        unit: "USD",
        value: 123,
      }),
    ]);

    expect(
      parseSecCompanySubmissions({
        filings: {
          recent: {
            accessionNumber: ["0000320193-26-000001"],
            filingDate: ["2026-04-30"],
            form: ["10-Q"],
            primaryDocument: ["aapl-20260331.htm"],
            reportDate: ["2026-03-31"],
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        accessionNumber: "0000320193-26-000001",
        filingDate: "2026-04-30",
        form: "10-Q",
        reportDate: "2026-03-31",
      }),
    ]);
  });

  it("parses Nasdaq pipe-delimited symbol files without the footer row", () => {
    const listed = parseNasdaqListedSymbols(
      [
        "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares",
        "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N",
        "File Creation Time: 0510202600:00|||||||",
      ].join("\n"),
    );
    const other = parseOtherListedSymbols(
      [
        "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol",
        "IBM|International Business Machines|N|IBM|N|100|N|IBM",
      ].join("\n"),
    );

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      etf: false,
      symbol: "AAPL",
      testIssue: false,
    });
    expect(other[0]).toMatchObject({
      exchange: "N",
      symbol: "IBM",
    });
  });

  it("parses Massive ticker and aggregate bar responses", () => {
    expect(
      parseMassiveTickers({
        results: [
          {
            active: true,
            composite_figi: "BBG000B9XRY4",
            market: "stocks",
            name: "Apple Inc.",
            ticker: "AAPL",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        active: true,
        compositeFigi: "BBG000B9XRY4",
        ticker: "AAPL",
      }),
    ]);
    expect(
      parseMassiveAggregateBars({
        results: [
          {
            c: 3,
            h: 4,
            l: 1,
            o: 2,
            t: Date.UTC(2026, 4, 8),
            v: 1000,
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        close: 3,
        date: "2026-05-08",
      }),
    ]);
  });

  it("parses OpenFIGI and FMP list responses", () => {
    expect(
      parseOpenFigiMappings([
        {
          data: [
            {
              compositeFIGI: "BBG000B9XRY4",
              exchCode: "US",
              figi: "BBG000B9XRY4",
              name: "Apple Inc.",
              ticker: "AAPL",
            },
          ],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        compositeFigi: "BBG000B9XRY4",
        figi: "BBG000B9XRY4",
        ticker: "AAPL",
      }),
    ]);
    expect(parseFmpRows([{ symbol: "AAPL", revenue: 1 }])).toEqual([
      expect.objectContaining({
        revenue: 1,
        symbol: "AAPL",
      }),
    ]);
    expect(
      parseFmpProfile([
        {
          companyName: "NVIDIA Corporation",
          description: "Supplier of GPUs and AI accelerators.",
          industry: "Semiconductors",
          marketCap: "123456",
          sector: "Technology",
          symbol: "nvda",
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        companyName: "NVIDIA Corporation",
        description: "Supplier of GPUs and AI accelerators.",
        industry: "Semiconductors",
        marketCap: 123456,
        sector: "Technology",
        symbol: "NVDA",
      }),
    ]);
  });

  it("parses Alpha Vantage CSV with quoted cells", () => {
    expect(
      parseAlphaVantageListingCsv(
        'symbol,name,exchange,assetType,ipoDate,delistingDate,status\nAAPL,"Apple, Inc.",NASDAQ,Stock,1980-12-12,null,Active',
      ),
    ).toEqual([
      expect.objectContaining({
        exchange: "NASDAQ",
        name: "Apple, Inc.",
        status: "Active",
        symbol: "AAPL",
      }),
    ]);
  });

  it("parses macro provider smoke responses", () => {
    expect(
      parseFredObservations(
        {
          observations: [
            {
              date: "2026-05-08",
              realtime_end: "2026-05-10",
              realtime_start: "2026-05-10",
              value: ".",
            },
          ],
        },
        "DGS10",
      ),
    ).toEqual([
      expect.objectContaining({
        seriesId: "DGS10",
        value: null,
      }),
    ]);
    expect(
      parseBeaDatasets({
        BEAAPI: {
          Results: {
            Dataset: [
              {
                DatasetDescription: "National income",
                DatasetName: "NIPA",
              },
            ],
          },
        },
      }),
    ).toEqual([
      expect.objectContaining({
        datasetName: "NIPA",
      }),
    ]);
    expect(
      parseBlsObservations({
        Results: {
          series: [
            {
              data: [
                {
                  period: "M01",
                  periodName: "January",
                  value: "300.1",
                  year: "2026",
                },
              ],
              seriesID: "CUUR0000SA0",
            },
          ],
        },
      }),
    ).toEqual([
      expect.objectContaining({
        seriesId: "CUUR0000SA0",
        value: 300.1,
      }),
    ]);
    expect(
      parseEiaRoutes({
        response: {
          routes: [
            {
              id: "electricity",
              name: "Electricity",
            },
          ],
        },
      }),
    ).toEqual([
      expect.objectContaining({
        id: "electricity",
      }),
    ]);
    expect(
      parseEiaDataPoints(
        {
          response: {
            data: [
              {
                period: "2026-02",
                sales: "125.4",
                "sales-units": "million kWh",
                sectorid: "ALL",
                stateid: "US",
              },
            ],
          },
        },
        "sales",
      ),
    ).toEqual([
      expect.objectContaining({
        metricName: "sales",
        period: "2026-02",
        region: "US",
        sector: "ALL",
        unit: "million kWh",
        value: 125.4,
      }),
    ]);
  });

  it("parses USAspending awards", () => {
    expect(
      parseUsaSpendingAwards({
        results: [
          {
            "Award Amount": 123,
            "Award ID": "A1",
            "Award Type": "A",
            "NAICS Code": "336411",
            "PSC Code": "1550",
            "Recipient DUNS": "123456789",
            "Recipient Name": "Example Recipient",
            "Recipient UEI": "UEI123456789",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        awardAmount: 123,
        awardId: "A1",
        naics: "336411",
        psc: "1550",
        recipientDuns: "123456789",
        recipientName: "Example Recipient",
        recipientUei: "UEI123456789",
      }),
    ]);
  });
});
