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

async function ensureSchemaColumns(client: any) {
  console.log("[migrate] Ensuring schema columns and tables...");

  try {
    await client.query("RESET ROLE");
  } catch (_e) {}

  const addColumnIfNotExists = async (table: string, column: string, definition: string) => {
    const check = await client.query(`
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    `, [table, column]);
    if (check.rows.length === 0) {
      try {
        await client.query(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${definition}`);
        console.log(`[migrate] Added column ${table}.${column}`);
      } catch (e: any) {
        console.warn(`[migrate] Could not add ${table}.${column}: ${e.message}`);
      }
    }
  };

  await addColumnIfNotExists("tenants", "daily_send_limit", "INTEGER DEFAULT 250");
  await addColumnIfNotExists("tenants", "warmup_days_remaining", "INTEGER DEFAULT 14");
  await addColumnIfNotExists("tenants", "warmup_started_at", "TIMESTAMP");
  await addColumnIfNotExists("tenants", "first_campaign_approved", "BOOLEAN DEFAULT false");

  await addColumnIfNotExists("contacts", "opt_in_status", "BOOLEAN DEFAULT false");
  await addColumnIfNotExists("contacts", "opt_in_source", "VARCHAR(30)");
  await addColumnIfNotExists("contacts", "opt_in_timestamp", "TIMESTAMP");
  await addColumnIfNotExists("contacts", "opt_in_ip", "VARCHAR(45)");
  await addColumnIfNotExists("contacts", "unsubscribed", "BOOLEAN DEFAULT false");
  await addColumnIfNotExists("contacts", "unsubscribe_timestamp", "TIMESTAMP");
  await addColumnIfNotExists("contacts", "tags", "TEXT[] DEFAULT '{}'");
  await addColumnIfNotExists("contacts", "sentiment", "VARCHAR(20) DEFAULT 'neutral'");
  await addColumnIfNotExists("contacts", "total_conversations", "INTEGER DEFAULT 0");

  await addColumnIfNotExists("campaigns", "template_name", "VARCHAR(255)");
  await addColumnIfNotExists("campaigns", "target_tags", "TEXT[] DEFAULT '{}'");
  await addColumnIfNotExists("campaigns", "target_contact_ids", "TEXT[] DEFAULT '{}'");

  await addColumnIfNotExists("conversations", "assignment_status", "VARCHAR(30)");
  await addColumnIfNotExists("conversations", "ai_failed_attempts", "INTEGER DEFAULT 0");
  await addColumnIfNotExists("conversations", "delay_alerted", "BOOLEAN DEFAULT false");
  await addColumnIfNotExists("conversations", "booking_type", "VARCHAR(20)");
  await addColumnIfNotExists("conversations", "booking_data", "JSONB");
  await addColumnIfNotExists("conversations", "payment_status", "VARCHAR(30)");
  await addColumnIfNotExists("conversations", "receipt_url", "TEXT");
  await addColumnIfNotExists("conversations", "receipt_analysis", "JSONB");
  await addColumnIfNotExists("conversations", "booking_amount", "NUMERIC");
  await addColumnIfNotExists("conversations", "payment_confirmed_at", "TIMESTAMP");
  await addColumnIfNotExists("conversations", "payment_confirmed_by", "UUID REFERENCES users(id)");

  await addColumnIfNotExists("tenants", "business_industry", "VARCHAR(100)");

  const mlCheck = await client.query(`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'message_logs'
  `);
  if (mlCheck.rows.length === 0) {
    await client.query(`
      CREATE TABLE message_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        contact_id UUID REFERENCES contacts(id),
        conversation_id UUID REFERENCES conversations(id),
        template_name VARCHAR(255),
        message_type VARCHAR(30) NOT NULL,
        direction VARCHAR(10) NOT NULL DEFAULT 'outbound',
        channel VARCHAR(20) DEFAULT 'whatsapp',
        delivered BOOLEAN DEFAULT false,
        read BOOLEAN DEFAULT false,
        failed BOOLEAN DEFAULT false,
        error_reason TEXT,
        twilio_sid VARCHAR(100),
        sent_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS message_logs_tenant_idx ON message_logs(tenant_id, sent_at)");
    await client.query("CREATE INDEX IF NOT EXISTS message_logs_contact_idx ON message_logs(contact_id)");
    console.log("[migrate] Created message_logs table");
  }

  const aiCtxCheck = await client.query(`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ai_conversation_context'
  `);
  if (aiCtxCheck.rows.length === 0) {
    await client.query(`
      CREATE TABLE ai_conversation_context (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'active',
        context JSONB,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS ai_conv_ctx_conversation_idx ON ai_conversation_context(conversation_id)");
    await client.query("CREATE INDEX IF NOT EXISTS ai_conv_ctx_tenant_idx ON ai_conversation_context(tenant_id)");
    console.log("[migrate] Created ai_conversation_context table");
  }

  const aiPayCheck = await client.query(`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ai_payments'
  `);
  if (aiPayCheck.rows.length === 0) {
    await client.query(`
      CREATE TABLE ai_payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES conversations(id),
        customer_phone TEXT,
        image_url TEXT,
        amount DECIMAL(10,2),
        currency TEXT DEFAULT 'SAR',
        vision_data JSONB,
        status TEXT DEFAULT 'pending',
        reviewed_by TEXT,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS ai_payments_tenant_idx ON ai_payments(tenant_id)");
    await client.query("CREATE INDEX IF NOT EXISTS ai_payments_status_idx ON ai_payments(tenant_id, status)");
    console.log("[migrate] Created ai_payments table");
  }

  const aiSlaCheck = await client.query(`
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ai_sla_alerts'
  `);
  if (aiSlaCheck.rows.length === 0) {
    await client.query(`
      CREATE TABLE ai_sla_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        payment_id UUID REFERENCES ai_payments(id),
        type TEXT,
        sent_at TIMESTAMP DEFAULT NOW(),
        resolved BOOLEAN DEFAULT false
      )
    `);
    await client.query("CREATE INDEX IF NOT EXISTS ai_sla_alerts_tenant_idx ON ai_sla_alerts(tenant_id)");
    console.log("[migrate] Created ai_sla_alerts table");
  }

  console.log("[migrate] Schema columns verified");
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

    await ensureSchemaColumns(client);
    await ensureRlsRole(client);
    await ensureRlsPolicies(client);

  } finally {
    client.release();
  }
}
