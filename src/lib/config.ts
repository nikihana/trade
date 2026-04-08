import { sql } from "./db";

export interface ConfigRow {
  key: string;
  value: string;
  label: string;
  description: string | null;
  type: string;
}

export async function getAllConfig(): Promise<ConfigRow[]> {
  const rows = await sql`SELECT * FROM "Config" ORDER BY key`;
  return rows as ConfigRow[];
}

export async function getConfig(key: string): Promise<string | null> {
  const rows = await sql`SELECT value FROM "Config" WHERE key = ${key}`;
  return rows[0]?.value ?? null;
}

export async function getConfigNum(key: string, fallback: number): Promise<number> {
  const val = await getConfig(key);
  return val !== null ? parseFloat(val) : fallback;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await sql`UPDATE "Config" SET value = ${value} WHERE key = ${key}`;
}
