import { runTick } from "./engine";
import { generateDailySummary } from "./summary";
import { isMarketHours, isMarketCloseTime } from "@/lib/utils";
import { logInfo } from "@/lib/logger";
import { writeFileSync } from "fs";
import { join } from "path";

const TICK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const STATUS_FILE = join(process.cwd(), "bot-status.json");

let summaryGeneratedToday = false;

function updateStatus(running: boolean) {
  const status = {
    running,
    lastCheck: new Date().toISOString(),
    nextCheck: running
      ? new Date(Date.now() + TICK_INTERVAL).toISOString()
      : null,
    pid: process.pid,
  };
  try {
    writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
  } catch {
    // ignore write errors
  }
}

async function tick() {
  const now = new Date();

  if (!isMarketHours(now)) {
    // Check if it's market close time for daily summary
    if (isMarketCloseTime(now) && !summaryGeneratedToday) {
      logInfo("Market closed — generating daily summary");
      await generateDailySummary();
      summaryGeneratedToday = true;
    }

    // Reset the summary flag at midnight
    if (now.getHours() === 0) {
      summaryGeneratedToday = false;
    }

    console.log(
      `[${now.toISOString()}] Outside market hours, skipping tick`
    );
    updateStatus(true);
    return;
  }

  summaryGeneratedToday = false; // Reset for next close
  updateStatus(true);
  await runTick();
  updateStatus(true);
}

async function main() {
  console.log("🎡 Wheel Strategy Bot starting...");
  console.log(`   Tick interval: ${TICK_INTERVAL / 1000}s (15 minutes)`);
  console.log(`   Market hours: 9:30 AM - 4:00 PM ET`);
  console.log(`   PID: ${process.pid}`);
  console.log("");

  await logInfo("Bot started");
  updateStatus(true);

  // Run immediately on start
  await tick();

  // Then run every 15 minutes
  setInterval(tick, TICK_INTERVAL);
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Bot shutting down...");
  updateStatus(false);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n🛑 Bot shutting down...");
  updateStatus(false);
  process.exit(0);
});

main().catch((err) => {
  console.error("Fatal error:", err);
  updateStatus(false);
  process.exit(1);
});
