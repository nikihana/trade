import { sql, genId } from "./db";
import { LogLevel } from "./types";

export async function log(
  level: LogLevel,
  message: string,
  ticker?: string,
  data?: Record<string, unknown>
) {
  const timestamp = new Date();
  const prefix = ticker ? `[${ticker}]` : "";
  console.log(`${timestamp.toISOString()} [${level}] ${prefix} ${message}`);

  await sql`
    INSERT INTO "TradeLog" (id, timestamp, level, message, ticker, data)
    VALUES (${genId()}, ${timestamp}, ${level}, ${message}, ${ticker || null}, ${data ? JSON.stringify(data) : null})
  `;
}

export const logInfo = (msg: string, ticker?: string, data?: Record<string, unknown>) =>
  log(LogLevel.INFO, msg, ticker, data);

export const logWarn = (msg: string, ticker?: string, data?: Record<string, unknown>) =>
  log(LogLevel.WARN, msg, ticker, data);

export const logError = (msg: string, ticker?: string, data?: Record<string, unknown>) =>
  log(LogLevel.ERROR, msg, ticker, data);

export const logTrade = (msg: string, ticker?: string, data?: Record<string, unknown>) =>
  log(LogLevel.TRADE, msg, ticker, data);
