import axios from "axios";

type StockInsights = {
  period: string;
  eps: number;
  ebitdaMargin: number;
  netMargin: number;
  sgaToRevenueRatio: number;
  analystCount: number;
  summary: string;
};

// Extend StockInsights to include additional properties
export interface Stock extends StockInsights {
  symbol: string;
  companyName: string;
  price: number;
  pe: number;
  pb: number;
  targetPrice?: number | null; // Optional, can be null if not available
  rsi: number;
  debtToEquity: number;
}

type ScreenerOptions = {
  marketCapLowerThan?: number;
  priceLowerThan?: number;
  averageVolumeMoreThan?: number;
  exchange?: string;
  isActivelyTrading?: boolean;
  isEtf?: boolean;
  isFund?: boolean;
  limit?: number;
};

type RawStockData = {
  symbol: string;
  date: string;
  revenueAvg: number;
  ebitdaAvg: number;
  netIncomeAvg: number;
  sgaExpenseAvg: number;
  epsAvg: number;
  numAnalystsRevenue: number;
  numAnalystsEps: number;
};

function extractKeyInsights(data: RawStockData): StockInsights {
  const {
    date,
    revenueAvg,
    ebitdaAvg,
    netIncomeAvg,
    sgaExpenseAvg,
    epsAvg,
    numAnalystsRevenue,
    numAnalystsEps,
  } = data;

  const ebitdaMargin = +(ebitdaAvg / revenueAvg).toFixed(4);
  const netMargin = +(netIncomeAvg / revenueAvg).toFixed(4);
  const sgaToRevenueRatio = +(sgaExpenseAvg / revenueAvg).toFixed(4);
  const analystCount = Math.max(numAnalystsRevenue, numAnalystsEps);

  return {
    period: date,
    eps: +epsAvg.toFixed(2),
    ebitdaMargin,
    netMargin,
    sgaToRevenueRatio,
    analystCount,
    summary: `EPS: $${epsAvg.toFixed(2)}, EBITDA Margin: ${(
      ebitdaMargin * 100
    ).toFixed(1)}%, Net Margin: ${(netMargin * 100).toFixed(1)}%, SG&A: ${(
      sgaToRevenueRatio * 100
    ).toFixed(1)}%, Analysts: ${analystCount}`,
  };
}

const FMP_API_KEY = process.env.FMP_API_KEY;

if (!FMP_API_KEY) {
  throw new Error("🚨 Missing FMP_API_KEY in environment variables.");
}

// 🔁 Get fundamentals per symbol
async function getMetrics(symbol: string): Promise<Partial<Stock>> {
  try {
    const { data } = await axios.get(
      `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${FMP_API_KEY}`
    );
    const metrics = data[0];
    if (!metrics) return {};

    return {
      pe: metrics.peRatioTTM,
      pb: metrics.pbRatioTTM,
      debtToEquity: metrics.debtToEquityTTM,
    };
  } catch (err) {
    console.error(
      `❌ Error fetching metrics for ${symbol}:`,
      (err as Error).message
    );
    return {};
  }
}

// TODO: Fetch RSI from Alpha Vantage or another provider
async function getRsi(_symbol: string): Promise<number | null> {
  return null;
}

// 🔁 Get analyst sentiment from analyst-estimates endpoint
async function getAnalystSentiment(
  symbol: string
): Promise<StockInsights | false> {
  try {
    const url = `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&period=annual&page=0&limit=10&apikey=${FMP_API_KEY}`;
    const { data }: { data: RawStockData[] } = await axios.get(url);

    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`⚠️ No analyst estimates data for ${symbol}`);
      return false;
    }

    // Take the most recent analyst estimate (first in array)
    const latestEstimate = data[0];

    const epsAvg = latestEstimate.epsAvg;
    const numAnalystsEps = latestEstimate.numAnalystsEps;

    if (typeof epsAvg !== "number" || typeof numAnalystsEps !== "number") {
      console.warn(`⚠️ Missing EPS average or analyst count for ${symbol}`);
      return false;
    }

    return extractKeyInsights(latestEstimate);
  } catch (err) {
    console.warn(
      `❌ Failed to get analyst sentiment for ${symbol}:`,
      (err as Error).message
    );
    return false;
  }
}

// 🔁 Get target price from price-target-summary endpoint
async function getTargetPrice(symbol: string): Promise<number | null> {
  try {
    const { data } = await axios.get(
      `https://financialmodelingprep.com/stable/price-target-summary?symbol=${symbol}&apikey=${FMP_API_KEY}`
    );

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const summary = data[0];
    const targetPrice =
      summary.allTimeAvgPriceTarget && summary.allTimeAvgPriceTarget > 0
        ? summary.allTimeAvgPriceTarget
        : null;

    return targetPrice;
  } catch (err) {
    console.warn(
      `⚠️ Target price fetch failed for ${symbol}:`,
      (err as Error).message
    );
    return null;
  }
}

function buildQueryParams(params: ScreenerOptions): string {
  const defaultParams: ScreenerOptions = {
    isActivelyTrading: true,
    limit: 400,
    exchange: "NASDAQ",
  };

  const finalParams = { ...defaultParams, ...params };

  return Object.entries(finalParams)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function fetchUndervaluedStocks(
  screenerOptions: ScreenerOptions = {}
): Promise<Stock[]> {
  const query = buildQueryParams(screenerOptions);
  const screenerUrl = `https://financialmodelingprep.com/stable/company-screener?${query}&apikey=${FMP_API_KEY}`;

  try {
    const { data } = await axios.get(screenerUrl);

    const filtered = data.filter((s: any) => !s.isEtf && !s.isFund);
    const enriched: Stock[] = [];

    for (const stock of filtered) {
      const { symbol, companyName, price } = stock;

      // Step 1: Get target price first (cheap disqualifier)
      const targetPrice = await getTargetPrice(symbol);
      if (!targetPrice || targetPrice / price <= 1.5) continue;

      // Step 2: Check analyst sentiment
      const analystSentiment = await getAnalystSentiment(symbol);
      if (!analystSentiment) continue;

      // Step 3: Get fundamentals
      const metrics = await getMetrics(symbol);
      if (
        typeof metrics.pe !== "number" ||
        typeof metrics.pb !== "number" ||
        typeof metrics.debtToEquity !== "number"
      ) {
        continue;
      }

      // Step 4: RSI (optional)
      const rsi = await getRsi(symbol);

      enriched.push({
        symbol,
        companyName,
        price,
        targetPrice: targetPrice,
        pe: metrics.pe,
        pb: metrics.pb,
        rsi: rsi ?? 50,
        debtToEquity: metrics.debtToEquity,
        ...analystSentiment,
      });
    }

    return enriched;
  } catch (err) {
    console.error(
      "❌ Failed to fetch undervalued stocks:",
      (err as Error).message
    );
    throw err;
  }
}
