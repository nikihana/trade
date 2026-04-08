import { toZonedTime } from "date-fns-tz";

const ET_TIMEZONE = "America/New_York";

export function isMarketHours(now: Date = new Date()): boolean {
  const et = toZonedTime(now, ET_TIMEZONE);
  const day = et.getDay();
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // Weekdays only (Mon=1, Fri=5)
  if (day === 0 || day === 6) return false;

  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = 9 * 60 + 30; // 570
  const marketClose = 16 * 60; // 960

  return timeInMinutes >= marketOpen && timeInMinutes < marketClose;
}

export function isMarketCloseTime(now: Date = new Date()): boolean {
  const et = toZonedTime(now, ET_TIMEZONE);
  const hours = et.getHours();
  const minutes = et.getMinutes();
  return hours === 16 && minutes >= 0 && minutes < 15;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
