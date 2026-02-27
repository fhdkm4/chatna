import { pool } from "./db";
import fs from "fs";
import path from "path";

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
      return;
    }

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
  } finally {
    client.release();
  }
}
