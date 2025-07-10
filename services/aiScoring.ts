import { OpenAI } from "openai";
import { Stock } from "./fetchStocks.js";

export interface ScoredStock {
  symbol: string;
  score: number;
  explanation: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function scoreAndExplain(stocks: Stock[]): Promise<ScoredStock[]> {
  const prompt = `
You are a financial analyst AI.

Given a list of stocks and their financial metrics:
- P/E (Price to Earnings)
- P/B (Price to Book)
- RSI (Relative Strength Index)
- Debt to Equity
- EPS
- EBITDA Margin
- Net Margin
- SG&A to Revenue Ratio
- Analyst Coverage
- Current Price vs Target Price

Score each stock from **1 to 10** for **upside potential** (10 = high upside).
Then provide a brief explanation (1–2 sentences) in simple English about **why the stock may be undervalued or attractive**.

Return **only the top 3 stocks with the highest upside potential**, sorted from highest to lowest score.

Use the following JSON format in your response:

\`\`\`json
[
  {
    "symbol": "XYZ",
    "score": 8.5,
    "explanation": "Strong upside based on undervalued P/E and increasing EPS."
  }
]
\`\`\`

Here are the stocks:

${JSON.stringify(stocks, null, 2)}
`;

  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
  });

  const content = res.choices[0].message?.content;

  if (!content) {
    throw new Error("❌ No content received from OpenAI.");
  }

  try {
    const jsonMatch = content.match(/\[\s*{[\s\S]*?}\s*]/);
    if (!jsonMatch) {
      throw new Error("❌ Could not find a valid JSON array in the response.");
    }

    const parsed = JSON.parse(jsonMatch[0]) as ScoredStock[];

    return parsed;
  } catch (err) {
    console.error("❌ Failed to parse OpenAI response:", err);
    console.error("📦 Raw content was:", content);
    throw err;
  }
}
