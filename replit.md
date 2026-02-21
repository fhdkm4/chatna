# Jawab (جواب) - WhatsApp AI Customer Service SaaS

## Overview

Jawab is a multi-tenant WhatsApp AI customer service SaaS platform. It enables businesses to manage WhatsApp customer conversations through a web dashboard, with AI-powered auto-responses using Anthropic Claude, agent assignment, knowledge base management, quick replies, and analytics. The platform is designed with Arabic (RTL) as the primary language and uses a dark-themed UI.

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
- **Key Pages**: Login/Register (`/login`), Dashboard (`/`) with views for chat, contacts, AI knowledge base, analytics, and settings; Accept Invitation (`/accept-invitation`); Setup Wizard (`/wizard`)
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework**: Express.js with TypeScript, run via `tsx` in dev
- **Authentication**: JWT-based (bcryptjs for password hashing, jsonwebtoken for tokens). No session-based auth — tokens are stored client-side in localStorage
- **API Pattern**: RESTful endpoints under `/api/` prefix. Auth middleware validates JWT Bearer tokens
- **Real-time**: Socket.io integrated with the HTTP server for pushing new messages to connected clients
- **AI Service** (`server/services/ai.ts`): Uses Anthropic Claude API (via `@anthropic-ai/sdk`) for generating customer service responses. Supports auto-replies (keyword/exact/pattern matching) and AI-generated responses with knowledge base context
- **WhatsApp Integration** (`server/services/twilio.ts`): Twilio API for sending/receiving WhatsApp messages. Gracefully degrades when credentials aren't configured. Migration to Meta Cloud API in progress with webhook endpoint at `/webhook`
- **Encryption Service** (`server/services/encryption.ts`): AES-256-GCM encryption for Meta access tokens using PBKDF2 key derivation
- **Typing Delay** (`server/services/typing-delay.ts`): Human-like typing delay (800ms-4000ms) before sending AI/auto-reply messages
- **Database Seeding** (`server/seed.ts`): Seeds initial tenant, admin user, agent user, and sample contacts on first run
- **Build**: Production build uses esbuild for server (outputs `dist/index.cjs`) and Vite for client (outputs `dist/public/`). The build script bundles selected dependencies to reduce cold start times

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM (`drizzle-orm/node-postgres`)
- **Schema** (`shared/schema.ts`): Defined with Drizzle's `pgTable` helpers. Uses `drizzle-zod` for validation schema generation
- **Key Tables**:
  - `tenants` — Multi-tenant organizations with plan, AI settings, Twilio config, Meta Cloud API encrypted tokens, quality rating
  - `users` — Agents/admins/managers belonging to a tenant (email/password auth, roles: admin, manager, agent)
  - `invitations` — Email-based team invitations with token, role, expiration
  - `contacts` — Customer contacts per tenant (unique by tenant+phone)
  - `conversations` — Chat sessions between contacts and tenants, with status tracking and agent assignment
  - `messages` — Individual messages in conversations (supports sender types: customer, agent, ai, system)
  - `autoReplies` — Rule-based automatic responses (keyword, exact, pattern triggers)
  - `aiKnowledge` — Knowledge base entries for AI context
  - `quickReplies` — Pre-written response templates for agents
- **Schema push**: Use `npm run db:push` (runs `drizzle-kit push`) to sync schema to database
- **Storage layer** (`server/storage.ts`): Repository pattern interface (`IStorage`) abstracting all database operations

### Multi-Tenancy
- Tenant isolation is enforced at the query level — most storage methods require `tenantId`
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