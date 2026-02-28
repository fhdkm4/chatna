import { db } from "./db";
import { eq, and, desc, ilike, or, sql, count, gte, lte, between, ne, isNull, asc } from "drizzle-orm";
import {
  tenants, users, contacts, conversations, messages,
  autoReplies, aiKnowledge, quickReplies, invitations,
  ratings, agentMetrics, activityLog,
  campaigns, campaignLogs, products, internalMessages, messageLogs,
  type Tenant, type InsertTenant,
  type User, type InsertUser,
  type Contact, type InsertContact,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AutoReply, type InsertAutoReply,
  type AiKnowledge, type InsertAiKnowledge,
  type QuickReply, type InsertQuickReply,
  type Invitation, type InsertInvitation,
  type Rating, type InsertRating,
  type AgentMetric, type InsertAgentMetric,
  type ActivityLogEntry, type InsertActivityLog,
  type Campaign, type InsertCampaign,
  type CampaignLog, type InsertCampaignLog,
  type Product, type InsertProduct,
  type InternalMessage, type InsertInternalMessage,
  conversationAssignmentsLog,
  type ConversationAssignmentLog, type InsertConversationAssignmentLog,
  type MessageLog, type InsertMessageLog,
} from "@shared/schema";

export interface IStorage {
  createTenant(data: InsertTenant): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | undefined>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;

  createUser(data: InsertUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  updateUser(id: string, data: Partial<InsertUser>, tenantId?: string): Promise<User | undefined>;
  deleteUser(id: string, tenantId: string): Promise<void>;

  createContact(data: InsertContact): Promise<Contact>;
  getContactByPhone(tenantId: string, phone: string): Promise<Contact | undefined>;
  getContactById(id: string, tenantId: string): Promise<Contact | undefined>;
  getContactsByTenant(tenantId: string, search?: string): Promise<Contact[]>;
  updateContact(id: string, tenantId: string, data: Partial<InsertContact>): Promise<Contact | undefined>;

  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversationById(id: string, tenantId: string): Promise<Conversation | undefined>;
  getConversationsByTenant(tenantId: string, status?: string, agentId?: string, role?: string): Promise<any[]>;
  getActiveConversation(tenantId: string, contactId: string): Promise<Conversation | undefined>;
  getLatestConversation(tenantId: string, contactId: string): Promise<Conversation | undefined>;
  updateConversation(id: string, tenantId: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;
  getActiveConversationCountByAgent(agentId: string): Promise<number>;

  createMessage(data: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  getRecentMessages(conversationId: string, limit?: number): Promise<Message[]>;
  getLastCustomerMessage(conversationId: string): Promise<Message | undefined>;
  getCampaignBlockRate(tenantId: string): Promise<number>;
  createMessageLog(data: InsertMessageLog): Promise<MessageLog>;
  getMessageLogsByTenant(tenantId: string, limit?: number): Promise<MessageLog[]>;
  getDailySendCount(tenantId: string): Promise<number>;
  getNumberHealth(tenantId: string): Promise<{ blockRate: number; deliveryRate: number; readRate: number; dailySent: number; dailyLimit: number }>;

  createAutoReply(data: InsertAutoReply): Promise<AutoReply>;
  getAutoRepliesByTenant(tenantId: string): Promise<AutoReply[]>;
  getActiveAutoReplies(tenantId: string): Promise<AutoReply[]>;
  updateAutoReply(id: string, tenantId: string, data: Partial<InsertAutoReply>): Promise<AutoReply | undefined>;
  deleteAutoReply(id: string, tenantId: string): Promise<void>;

  createKnowledge(data: InsertAiKnowledge): Promise<AiKnowledge>;
  getKnowledgeByTenant(tenantId: string): Promise<AiKnowledge[]>;
  getActiveKnowledge(tenantId: string): Promise<AiKnowledge[]>;
  updateKnowledge(id: string, tenantId: string, data: Partial<InsertAiKnowledge>): Promise<AiKnowledge | undefined>;
  deleteKnowledge(id: string, tenantId: string): Promise<void>;

  createQuickReply(data: InsertQuickReply): Promise<QuickReply>;
  getQuickRepliesByTenant(tenantId: string): Promise<QuickReply[]>;
  deleteQuickReply(id: string, tenantId: string): Promise<void>;

  createInvitation(data: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationsByTenant(tenantId: string): Promise<Invitation[]>;
  updateInvitation(id: string, tenantId: string, data: Partial<InsertInvitation>): Promise<Invitation | undefined>;
  deleteInvitation(id: string, tenantId: string): Promise<void>;

  upsertAgentMetrics(data: InsertAgentMetric): Promise<AgentMetric>;
  getAgentMetricsByTenant(tenantId: string, date?: string): Promise<AgentMetric[]>;
  incrementAgentMetric(userId: string, tenantId: string, field: "totalConversations" | "resolvedConversations" | "totalMessages", increment?: number): Promise<void>;
  updateAgentAvgResponseTime(userId: string, tenantId: string, responseTimeSeconds: number): Promise<void>;

  getTeamMemberStats(tenantId: string): Promise<Map<string, { open: number; resolved: number; aiTransferred: number }>>;

  createActivityLog(data: InsertActivityLog): Promise<ActivityLogEntry>;
  getActivityLogByTenant(tenantId: string, limit?: number): Promise<any[]>;

  createRating(data: InsertRating): Promise<Rating>;
  getRatingsByAgent(agentId: string, tenantId: string): Promise<any[]>;
  getAgentRatingStats(tenantId: string): Promise<any[]>;
  getConversationsPendingRating(): Promise<any[]>;
  getRecentResolvedConversation(tenantId: string, contactId: string): Promise<Conversation | undefined>;

  autoAssignConversation(tenantId: string): Promise<string | null>;
  mergeDuplicateConversations(): Promise<number>;

  getTeamMonitoring(tenantId: string): Promise<any>;

  getStats(tenantId: string): Promise<any>;
  getAnalytics(tenantId: string, days: number): Promise<any>;
  getContactCount(tenantId: string): Promise<number>;

  createCampaign(data: InsertCampaign): Promise<Campaign>;
  getCampaignById(id: string): Promise<Campaign | undefined>;
  getCampaignsByTenant(tenantId: string): Promise<Campaign[]>;
  updateCampaign(id: string, tenantId: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined>;
  deleteCampaign(id: string, tenantId: string): Promise<void>;

  createCampaignLog(data: InsertCampaignLog): Promise<CampaignLog>;
  getCampaignLogsByCampaign(campaignId: string): Promise<CampaignLog[]>;

  createProduct(data: InsertProduct): Promise<Product>;
  getProductById(id: string): Promise<Product | undefined>;
  getProductsByTenant(tenantId: string, search?: string): Promise<Product[]>;
  updateProduct(id: string, tenantId: string, data: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: string, tenantId: string): Promise<void>;

  getWaitingConversationsCount(tenantId: string): Promise<number>;

  createInternalMessage(data: InsertInternalMessage): Promise<InternalMessage>;
  getInternalMessages(tenantId: string, userId1: string, userId2: string, limit?: number): Promise<InternalMessage[]>;
  getInternalChatPartners(tenantId: string, userId: string): Promise<{ partnerId: string; lastMessage: string; lastMessageAt: Date | null }[]>;

  createAssignmentLog(data: InsertConversationAssignmentLog): Promise<ConversationAssignmentLog>;
  getAssignmentLogsByConversation(conversationId: string, tenantId: string): Promise<ConversationAssignmentLog[]>;
}

class DatabaseStorage implements IStorage {
  async createTenant(data: InsertTenant): Promise<Tenant> {
    const [tenant] = await db.insert(tenants).values(data).returning();
    return tenant;
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant;
  }

  async updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [tenant] = await db.update(tenants).set({ ...data, updatedAt: new Date() }).where(eq(tenants.id, id)).returning();
    return tenant;
  }

  async createUser(data: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async updateUser(id: string, data: Partial<InsertUser>, tenantId?: string): Promise<User | undefined> {
    const condition = tenantId
      ? and(eq(users.id, id), eq(users.tenantId, tenantId))
      : eq(users.id, id);
    const [user] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(condition).returning();
    return user;
  }

  async deleteUser(id: string, tenantId: string): Promise<void> {
    await db.delete(users).where(and(eq(users.id, id), eq(users.tenantId, tenantId)));
  }

  async createContact(data: InsertContact): Promise<Contact> {
    const [contact] = await db.insert(contacts).values(data).returning();
    return contact;
  }

  async getContactByPhone(tenantId: string, phone: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts)
      .where(and(eq(contacts.tenantId, tenantId), eq(contacts.phone, phone)));
    return contact;
  }

  async getContactById(id: string, tenantId: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
    return contact;
  }

  async getContactsByTenant(tenantId: string, search?: string): Promise<Contact[]> {
    if (search) {
      return db.select().from(contacts)
        .where(and(
          eq(contacts.tenantId, tenantId),
          or(
            ilike(contacts.name, `%${search}%`),
            ilike(contacts.phone, `%${search}%`)
          )
        ))
        .orderBy(desc(contacts.updatedAt));
    }
    return db.select().from(contacts)
      .where(eq(contacts.tenantId, tenantId))
      .orderBy(desc(contacts.updatedAt));
  }

  async updateContact(id: string, tenantId: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db.update(contacts).set({ ...data, updatedAt: new Date() }).where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId))).returning();
    return contact;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async getConversationById(id: string, tenantId: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId)));
    return conv;
  }

  async getConversationsByTenant(tenantId: string, status?: string, agentId?: string, role?: string): Promise<any[]> {
    const conditions = [eq(conversations.tenantId, tenantId)];
    if (status && status !== "all") {
      conditions.push(eq(conversations.status, status));
    }
    if (role === "agent" && agentId) {
      conditions.push(eq(conversations.assignedTo, agentId));
    }

    const convs = await db.select().from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt));

    const result = [];
    for (const conv of convs) {
      const contact = conv.contactId
        ? await this.getContactById(conv.contactId, tenantId)
        : undefined;

      const lastMsgs = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      let assignedAgent = null;
      if (conv.assignedTo) {
        const agent = await this.getUserById(conv.assignedTo);
        assignedAgent = agent ? { id: agent.id, name: agent.name, email: agent.email } : null;
      }

      result.push({
        ...conv,
        contact,
        lastMessage: lastMsgs[0] || null,
        unreadCount: 0,
        assignedAgent,
      });
    }
    return result;
  }

  async getActiveConversation(tenantId: string, contactId: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.contactId, contactId),
        or(eq(conversations.status, "active"), eq(conversations.status, "waiting"))
      ))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    return conv;
  }

  async getLatestConversation(tenantId: string, contactId: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.contactId, contactId),
      ))
      .orderBy(desc(conversations.updatedAt))
      .limit(1);
    return conv;
  }

  async updateConversation(id: string, tenantId: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.status === "resolved") {
      updateData.resolvedAt = new Date();
    }
    const [conv] = await db.update(conversations).set(updateData).where(and(eq(conversations.id, id), eq(conversations.tenantId, tenantId))).returning();
    return conv;
  }

  async getActiveConversationCountByAgent(agentId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(conversations)
      .where(and(
        eq(conversations.assignedTo, agentId),
        eq(conversations.assignmentStatus, "assigned"),
        ne(conversations.status, "resolved"),
      ));
    return Number(result[0]?.count || 0);
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    if (data.conversationId) {
      await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, data.conversationId));
    }
    return msg;
  }

  async getMessagesByConversation(conversationId: string): Promise<Message[]> {
    return db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async getRecentMessages(conversationId: string, limit = 10): Promise<Message[]> {
    const msgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);
    return msgs.reverse();
  }

  async getLastCustomerMessage(conversationId: string): Promise<Message | undefined> {
    const msgs = await db.select().from(messages)
      .where(and(eq(messages.conversationId, conversationId), eq(messages.senderType, "customer")))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return msgs[0];
  }

  async getCampaignBlockRate(tenantId: string): Promise<number> {
    const recentLogs = await db.select().from(campaignLogs)
      .where(eq(campaignLogs.tenantId, tenantId))
      .orderBy(desc(campaignLogs.sentAt))
      .limit(100);
    if (recentLogs.length === 0) return 0;
    const failed = recentLogs.filter(l => l.status === "failed").length;
    return (failed / recentLogs.length) * 100;
  }

  async createMessageLog(data: InsertMessageLog): Promise<MessageLog> {
    const [log] = await db.insert(messageLogs).values(data).returning();
    return log;
  }

  async getMessageLogsByTenant(tenantId: string, limit = 100): Promise<MessageLog[]> {
    return db.select().from(messageLogs)
      .where(eq(messageLogs.tenantId, tenantId))
      .orderBy(desc(messageLogs.sentAt))
      .limit(limit);
  }

  async getDailySendCount(tenantId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const result = await db.select({ count: count() }).from(messageLogs)
      .where(and(
        eq(messageLogs.tenantId, tenantId),
        eq(messageLogs.direction, "outbound"),
        gte(messageLogs.sentAt, todayStart),
      ));
    return result[0]?.count || 0;
  }

  async getNumberHealth(tenantId: string): Promise<{ blockRate: number; deliveryRate: number; readRate: number; dailySent: number; dailyLimit: number }> {
    const recentLogs = await db.select().from(messageLogs)
      .where(and(eq(messageLogs.tenantId, tenantId), eq(messageLogs.direction, "outbound")))
      .orderBy(desc(messageLogs.sentAt))
      .limit(200);

    const total = recentLogs.length;
    const failed = recentLogs.filter(l => l.failed).length;
    const delivered = recentLogs.filter(l => l.delivered).length;
    const read = recentLogs.filter(l => l.read).length;

    const tenant = await this.getTenant(tenantId);
    const dailySent = await this.getDailySendCount(tenantId);

    return {
      blockRate: total > 0 ? (failed / total) * 100 : 0,
      deliveryRate: total > 0 ? (delivered / total) * 100 : 0,
      readRate: total > 0 ? (read / total) * 100 : 0,
      dailySent,
      dailyLimit: tenant?.dailySendLimit || 250,
    };
  }

  async createAutoReply(data: InsertAutoReply): Promise<AutoReply> {
    const [reply] = await db.insert(autoReplies).values(data).returning();
    return reply;
  }

  async getAutoRepliesByTenant(tenantId: string): Promise<AutoReply[]> {
    return db.select().from(autoReplies)
      .where(eq(autoReplies.tenantId, tenantId))
      .orderBy(desc(autoReplies.priority));
  }

  async getActiveAutoReplies(tenantId: string): Promise<AutoReply[]> {
    return db.select().from(autoReplies)
      .where(and(eq(autoReplies.tenantId, tenantId), eq(autoReplies.isActive, true)))
      .orderBy(desc(autoReplies.priority));
  }

  async updateAutoReply(id: string, tenantId: string, data: Partial<InsertAutoReply>): Promise<AutoReply | undefined> {
    const [reply] = await db.update(autoReplies).set(data).where(and(eq(autoReplies.id, id), eq(autoReplies.tenantId, tenantId))).returning();
    return reply;
  }

  async deleteAutoReply(id: string, tenantId: string): Promise<void> {
    await db.delete(autoReplies).where(and(eq(autoReplies.id, id), eq(autoReplies.tenantId, tenantId)));
  }

  async createKnowledge(data: InsertAiKnowledge): Promise<AiKnowledge> {
    const [entry] = await db.insert(aiKnowledge).values(data).returning();
    return entry;
  }

  async getKnowledgeByTenant(tenantId: string): Promise<AiKnowledge[]> {
    return db.select().from(aiKnowledge)
      .where(eq(aiKnowledge.tenantId, tenantId))
      .orderBy(desc(aiKnowledge.createdAt));
  }

  async getActiveKnowledge(tenantId: string): Promise<AiKnowledge[]> {
    return db.select().from(aiKnowledge)
      .where(and(eq(aiKnowledge.tenantId, tenantId), eq(aiKnowledge.isActive, true)))
      .orderBy(desc(aiKnowledge.createdAt));
  }

  async updateKnowledge(id: string, tenantId: string, data: Partial<InsertAiKnowledge>): Promise<AiKnowledge | undefined> {
    const [entry] = await db.update(aiKnowledge).set(data).where(and(eq(aiKnowledge.id, id), eq(aiKnowledge.tenantId, tenantId))).returning();
    return entry;
  }

  async deleteKnowledge(id: string, tenantId: string): Promise<void> {
    await db.delete(aiKnowledge).where(and(eq(aiKnowledge.id, id), eq(aiKnowledge.tenantId, tenantId)));
  }

  async createQuickReply(data: InsertQuickReply): Promise<QuickReply> {
    const [reply] = await db.insert(quickReplies).values(data).returning();
    return reply;
  }

  async getQuickRepliesByTenant(tenantId: string): Promise<QuickReply[]> {
    return db.select().from(quickReplies)
      .where(eq(quickReplies.tenantId, tenantId))
      .orderBy(quickReplies.title);
  }

  async deleteQuickReply(id: string, tenantId: string): Promise<void> {
    await db.delete(quickReplies).where(and(eq(quickReplies.id, id), eq(quickReplies.tenantId, tenantId)));
  }

  async createInvitation(data: InsertInvitation): Promise<Invitation> {
    const [invitation] = await db.insert(invitations).values(data).returning();
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select().from(invitations).where(eq(invitations.token, token));
    return invitation;
  }

  async getInvitationsByTenant(tenantId: string): Promise<Invitation[]> {
    return db.select().from(invitations)
      .where(eq(invitations.tenantId, tenantId))
      .orderBy(desc(invitations.createdAt));
  }

  async updateInvitation(id: string, tenantId: string, data: Partial<InsertInvitation>): Promise<Invitation | undefined> {
    const [invitation] = await db.update(invitations).set(data).where(and(eq(invitations.id, id), eq(invitations.tenantId, tenantId))).returning();
    return invitation;
  }

  async deleteInvitation(id: string, tenantId: string): Promise<void> {
    await db.delete(invitations).where(and(eq(invitations.id, id), eq(invitations.tenantId, tenantId)));
  }

  async upsertAgentMetrics(data: InsertAgentMetric): Promise<AgentMetric> {
    const today = data.date || new Date().toISOString().split("T")[0];
    const existing = await db.select().from(agentMetrics)
      .where(and(eq(agentMetrics.userId, data.userId!), eq(agentMetrics.date, today)));

    if (existing.length > 0) {
      const [updated] = await db.update(agentMetrics).set(data)
        .where(eq(agentMetrics.id, existing[0].id)).returning();
      return updated;
    }
    const [created] = await db.insert(agentMetrics).values({ ...data, date: today }).returning();
    return created;
  }

  async getAgentMetricsByTenant(tenantId: string, date?: string): Promise<AgentMetric[]> {
    const targetDate = date || new Date().toISOString().split("T")[0];
    return db.select().from(agentMetrics)
      .where(and(eq(agentMetrics.tenantId, tenantId), eq(agentMetrics.date, targetDate)));
  }

  async getTeamMemberStats(tenantId: string): Promise<Map<string, { open: number; resolved: number; aiTransferred: number }>> {
    const rows = await db.select({
      assignedTo: conversations.assignedTo,
      status: conversations.status,
      assignmentStatus: conversations.assignmentStatus,
    }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), sql`${conversations.assignedTo} IS NOT NULL`));

    const map = new Map<string, { open: number; resolved: number; aiTransferred: number }>();
    for (const row of rows) {
      if (!row.assignedTo) continue;
      if (!map.has(row.assignedTo)) {
        map.set(row.assignedTo, { open: 0, resolved: 0, aiTransferred: 0 });
      }
      const entry = map.get(row.assignedTo)!;
      if (row.status === "resolved") {
        entry.resolved++;
      } else {
        entry.open++;
      }
      if (row.assignmentStatus === "assigned" || row.assignmentStatus === "closed") {
        entry.aiTransferred++;
      }
    }
    return map;
  }

  async incrementAgentMetric(userId: string, tenantId: string, field: "totalConversations" | "resolvedConversations" | "totalMessages", increment = 1): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db.select().from(agentMetrics)
      .where(and(eq(agentMetrics.userId, userId), eq(agentMetrics.date, today)));

    if (existing.length > 0) {
      const currentVal = Number(existing[0][field] || 0);
      await db.update(agentMetrics)
        .set({ [field]: currentVal + increment })
        .where(eq(agentMetrics.id, existing[0].id));
    } else {
      await db.insert(agentMetrics).values({
        userId,
        tenantId,
        date: today,
        [field]: increment,
      });
    }
  }

  async updateAgentAvgResponseTime(userId: string, tenantId: string, responseTimeSeconds: number): Promise<void> {
    const today = new Date().toISOString().split("T")[0];
    const existing = await db.select().from(agentMetrics)
      .where(and(eq(agentMetrics.userId, userId), eq(agentMetrics.date, today)));

    if (existing.length > 0) {
      const current = existing[0];
      const totalMsgs = Number(current.totalMessages || 0);
      const currentAvg = Number(current.avgResponseTimeSeconds || 0);
      const newAvg = totalMsgs > 0
        ? Math.round((currentAvg * totalMsgs + responseTimeSeconds) / (totalMsgs + 1))
        : responseTimeSeconds;
      await db.update(agentMetrics)
        .set({ avgResponseTimeSeconds: newAvg })
        .where(eq(agentMetrics.id, current.id));
    } else {
      await db.insert(agentMetrics).values({
        userId,
        tenantId,
        date: today,
        avgResponseTimeSeconds: Math.round(responseTimeSeconds),
      });
    }
  }

  async createActivityLog(data: InsertActivityLog): Promise<ActivityLogEntry> {
    const [entry] = await db.insert(activityLog).values(data).returning();
    return entry;
  }

  async getActivityLogByTenant(tenantId: string, limit = 50): Promise<any[]> {
    const logs = await db.select().from(activityLog)
      .where(eq(activityLog.tenantId, tenantId))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    const result = [];
    for (const log of logs) {
      let userName: string | null = null;
      if (log.userId) {
        const user = await this.getUserById(log.userId);
        userName = user?.name || null;
      }
      result.push({ ...log, userName });
    }
    return result;
  }

  async createRating(data: InsertRating): Promise<Rating> {
    const [rating] = await db.insert(ratings).values(data).returning();
    return rating;
  }

  async getRatingsByAgent(agentId: string, tenantId: string): Promise<any[]> {
    const result = await db.select({
      id: ratings.id,
      rating: ratings.rating,
      conversationId: ratings.conversationId,
      contactId: ratings.contactId,
      createdAt: ratings.createdAt,
      contactName: contacts.name,
      contactPhone: contacts.phone,
    })
      .from(ratings)
      .leftJoin(contacts, eq(ratings.contactId, contacts.id))
      .where(and(eq(ratings.agentId, agentId), eq(ratings.tenantId, tenantId)))
      .orderBy(desc(ratings.createdAt));
    return result;
  }

  async getAgentRatingStats(tenantId: string): Promise<any[]> {
    const result = await db.select({
      agentId: ratings.agentId,
      avgRating: sql<number>`ROUND(AVG(${ratings.rating})::numeric, 1)`,
      totalRatings: count(),
    })
      .from(ratings)
      .where(eq(ratings.tenantId, tenantId))
      .groupBy(ratings.agentId);
    return result;
  }

  async getConversationsPendingRating(): Promise<any[]> {
    const result = await db.select({
      conversationId: conversations.id,
      tenantId: conversations.tenantId,
      contactId: conversations.contactId,
      agentId: conversations.assignedTo,
      ratingScheduledAt: conversations.ratingScheduledAt,
    })
      .from(conversations)
      .innerJoin(tenants, eq(conversations.tenantId, tenants.id))
      .where(and(
        eq(conversations.status, "resolved"),
        eq(conversations.ratingRequested, false),
        eq(tenants.ratingEnabled, true),
        sql`${conversations.ratingScheduledAt} IS NOT NULL`,
        sql`${conversations.ratingScheduledAt} <= NOW()`,
      ));
    return result;
  }

  async getRecentResolvedConversation(tenantId: string, contactId: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.contactId, contactId),
        eq(conversations.status, "resolved"),
        eq(conversations.ratingRequested, true),
      ))
      .orderBy(desc(conversations.resolvedAt))
      .limit(1);
    return conv;
  }

  async autoAssignConversation(tenantId: string): Promise<string | null> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant || tenant.assignmentMode === "manual") return null;

    const allAgents = await db.select().from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.status, "online"),
      ));

    if (allAgents.length === 0) return null;

    const eligibleAgents: { id: string; activeChats: number }[] = [];
    for (const agent of allAgents) {
      const activeCount = await this.getActiveConversationCountByAgent(agent.id);
      const maxChats = agent.maxConcurrentChats || 10;
      if (activeCount < maxChats) {
        eligibleAgents.push({ id: agent.id, activeChats: activeCount });
      }
    }

    if (eligibleAgents.length === 0) return null;

    if (tenant.assignmentMode === "least_busy") {
      eligibleAgents.sort((a, b) => a.activeChats - b.activeChats);
      return eligibleAgents[0].id;
    }

    if (tenant.assignmentMode === "round_robin") {
      const lastAssigned = tenant.lastAssignedUserId;
      if (!lastAssigned) {
        const chosen = eligibleAgents[0].id;
        await this.updateTenant(tenantId, { lastAssignedUserId: chosen } as any);
        return chosen;
      }
      const lastIdx = eligibleAgents.findIndex(a => a.id === lastAssigned);
      const nextIdx = (lastIdx + 1) % eligibleAgents.length;
      const chosen = eligibleAgents[nextIdx].id;
      await this.updateTenant(tenantId, { lastAssignedUserId: chosen } as any);
      return chosen;
    }

    return null;
  }

  async mergeDuplicateConversations(): Promise<number> {
    const allConvs = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));

    const grouped = new Map<string, typeof allConvs>();
    for (const conv of allConvs) {
      if (!conv.contactId || !conv.tenantId) continue;
      const key = `${conv.tenantId}:${conv.contactId}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(conv);
    }

    let mergedCount = 0;
    const keys = Array.from(grouped.keys());
    for (const key of keys) {
      const convGroup = grouped.get(key)!;
      if (convGroup.length <= 1) continue;

      const primary = convGroup[0];
      const duplicates = convGroup.slice(1);

      for (const dup of duplicates) {
        await db.update(messages)
          .set({ conversationId: primary.id })
          .where(eq(messages.conversationId, dup.id));

        await db.delete(conversations).where(eq(conversations.id, dup.id));
        mergedCount++;
      }

      const hasActive = convGroup.some((c: any) => c.status === "active" || c.status === "waiting");
      if (hasActive && primary.status === "resolved") {
        await db.update(conversations)
          .set({ status: "active", updatedAt: new Date() })
          .where(eq(conversations.id, primary.id));
      }
    }

    return mergedCount;
  }

  async getTeamMonitoring(tenantId: string): Promise<any> {
    const teamMembers = await db.select().from(users).where(eq(users.tenantId, tenantId));

    const today = new Date().toISOString().split("T")[0];
    const todayMetrics = await db.select().from(agentMetrics)
      .where(and(eq(agentMetrics.tenantId, tenantId), eq(agentMetrics.date, today)));

    const metricsMap = new Map<string, AgentMetric>();
    for (const m of todayMetrics) {
      if (m.userId) metricsMap.set(m.userId, m);
    }

    const agentStats = [];
    for (const member of teamMembers) {
      const activeChats = await this.getActiveConversationCountByAgent(member.id);
      const metrics = metricsMap.get(member.id);

      agentStats.push({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        maxConcurrentChats: member.maxConcurrentChats || 10,
        activeChats,
        totalConversationsToday: metrics?.totalConversations || 0,
        resolvedToday: metrics?.resolvedConversations || 0,
        totalMessagesToday: metrics?.totalMessages || 0,
        avgResponseTimeSeconds: metrics?.avgResponseTimeSeconds || 0,
      });
    }

    const totalActive = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "active")));
    const totalWaiting = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "waiting")));
    const unassigned = await db.select({ count: count() }).from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        or(eq(conversations.status, "active"), eq(conversations.status, "waiting")),
        isNull(conversations.assignedTo)
      ));

    return {
      agents: agentStats,
      summary: {
        totalActive: Number(totalActive[0]?.count || 0),
        totalWaiting: Number(totalWaiting[0]?.count || 0),
        unassigned: Number(unassigned[0]?.count || 0),
        onlineAgents: teamMembers.filter(m => m.status === "online").length,
        totalAgents: teamMembers.length,
      },
    };
  }

  async getStats(tenantId: string): Promise<any> {
    const activeCount = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "active")));
    const waitingCount = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "waiting")));
    const resolvedCount = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.status, "resolved")));
    const totalCount = await db.select({ count: count() }).from(conversations)
      .where(eq(conversations.tenantId, tenantId));
    const aiHandledCount = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), eq(conversations.aiHandled, true)));
    const contactCount = await db.select({ count: count() }).from(contacts)
      .where(eq(contacts.tenantId, tenantId));

    const total = totalCount[0]?.count || 0;
    const aiHandled = aiHandledCount[0]?.count || 0;

    return {
      active: activeCount[0]?.count || 0,
      waiting: waitingCount[0]?.count || 0,
      resolved: resolvedCount[0]?.count || 0,
      total,
      aiResolutionRate: total > 0 ? Math.round((Number(aiHandled) / Number(total)) * 100) : 0,
      totalContacts: contactCount[0]?.count || 0,
    };
  }

  async getAnalytics(tenantId: string, days: number): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const dailyConversations = await db
      .select({
        date: sql<string>`DATE(${conversations.startedAt})`,
        count: count(),
      })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        gte(conversations.startedAt, startDate)
      ))
      .groupBy(sql`DATE(${conversations.startedAt})`)
      .orderBy(sql`DATE(${conversations.startedAt})`);

    const totalInPeriod = await db.select({ count: count() }).from(conversations)
      .where(and(eq(conversations.tenantId, tenantId), gte(conversations.startedAt, startDate)));

    const aiHandledInPeriod = await db.select({ count: count() }).from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        gte(conversations.startedAt, startDate),
        eq(conversations.aiHandled, true)
      ));

    const totalMsgs = Number(totalInPeriod[0]?.count || 0);
    const aiMsgs = Number(aiHandledInPeriod[0]?.count || 0);

    const avgResponseResult = await db
      .select({
        avgTime: sql<number>`
          AVG(EXTRACT(EPOCH FROM (
            (SELECT MIN(m2.created_at) FROM messages m2 
             WHERE m2.conversation_id = ${conversations.id} 
             AND m2.sender_type IN ('agent','ai')
             AND m2.created_at > (SELECT MIN(m3.created_at) FROM messages m3 WHERE m3.conversation_id = ${conversations.id} AND m3.sender_type = 'customer'))
            - 
            (SELECT MIN(m3.created_at) FROM messages m3 
             WHERE m3.conversation_id = ${conversations.id} 
             AND m3.sender_type = 'customer')
          )))`,
      })
      .from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        gte(conversations.startedAt, startDate)
      ));

    const avgResponseSeconds = avgResponseResult[0]?.avgTime || 0;

    return {
      dailyConversations,
      totalConversations: totalMsgs,
      aiReplyRatio: totalMsgs > 0 ? Math.round((aiMsgs / totalMsgs) * 100) : 0,
      avgResponseTime: Math.round(avgResponseSeconds),
      period: days,
    };
  }

  async getContactCount(tenantId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(contacts)
      .where(eq(contacts.tenantId, tenantId));
    return result[0]?.count || 0;
  }

  async createCampaign(data: InsertCampaign): Promise<Campaign> {
    const [campaign] = await db.insert(campaigns).values(data).returning();
    return campaign;
  }

  async getCampaignById(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    return campaign;
  }

  async getCampaignsByTenant(tenantId: string): Promise<Campaign[]> {
    return db.select().from(campaigns)
      .where(eq(campaigns.tenantId, tenantId))
      .orderBy(desc(campaigns.createdAt));
  }

  async updateCampaign(id: string, tenantId: string, data: Partial<InsertCampaign>): Promise<Campaign | undefined> {
    const [campaign] = await db.update(campaigns).set({ ...data, updatedAt: new Date() }).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId))).returning();
    return campaign;
  }

  async deleteCampaign(id: string, tenantId: string): Promise<void> {
    await db.delete(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.tenantId, tenantId)));
  }

  async createCampaignLog(data: InsertCampaignLog): Promise<CampaignLog> {
    const [log] = await db.insert(campaignLogs).values(data).returning();
    return log;
  }

  async getCampaignLogsByCampaign(campaignId: string): Promise<CampaignLog[]> {
    return db.select().from(campaignLogs)
      .where(eq(campaignLogs.campaignId, campaignId))
      .orderBy(desc(campaignLogs.sentAt));
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [product] = await db.insert(products).values(data).returning();
    return product;
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async getProductsByTenant(tenantId: string, search?: string): Promise<Product[]> {
    if (search) {
      return db.select().from(products)
        .where(and(
          eq(products.tenantId, tenantId),
          or(
            ilike(products.name, `%${search}%`),
            ilike(products.category, `%${search}%`)
          )
        ))
        .orderBy(desc(products.createdAt));
    }
    return db.select().from(products)
      .where(eq(products.tenantId, tenantId))
      .orderBy(desc(products.createdAt));
  }

  async updateProduct(id: string, tenantId: string, data: Partial<InsertProduct>): Promise<Product | undefined> {
    const [product] = await db.update(products).set(data).where(and(eq(products.id, id), eq(products.tenantId, tenantId))).returning();
    return product;
  }

  async deleteProduct(id: string, tenantId: string): Promise<void> {
    await db.delete(products).where(and(eq(products.id, id), eq(products.tenantId, tenantId)));
  }

  async getWaitingConversationsCount(tenantId: string): Promise<number> {
    const result = await db.select({ count: count() }).from(conversations)
      .where(and(
        eq(conversations.tenantId, tenantId),
        eq(conversations.assignmentStatus, "waiting_human")
      ));
    return result[0]?.count || 0;
  }

  async createInternalMessage(data: InsertInternalMessage): Promise<InternalMessage> {
    const [msg] = await db.insert(internalMessages).values(data).returning();
    return msg;
  }

  async getInternalMessages(tenantId: string, userId1: string, userId2: string, limit = 100): Promise<InternalMessage[]> {
    return db.select().from(internalMessages)
      .where(and(
        eq(internalMessages.tenantId, tenantId),
        or(
          and(eq(internalMessages.senderId, userId1), eq(internalMessages.receiverId, userId2)),
          and(eq(internalMessages.senderId, userId2), eq(internalMessages.receiverId, userId1))
        )
      ))
      .orderBy(asc(internalMessages.createdAt))
      .limit(limit);
  }

  async getInternalChatPartners(tenantId: string, userId: string): Promise<{ partnerId: string; lastMessage: string; lastMessageAt: Date | null }[]> {
    const result = await db.execute(sql`
      SELECT DISTINCT ON (partner_id) partner_id, message AS last_message, created_at AS last_message_at
      FROM (
        SELECT receiver_id AS partner_id, message, created_at FROM internal_messages WHERE tenant_id = ${tenantId} AND sender_id = ${userId}
        UNION ALL
        SELECT sender_id AS partner_id, message, created_at FROM internal_messages WHERE tenant_id = ${tenantId} AND receiver_id = ${userId}
      ) sub
      ORDER BY partner_id, created_at DESC
    `);
    return (result.rows || []).map((r: any) => ({
      partnerId: r.partner_id,
      lastMessage: r.last_message,
      lastMessageAt: r.last_message_at ? new Date(r.last_message_at) : null,
    }));
  }

  async createAssignmentLog(data: InsertConversationAssignmentLog): Promise<ConversationAssignmentLog> {
    const [log] = await db.insert(conversationAssignmentsLog).values(data).returning();
    return log;
  }

  async getAssignmentLogsByConversation(conversationId: string, tenantId: string): Promise<ConversationAssignmentLog[]> {
    return db.select().from(conversationAssignmentsLog)
      .where(and(eq(conversationAssignmentsLog.conversationId, conversationId), eq(conversationAssignmentsLog.tenantId, tenantId)))
      .orderBy(desc(conversationAssignmentsLog.createdAt));
  }
}

export const storage = new DatabaseStorage();
