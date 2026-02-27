import { pool } from "./db";
import fs from "fs";
import path from "path";

async function ensureRlsRole(client: any) {
  console.log("[migrate] Ensuring jawab_app role exists...");

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jawab_app') THEN
        CREATE ROLE jawab_app NOLOGIN;
      END IF;
    END
    $$;
  `);

  await client.query(`GRANT USAGE ON SCHEMA public TO jawab_app`);
  await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jawab_app`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jawab_app`);
  await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jawab_app`);
  await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO jawab_app`);

  console.log("[migrate] jawab_app role ready with permissions");
}

async function ensureRlsPolicies(client: any) {
  console.log("[migrate] Ensuring RLS policies...");

  const tablesResult = await client.query(`
    SELECT tablename FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('__drizzle_migrations')
  `);

  const tenantTables: string[] = [];
  for (const row of tablesResult.rows) {
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = 'tenant_id'
    `, [row.tablename]);
    if (colCheck.rows.length > 0) {
      tenantTables.push(row.tablename);
    }
  }

  for (const table of tenantTables) {
    await client.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`);

    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies WHERE tablename = '${table}' AND policyname = '${table}_tenant_isolation'
        ) THEN
          CREATE POLICY "${table}_tenant_isolation" ON "${table}"
            FOR ALL
            TO jawab_app
            USING (
              tenant_id::text = current_setting('app.current_tenant', true)
              OR current_setting('app.rls_bypass', true) = 'true'
            );
        END IF;
      END $$;
    `);
  }

  const tenantsRls = await client.query(`
    SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_self_access'
  `);
  if (tenantsRls.rows.length === 0) {
    const hasTenantId = tenantTables.includes('tenants');
    if (!hasTenantId) {
      await client.query(`ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY`);
      await client.query(`ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY`);
      await client.query(`
        CREATE POLICY "tenants_self_access" ON "tenants"
          FOR ALL
          TO jawab_app
          USING (
            id::text = current_setting('app.current_tenant', true)
            OR current_setting('app.rls_bypass', true) = 'true'
          );
      `);
    }
  }

  console.log(`[migrate] RLS policies applied to ${tenantTables.length} tables`);
}

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash TEXT NOT NULL UNIQUE,
        created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
      )
    `);

    const migrationsDir = path.resolve(
      process.cwd(),
      process.env.NODE_ENV === "production" ? path.join(__dirname, "..", "migrations") : "migrations"
    );

    let migrationsDirFinal = migrationsDir;
    if (!fs.existsSync(migrationsDirFinal)) {
      const alt1 = path.resolve(__dirname, "..", "migrations");
      const alt2 = path.resolve(process.cwd(), "migrations");
      const alt3 = path.resolve(__dirname, "migrations");
      for (const alt of [alt1, alt2, alt3]) {
        if (fs.existsSync(alt)) {
          migrationsDirFinal = alt;
          break;
        }
      }
    }

    if (!fs.existsSync(migrationsDirFinal)) {
      console.warn("[migrate] No migrations directory found, skipping migrations");
    } else {
      const files = fs.readdirSync(migrationsDirFinal)
        .filter(f => f.endsWith(".sql"))
        .sort();

      const applied = await client.query("SELECT hash FROM __drizzle_migrations");
      const appliedHashes = new Set(applied.rows.map((r: any) => r.hash));

      for (const file of files) {
        if (appliedHashes.has(file)) {
          continue;
        }

        const sql = fs.readFileSync(path.join(migrationsDirFinal, file), "utf-8");
        console.log(`[migrate] Applying migration: ${file}`);

        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO __drizzle_migrations (hash) VALUES ($1)", [file]);
          await client.query("COMMIT");
          console.log(`[migrate] Applied: ${file}`);
        } catch (err: any) {
          await client.query("ROLLBACK");
          if (err.message?.includes("already exists")) {
            console.log(`[migrate] Skipped (already exists): ${file}`);
            await client.query("INSERT INTO __drizzle_migrations (hash) VALUES ($1) ON CONFLICT DO NOTHING", [file]);
          } else {
            throw err;
          }
        }
      }

      console.log("[migrate] All migrations applied successfully");
    }

    await ensureRlsRole(client);
    await ensureRlsPolicies(client);

  } finally {
    client.release();
  }
}
