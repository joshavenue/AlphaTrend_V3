import { describe, expect, it } from "vitest";

import {
  findSecRevenueFactTags,
  parseAlphaVantageListingCsv,
  parseBeaDatasets,
  parseBlsObservations,
  parseEiaRoutes,
  parseFmpProfile,
  parseFmpRows,
  parseFredObservations,
  parseMassiveAggregateBars,
  parseMassiveTickers,
  parseNasdaqListedSymbols,
  parseOpenFigiMappings,
  parseOtherListedSymbols,
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
  });

  it("parses USAspending awards", () => {
    expect(
      parseUsaSpendingAwards({
        results: [
          {
            "Award Amount": 123,
            "Award ID": "A1",
            "Award Type": "A",
            "Recipient Name": "Example Recipient",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        awardAmount: 123,
        awardId: "A1",
        recipientName: "Example Recipient",
      }),
    ]);
  });
});
