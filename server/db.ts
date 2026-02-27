import { Pool, PoolClient } from "pg";
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

const rlsEnabled = process.env.ENABLE_RLS !== "false";

pool.on("connect", (client: PoolClient) => {
  if (rlsEnabled) {
    client.query("SET ROLE jawab_app; SELECT set_config('app.rls_bypass', 'true', false)").catch((err) => {
      console.warn("[RLS] Could not set jawab_app role. RLS will be skipped. Error:", err.message);
    });
  }
});

const originalPoolQuery = pool.query.bind(pool);
const originalPoolConnect = pool.connect.bind(pool);

(pool as any).query = async function (config: any, values?: any, callback?: any) {
  const tenantId = tenantStore.getStore();
  if (tenantId && rlsEnabled) {
    const client: PoolClient = await originalPoolConnect();
    try {
      await client.query(
        "SELECT set_config('app.current_tenant', $1, false), set_config('app.rls_bypass', '', false)",
        [tenantId]
      );
      const result = await client.query(config, values);
      return result;
    } finally {
      await client.query(
        "SELECT set_config('app.rls_bypass', 'true', false), set_config('app.current_tenant', '', false)"
      ).catch(() => {});
      client.release();
    }
  }
  return originalPoolQuery(config, values, callback);
};

export const db = drizzle(pool, { schema });
