import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/api/health", async (_req, res) => {
  try {
    const { pool } = await import("./db");
    const result = await pool.query("SELECT NOW() as time, current_database() as db");
    const tableCheck = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
    res.status(200).json({
      status: "ok",
      timestamp: Date.now(),
      database: {
        connected: true,
        time: result.rows[0]?.time,
        name: result.rows[0]?.db,
        tables: tableCheck.rows.map((r: any) => r.tablename),
      },
      env: {
        nodeEnv: process.env.NODE_ENV,
        hasDbUrl: !!process.env.DATABASE_URL,
        hasNeonUrl: !!process.env.NEON_DATABASE_URL,
        hasSessionSecret: !!process.env.SESSION_SECRET,
        rlsEnabled: process.env.ENABLE_RLS !== "false",
      },
    });
  } catch (err: any) {
    res.status(200).json({
      status: "error",
      timestamp: Date.now(),
      database: { connected: false, error: err.message },
    });
  }
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    const { runMigrations } = await import("./migrate");
    await runMigrations();
  } catch (err: any) {
    console.error("Migration warning (non-fatal):", err.message);
  }

  try {
    const { seedDatabase } = await import("./seed");
    await seedDatabase();
  } catch (err: any) {
    console.error("Seed warning (non-fatal):", err.message);
  }

  try {
    const { storage } = await import("./storage");
    const merged = await storage.mergeDuplicateConversations();
    if (merged > 0) {
      console.log(`Merged ${merged} duplicate conversation(s)`);
    }
  } catch (err: any) {
    console.error("Merge warning (non-fatal):", err.message);
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
