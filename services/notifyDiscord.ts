import axios from "axios";
import { ScoredStock } from "./aiScoring.js";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
  throw new Error(
    "🚨 Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_ID in environment variables."
  );
}

export async function notifyDiscord(topStocks: ScoredStock[]): Promise<void> {
  if (!Array.isArray(topStocks) || topStocks.length === 0) {
    console.warn("⚠️ No stocks to notify.");
    return;
  }

  const content = topStocks
    .map(
      (s, i) =>
        `**${i + 1}. ${s.symbol}** — Score: **${s.score.toFixed(2)}**\n*${
          s.explanation
        }*`
    )
    .join("\n\n");

  const payload = {
    content: `📈 **Top ${topStocks.length} Undervalued Stocks Today**\n\n${content}`,
  };

  try {
    const response = await axios.post(
      `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.status !== 200 && response.status !== 201) {
      console.warn("⚠️ Unexpected Discord API status:", response.status);
    } else {
      console.log("✅ Message sent to Discord successfully.");
    }
  } catch (error: any) {
    console.error("❌ Failed to send Discord message:", error.message);
    throw error;
  }
}
