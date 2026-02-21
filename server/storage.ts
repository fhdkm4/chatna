import { db } from "./db";
import { eq, and, desc, ilike, or, sql, count, gte, lte, between } from "drizzle-orm";
import {
  tenants, users, contacts, conversations, messages,
  autoReplies, aiKnowledge, quickReplies, invitations,
  type Tenant, type InsertTenant,
  type User, type InsertUser,
  type Contact, type InsertContact,
  type Conversation, type InsertConversation,
  type Message, type InsertMessage,
  type AutoReply, type InsertAutoReply,
  type AiKnowledge, type InsertAiKnowledge,
  type QuickReply, type InsertQuickReply,
  type Invitation, type InsertInvitation,
} from "@shared/schema";

export interface IStorage {
  createTenant(data: InsertTenant): Promise<Tenant>;
  getTenant(id: string): Promise<Tenant | undefined>;
  updateTenant(id: string, data: Partial<InsertTenant>): Promise<Tenant | undefined>;

  createUser(data: InsertUser): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserById(id: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  deleteUser(id: string): Promise<void>;

  createContact(data: InsertContact): Promise<Contact>;
  getContactByPhone(tenantId: string, phone: string): Promise<Contact | undefined>;
  getContactById(id: string): Promise<Contact | undefined>;
  getContactsByTenant(tenantId: string, search?: string): Promise<Contact[]>;
  updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined>;

  createConversation(data: InsertConversation): Promise<Conversation>;
  getConversationById(id: string): Promise<Conversation | undefined>;
  getConversationsByTenant(tenantId: string, status?: string, agentId?: string, role?: string): Promise<any[]>;
  getActiveConversation(tenantId: string, contactId: string): Promise<Conversation | undefined>;
  updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined>;

  createMessage(data: InsertMessage): Promise<Message>;
  getMessagesByConversation(conversationId: string): Promise<Message[]>;
  getRecentMessages(conversationId: string, limit?: number): Promise<Message[]>;

  createAutoReply(data: InsertAutoReply): Promise<AutoReply>;
  getAutoRepliesByTenant(tenantId: string): Promise<AutoReply[]>;
  getActiveAutoReplies(tenantId: string): Promise<AutoReply[]>;
  updateAutoReply(id: string, data: Partial<InsertAutoReply>): Promise<AutoReply | undefined>;
  deleteAutoReply(id: string): Promise<void>;

  createKnowledge(data: InsertAiKnowledge): Promise<AiKnowledge>;
  getKnowledgeByTenant(tenantId: string): Promise<AiKnowledge[]>;
  getActiveKnowledge(tenantId: string): Promise<AiKnowledge[]>;
  updateKnowledge(id: string, data: Partial<InsertAiKnowledge>): Promise<AiKnowledge | undefined>;
  deleteKnowledge(id: string): Promise<void>;

  createQuickReply(data: InsertQuickReply): Promise<QuickReply>;
  getQuickRepliesByTenant(tenantId: string): Promise<QuickReply[]>;
  deleteQuickReply(id: string): Promise<void>;

  createInvitation(data: InsertInvitation): Promise<Invitation>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationsByTenant(tenantId: string): Promise<Invitation[]>;
  updateInvitation(id: string, data: Partial<InsertInvitation>): Promise<Invitation | undefined>;
  deleteInvitation(id: string): Promise<void>;

  getStats(tenantId: string): Promise<any>;
  getAnalytics(tenantId: string, days: number): Promise<any>;
  getContactCount(tenantId: string): Promise<number>;
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

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
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

  async getContactById(id: string): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
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

  async updateContact(id: string, data: Partial<InsertContact>): Promise<Contact | undefined> {
    const [contact] = await db.update(contacts).set({ ...data, updatedAt: new Date() }).where(eq(contacts.id, id)).returning();
    return contact;
  }

  async createConversation(data: InsertConversation): Promise<Conversation> {
    const [conv] = await db.insert(conversations).values(data).returning();
    return conv;
  }

  async getConversationById(id: string): Promise<Conversation | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
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
        ? await this.getContactById(conv.contactId)
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

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation | undefined> {
    const updateData: any = { ...data, updatedAt: new Date() };
    if (data.status === "resolved") {
      updateData.resolvedAt = new Date();
    }
    const [conv] = await db.update(conversations).set(updateData).where(eq(conversations.id, id)).returning();
    return conv;
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

  async updateAutoReply(id: string, data: Partial<InsertAutoReply>): Promise<AutoReply | undefined> {
    const [reply] = await db.update(autoReplies).set(data).where(eq(autoReplies.id, id)).returning();
    return reply;
  }

  async deleteAutoReply(id: string): Promise<void> {
    await db.delete(autoReplies).where(eq(autoReplies.id, id));
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

  async updateKnowledge(id: string, data: Partial<InsertAiKnowledge>): Promise<AiKnowledge | undefined> {
    const [entry] = await db.update(aiKnowledge).set(data).where(eq(aiKnowledge.id, id)).returning();
    return entry;
  }

  async deleteKnowledge(id: string): Promise<void> {
    await db.delete(aiKnowledge).where(eq(aiKnowledge.id, id));
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

  async deleteQuickReply(id: string): Promise<void> {
    await db.delete(quickReplies).where(eq(quickReplies.id, id));
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

  async updateInvitation(id: string, data: Partial<InsertInvitation>): Promise<Invitation | undefined> {
    const [invitation] = await db.update(invitations).set(data).where(eq(invitations.id, id)).returning();
    return invitation;
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.id, id));
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
}

export const storage = new DatabaseStorage();
