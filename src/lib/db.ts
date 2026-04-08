import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

// Helper to generate cuid-like IDs
export function genId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 25);
}
