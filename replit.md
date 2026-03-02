# Chatna - WhatsApp AI Customer Service SaaS

## Overview

Chatna is a multi-tenant WhatsApp AI customer service SaaS platform enabling businesses to manage WhatsApp customer conversations. It features AI-powered auto-responses, agent assignment, knowledge base management, quick replies, and analytics. The platform prioritizes Arabic (RTL) language support and utilizes a dark-themed UI. Its core capabilities include AI-driven customer service, efficient conversation management, and comprehensive analytics, aiming to streamline customer interactions for businesses.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

Chatna employs a monorepo structure comprising a React frontend (`client/`), an Express backend (`server/`), and shared TypeScript definitions (`shared/`). The frontend interacts with the backend via REST APIs and Socket.io for real-time updates.

### Frontend
The frontend is a React SPA built with Vite, utilizing `wouter` for routing, `zustand` for global state, and `@tanstack/react-query` for server state management. UI components are built with shadcn/ui (New York style), Radix UI primitives, and Tailwind CSS for styling, supporting light/dark modes and RTL. Key pages include Login, Dashboard (with chat, contacts, AI knowledge, settings), Accept Invitation, and a Setup Wizard.

### Backend
The backend is an Express.js server providing RESTful APIs. Authentication is JWT-based. Real-time communication is handled by Socket.io.
- **AI Service**: Integrates Anthropic Claude for generating customer service responses, supporting auto-replies and AI-generated content using a layered prompt builder.
- **WhatsApp Integration**: Uses Twilio API for sending/receiving WhatsApp messages, with ongoing migration to Meta Cloud API.
- **Data Encryption**: Employs AES-256-GCM for sensitive data like Meta access tokens.
- **SLA Monitor**: A cron job monitors pending payments and sends alerts.
- **Prompt Builder**: A sophisticated, layered system for constructing AI prompts, incorporating tenant identity, tone, and knowledge base context. Includes industry-specific layers for sectors like tourism.
- **Human-like Interaction**: Implements a typing delay for AI/auto-reply messages to mimic human interaction.

### Data Storage
PostgreSQL is the primary data store, managed with Drizzle ORM. The schema defines key entities such as `tenants`, `users`, `contacts`, `conversations`, `messages`, `autoReplies`, `aiKnowledge`, `quickReplies`, `campaigns`, and `products`. Multi-tenancy is enforced at the application and database levels, with all queries scoped by `tenant_id` and Row-Level Security (RLS) policies implemented for data isolation.

### Authentication
The system uses a JWT-based authentication flow. Upon login or registration, the server issues a JWT token stored client-side for subsequent API requests, ensuring secure access.

## External Dependencies

### Environment Variables
- `DATABASE_URL`
- `AI_INTEGRATIONS_ANTHROPIC_API_KEY`
- `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` (for Replit AI integration)
- `JWT_SECRET`
- `SESSION_SECRET` / `TOKEN_ENCRYPTION_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`

### Third-Party Services
- **Anthropic Claude API**: For AI-powered customer service and content generation.
- **Twilio**: For WhatsApp Business API integration.
- **PostgreSQL**: The relational database used for all application data.

### Key NPM Packages
- `drizzle-orm`, `drizzle-kit`
- `socket.io`
- `twilio`, `@anthropic-ai/sdk`
- `jsonwebtoken`, `bcryptjs`
- `zod`, `drizzle-zod`
- `wouter`, `zustand`
- `date-fns`, `react-icons`

### WhatsApp Business Compliance
The platform includes robust mechanisms for WhatsApp Business API compliance, including:
- **Opt-in/Opt-out System**: Manages customer consent for receiving messages.
- **Campaign Enforcement**: Filters contacts without opt-in and requires approved templates for campaigns.
- **Block Rate Protection**: Monitors and prevents campaigns if failure rates are too high.
- **Rate Limiting**: Implements delays for campaign sending to prevent message spikes.
- **24-Hour Window**: Alerts agents if responding outside the 24-hour customer service window, requiring template usage.
- **Unsubscribe Footer**: Automatically adds an unsubscribe option to campaign messages.
- **Daily Send Limit & Warm-up**: Enforces daily message limits and a warm-up period for new numbers.
- **Admin Approval**: Requires admin approval for the first campaign.
- **Message Audit Log**: Logs all inbound and outbound messages for compliance and tracking.
- **Number Health Dashboard**: Provides insights into WhatsApp number performance and quality.