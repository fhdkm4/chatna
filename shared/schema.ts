import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, boolean, integer, real, timestamp, index, uniqueIndex, date, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }),
  plan: varchar("plan", { length: 50 }).default("starter"),
  twilioPhone: varchar("twilio_phone", { length: 20 }),
  aiEnabled: boolean("ai_enabled").default(true),
  aiSystemPrompt: text("ai_system_prompt"),
  maxAgents: integer("max_agents").default(2),
  metaAccessTokenEnc: text("meta_access_token_enc"),
  metaTokenIv: varchar("meta_token_iv", { length: 64 }),
  metaTokenTag: varchar("meta_token_tag", { length: 64 }),
  metaBusinessId: varchar("meta_business_id", { length: 100 }),
  metaPhoneNumberId: varchar("meta_phone_number_id", { length: 100 }),
  wabaId: varchar("waba_id", { length: 100 }),
  webhookVerifyToken: varchar("webhook_verify_token", { length: 100 }),
  qualityRating: varchar("quality_rating", { length: 20 }),
  qualityCheckedAt: timestamp("quality_checked_at"),
  assignmentMode: varchar("assignment_mode", { length: 20 }).default("round_robin"),
  lastAssignedUserId: uuid("last_assigned_user_id"),
  ratingEnabled: boolean("rating_enabled").default(true),
  ratingMessage: text("rating_message").default("شكراً لتواصلك معنا! 🙏\nكيف تقيّم الخدمة اللي حصلت عليها؟\n\n1️⃣ ممتاز 😊\n2️⃣ جيد 👍\n3️⃣ سيئ 😞"),
  ratingDelayMinutes: integer("rating_delay_minutes").default(2),
  setupCompleted: boolean("setup_completed").default(false),
  discountCode: varchar("discount_code", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).default("agent"),
  status: varchar("status", { length: 20 }).default("offline"),
  maxConcurrentChats: integer("max_concurrent_chats").default(10),
  lastAssignedAt: timestamp("last_assigned_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: varchar("role", { length: 20 }).notNull().default("agent"),
  token: varchar("token", { length: 255 }).notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  phone: varchar("phone", { length: 20 }).notNull(),
  name: varchar("name", { length: 255 }),
  tags: text("tags").array().default(sql`'{}'`),
  notes: text("notes"),
  sentiment: varchar("sentiment", { length: 20 }).default("neutral"),
  totalConversations: integer("total_conversations").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  uniqueIndex("contacts_tenant_phone_idx").on(table.tenantId, table.phone),
]);

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  assignedTo: uuid("assigned_to").references(() => users.id),
  status: varchar("status", { length: 20 }).default("active"),
  channel: varchar("channel", { length: 20 }).default("whatsapp"),
  aiHandled: boolean("ai_handled").default(false),
  aiPaused: boolean("ai_paused").default(false),
  delayAlerted: boolean("delay_alerted").default(false),
  ratingRequested: boolean("rating_requested").default(false),
  ratingScheduledAt: timestamp("rating_scheduled_at"),
  startedAt: timestamp("started_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("conversations_tenant_status_idx").on(table.tenantId, table.status),
]);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  senderType: varchar("sender_type", { length: 20 }).notNull(),
  senderId: uuid("sender_id"),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: varchar("media_type", { length: 50 }),
  metaMediaId: varchar("meta_media_id", { length: 255 }),
  isInternal: boolean("is_internal").default(false),
  aiConfidence: real("ai_confidence"),
  twilioSid: varchar("twilio_sid", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("messages_conversation_idx").on(table.conversationId, table.createdAt),
]);

export const autoReplies = pgTable("auto_replies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  triggerType: varchar("trigger_type", { length: 20 }).notNull(),
  triggerValue: text("trigger_value").notNull(),
  response: text("response").notNull(),
  isActive: boolean("is_active").default(true),
  priority: integer("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiKnowledge = pgTable("ai_knowledge", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }),
  content: text("content").notNull(),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quickReplies = pgTable("quick_replies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const ratings = pgTable("ratings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "cascade" }),
  agentId: uuid("agent_id").references(() => users.id),
  contactId: uuid("contact_id").references(() => contacts.id),
  rating: integer("rating").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("ratings_agent_idx").on(table.agentId),
  index("ratings_tenant_idx").on(table.tenantId),
]);

export const agentMetrics = pgTable("agent_metrics", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  totalConversations: integer("total_conversations").default(0),
  resolvedConversations: integer("resolved_conversations").default(0),
  avgResponseTimeSeconds: integer("avg_response_time_seconds").default(0),
  totalMessages: integer("total_messages").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("agent_metrics_user_date_idx").on(table.userId, table.date),
]);

export const activityLog = pgTable("activity_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  action: varchar("action", { length: 50 }).notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("activity_log_tenant_idx").on(table.tenantId, table.createdAt),
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  messageText: text("message_text"),
  ctaType: varchar("cta_type", { length: 20 }).default("none"),
  ctaValue: text("cta_value"),
  targetType: varchar("target_type", { length: 20 }).default("all"),
  targetTags: text("target_tags").array().default(sql`'{}'`),
  targetContactIds: uuid("target_contact_ids").array().default(sql`'{}'`),
  status: varchar("status", { length: 20 }).default("draft"),
  scheduledAt: timestamp("scheduled_at"),
  sentAt: timestamp("sent_at"),
  totalRecipients: integer("total_recipients").default(0),
  deliveredCount: integer("delivered_count").default(0),
  readCount: integer("read_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("campaigns_tenant_idx").on(table.tenantId, table.status),
]);

export const campaignLogs = pgTable("campaign_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id),
  status: varchar("status", { length: 20 }).default("pending"),
  error: text("error"),
  sentAt: timestamp("sent_at"),
}, (table) => [
  index("campaign_logs_campaign_idx").on(table.campaignId, table.status),
]);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("SAR"),
  imageUrl: text("image_url"),
  link: text("link"),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("products_tenant_idx").on(table.tenantId),
]);

export const insertTenantSchema = createInsertSchema(tenants).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertContactSchema = createInsertSchema(contacts).omit({ id: true, createdAt: true, updatedAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, startedAt: true, updatedAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertAutoReplySchema = createInsertSchema(autoReplies).omit({ id: true, createdAt: true });
export const insertAiKnowledgeSchema = createInsertSchema(aiKnowledge).omit({ id: true, createdAt: true });
export const insertQuickReplySchema = createInsertSchema(quickReplies).omit({ id: true, createdAt: true });
export const insertInvitationSchema = createInsertSchema(invitations).omit({ id: true, createdAt: true });
export const insertRatingSchema = createInsertSchema(ratings).omit({ id: true, createdAt: true });
export const insertAgentMetricsSchema = createInsertSchema(agentMetrics).omit({ id: true, createdAt: true });
export const insertActivityLogSchema = createInsertSchema(activityLog).omit({ id: true, createdAt: true });
export const insertCampaignSchema = createInsertSchema(campaigns).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCampaignLogSchema = createInsertSchema(campaignLogs).omit({ id: true });
export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });

export const registerSchema = z.object({
  companyName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  discountCode: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createAgentSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  role: z.enum(["agent", "manager"]).default("agent"),
});

export const inviteAgentSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "agent"]).default("agent"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(2),
  password: z.string().min(6),
});

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type AutoReply = typeof autoReplies.$inferSelect;
export type InsertAutoReply = z.infer<typeof insertAutoReplySchema>;
export type AiKnowledge = typeof aiKnowledge.$inferSelect;
export type InsertAiKnowledge = z.infer<typeof insertAiKnowledgeSchema>;
export type QuickReply = typeof quickReplies.$inferSelect;
export type InsertQuickReply = z.infer<typeof insertQuickReplySchema>;
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = z.infer<typeof insertInvitationSchema>;
export type Rating = typeof ratings.$inferSelect;
export type InsertRating = z.infer<typeof insertRatingSchema>;
export type AgentMetric = typeof agentMetrics.$inferSelect;
export type InsertAgentMetric = z.infer<typeof insertAgentMetricsSchema>;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type Campaign = typeof campaigns.$inferSelect;
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type CampaignLog = typeof campaignLogs.$inferSelect;
export type InsertCampaignLog = z.infer<typeof insertCampaignLogSchema>;
export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;
