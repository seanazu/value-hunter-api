import "dotenv/config";
import express from "express";
import { fetchUndervaluedStocks } from "./services/fetchStocks.js";
import { scoreAndExplain } from "./services/aiScoring.js";
import { notifyDiscord } from "./services/notifyDiscord.js";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3002;

// Enable CORS for all origins
app.use(cors());

async function runBot(params = {}) {
  const stocks = await fetchUndervaluedStocks(params);
  const scored = await scoreAndExplain(stocks);

  const top3 = scored.sort((a, b) => b.score - a.score).slice(0, 3);
  await notifyDiscord(top3);
  return top3;
}

app.get("/run", async (req, res) => {
  try {
    // parse params as before...
    const {
      marketCapLowerThan,
      priceLowerThan,
      averageVolumeMoreThan,
      exchange,
      isActivelyTrading,
      isEtf,
      isFund,
      limit,
    } = req.query;

    const params = {
      marketCapLowerThan: Number(marketCapLowerThan),
      priceLowerThan: Number(priceLowerThan),
      averageVolumeMoreThan: Number(averageVolumeMoreThan),
      exchange: String(exchange),
      isActivelyTrading: isActivelyTrading === "true",
      isEtf: isEtf === "true",
      isFund: isFund === "true",
      limit: Number(limit) || 400, // default limit to 400 if not provided
    };

    const data = await runBot(params);
    res.json(data);
  } catch (err: any) {
    console.error("Error:", err.message);
    res.status(500).send("Internal Error");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
