import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("NEON_DATABASE_URL or DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: dbUrl,
  max: 10,
});

export const db = drizzle(pool, { schema });
