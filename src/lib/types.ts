// Wheel cycle stages
export enum WheelStage {
  SELLING_PUTS = "SELLING_PUTS",
  HOLDING_SHARES = "HOLDING_SHARES",
  SELLING_CALLS = "SELLING_CALLS",
}

// Contract types
export enum ContractType {
  PUT = "PUT",
  CALL = "CALL",
}

// Contract actions
export enum ContractAction {
  SELL_TO_OPEN = "SELL_TO_OPEN",
  BUY_TO_CLOSE = "BUY_TO_CLOSE",
}

// Contract statuses
export enum ContractStatus {
  PENDING = "PENDING",
  OPEN = "OPEN",
  CLOSED = "CLOSED",
  ASSIGNED = "ASSIGNED",
  EXPIRED = "EXPIRED",
}

// Close reasons
export enum CloseReason {
  PROFIT_TARGET = "PROFIT_TARGET",
  EXPIRATION = "EXPIRATION",
  ASSIGNMENT = "ASSIGNMENT",
  MANUAL = "MANUAL",
}

// Log levels
export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  TRADE = "TRADE",
}

// Alpaca account info
export interface AlpacaAccount {
  id: string;
  cash: number;
  buyingPower: number;
  equity: number;
  portfolioValue: number;
}

// Alpaca position
export interface AlpacaPosition {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPL: number;
}

// Option contract from Alpaca
export interface AlpacaOptionContract {
  id: string;
  symbol: string;
  name: string;
  type: "call" | "put";
  strikePrice: number;
  expirationDate: string;
  openInterest: number;
  status: string;
}

// Quote
export interface AlpacaQuote {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
}

// Bot status
export interface BotStatus {
  running: boolean;
  lastCheck: string | null;
  nextCheck: string | null;
  activeTickers: number;
}
