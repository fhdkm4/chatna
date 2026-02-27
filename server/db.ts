import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { AsyncLocalStorage } from "async_hooks";
import * as schema from "@shared/schema";

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL is required");
}

export const tenantStore = new AsyncLocalStorage<string>();

const needsSsl = dbUrl.includes("neon.tech") || dbUrl.includes("supabase") || dbUrl.includes("sslmode=require") || process.env.DB_SSL === "true";

export const pool = new Pool({
  connectionString: dbUrl,
  max: 10,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

export const db = drizzle(pool, { schema });
