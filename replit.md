# Chatna - WhatsApp AI Customer Service SaaS

## Overview

Chatna is a multi-tenant WhatsApp AI customer service SaaS platform (rebranded from Jawab). It enables businesses to manage WhatsApp customer conversations through a web dashboard, with AI-powered auto-responses using Anthropic Claude, agent assignment, knowledge base management, quick replies, and analytics. The platform is designed with Arabic (RTL) as the primary language and uses a dark-themed UI.

### Logo
- PNG logo at `client/public/chatna-logo.png` — transparent background, green speech bubble + "CHATNA" text
- Wrapper component at `client/src/components/chatna-logo.tsx` renders the PNG
- Used across: landing page navbar, auth page, setup wizard, accept invitation, sidebar
- Extracted logo green: `#6EC047` → CSS variables `--primary-green` and `--primary-green-dark` (`#5BAA38`)
- All theme `--primary` HSL values updated to `99 53% 52%` to match logo color

The app follows a monorepo structure with a React frontend (`client/`), Express backend (`server/`), and shared schema definitions (`shared/`). The frontend communicates with the backend via REST APIs and Socket.io for real-time messaging.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Directory Structure
- `client/` — React SPA (Vite-based)
- `server/` — Express API server
- `shared/` — Shared TypeScript types and Drizzle schema
- `migrations/` — Drizzle-generated database migrations
- `script/` — Build tooling (esbuild + Vite)
- `attached_assets/` — Reference documents and specs

### Frontend Architecture
- **Framework**: React with TypeScript, bundled by Vite
- **Routing**: `wouter` (lightweight client-side router)
- **State Management**: `zustand` for auth state, `@tanstack/react-query` for server state
- **UI Components**: shadcn/ui (new-york style) with Radix UI primitives, Tailwind CSS, and `class-variance-authority`
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support), IBM Plex Sans Arabic font
- **RTL Support**: The HTML root is set to `dir="rtl"` and `lang="ar"`
- **Real-time**: Socket.io client for live message updates
- **Key Pages**: Login/Register (`/login`), Dashboard (`/`) with views for chat, contacts, AI knowledge base, AI settings, company identity, analytics, and settings; Accept Invitation (`/accept-invitation`); Setup Wizard (`/wizard`)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js with TypeScript, run via `tsx` in dev
- **Authentication**: JWT-based (bcryptjs for password hashing, jsonwebtoken for tokens). No session-based auth — tokens are stored client-side in localStorage
- **API Pattern**: RESTful endpoints under `/api/` prefix. Auth middleware validates JWT Bearer tokens
- **Real-time**: Socket.io integrated with the HTTP server for pushing new messages to connected clients
- **AI Service** (`server/services/ai.ts`): Uses Anthropic Claude API (via `@anthropic-ai/sdk`) for generating customer service responses. Supports auto-replies (keyword/exact/pattern matching) and AI-generated responses with knowledge base context
- **Prompt Builder** (`server/services/prompt-builder.ts`): Layered system prompt builder for AI responses. Builds prompts in 7 layers: BASE_SYSTEM, TENANT_IDENTITY, STYLE_LAYER, BUSINESS_INFO, STRICT_RULES, KNOWLEDGE_BASE, CONVERSATION_CONTEXT. Enforces tenant-specific identity, tone, language preference, and escalation messages. Reusable for both live responses and future preview features
- **WhatsApp Integration** (`server/services/twilio.ts`): Twilio API for sending/receiving WhatsApp messages. Gracefully degrades when credentials aren't configured. Migration to Meta Cloud API in progress with webhook endpoint at `/webhook`
- **Encryption Service** (`server/services/encryption.ts`): AES-256-GCM encryption for Meta access tokens using PBKDF2 key derivation
- **Typing Delay** (`server/services/typing-delay.ts`): Human-like typing delay (800ms-4000ms) before sending AI/auto-reply messages
- **Database Seeding** (`server/seed.ts`): Seeds initial tenant, admin user, agent user, and sample contacts on first run
- **Build**: Production build uses esbuild for server (outputs `dist/index.cjs`) and Vite for client (outputs `dist/public/`). The build script bundles selected dependencies to reduce cold start times

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`)
- **Schema** (`shared/schema.ts`): Defined with Drizzle's `pgTable` helpers. Uses `drizzle-zod` for validation schema generation
- **Key Tables**:
  - `tenants` — Multi-tenant organizations with plan, AI settings, Twilio config, Meta Cloud API encrypted tokens, quality rating, assignmentMode (round_robin/least_busy/manual), maxOpenConversationsPerUser (default 5)
  - `users` — Agents/admins/managers belonging to a tenant (email/password auth, roles: admin, manager, agent, maxConcurrentChats, isActive for enable/disable, jobTitle VARCHAR(120), avatarUrl TEXT, updatedAt TIMESTAMPTZ auto-updated)
  - `invitations` — Email-based team invitations with token, role, expiration
  - `contacts` — Customer contacts per tenant (unique by tenant+phone), with WhatsApp Business opt-in compliance fields (optInStatus, optInSource, optInTimestamp, optInIp, unsubscribed, unsubscribeTimestamp)
  - `conversations` — Chat sessions between contacts and tenants, with status tracking, agent assignment, assignmentStatus (ai_handling/waiting_human/assigned/closed), and aiFailedAttempts counter
  - `messages` — Individual messages in conversations (supports sender types: customer, agent, ai, system)
  - `autoReplies` — Rule-based automatic responses (keyword, exact, pattern triggers)
  - `aiKnowledge` — Knowledge base entries for AI context
  - `quickReplies` — Pre-written response templates for agents
  - `internalMessages` — 1-to-1 private messages between team members within same tenant (completely separate from customer conversations)
  - `agentMetrics` — Daily agent performance metrics (totalConversations, resolvedConversations, avgResponseTimeSeconds, totalMessages)
  - `activityLog` — System activity audit trail (transfers, assignments, resolutions)
  - `campaigns` — Marketing campaigns with targeting (all/tags/specific contacts), AI-generated content, scheduling, delivery tracking, and templateName for WhatsApp Business compliance
  - `campaignLogs` — Per-contact delivery logs for each campaign (status, error, sentAt)
  - `products` — Product catalog entries with name, description, price, currency, category, image, and WhatsApp sharing
  - `conversationAssignmentsLog` — Assignment change tracking log (conversationId, previousAssignee, newAssignee, assignedBy, createdAt)
- **Schema push**: Use `npm run db:push` (runs `drizzle-kit push`) to sync schema to database
- **Storage layer** (`server/storage.ts`): Repository pattern interface (`IStorage`) abstracting all database operations

### Multi-Tenancy & Security
- **Application-level tenant isolation**: All ORM queries enforce tenant scoping
- All tables have `tenant_id` with NOT NULL constraints, indexes, and FK references to `tenants(id)`
- All storage methods (get/update/delete) enforce `and(eq(table.id, id), eq(table.tenantId, tenantId))` pattern
- All route handlers pass `req.user.tenantId` to storage methods; PATCH endpoints verify tenant ownership before updates
- Global Express middleware strips `tenantId`/`tenant_id` from POST/PATCH/PUT request bodies to prevent client injection
- `AsyncLocalStorage` in `server/db.ts` tracks tenant context per-request; auth middleware wraps handlers with `tenantStore.run(tenantId, () => next())`
- **Row-Level Security (RLS)**: Auto-provisioned via `server/migrate.ts` at startup
  - `jawab_app` role created automatically with `NOLOGIN` + `GRANT SELECT/INSERT/UPDATE/DELETE` on all public tables
  - RLS enabled and forced on all tables with `tenant_id` column (16 tables)
  - Tenant isolation policy: `tenant_id = current_setting('app.current_tenant')` OR bypass via `app.rls_bypass = 'true'`
  - `setRlsReady(true)` called after migrations succeed — connections use default role until then
  - Pool `on("connect")` sets `SET ROLE jawab_app` + bypass mode; authenticated queries switch to tenant-scoped mode
- Users belong to a single tenant; contacts, conversations, and all data are scoped per tenant

### Authentication Flow
1. User registers or logs in via `/api/auth/login` or `/api/auth/register`
2. Server returns JWT token + user info
3. Client stores in localStorage (`jawab_auth` key) via zustand store
4. All subsequent API requests include `Authorization: Bearer <token>` header
5. 401 responses trigger automatic logout and redirect to `/login`

## External Dependencies

### Required Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required)
- `ANTHROPIC_API_KEY` or `AI_INTEGRATIONS_ANTHROPIC_API_KEY` — Anthropic Claude API key (the code uses `AI_INTEGRATIONS_ANTHROPIC_API_KEY`)
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` — Custom base URL for Anthropic API (used for Replit AI integrations proxy)
- `JWT_SECRET` — Secret key for JWT token signing
- `SESSION_SECRET` — Used for token encryption fallback (required for AES-256-GCM encryption)
- `TWILIO_ACCOUNT_SID` — Twilio account SID (optional, WhatsApp disabled without it)
- `TWILIO_AUTH_TOKEN` — Twilio auth token (optional)
- `TWILIO_WHATSAPP_NUMBER` — Twilio WhatsApp sender number (defaults to sandbox number)
- `META_WEBHOOK_VERIFY_TOKEN` — Verify token for Meta webhook validation (required for Meta Cloud API)
- `META_APP_SECRET` — Meta App Secret for webhook signature validation (optional but recommended)
- `TOKEN_ENCRYPTION_KEY` — Encryption key for Meta access tokens (falls back to SESSION_SECRET)

### Third-Party Services
- **Anthropic Claude API**: AI-powered customer service responses (claude-sonnet-4-20250514 model)
- **Twilio**: WhatsApp Business API for sending/receiving messages
- **PostgreSQL**: Primary data store (provisioned via Replit or Neon.tech)

### Key NPM Packages
- `drizzle-orm` + `drizzle-kit` — ORM and migration tooling
- `socket.io` — Real-time bidirectional communication
- `twilio` — WhatsApp messaging SDK
- `@anthropic-ai/sdk` — Anthropic Claude AI SDK
- `jsonwebtoken` + `bcryptjs` — Authentication
- `zod` + `drizzle-zod` — Schema validation
- `wouter` — Client-side routing
- `zustand` — Client state management
- `date-fns` — Date formatting (with Arabic locale support)
- `react-icons` — Icon library (WhatsApp icon)

### WhatsApp Business Compliance
- **Opt-in System**: Contacts must have `optInStatus = true` and `unsubscribed = false` to receive campaign messages
- **Opt-in Sources**: `website`, `in_store`, `whatsapp`, `api`, `dashboard`
- **Unsubscribe**: Customers can send "إلغاء" or "stop" via WhatsApp to auto-unsubscribe; confirmation message sent automatically
- **Re-subscribe**: Customers can send "اشتراك" or "subscribe" to re-opt-in
- **Campaign Enforcement**: `POST /api/campaigns/:id/send` filters out contacts without opt-in before sending
- **Template Required**: Campaigns must have `templateName` set before sending — rejected with `no_template` reason otherwise
- **Block Rate Protection**: Before sending, checks last 100 campaign logs; if failure rate > 3%, campaign is blocked. During sending, re-checks every 20 messages and auto-stops if rate exceeds 3%
- **Rate Limiting**: Campaigns send in batches of 20 with 2-second delays between batches to prevent sudden spikes
- **24-Hour Window**: Agent messages check if last customer message was within 24 hours. If outside window, response includes `windowWarning` indicating only approved Templates should be sent
- **Unsubscribe Footer**: Every campaign message includes "لإلغاء الاشتراك، أرسل: إلغاء" footer
- **API Routes**: `POST /api/contacts/:id/opt-in`, `POST /api/contacts/:id/opt-out`, `POST /api/contacts/bulk-opt-in`
- **Template Name**: Campaigns table has `templateName` field for WhatsApp approved template tracking