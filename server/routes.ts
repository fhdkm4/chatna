import type { Express } from "express";
import express from "express";
import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db, tenantStore } from "./db";
import { registerSchema, loginSchema, createAgentSchema, inviteAgentSchema, acceptInvitationSchema, insertCampaignSchema, insertProductSchema, insertOrderSchema, insertOrderItemSchema, insertPaymentSchema, insertVendorSchema, insertVendorTransactionSchema, users as usersTable, messages as messagesTable, conversations as conversationsTable, invitations as invitationsTable } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { parseIncomingMessage, sendWhatsAppMessage } from "./services/twilio";
import { sendMetaWhatsAppMessage, sendMetaWhatsAppInteractiveButtons, markMessageAsRead } from "./services/meta-whatsapp";
import { checkAutoReply, generateAiResponse } from "./services/ai";
import { simulateTypingDelay } from "./services/typing-delay";
import { isHandoverRequest, assignConversationToAgent, isWithinWorkingHours } from "./services/assignment";
import { handleAIMessage } from "./services/ai-handler";
import { classifyMessageLocal } from "./services/ai-classifier";
import { initWorkflow, updateWorkflow, getNextQuestion, createOrderFromWorkflow, isBookingIntent, getWorkflowSummaryAr } from "./services/order-workflow";
import { processIncomingMessage } from "./services/conversationWorkflow";
import { ObjectStorageService } from "./replit_integrations/object_storage";
import { count, sql as sqlHelper, and, inArray, not, desc } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "jawab-default-secret";

interface AuthRequest extends Express.Request {
  user?: { id: string; tenantId: string; role: string };
}

const userCache = new Map<string, { user: { id: string; tenantId: string; role: string; isActive: boolean }; ts: number }>();
const USER_CACHE_TTL = 30_000;

function invalidateUserCache(userId: string) {
  userCache.delete(userId);
}

async function getAuthUser(userId: string) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.ts < USER_CACHE_TTL) {
    return cached.user;
  }
  const dbUser = await storage.getUserById(userId);
  if (!dbUser) return null;
  const entry = { id: dbUser.id, tenantId: dbUser.tenantId!, role: dbUser.role, isActive: dbUser.isActive !== false };
  userCache.set(userId, { user: entry, ts: Date.now() });
  return entry;
}

async function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const currentUser = await getAuthUser(decoded.id);
    if (!currentUser || !currentUser.isActive) {
      return res.status(403).json({ message: "تم تعطيل حسابك. تواصل مع المدير" });
    }

    req.user = { id: currentUser.id, tenantId: currentUser.tenantId, role: currentUser.role };
    tenantStore.run(currentUser.tenantId, () => next());
  } catch (err) {
    return res.status(401).json({ message: "جلسة منتهية" });
  }
}

function adminOnly(req: any, res: any, next: any) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "هذا الإجراء للمدير فقط" });
  }
  next();
}

function managerOrAdmin(req: any, res: any, next: any) {
  if (req.user?.role !== "admin" && req.user?.role !== "manager") {
    return res.status(403).json({ message: "هذا الإجراء للمدير أو المشرف فقط" });
  }
  next();
}

const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads", "campaigns");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const objectStorageService = new ObjectStorageService();

export async function registerRoutes(httpServer: Server, app: Express): Promise<{ httpServer: Server; io: SocketServer }> {
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

  app.use("/api", (req: any, _res: any, next: any) => {
    if (req.body && typeof req.body === 'object' && ['POST', 'PATCH', 'PUT'].includes(req.method)) {
      delete req.body.tenantId;
      delete req.body.tenant_id;
    }
    next();
  });

  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
  });

  const onlineUsers = new Map<string, { tenantId: string; userId: string; socketId: string }>();

  io.on("connection", (socket) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        socket.join(`tenant:${decoded.tenantId}`);
        socket.join(`user:${decoded.id}`);

        onlineUsers.set(socket.id, { tenantId: decoded.tenantId, userId: decoded.id, socketId: socket.id });
        db.update(usersTable).set({ status: "online" }).where(eq(usersTable.id, decoded.id)).then(() => {
          io.to(`tenant:${decoded.tenantId}`).emit("agent_status", { userId: decoded.id, status: "online" });
        }).catch((err: any) => console.error("Update online status error:", err));

        socket.on("disconnect", () => {
          const userData = onlineUsers.get(socket.id);
          if (userData) {
            onlineUsers.delete(socket.id);
            const stillOnline = Array.from(onlineUsers.values()).some(u => u.userId === userData.userId);
            if (!stillOnline) {
              db.update(usersTable).set({ status: "offline" }).where(eq(usersTable.id, userData.userId)).then(() => {
                io.to(`tenant:${userData.tenantId}`).emit("agent_status", { userId: userData.userId, status: "offline" });
              }).catch((err: any) => console.error("Update offline status error:", err));
            }
          }
        });
      } catch (err) {
        socket.disconnect();
      }
    }
  });

  async function handleEscalation(
    conversationId: string,
    tenantId: string,
    customerPhone: string,
    reason: string,
  ) {
    await storage.updateConversation(conversationId, tenantId, {
      status: "waiting",
      aiPaused: true,
      aiHandled: false,
      assignmentStatus: "waiting_human",
      aiFailedAttempts: 0,
    });

    io.to(`tenant:${tenantId}`).emit("escalation", {
      conversationId,
      reason,
    });

    let assignment;
    try {
      assignment = await assignConversationToAgent(tenantId, conversationId);
    } catch (assignErr) {
      console.error("Assignment error:", assignErr);
      const fallbackMsg = "تم تحويل محادثتك لفريقنا، سيتم الرد عليك خلال 10-15 دقيقة";
      await simulateTypingDelay(fallbackMsg);
      const fallbackSid = await sendWhatsAppMessage(customerPhone, fallbackMsg);
      const fallbackSystemMsg = await storage.createMessage({
        conversationId,
        tenantId,
        senderType: "system",
        content: fallbackMsg,
        twilioSid: fallbackSid,
      });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId,
        message: fallbackSystemMsg,
      });
      io.to(`tenant:${tenantId}`).emit("conversation_updated", {
        conversationId,
        status: "waiting",
        assignmentStatus: "waiting_human",
      });
      return;
    }

    if (assignment.reason === "assigned" && assignment.agentId && assignment.agentName) {
      const assignMsg = "تم تحويل محادثتك إلى أحد أعضاء فريقنا المختصين، وسيتم الرد عليك خلال دقائق";
      await simulateTypingDelay(assignMsg);
      const assignSid = await sendWhatsAppMessage(customerPhone, assignMsg);
      const assignSystemMsg = await storage.createMessage({
        conversationId,
        tenantId,
        senderType: "system",
        content: assignMsg,
        twilioSid: assignSid,
      });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId,
        message: assignSystemMsg,
      });

      const conversation = await storage.getConversationById(conversationId, tenantId);
      const contact = conversation?.contactId ? await storage.getContactById(conversation.contactId, tenantId) : null;
      const recentMsgs = await storage.getRecentMessages(conversationId, 1);

      io.to(`user:${assignment.agentId}`).emit("new_assignment", {
        conversationId,
        contactName: contact?.name || contact?.phone || "عميل",
        contactPhone: contact?.phone || "",
        lastMessage: recentMsgs[0]?.content || "",
        priority: "high",
        agentName: assignment.agentName,
      });

      io.to(`tenant:${tenantId}`).emit("conversation_updated", {
        conversationId,
        status: "active",
        assignedTo: assignment.agentId,
        assignmentStatus: "assigned",
      });
    } else {
      const tenant = await storage.getTenant(tenantId);
      const withinHours = tenant ? isWithinWorkingHours(tenant) : true;

      let noAgentMsg: string;
      if (withinHours) {
        noAgentMsg = "تم تحويل محادثتك لفريقنا، سيتم الرد عليك خلال 10-15 دقيقة";
      } else {
        noAgentMsg = "تم استلام رسالتك، سيتم الرد عليك مع بداية ساعات العمل القادمة";
      }

      await simulateTypingDelay(noAgentMsg);
      const noAgentSid = await sendWhatsAppMessage(customerPhone, noAgentMsg);
      const noAgentSystemMsg = await storage.createMessage({
        conversationId,
        tenantId,
        senderType: "system",
        content: noAgentMsg,
        twilioSid: noAgentSid,
      });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId,
        message: noAgentSystemMsg,
      });
      io.to(`tenant:${tenantId}`).emit("conversation_updated", {
        conversationId,
        status: "waiting",
        assignmentStatus: "waiting_human",
      });
    }
  }

  const DELAY_CHECK_INTERVAL = 60_000;
  const DELAY_THRESHOLD_MS = 10 * 60 * 1000;

  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - DELAY_THRESHOLD_MS);

      const activeConvs = await db
        .select()
        .from(conversationsTable)
        .where(
          and(
            inArray(conversationsTable.status, ["active", "waiting"]),
            not(eq(conversationsTable.delayAlerted, true))
          )
        );

      for (const conv of activeConvs) {
        const lastMsg = await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conv.id))
          .orderBy(desc(messagesTable.createdAt))
          .limit(1);

        if (lastMsg.length === 0) continue;

        const msg = lastMsg[0];
        if (msg.senderType !== "customer") continue;
        if (!msg.createdAt || new Date(msg.createdAt) > threshold) continue;

        await db
          .update(conversationsTable)
          .set({ delayAlerted: true })
          .where(eq(conversationsTable.id, conv.id));

        if (conv.tenantId) {
          io.to(`tenant:${conv.tenantId}`).emit("delay_alert", {
            conversationId: conv.id,
            contactId: conv.contactId,
            lastMessageAt: msg.createdAt,
          });
        }
      }
    } catch (err) {
      console.error("Delay check error:", err);
    }
  }, DELAY_CHECK_INTERVAL);

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }

      const { companyName, email, password, name, discountCode } = parsed.data;

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
      }

      const tenant = await storage.createTenant({ name: companyName, discountCode: discountCode || undefined });
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        tenantId: tenant.id,
        email,
        passwordHash,
        name,
        role: "admin",
        status: "online",
      });

      const token = jwt.sign(
        { id: user.id, tenantId: tenant.id, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: tenant.id,
          tenantName: tenant.name,
        },
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الحساب" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة" });
      }

      const { email, password } = parsed.data;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "بريد إلكتروني أو كلمة مرور خاطئة" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "بريد إلكتروني أو كلمة مرور خاطئة" });
      }

      if (user.isActive === false) {
        return res.status(403).json({ message: "تم تعطيل حسابك. تواصل مع المدير" });
      }

      const tenant = user.tenantId ? await storage.getTenant(user.tenantId) : null;

      const token = jwt.sign(
        { id: user.id, tenantId: user.tenantId, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: tenant?.name || "",
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "خطأ في تسجيل الدخول" });
    }
  });

  // Current user profile
  app.get("/api/team/me", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.user.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        jobTitle: user.jobTitle || null,
        avatarUrl: user.avatarUrl || null,
        isActive: user.isActive,
        status: user.status,
        maxConcurrentChats: user.maxConcurrentChats,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      console.error("Get my profile error:", err);
      res.status(500).json({ message: "خطأ في جلب الملف الشخصي" });
    }
  });

  app.patch("/api/team/me/avatar", authMiddleware, async (req: any, res) => {
    try {
      const schema = z.object({
        avatarUrl: z.string().min(1).max(2000).refine(
          (v) => v.startsWith("/objects/"),
          { message: "رابط غير صحيح" }
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "رابط الصورة غير صحيح", errors: parsed.error.issues });
      }
      const updated = await storage.updateUser(req.user.id, { avatarUrl: parsed.data.avatarUrl }, req.user.tenantId);
      if (!updated) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      res.json({
        id: updated.id,
        name: updated.name,
        avatarUrl: updated.avatarUrl || null,
      });
    } catch (err) {
      console.error("Update my avatar error:", err);
      res.status(500).json({ message: "خطأ في تحديث الصورة الشخصية" });
    }
  });

  // Team management routes
  app.get("/api/team", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const teamMembers = await storage.getUsersByTenant(req.user.tenantId);
      const allMetrics = await storage.getAgentMetricsByTenant(req.user.tenantId);
      const metricsMap = new Map<string, typeof allMetrics[0]>();
      allMetrics.forEach(m => metricsMap.set(m.userId, m));
      const memberStats = await storage.getTeamMemberStats(req.user.tenantId);
      const result = teamMembers.map((u) => {
        const metric = metricsMap.get(u.id);
        const mStats = memberStats.get(u.id);
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          status: u.status,
          isActive: u.isActive,
          jobTitle: u.jobTitle || null,
          avatarUrl: u.avatarUrl || null,
          createdAt: u.createdAt,
          stats: {
            openConversations: mStats?.open || 0,
            resolvedConversations: mStats?.resolved || 0,
            aiTransferred: mStats?.aiTransferred || 0,
            avgResponseTimeSeconds: metric?.avgResponseTimeSeconds || 0,
          },
        };
      });
      res.json(result);
    } catch (err) {
      console.error("Get team error:", err);
      res.status(500).json({ message: "خطأ في جلب الفريق" });
    }
  });

  app.post("/api/team", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const parsed = createAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }

      const { email, password, name, role } = parsed.data;

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        tenantId: req.user.tenantId,
        email,
        passwordHash,
        name,
        role: role || "agent",
        status: "offline",
      });

      res.status(201).json({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      });
    } catch (err) {
      console.error("Create agent error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الموظف" });
    }
  });

  app.patch("/api/team/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      const schema = z.object({
        jobTitle: z.string().max(120).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        name: z.string().min(1).max(255).optional(),
        role: z.enum(["admin", "manager", "agent"]).optional(),
        maxConcurrentChats: z.number().int().min(1).max(100).optional(),
        isActive: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }
      const { jobTitle, avatarUrl, name, role, maxConcurrentChats, isActive } = parsed.data;
      if (req.params.id === req.user.id && isActive === false) {
        return res.status(400).json({ message: "لا يمكنك تعطيل حسابك الخاص" });
      }
      if (req.params.id === req.user.id && role !== undefined && role !== user.role) {
        return res.status(400).json({ message: "لا يمكنك تغيير دورك بنفسك" });
      }
      if (role !== undefined && role !== user.role && user.role === "admin") {
        const allMembers = await storage.getUsersByTenant(req.user.tenantId);
        const adminCount = allMembers.filter(m => m.role === "admin").length;
        if (adminCount <= 1) {
          return res.status(400).json({ message: "لا يمكن تغيير دور آخر مدير في المنظمة" });
        }
      }
      if (isActive === false && user.role === "admin") {
        const allMembers = await storage.getUsersByTenant(req.user.tenantId);
        const activeAdminCount = allMembers.filter(m => m.role === "admin" && m.isActive !== false && m.id !== user.id).length;
        if (activeAdminCount < 1) {
          return res.status(400).json({ message: "لا يمكن تعطيل آخر مدير نشط في المنظمة" });
        }
      }
      const updateData: any = {};
      if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
      if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
      if (name !== undefined) updateData.name = name;
      if (role !== undefined) updateData.role = role;
      if (maxConcurrentChats !== undefined) updateData.maxConcurrentChats = maxConcurrentChats;
      if (isActive !== undefined) updateData.isActive = isActive;
      const updated = await storage.updateUser(req.params.id, updateData, req.user.tenantId);
      invalidateUserCache(req.params.id);
      res.json({
        id: updated!.id,
        email: updated!.email,
        name: updated!.name,
        role: updated!.role,
        status: updated!.status,
        jobTitle: updated!.jobTitle || null,
        avatarUrl: updated!.avatarUrl || null,
        isActive: updated!.isActive,
        maxConcurrentChats: updated!.maxConcurrentChats,
        createdAt: updated!.createdAt,
      });
    } catch (err) {
      console.error("Update team member error:", err);
      res.status(500).json({ message: "خطأ في تحديث بيانات الموظف" });
    }
  });

  app.patch("/api/team/:id/job-title", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      const schema = z.object({ jobTitle: z.string().max(120).nullable() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }
      const updated = await storage.updateUser(req.params.id, { jobTitle: parsed.data.jobTitle }, req.user.tenantId);
      res.json({ id: updated!.id, name: updated!.name, jobTitle: updated!.jobTitle || null });
    } catch (err) {
      console.error("Update job title error:", err);
      res.status(500).json({ message: "خطأ في تحديث المسمى الوظيفي" });
    }
  });

  app.patch("/api/team/:id/role", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      if (req.params.id === req.user.id) {
        return res.status(400).json({ message: "لا يمكنك تغيير دورك بنفسك" });
      }
      const schema = z.object({ role: z.enum(["admin", "manager", "agent"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }
      if (parsed.data.role !== user.role && user.role === "admin") {
        const allMembers = await storage.getUsersByTenant(req.user.tenantId);
        const adminCount = allMembers.filter(m => m.role === "admin").length;
        if (adminCount <= 1) {
          return res.status(400).json({ message: "لا يمكن تغيير دور آخر مدير في المنظمة" });
        }
      }
      const updated = await storage.updateUser(req.params.id, { role: parsed.data.role }, req.user.tenantId);
      invalidateUserCache(req.params.id);
      res.json({ id: updated!.id, name: updated!.name, role: updated!.role });
    } catch (err) {
      console.error("Update role error:", err);
      res.status(500).json({ message: "خطأ في تحديث الصلاحية" });
    }
  });

  app.patch("/api/team/:id/disable", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      const schema = z.object({ isDisabled: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }
      if (req.params.id === req.user.id && parsed.data.isDisabled) {
        return res.status(400).json({ message: "لا يمكنك تعطيل حسابك الخاص" });
      }
      if (parsed.data.isDisabled && user.role === "admin") {
        const allMembers = await storage.getUsersByTenant(req.user.tenantId);
        const activeAdminCount = allMembers.filter(m => m.role === "admin" && m.isActive !== false && m.id !== user.id).length;
        if (activeAdminCount < 1) {
          return res.status(400).json({ message: "لا يمكن تعطيل آخر مدير نشط في المنظمة" });
        }
      }
      const updated = await storage.updateUser(req.params.id, { isActive: !parsed.data.isDisabled }, req.user.tenantId);
      invalidateUserCache(req.params.id);
      res.json({ id: updated!.id, name: updated!.name, isActive: updated!.isActive, isDisabled: !updated!.isActive });
    } catch (err) {
      console.error("Toggle disable error:", err);
      res.status(500).json({ message: "خطأ في تغيير حالة الحساب" });
    }
  });

  app.get("/api/team/:id/profile", authMiddleware, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      const activeChats = await storage.getActiveConversationCountByAgent(user.id);
      const allConvs = await storage.getConversationsByTenant(req.user.tenantId, undefined, user.id, "agent");
      const resolvedCount = allConvs.filter((c: any) => c.status === "resolved").length;
      const openCount = allConvs.filter((c: any) => c.status !== "resolved").length;
      res.json({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        jobTitle: user.jobTitle || null,
        avatarUrl: user.avatarUrl || null,
        maxConcurrentChats: user.maxConcurrentChats,
        createdAt: user.createdAt,
        stats: {
          openConversations: openCount,
          resolvedConversations: resolvedCount,
          activeChats,
        },
      });
    } catch (err) {
      console.error("Get team member profile error:", err);
      res.status(500).json({ message: "خطأ في جلب الملف الشخصي" });
    }
  });

  app.post("/api/uploads/request-url", authMiddleware, async (req: any, res) => {
    try {
      const { name, size, contentType } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Missing required field: name" });
      }
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  app.get(/^\/objects\/(.+)$/, async (req: any, res) => {
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      if (error?.name === "ObjectNotFoundError") {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Failed to serve object" });
    }
  });

  app.patch("/api/profile/avatar", authMiddleware, async (req: any, res) => {
    try {
      const schema = z.object({
        avatarUrl: z.string().min(1).max(2000).refine(
          (v) => v.startsWith("/objects/"),
          { message: "رابط غير صحيح" }
        ),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "رابط الصورة غير صحيح", errors: parsed.error.issues });
      }
      const updated = await storage.updateUser(req.user.id, { avatarUrl: parsed.data.avatarUrl }, req.user.tenantId);
      if (!updated) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      res.json({
        id: updated.id,
        name: updated.name,
        avatarUrl: updated.avatarUrl || null,
      });
    } catch (err) {
      console.error("Update avatar error:", err);
      res.status(500).json({ message: "خطأ في تحديث الصورة الشخصية" });
    }
  });

  app.delete("/api/team/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      if (req.params.id === req.user.id) {
        return res.status(400).json({ message: "لا يمكنك حذف حسابك الخاص" });
      }
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      if (user.role === "admin") {
        const allMembers = await storage.getUsersByTenant(req.user.tenantId);
        const adminCount = allMembers.filter(m => m.role === "admin").length;
        if (adminCount <= 1) {
          return res.status(400).json({ message: "لا يمكن حذف آخر مدير في المنظمة" });
        }
      }
      await storage.deleteUser(req.params.id, req.user.tenantId);
      invalidateUserCache(req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error("Delete agent error:", err);
      res.status(500).json({ message: "خطأ في حذف الموظف" });
    }
  });

  // Invitation routes
  app.post("/api/invitations", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const parsed = inviteAgentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }

      const { email, role } = parsed.data;

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
      }

      const existingInvitations = await storage.getInvitationsByTenant(req.user.tenantId);
      const activeInvitation = existingInvitations.find(
        (inv) => inv.email === email && !inv.acceptedAt && new Date(inv.expiresAt) > new Date()
      );
      if (activeInvitation) {
        return res.status(409).json({ message: "يوجد دعوة نشطة لهذا البريد الإلكتروني" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitation = await storage.createInvitation({
        tenantId: req.user.tenantId,
        email,
        role,
        token,
        invitedBy: req.user.id,
        expiresAt,
      });

      res.status(201).json({
        ...invitation,
        inviteLink: `/accept-invitation?token=${token}`,
      });
    } catch (err) {
      console.error("Create invitation error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الدعوة" });
    }
  });

  app.get("/api/invitations", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const invitationsList = await storage.getInvitationsByTenant(req.user.tenantId);
      res.json(invitationsList);
    } catch (err) {
      console.error("Get invitations error:", err);
      res.status(500).json({ message: "خطأ في جلب الدعوات" });
    }
  });

  app.delete("/api/invitations/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      await storage.deleteInvitation(req.params.id, req.user.tenantId);
      res.status(204).send();
    } catch (err) {
      console.error("Delete invitation error:", err);
      res.status(500).json({ message: "خطأ في حذف الدعوة" });
    }
  });

  app.get("/api/auth/invitation-info", async (req, res) => {
    try {
      const token = req.query.token as string;
      if (!token) return res.status(400).json({ message: "رمز الدعوة مطلوب" });

      const invitation = await storage.getInvitationByToken(token);
      if (!invitation) return res.status(404).json({ message: "الدعوة غير موجودة" });
      if (invitation.acceptedAt) return res.status(400).json({ message: "تم قبول هذه الدعوة مسبقاً" });
      if (new Date(invitation.expiresAt) < new Date()) return res.status(400).json({ message: "انتهت صلاحية الدعوة" });

      res.json({ email: invitation.email, role: invitation.role });
    } catch (err) {
      console.error("Invitation info error:", err);
      res.status(500).json({ message: "خطأ في التحقق من الدعوة" });
    }
  });

  app.post("/api/auth/accept-invitation", async (req, res) => {
    try {
      const parsed = acceptInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }

      const { token, name, password } = parsed.data;

      const invitation = await storage.getInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: "الدعوة غير موجودة" });
      }

      if (invitation.acceptedAt) {
        return res.status(400).json({ message: "تم قبول هذه الدعوة مسبقاً" });
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        return res.status(400).json({ message: "انتهت صلاحية الدعوة" });
      }

      const existingUser = await storage.getUserByEmail(invitation.email);
      if (existingUser) {
        return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await storage.createUser({
        tenantId: invitation.tenantId,
        email: invitation.email,
        passwordHash,
        name,
        role: invitation.role,
        status: "offline",
      });

      await storage.updateInvitation(invitation.id, invitation.tenantId, { acceptedAt: new Date() } as any);

      const tenant = invitation.tenantId ? await storage.getTenant(invitation.tenantId) : null;

      const jwtToken = jwt.sign(
        { id: user.id, tenantId: user.tenantId, role: user.role },
        JWT_SECRET,
        { expiresIn: "7d" }
      );

      res.status(201).json({
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantName: tenant?.name || "",
        },
      });
    } catch (err) {
      console.error("Accept invitation error:", err);
      res.status(500).json({ message: "خطأ في قبول الدعوة" });
    }
  });

  // Settings endpoint
  app.get("/api/settings", authMiddleware, async (req: any, res) => {
    try {
      const tenant = await storage.getTenant(req.user.tenantId);
      if (!tenant) return res.status(404).json({ message: "لم يتم العثور على المؤسسة" });
      res.json({
        aiEnabled: tenant.aiEnabled,
        aiSystemPrompt: tenant.aiSystemPrompt,
        setupCompleted: tenant.setupCompleted,
        qualityRating: tenant.qualityRating,
        plan: tenant.plan,
        maxAgents: tenant.maxAgents,
        name: tenant.name,
        assignmentMode: tenant.assignmentMode || "round_robin",
        maxOpenConversationsPerUser: tenant.maxOpenConversationsPerUser ?? 5,
        ratingEnabled: tenant.ratingEnabled ?? true,
        ratingMessage: tenant.ratingMessage || "شكراً لتواصلك معنا! 🙏\nكيف تقيّم الخدمة اللي حصلت عليها؟\n\n1️⃣ ممتاز 😊\n2️⃣ جيد 👍\n3️⃣ سيئ 😞",
        ratingDelayMinutes: tenant.ratingDelayMinutes ?? 2,
      });
    } catch (err) {
      console.error("Get settings error:", err);
      res.status(500).json({ message: "خطأ في جلب الإعدادات" });
    }
  });

  app.patch("/api/settings", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const { aiEnabled, aiSystemPrompt, setupCompleted, name, assignmentMode, ratingEnabled, ratingMessage, ratingDelayMinutes, maxOpenConversationsPerUser } = req.body;
      const updates: any = {};
      if (typeof aiEnabled === "boolean") updates.aiEnabled = aiEnabled;
      if (typeof aiSystemPrompt === "string") updates.aiSystemPrompt = aiSystemPrompt;
      if (typeof setupCompleted === "boolean") updates.setupCompleted = setupCompleted;
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (assignmentMode && ["round_robin", "least_busy", "manual"].includes(assignmentMode)) {
        updates.assignmentMode = assignmentMode;
      }
      if (typeof ratingEnabled === "boolean") updates.ratingEnabled = ratingEnabled;
      if (typeof ratingMessage === "string") updates.ratingMessage = ratingMessage;
      if (typeof ratingDelayMinutes === "number" && ratingDelayMinutes >= 0) updates.ratingDelayMinutes = ratingDelayMinutes;
      if (typeof maxOpenConversationsPerUser === "number" && maxOpenConversationsPerUser >= 1) updates.maxOpenConversationsPerUser = maxOpenConversationsPerUser;

      const tenant = await storage.updateTenant(req.user.tenantId, updates);
      res.json(tenant);
    } catch (err) {
      console.error("Update settings error:", err);
      res.status(500).json({ message: "خطأ في تحديث الإعدادات" });
    }
  });

  app.get("/api/settings/company", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const tenant = await storage.getTenant(req.user.tenantId);
      if (!tenant) return res.status(404).json({ message: "لم يتم العثور على المؤسسة" });
      res.json({
        name: tenant.name,
        businessDescription: tenant.businessDescription || "",
        businessType: tenant.businessType || "",
        contactPhone: tenant.contactPhone || "",
        website: tenant.website || "",
        workingHours: typeof tenant.workingHours === "string" ? tenant.workingHours : (tenant.workingHours ? JSON.stringify(tenant.workingHours) : ""),
        address: tenant.address || "",
        aiTone: tenant.aiTone || "friendly",
        welcomeMessage: tenant.welcomeMessage || "",
        offHoursMessage: tenant.offHoursMessage || "",
      });
    } catch (err) {
      console.error("Get company settings error:", err);
      res.status(500).json({ message: "خطأ في جلب بيانات الشركة" });
    }
  });

  app.patch("/api/settings/company", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const { name, businessDescription, businessType, contactPhone, website, workingHours, address, aiTone, welcomeMessage, offHoursMessage } = req.body;

      if (name !== undefined && (typeof name !== "string" || !name.trim())) {
        return res.status(400).json({ message: "اسم الشركة مطلوب" });
      }
      if (businessDescription !== undefined && typeof businessDescription !== "string") {
        return res.status(400).json({ message: "وصف الشركة غير صالح" });
      }

      const updates: any = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim().slice(0, 255);
      if (typeof businessDescription === "string") updates.businessDescription = businessDescription.slice(0, 2000);
      if (typeof businessType === "string") updates.businessType = businessType.slice(0, 100);
      if (typeof contactPhone === "string") updates.contactPhone = contactPhone.slice(0, 50);
      if (typeof website === "string") updates.website = website.slice(0, 255);
      if (typeof workingHours === "string") updates.workingHours = workingHours.slice(0, 255);
      if (typeof address === "string") updates.address = address.slice(0, 500);
      if (typeof aiTone === "string" && ["friendly", "professional", "formal", "casual"].includes(aiTone)) {
        updates.aiTone = aiTone;
      }
      if (typeof welcomeMessage === "string") updates.welcomeMessage = welcomeMessage.slice(0, 2000);
      if (typeof offHoursMessage === "string") updates.offHoursMessage = offHoursMessage.slice(0, 2000);

      const tenant = await storage.updateTenant(req.user.tenantId, updates);
      res.json({ success: true, tenant });
    } catch (err) {
      console.error("Update company settings error:", err);
      res.status(500).json({ message: "خطأ في تحديث بيانات الشركة" });
    }
  });

  app.get("/api/settings/ai", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const tenant = await storage.getTenant(req.user.tenantId);
      if (!tenant) return res.status(404).json({ message: "لم يتم العثور على المؤسسة" });
      const knowledgeEntries = await storage.getKnowledgeByTenant(req.user.tenantId);
      res.json({
        aiEnabled: tenant.aiEnabled ?? true,
        aiTone: tenant.aiTone || "friendly",
        languagePreference: tenant.languagePreference || "auto",
        aiPersonalityInstructions: tenant.aiPersonalityInstructions || "",
        aiSystemPrompt: tenant.aiSystemPrompt || "",
        businessDescription: tenant.businessDescription || "",
        businessType: tenant.businessType || "",
        contactPhone: tenant.contactPhone || "",
        website: tenant.website || "",
        workingHours: tenant.workingHours || "",
        address: tenant.address || "",
        welcomeMessage: tenant.welcomeMessage || "",
        offHoursMessage: tenant.offHoursMessage || "",
        defaultEscalationMessage: tenant.defaultEscalationMessage || "",
        name: tenant.name,
        knowledgeBaseCount: knowledgeEntries.filter((e: any) => e.isActive !== false).length,
      });
    } catch (err) {
      console.error("Get AI settings error:", err);
      res.status(500).json({ message: "خطأ في جلب إعدادات الذكاء الاصطناعي" });
    }
  });

  app.patch("/api/settings/ai", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const allowedFields = [
        "aiEnabled", "aiTone", "languagePreference", "aiPersonalityInstructions",
        "aiSystemPrompt", "businessDescription", "businessType", "contactPhone",
        "website", "workingHours", "address", "welcomeMessage", "offHoursMessage",
        "defaultEscalationMessage"
      ];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          if (field === "aiEnabled") {
            if (typeof req.body[field] === "boolean") updates[field] = req.body[field];
          } else if (field === "aiTone") {
            if (["friendly", "professional", "formal", "casual"].includes(req.body[field])) {
              updates[field] = req.body[field];
            }
          } else if (field === "languagePreference") {
            if (["auto", "ar", "en"].includes(req.body[field])) {
              updates[field] = req.body[field];
            }
          } else if (typeof req.body[field] === "string") {
            updates[field] = req.body[field];
          }
        }
      }

      const tenant = await storage.updateTenant(req.user.tenantId, updates);
      res.json({ success: true, tenant });
    } catch (err) {
      console.error("Update AI settings error:", err);
      res.status(500).json({ message: "خطأ في تحديث إعدادات الذكاء الاصطناعي" });
    }
  });

  // Meta Cloud API webhook endpoints
  app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    if (!VERIFY_TOKEN) {
      console.warn("VERIFY_TOKEN not configured");
      return res.status(503).send("Webhook not configured");
    }

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Meta webhook verified successfully");
      return res.status(200).send(challenge);
    }
    return res.status(403).send("Forbidden");
  });

  app.post("/webhook", express.raw({ type: "application/json" }), (req: any, res) => {
    try {
      const APP_SECRET = process.env.META_APP_SECRET;
      const signature = req.headers["x-hub-signature-256"] as string;

      if (APP_SECRET) {
        if (!signature) {
          console.warn("Missing webhook signature");
          return res.status(403).send("Missing signature");
        }
        const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        const expectedSignature = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(rawBody).digest("hex");
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
          console.warn("Invalid webhook signature");
          return res.status(403).send("Invalid signature");
        }
      }

      res.status(200).send("EVENT_RECEIVED");

      const body = Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;

      if (body.object !== "whatsapp_business_account") return;

      const contactsMap = new Map<string, string>();
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value = change.value;

          const waContacts = value?.contacts || [];
          for (const wc of waContacts) {
            if (wc.wa_id && wc.profile?.name) {
              contactsMap.set(wc.wa_id, wc.profile.name);
            }
          }

          const statuses = value?.statuses || [];
          for (const status of statuses) {
            console.log("WhatsApp status update:", status.status, "for", status.recipient_id);
          }

          const messages = value?.messages || [];
          for (const msg of messages) {
            processMetaMessage(msg, contactsMap, io).catch((err) => {
              console.error("Error processing Meta message:", err);
            });
          }
        }
      }
    } catch (err) {
      console.error("Meta webhook error:", err);
      if (!res.headersSent) {
        res.status(500).send("Error");
      }
    }
  });

  function parseRatingResponse(text: string, buttonReplyId?: string | null): number | null {
    if (buttonReplyId === "rating_excellent") return 5;
    if (buttonReplyId === "rating_good") return 3;
    if (buttonReplyId === "rating_bad") return 1;

    const normalized = text.replace(/[\u{FE0F}\u{20E3}]/gu, "").trim();

    if (normalized === "1" || normalized === "1️⃣" || normalized.includes("ممتاز")) return 5;
    if (normalized === "2" || normalized === "2️⃣" || normalized.includes("جيد")) return 3;
    if (normalized === "3" || normalized === "3️⃣" || normalized.includes("سيئ")) return 1;
    return null;
  }

  async function sendRatingRequest(tenantId: string, contactPhone: string, ratingMessage: string) {
    const fullMessage = `${ratingMessage}\n\nأرسل:\n1 - ممتاز\n2 - جيد\n3 - سيئ`;
    await sendWhatsAppMessage(contactPhone, fullMessage);
  }

  setInterval(async () => {
    try {
      const pending = await storage.getConversationsPendingRating();
      for (const conv of pending) {
        const contact = await storage.getContactById(conv.contactId, conv.tenantId);
        if (!contact?.phone) continue;

        const tenant = await storage.getTenant(conv.tenantId);
        if (!tenant?.ratingEnabled) continue;

        const ratingMessage = tenant.ratingMessage ||
          "شكراً لتواصلك معنا! 🙏\nكيف تقيّم الخدمة اللي حصلت عليها؟\n\n1️⃣ ممتاز 😊\n2️⃣ جيد 👍\n3️⃣ سيئ 😞";

        await sendRatingRequest(conv.tenantId, contact.phone, ratingMessage);

        await storage.updateConversation(conv.conversationId, conv.tenantId, {
          ratingRequested: true,
        } as any);

        console.log(`Rating request sent to ${contact.phone} for conversation ${conv.conversationId}`);
      }
    } catch (err) {
      console.error("Rating dispatch error:", err);
    }
  }, 30000);

  async function processMetaMessage(msg: any, contactsMap: Map<string, string>, io: SocketServer) {
    const senderPhone = msg.from;
    const profileName = contactsMap.get(senderPhone) || null;

    let messageContent = "";
    let mediaType: string | undefined;

    if (msg.type === "interactive" && msg.interactive?.button_reply) {
      messageContent = msg.interactive.button_reply.title || msg.interactive.button_reply.id || "";
    } else if (msg.type === "text") {
      messageContent = msg.text?.body || "";
    } else if (msg.type === "image") {
      messageContent = msg.image?.caption || "[صورة]";
      mediaType = "image";
    } else if (msg.type === "video") {
      messageContent = msg.video?.caption || "[فيديو]";
      mediaType = "video";
    } else if (msg.type === "audio" || msg.type === "voice") {
      messageContent = "[رسالة صوتية]";
      mediaType = "audio";
    } else if (msg.type === "document") {
      messageContent = msg.document?.caption || `[مستند: ${msg.document?.filename || "ملف"}]`;
      mediaType = "document";
    } else if (msg.type === "location") {
      messageContent = `[موقع: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
    } else if (msg.type === "sticker") {
      messageContent = "[ملصق]";
      mediaType = "image";
    } else {
      messageContent = `[رسالة من نوع: ${msg.type}]`;
    }

    if (!messageContent) return;

    markMessageAsRead(msg.id).catch(() => {});
    console.log(`WhatsApp message from ${senderPhone}: ${messageContent.substring(0, 100)}`);

    let tenantId: string | null = null;

    const existingContact = await storage.getContactByPhone("*", senderPhone);
    if (existingContact) {
      tenantId = existingContact.tenantId;
    }

    if (!tenantId) {
      const { tenants: tenantsTable } = await import("@shared/schema");
      const allT = await db.select().from(tenantsTable).limit(1);
      if (allT.length > 0) {
        tenantId = allT[0].id;
      } else {
        console.warn("No tenant found, ignoring message");
        return;
      }
    }

    let contact = await storage.getContactByPhone(tenantId, senderPhone);
    if (!contact) {
      contact = await storage.createContact({
        tenantId,
        phone: senderPhone,
        name: profileName,
      });
    } else if (profileName && !contact.name) {
      await storage.updateContact(contact.id, tenantId, { name: profileName });
    }

    const resolvedConv = await storage.getRecentResolvedConversation(tenantId, contact.id);
    if (resolvedConv) {
      const buttonReplyId = msg.type === "interactive" ? msg.interactive?.button_reply?.id : null;
      const ratingValue = parseRatingResponse(messageContent.trim(), buttonReplyId);

      if (ratingValue !== null) {
        await storage.createRating({
          tenantId,
          conversationId: resolvedConv.id,
          agentId: resolvedConv.assignedTo,
          contactId: contact.id,
          rating: ratingValue,
        });

        await storage.updateConversation(resolvedConv.id, tenantId, {
          ratingRequested: false,
        } as any);

        const thankYouMsg = "شكراً على تقييمك! نسعد بخدمتك دائماً 💚";
        await sendWhatsAppMessage(senderPhone, thankYouMsg);

        const systemMsg = await storage.createMessage({
          conversationId: resolvedConv.id,
          tenantId,
          senderType: "system",
          content: `تقييم العميل: ${ratingValue === 5 ? "ممتاز ⭐⭐⭐⭐⭐" : ratingValue === 3 ? "جيد ⭐⭐⭐" : "سيئ ⭐"}`,
        });

        io.to(`tenant:${tenantId}`).emit("new_message", {
          conversationId: resolvedConv.id,
          message: systemMsg,
        });

        return;
      } else {
        await storage.updateConversation(resolvedConv.id, tenantId, {
          ratingRequested: false,
        } as any);
      }
    }

    let conversation = await storage.getLatestConversation(tenantId, contact.id);
    if (conversation && conversation.status === "resolved") {
      await storage.updateConversation(conversation.id, tenantId, { status: "active", assignmentStatus: "ai_handling" } as any);
      conversation = await storage.getConversationById(conversation.id, tenantId);
    }
    if (!conversation) {
      const assignedAgentId = await storage.autoAssignConversation(tenantId);
      conversation = await storage.createConversation({
        tenantId,
        contactId: contact.id,
        status: "active",
        channel: "whatsapp",
        aiHandled: false,
        assignedTo: assignedAgentId,
      });
      await storage.updateContact(contact.id, tenantId, {
        totalConversations: (contact.totalConversations || 0) + 1,
      });
      if (assignedAgentId) {
        const assignedAgent = await storage.getUserById(assignedAgentId);
        await storage.createActivityLog({
          tenantId,
          action: "conversation_assigned",
          details: {
            conversationId: conversation.id,
            agentId: assignedAgentId,
            agentName: assignedAgent?.name,
            method: "auto",
          },
        });
        await storage.incrementAgentMetric(assignedAgentId, tenantId, "totalConversations");
        io.to(`tenant:${tenantId}`).emit("conversation_assigned", {
          conversationId: conversation.id,
          agentId: assignedAgentId,
          agentName: assignedAgent?.name,
        });
      }
    }

    const customerMessage = await storage.createMessage({
      conversationId: conversation.id,
      tenantId,
      senderType: "customer",
      content: messageContent,
      mediaType,
    });

    io.to(`tenant:${tenantId}`).emit("new_message", {
      conversationId: conversation.id,
      message: customerMessage,
    });

    if (!messageContent) return;

    let metaMediaUrl: string | null = null;
    let metaImageBase64: string | undefined;
    let metaImageMimeType: string | undefined;

    if (mediaType === "image" && msg.image?.id) {
      try {
        const { getMetaMediaUrl, downloadMetaMedia } = await import("./services/meta-whatsapp");
        if (typeof getMetaMediaUrl === "function") {
          metaMediaUrl = await getMetaMediaUrl(msg.image.id);
          if (metaMediaUrl && typeof downloadMetaMedia === "function") {
            const mediaData = await downloadMetaMedia(metaMediaUrl);
            if (mediaData) {
              metaImageBase64 = mediaData.base64;
              metaImageMimeType = mediaData.mimeType;
            }
          }
        }
      } catch (e) {
        console.error("Failed to fetch Meta media:", e);
      }
    }

    const metaResult = await processIncomingMessage({
      tenantId,
      conversationId: conversation.id,
      contactId: contact.id,
      customerPhone: senderPhone,
      messageContent,
      mediaUrl: metaMediaUrl,
      mediaType,
      imageBase64: metaImageBase64,
      imageMimeType: metaImageMimeType,
      io,
      onEscalation: handleEscalation,
    });
    console.log("📋 Meta processIncomingMessage result:", metaResult.action, metaResult.handled);
  }

  app.get("/api/webhook/test", (_req, res) => {
    res.json({ status: "webhook is working" });
  });

  app.get("/api/webhook", (_req, res) => {
    res.json({ status: "webhook is working" });
  });

  async function handleTwilioWebhook(req: any, res: any) {
    console.log("📩 Webhook received:", req.body);
    res.set("Content-Type", "text/xml");
    res.status(200).send("<Response></Response>");

    try {
      const incoming = parseIncomingMessage(req.body);
      if (!incoming.from || (!incoming.content && !incoming.mediaUrl)) return;

      const phone = incoming.from.replace("whatsapp:", "");

      let tenantId: string | null = null;
      let contact = null;

      const { db: database } = await import("./db");
      const { tenants: tenantsTable, contacts: contactsTable } = await import("@shared/schema");

      const existingContact = await database.select().from(contactsTable)
        .where(eq(contactsTable.phone, phone)).limit(1);

      if (existingContact.length > 0) {
        tenantId = existingContact[0].tenantId;
        contact = existingContact[0];
      } else {
        const allT = await database.select().from(tenantsTable).limit(1);
        if (allT.length > 0) {
          tenantId = allT[0].id;
        } else {
          return;
        }
      }

      if (!contact) {
        contact = await storage.getContactByPhone(tenantId!, phone);
      }
      if (!contact) {
        contact = await storage.createContact({
          tenantId,
          phone,
          name: incoming.profileName || null,
        });
      }

      let conversation = await storage.getLatestConversation(tenantId, contact.id);
      if (conversation && conversation.status === "resolved") {
        await storage.updateConversation(conversation.id, tenantId!, { status: "active", assignmentStatus: "ai_handling" } as any);
        conversation = await storage.getConversationById(conversation.id, tenantId!);
      }
      if (!conversation) {
        conversation = await storage.createConversation({
          tenantId,
          contactId: contact.id,
          status: "active",
          channel: "whatsapp",
          aiHandled: false,
        });
        await storage.updateContact(contact.id, tenantId!, {
          totalConversations: (contact.totalConversations || 0) + 1,
        });
      }

      const messageContent = incoming.content || (incoming.mediaType?.startsWith("image") ? "[صورة]" : "[ملف]");

      const unsubKeywords = ["إلغاء", "الغاء", "stop", "unsubscribe", "إلغاء الاشتراك", "إيقاف", "ايقاف"];
      if (incoming.content && unsubKeywords.some(k => incoming.content!.trim().toLowerCase() === k.toLowerCase())) {
        await storage.updateContact(contact.id, tenantId!, {
          unsubscribed: true,
          unsubscribeTimestamp: new Date(),
        });
        try {
          await sendWhatsAppMessage(phone, "تم إلغاء اشتراكك بنجاح. لن تصلك رسائل تسويقية بعد الآن. يمكنك إعادة الاشتراك بإرسال: اشتراك");
        } catch (e) {
          console.error("Failed to send unsubscribe confirmation:", e);
        }
        return;
      }

      const resubKeywords = ["اشتراك", "subscribe"];
      if (incoming.content && resubKeywords.some(k => incoming.content!.trim().toLowerCase() === k.toLowerCase())) {
        await storage.updateContact(contact.id, tenantId!, {
          optInStatus: true,
          optInSource: "whatsapp",
          optInTimestamp: new Date(),
          unsubscribed: false,
          unsubscribeTimestamp: null,
        });
        try {
          await sendWhatsAppMessage(phone, "تم تفعيل اشتراكك بنجاح! ستصلك آخر العروض والتحديثات.");
        } catch (e) {
          console.error("Failed to send resubscribe confirmation:", e);
        }
        return;
      }

      const customerMessage = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "customer",
        content: messageContent,
        mediaUrl: incoming.mediaUrl,
        mediaType: incoming.mediaType,
        metaMediaId: incoming.metaMediaId,
        twilioSid: incoming.messageSid,
      });

      await storage.createMessageLog({
        tenantId,
        contactId: contact.id,
        conversationId: conversation.id,
        messageType: "customer_message",
        direction: "inbound",
        channel: "whatsapp",
        delivered: true,
        twilioSid: incoming.messageSid,
        sentAt: new Date(),
      });

      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: customerMessage,
      });

      console.log("🤖 AI check - conversationId:", conversation.id);

      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (incoming.mediaUrl && incoming.mediaType?.startsWith("image")) {
        try {
          const fetch = (await import("node-fetch")).default;
          const twilioSid2 = process.env.TWILIO_ACCOUNT_SID;
          const twilioAuth2 = process.env.TWILIO_AUTH_TOKEN;
          const imgResp = await fetch(incoming.mediaUrl, {
            headers: twilioSid2 && twilioAuth2 ? { "Authorization": "Basic " + Buffer.from(`${twilioSid2}:${twilioAuth2}`).toString("base64") } : {},
          });
          const buffer = await imgResp.buffer();
          imageBase64 = buffer.toString("base64");
          imageMimeType = incoming.mediaType || "image/jpeg";
        } catch (e) {
          console.error("Failed to fetch media for vision:", e);
        }
      }

      const result = await processIncomingMessage({
        tenantId: tenantId!,
        conversationId: conversation.id,
        contactId: contact.id,
        customerPhone: incoming.from,
        messageContent,
        mediaUrl: incoming.mediaUrl,
        mediaType: incoming.mediaType,
        imageBase64,
        imageMimeType,
        io,
        onEscalation: handleEscalation,
      });
      console.log("📋 processIncomingMessage result:", result.action, result.handled);
    } catch (err) {
      console.error("Webhook error:", err);
    }
  }

  app.post("/api/webhook", handleTwilioWebhook);
  app.post("/api/webhook/twilio", handleTwilioWebhook);

  // Conversations - role-based
  app.get("/api/conversations", authMiddleware, async (req: any, res) => {
    try {
      const status = req.query.status as string;
      const convs = await storage.getConversationsByTenant(
        req.user.tenantId,
        status,
        req.user.id,
        req.user.role
      );
      res.json(convs);
    } catch (err) {
      console.error("Get conversations error:", err);
      res.status(500).json({ message: "خطأ في جلب المحادثات" });
    }
  });

  app.get("/api/conversations/stats/overview", authMiddleware, async (req: any, res) => {
    try {
      const stats = await storage.getStats(req.user.tenantId);
      res.json(stats);
    } catch (err) {
      console.error("Stats error:", err);
      res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
    }
  });

  app.get("/api/conversations/analytics", authMiddleware, async (req: any, res) => {
    try {
      const days = parseInt(req.query.days as string) || 7;
      const analytics = await storage.getAnalytics(req.user.tenantId, days);
      res.json(analytics);
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ message: "خطأ في جلب التحليلات" });
    }
  });

  app.get("/api/finance/pending", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "manager") {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const payments = await storage.getPendingPayments(req.user.tenantId);
      res.json(payments);
    } catch (err) {
      console.error("Finance pending error:", err);
      res.status(500).json({ message: "خطأ في جلب المدفوعات" });
    }
  });

  app.post("/api/finance/:id/confirm", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "manager") {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const payment = await storage.getAiPaymentById(req.params.id, req.user.tenantId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });

      await storage.updateAiPayment(payment.id, req.user.tenantId, {
        status: "approved",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      } as any);

      if (payment.conversationId) {
        await storage.upsertAiContext(payment.conversationId, req.user.tenantId, "confirmed");
      }

      if (payment.customerPhone) {
        try {
          const phoneNum = payment.customerPhone.startsWith("whatsapp:") ? payment.customerPhone : payment.customerPhone;
          await sendWhatsAppMessage(phoneNum, "تم تأكيد مبلغك بنجاح، جاري إصدار التذاكر");
        } catch (e) {
          console.error("Failed to send confirmation WhatsApp:", e);
        }
      }

      io.to(`tenant:${req.user.tenantId}`).emit("payment_confirmed", { paymentId: payment.id });
      res.json({ success: true });
    } catch (err) {
      console.error("Finance confirm error:", err);
      res.status(500).json({ message: "خطأ في تأكيد الدفعة" });
    }
  });

  app.post("/api/finance/:id/reject", authMiddleware, async (req: any, res) => {
    try {
      if (req.user.role !== "admin" && req.user.role !== "manager") {
        return res.status(403).json({ message: "غير مصرح" });
      }
      const payment = await storage.getAiPaymentById(req.params.id, req.user.tenantId);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });

      const reason = req.body.reason || "تم رفض الإيصال";

      await storage.updateAiPayment(payment.id, req.user.tenantId, {
        status: "rejected",
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      } as any);

      if (payment.customerPhone) {
        try {
          await sendWhatsAppMessage(payment.customerPhone, `عذرا، لم يتم قبول الإيصال. السبب: ${reason}. يرجى إرسال إيصال صحيح.`);
        } catch (e) {
          console.error("Failed to send rejection WhatsApp:", e);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Finance reject error:", err);
      res.status(500).json({ message: "خطأ في رفض الدفعة" });
    }
  });

  app.get("/api/finance/stats", authMiddleware, async (req: any, res) => {
    try {
      const stats = await storage.getFinanceStats(req.user.tenantId);
      res.json(stats);
    } catch (err) {
      console.error("Finance stats error:", err);
      res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
    }
  });

  app.get("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    try {
      const conversation = await storage.getConversationById(req.params.id, req.user.tenantId);
      if (!conversation) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }
      if (req.user.role === "agent" && conversation.assignedTo && conversation.assignedTo !== req.user.id) {
        return res.status(403).json({ message: "غير مصرح بالوصول لهذه المحادثة" });
      }
      const msgs = await storage.getMessagesByConversation(req.params.id);
      res.json(msgs);
    } catch (err) {
      console.error("Get messages error:", err);
      res.status(500).json({ message: "خطأ في جلب الرسائل" });
    }
  });

  app.post("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    try {
      const { content, isInternal, mediaUrl } = req.body;
      if (!content) return res.status(400).json({ message: "محتوى الرسالة مطلوب" });

      const conversation = await storage.getConversationById(req.params.id, req.user.tenantId);
      if (!conversation) return res.status(404).json({ message: "المحادثة غير موجودة" });

      if (req.user.role === "agent" && conversation.assignedTo !== req.user.id) {
        return res.status(403).json({ message: "غير مصرح بالوصول لهذه المحادثة" });
      }

      let twilioSid: string | null = null;
      let windowWarning: string | undefined;
      if (!isInternal && conversation.contactId) {
        const contact = await storage.getContactById(conversation.contactId, req.user.tenantId);
        if (contact) {
          const lastCustomerMsg = await storage.getLastCustomerMessage(conversation.id);
          const now = new Date();
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const withinWindow = lastCustomerMsg?.createdAt && new Date(lastCustomerMsg.createdAt) > twentyFourHoursAgo;

          if (!withinWindow) {
            windowWarning = "تنبيه: آخر رسالة من العميل تجاوزت 24 ساعة. يُسمح فقط بإرسال Template معتمد خارج هذه النافذة";
          }

          try {
            twilioSid = await sendWhatsAppMessage(`whatsapp:${contact.phone}`, content, mediaUrl || undefined);
          } catch (err) {
            console.error("WhatsApp send failed:", err);
          }
        }
      }

      const msg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId: req.user.tenantId,
        senderType: isInternal ? "internal" : "agent",
        senderId: req.user.id,
        content,
        isInternal: isInternal || false,
        mediaUrl: mediaUrl || null,
        mediaType: mediaUrl ? "image" : null,
        twilioSid,
      });

      if (!isInternal) {
        const updateData: any = {};
        if (conversation.status === "waiting" || conversation.aiPaused) {
          updateData.status = "active";
          updateData.assignedTo = req.user.id;
          updateData.aiPaused = false;
        }
        if (conversation.delayAlerted) {
          updateData.delayAlerted = false;
        }
        if (Object.keys(updateData).length > 0) {
          await storage.updateConversation(conversation.id, req.user.tenantId, updateData);
        }
        await storage.incrementAgentMetric(req.user.id, req.user.tenantId, "totalMessages");

        await storage.createMessageLog({
          tenantId: req.user.tenantId,
          contactId: conversation.contactId,
          conversationId: conversation.id,
          messageType: "agent_reply",
          direction: "outbound",
          channel: "whatsapp",
          delivered: !!twilioSid,
          failed: !twilioSid && !isInternal,
          twilioSid: twilioSid,
          sentAt: new Date(),
        });

        await storage.createActivityLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          action: "message_sent",
          details: { conversationId: conversation.id },
        });
      }

      io.to(`tenant:${req.user.tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: msg,
      });

      const response: any = { ...msg };
      if (windowWarning) response.windowWarning = windowWarning;
      res.status(201).json(response);
    } catch (err) {
      console.error("Send message error:", err);
      res.status(500).json({ message: "خطأ في إرسال الرسالة" });
    }
  });

  // Assign agent to conversation (admin/manager only)
  app.patch("/api/conversations/:id/assign", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { agentId } = req.body;
      const conversation = await storage.getConversationById(req.params.id, req.user.tenantId);
      if (!conversation) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      if (agentId) {
        const agent = await storage.getUserById(agentId);
        if (!agent || agent.tenantId !== req.user.tenantId) {
          return res.status(400).json({ message: "الموظف غير موجود" });
        }
      }

      const previousAssignee = conversation.assignedTo;
      const updated = await storage.updateConversation(req.params.id, req.user.tenantId, {
        assignedTo: agentId || null,
        assignmentStatus: agentId ? "assigned" : "ai_handling",
      });

      await storage.createAssignmentLog({
        tenantId: req.user.tenantId,
        conversationId: req.params.id,
        previousAssignee: previousAssignee || null,
        newAssignee: agentId || null,
        assignedBy: req.user.id,
      });

      res.json(updated);
    } catch (err) {
      console.error("Assign agent error:", err);
      res.status(500).json({ message: "خطأ في تعيين الموظف" });
    }
  });

  app.patch("/api/conversations/:id", authMiddleware, async (req: any, res) => {
    try {
      const existingConv = await storage.getConversationById(req.params.id, req.user.tenantId);
      if (!existingConv) return res.status(404).json({ message: "المحادثة غير موجودة" });

      if (req.user.role === "agent") {
        if (existingConv.assignedTo !== req.user.id) {
          return res.status(403).json({ message: "غير مصرح بالوصول لهذه المحادثة" });
        }
        delete req.body.assignedTo;
        delete req.body.assigned_to;
        delete req.body.assignmentStatus;
        delete req.body.assignment_status;
      }

      const updateData = { ...req.body };
      if (updateData.status === "resolved") {
        updateData.assignmentStatus = "closed";
        updateData.resolvedAt = new Date();
      }
      const conv = await storage.updateConversation(req.params.id, req.user.tenantId, updateData);
      if (!conv) return res.status(404).json({ message: "المحادثة غير موجودة" });

      if (req.body.status === "resolved" && conv.assignedTo) {
        await storage.incrementAgentMetric(conv.assignedTo, req.user.tenantId, "resolvedConversations");
        await storage.createActivityLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          action: "conversation_resolved",
          details: { conversationId: conv.id },
        });

        const tenant = await storage.getTenant(req.user.tenantId);
        if (tenant?.ratingEnabled) {
          const delayMinutes = tenant.ratingDelayMinutes || 2;
          const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);
          await storage.updateConversation(conv.id, req.user.tenantId, {
            ratingScheduledAt: scheduledAt,
          } as any);
        }
      }

      res.json(conv);
    } catch (err) {
      console.error("Update conversation error:", err);
      res.status(500).json({ message: "خطأ في تحديث المحادثة" });
    }
  });

  app.get("/api/contacts", authMiddleware, async (req: any, res) => {
    try {
      const search = req.query.search as string;
      const contactsList = await storage.getContactsByTenant(req.user.tenantId, search);
      res.json(contactsList);
    } catch (err) {
      console.error("Get contacts error:", err);
      res.status(500).json({ message: "خطأ في جلب جهات الاتصال" });
    }
  });

  app.patch("/api/contacts/:id", authMiddleware, async (req: any, res) => {
    try {
      const contact = await storage.updateContact(req.params.id, req.user.tenantId, req.body);
      if (!contact) return res.status(404).json({ message: "جهة الاتصال غير موجودة" });
      res.json(contact);
    } catch (err) {
      console.error("Update contact error:", err);
      res.status(500).json({ message: "خطأ في تحديث جهة الاتصال" });
    }
  });

  app.post("/api/contacts/:id/opt-in", authMiddleware, async (req: any, res) => {
    try {
      const source = req.body.source || "dashboard";
      const contact = await storage.updateContact(req.params.id, req.user.tenantId, {
        optInStatus: true,
        optInSource: source,
        optInTimestamp: new Date(),
        optInIp: req.ip,
        unsubscribed: false,
        unsubscribeTimestamp: null,
      });
      if (!contact) return res.status(404).json({ message: "جهة الاتصال غير موجودة" });
      res.json(contact);
    } catch (err) {
      console.error("Opt-in error:", err);
      res.status(500).json({ message: "خطأ في تسجيل الموافقة" });
    }
  });

  app.post("/api/contacts/:id/opt-out", authMiddleware, async (req: any, res) => {
    try {
      const contact = await storage.updateContact(req.params.id, req.user.tenantId, {
        unsubscribed: true,
        unsubscribeTimestamp: new Date(),
      });
      if (!contact) return res.status(404).json({ message: "جهة الاتصال غير موجودة" });
      res.json(contact);
    } catch (err) {
      console.error("Opt-out error:", err);
      res.status(500).json({ message: "خطأ في إلغاء الاشتراك" });
    }
  });

  app.post("/api/contacts/bulk-opt-in", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { contactIds, source } = req.body;
      if (!Array.isArray(contactIds) || contactIds.length === 0) {
        return res.status(400).json({ message: "يجب تحديد جهات اتصال" });
      }
      let updated = 0;
      for (const id of contactIds) {
        const result = await storage.updateContact(id, req.user.tenantId, {
          optInStatus: true,
          optInSource: source || "dashboard",
          optInTimestamp: new Date(),
          unsubscribed: false,
          unsubscribeTimestamp: null,
        });
        if (result) updated++;
      }
      res.json({ updated, total: contactIds.length });
    } catch (err) {
      console.error("Bulk opt-in error:", err);
      res.status(500).json({ message: "خطأ في تسجيل الموافقة الجماعية" });
    }
  });

  app.get("/api/ai/knowledge", authMiddleware, async (req: any, res) => {
    try {
      const entries = await storage.getKnowledgeByTenant(req.user.tenantId);
      res.json(entries);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.post("/api/ai/knowledge", authMiddleware, async (req: any, res) => {
    try {
      const entry = await storage.createKnowledge({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(entry);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.patch("/api/ai/knowledge/:id", authMiddleware, async (req: any, res) => {
    try {
      const entry = await storage.updateKnowledge(req.params.id, req.user.tenantId, req.body);
      if (!entry) return res.status(404).json({ message: "غير موجود" });
      res.json(entry);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/ai/knowledge/:id", authMiddleware, async (req: any, res) => {
    try {
      await storage.deleteKnowledge(req.params.id, req.user.tenantId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.get("/api/ai/auto-replies", authMiddleware, async (req: any, res) => {
    try {
      const replies = await storage.getAutoRepliesByTenant(req.user.tenantId);
      res.json(replies);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.post("/api/ai/auto-replies", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const reply = await storage.createAutoReply({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.patch("/api/ai/auto-replies/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const reply = await storage.updateAutoReply(req.params.id, req.user.tenantId, req.body);
      if (!reply) return res.status(404).json({ message: "غير موجود" });
      res.json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/ai/auto-replies/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      await storage.deleteAutoReply(req.params.id, req.user.tenantId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.get("/api/quick-replies", authMiddleware, async (req: any, res) => {
    try {
      const replies = await storage.getQuickRepliesByTenant(req.user.tenantId);
      res.json(replies);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.post("/api/quick-replies", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const reply = await storage.createQuickReply({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/quick-replies/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      await storage.deleteQuickReply(req.params.id, req.user.tenantId);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  // Transfer conversation to another agent
  app.post("/api/conversations/:id/transfer", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const targetAgentId = req.body.toAgentId || req.body.targetAgentId;
      if (!targetAgentId) return res.status(400).json({ message: "الموظف المستهدف مطلوب" });

      const conversation = await storage.getConversationById(req.params.id, req.user.tenantId);
      if (!conversation) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      const targetAgent = await storage.getUserById(targetAgentId);
      if (!targetAgent || targetAgent.tenantId !== req.user.tenantId) {
        return res.status(400).json({ message: "الموظف غير موجود" });
      }

      const fromUser = await storage.getUserById(req.user.id);
      const fromName = fromUser?.name || "موظف";
      const previousAssignee = conversation.assignedTo;

      await storage.updateConversation(conversation.id, req.user.tenantId, {
        assignedTo: targetAgentId,
        assignmentStatus: "assigned",
      });

      await storage.createAssignmentLog({
        tenantId: req.user.tenantId,
        conversationId: conversation.id,
        previousAssignee: previousAssignee || null,
        newAssignee: targetAgentId,
        assignedBy: req.user.id,
      });

      const systemMsg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId: req.user.tenantId,
        senderType: "system",
        content: `تم تحويل المحادثة من ${fromName} إلى ${targetAgent.name}`,
      });

      await storage.createActivityLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        action: "conversation_transferred",
        details: {
          conversationId: conversation.id,
          fromAgentId: req.user.id,
          fromAgentName: fromName,
          toAgentId: targetAgentId,
          toAgentName: targetAgent.name,
        },
      });

      io.to(`tenant:${req.user.tenantId}`).emit("conversation_transferred", {
        conversationId: conversation.id,
        fromAgentId: req.user.id,
        toAgentId: targetAgentId,
        toAgentName: targetAgent.name,
      });

      io.to(`tenant:${req.user.tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: systemMsg,
      });

      res.json({ message: "تم التحويل بنجاح" });
    } catch (err) {
      console.error("Transfer error:", err);
      res.status(500).json({ message: "خطأ في تحويل المحادثة" });
    }
  });

  // Assignment logs for a conversation (admin/manager only)
  app.get("/api/conversations/:id/assignments", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const logs = await storage.getAssignmentLogsByConversation(req.params.id, req.user.tenantId);
      res.json(logs);
    } catch (err) {
      console.error("Assignment logs error:", err);
      res.status(500).json({ message: "خطأ في جلب سجل التحويلات" });
    }
  });

  // Team monitoring endpoint
  app.get("/api/team/monitoring", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const monitoring = await storage.getTeamMonitoring(req.user.tenantId);
      res.json(monitoring);
    } catch (err) {
      console.error("Monitoring error:", err);
      res.status(500).json({ message: "خطأ في جلب بيانات المراقبة" });
    }
  });

  // Activity log endpoint
  app.get("/api/activity-log", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getActivityLogByTenant(req.user.tenantId, limit);
      res.json(logs);
    } catch (err) {
      console.error("Activity log error:", err);
      res.status(500).json({ message: "خطأ في جلب سجل النشاطات" });
    }
  });

  // Team members with active chat counts (for transfer popup)
  app.get("/api/team/available", authMiddleware, async (req: any, res) => {
    try {
      const teamMembers = await storage.getUsersByTenant(req.user.tenantId);
      const result = [];
      for (const member of teamMembers) {
        const activeChats = await storage.getActiveConversationCountByAgent(member.id);
        result.push({
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          activeChats,
          maxConcurrentChats: member.maxConcurrentChats || 10,
        });
      }
      res.json(result);
    } catch (err) {
      console.error("Available team error:", err);
      res.status(500).json({ message: "خطأ في جلب الموظفين" });
    }
  });

  app.get("/api/export/contacts", authMiddleware, async (req: any, res) => {
    try {
      const contactsList = await storage.getContactsByTenant(req.user.tenantId);

      const rows = [];
      for (const c of contactsList) {
        const contactMsgCount = await db.select({ count: count() })
          .from(messagesTable)
          .where(sqlHelper`${messagesTable.conversationId} IN (
            SELECT id FROM conversations WHERE contact_id = ${c.id}
          )`);

        rows.push({
          name: c.name || "",
          phone: c.phone,
          tags: (c.tags || []).join(", "),
          sentiment: c.sentiment || "",
          totalConversations: c.totalConversations || 0,
          messageCount: contactMsgCount[0]?.count || 0,
          createdAt: c.createdAt ? new Date(c.createdAt).toLocaleDateString("ar-SA") : "",
        });
      }

      const header = "الاسم,رقم الهاتف,الوسوم,المشاعر,عدد المحادثات,عدد الرسائل,تاريخ التسجيل\n";
      const csvContent = rows.map(r =>
        `"${r.name}","${r.phone}","${r.tags}","${r.sentiment}",${r.totalConversations},${r.messageCount},"${r.createdAt}"`
      ).join("\n");

      const bom = "\uFEFF";
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", "attachment; filename=contacts_report.csv");
      res.send(bom + header + csvContent);
    } catch (err) {
      console.error("Export error:", err);
      res.status(500).json({ message: "خطأ في التصدير" });
    }
  });

  app.get("/api/ratings/stats", authMiddleware, async (req: any, res) => {
    try {
      const stats = await storage.getAgentRatingStats(req.user.tenantId);
      res.json(stats);
    } catch (err) {
      console.error("Rating stats error:", err);
      res.status(500).json({ message: "خطأ في جلب إحصائيات التقييمات" });
    }
  });

  app.get("/api/ratings/agent/:agentId", authMiddleware, async (req: any, res) => {
    try {
      const ratingsList = await storage.getRatingsByAgent(req.params.agentId, req.user.tenantId);
      res.json(ratingsList);
    } catch (err) {
      console.error("Agent ratings error:", err);
      res.status(500).json({ message: "خطأ في جلب التقييمات" });
    }
  });

  // ==================== CAMPAIGNS ====================

  app.get("/api/campaigns", authMiddleware, async (req: any, res) => {
    try {
      const list = await storage.getCampaignsByTenant(req.user.tenantId);
      res.json(list);
    } catch (err) {
      console.error("Campaigns list error:", err);
      res.status(500).json({ message: "خطأ في جلب الحملات" });
    }
  });

  app.get("/api/campaigns/:id", authMiddleware, async (req: any, res) => {
    try {
      const campaign = await storage.getCampaignById(req.params.id);
      if (!campaign || campaign.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الحملة غير موجودة" });
      }
      res.json(campaign);
    } catch (err) {
      console.error("Campaign get error:", err);
      res.status(500).json({ message: "خطأ في جلب الحملة" });
    }
  });

  const campaignCreateSchema = z.object({
    title: z.string().min(1),
    description: z.union([z.string(), z.null()]).optional(),
    imageUrl: z.union([z.string(), z.null()]).optional(),
    messageText: z.union([z.string(), z.null()]).optional(),
    templateName: z.union([z.string(), z.null()]).optional(),
    ctaType: z.union([z.string(), z.null()]).optional(),
    ctaValue: z.union([z.string(), z.null()]).optional(),
    targetType: z.string().optional(),
    targetTags: z.array(z.string()).optional(),
    targetContactIds: z.array(z.string()).optional(),
    status: z.string().optional(),
    scheduledAt: z.union([z.string(), z.null()]).optional(),
  });

  const productCreateSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    price: z.string().optional().nullable(),
    currency: z.string().optional(),
    imageUrl: z.string().optional().nullable(),
    link: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  });

  app.post("/api/campaigns", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const parsed = campaignCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.errors });
      }
      const campaign = await storage.createCampaign({
        ...parsed.data,
        tenantId: req.user.tenantId,
        createdBy: req.user.id,
      });
      res.status(201).json(campaign);
    } catch (err) {
      console.error("Campaign create error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الحملة" });
    }
  });

  app.patch("/api/campaigns/:id", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getCampaignById(req.params.id);
      if (!existing || existing.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الحملة غير موجودة" });
      }
      const updated = await storage.updateCampaign(req.params.id, req.user.tenantId, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Campaign update error:", err);
      res.status(500).json({ message: "خطأ في تحديث الحملة" });
    }
  });

  app.delete("/api/campaigns/:id", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getCampaignById(req.params.id);
      if (!existing || existing.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الحملة غير موجودة" });
      }
      await storage.deleteCampaign(req.params.id, req.user.tenantId);
      res.json({ success: true });
    } catch (err) {
      console.error("Campaign delete error:", err);
      res.status(500).json({ message: "خطأ في حذف الحملة" });
    }
  });

  app.post("/api/campaigns/:id/send", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const campaign = await storage.getCampaignById(req.params.id);
      if (!campaign || campaign.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الحملة غير موجودة" });
      }

      if (!campaign.templateName || campaign.templateName.trim() === "") {
        return res.status(400).json({
          message: "يجب تحديد اسم Template معتمد من Meta قبل إرسال الحملة",
          reason: "no_template",
        });
      }

      const tenant = await storage.getTenant(req.user.tenantId);
      if (!tenant) {
        return res.status(404).json({ message: "المنشأة غير موجودة" });
      }

      if (!tenant.firstCampaignApproved) {
        return res.status(400).json({
          message: "يجب الحصول على موافقة إدارية قبل إرسال أول حملة",
          reason: "not_approved",
        });
      }

      const blockRate = await storage.getCampaignBlockRate(req.user.tenantId);
      if (blockRate > 3) {
        return res.status(400).json({
          message: `نسبة الفشل/الحظر مرتفعة (${blockRate.toFixed(1)}%). يجب أن تكون أقل من 3% قبل إرسال حملة جديدة`,
          reason: "high_block_rate",
          blockRate: blockRate.toFixed(1),
        });
      }

      const dailySent = await storage.getDailySendCount(req.user.tenantId);
      let effectiveLimit = tenant.dailySendLimit || 250;

      if (tenant.warmupDaysRemaining && tenant.warmupDaysRemaining > 0) {
        if (!tenant.warmupStartedAt) {
          await storage.updateTenant(req.user.tenantId, { warmupStartedAt: new Date() });
        } else {
          const daysSinceStart = Math.floor((Date.now() - new Date(tenant.warmupStartedAt).getTime()) / (24 * 60 * 60 * 1000));
          const newRemaining = Math.max(0, 14 - daysSinceStart);
          if (newRemaining !== tenant.warmupDaysRemaining) {
            await storage.updateTenant(req.user.tenantId, { warmupDaysRemaining: newRemaining });
          }
        }
        const warmupProgress = Math.max(1, 14 - (tenant.warmupDaysRemaining || 0));
        effectiveLimit = Math.min(effectiveLimit, Math.floor(50 * Math.pow(1.3, warmupProgress - 1)));
      }

      if (dailySent >= effectiveLimit) {
        return res.status(400).json({
          message: `تم الوصول للحد اليومي للإرسال (${effectiveLimit} رسالة). حاول مرة أخرى غداً`,
          reason: "daily_limit_reached",
          dailySent,
          dailyLimit: effectiveLimit,
        });
      }

      const remaining = effectiveLimit - dailySent;

      let allTargetContacts: any[] = [];
      if (campaign.targetType === "all") {
        allTargetContacts = await storage.getContactsByTenant(req.user.tenantId);
      } else if (campaign.targetType === "tags" && campaign.targetTags?.length) {
        const allContacts = await storage.getContactsByTenant(req.user.tenantId);
        allTargetContacts = allContacts.filter((c: any) =>
          c.tags?.some((t: string) => campaign.targetTags!.includes(t))
        );
      } else if (campaign.targetType === "specific" && campaign.targetContactIds?.length) {
        const allContacts = await storage.getContactsByTenant(req.user.tenantId);
        allTargetContacts = allContacts.filter((c: any) =>
          campaign.targetContactIds!.includes(c.id)
        );
      }

      let targetContacts = allTargetContacts.filter((c: any) =>
        c.optInStatus === true && c.unsubscribed !== true
      );

      const skippedCount = allTargetContacts.length - targetContacts.length;
      let cappedByLimit = 0;
      if (targetContacts.length > remaining) {
        cappedByLimit = targetContacts.length - remaining;
        targetContacts = targetContacts.slice(0, remaining);
      }

      if (targetContacts.length === 0) {
        return res.status(400).json({
          message: "لا يوجد جهات اتصال مستهدفة لديها موافقة (Opt-in) على استقبال الرسائل",
          skippedCount,
          reason: "no_opt_in",
        });
      }

      await storage.updateCampaign(campaign.id, req.user.tenantId, {
        status: "sent",
        sentAt: new Date(),
        totalRecipients: targetContacts.length,
      } as any);

      let deliveredCount = 0;
      const BATCH_SIZE = 20;
      const BATCH_DELAY_MS = 2000;

      for (let i = 0; i < targetContacts.length; i++) {
        const contact = targetContacts[i];

        if (i > 0 && i % BATCH_SIZE === 0) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));

          const currentBlockRate = await storage.getCampaignBlockRate(req.user.tenantId);
          if (currentBlockRate > 3) {
            console.warn(`⚠️ Campaign ${campaign.id} stopped: block rate ${currentBlockRate.toFixed(1)}% exceeded 3%`);
            await storage.updateCampaign(campaign.id, req.user.tenantId, {
              deliveredCount,
              status: "stopped",
            } as any);
            return res.json({
              success: false,
              message: `تم إيقاف الحملة تلقائياً — نسبة الفشل بلغت ${currentBlockRate.toFixed(1)}%`,
              totalRecipients: targetContacts.length,
              deliveredCount,
              skippedNoOptIn: skippedCount,
              stoppedAt: i,
              reason: "block_rate_exceeded",
            });
          }
        }

        try {
          const baseText = campaign.messageText || campaign.title;
          const messageText = `${baseText}\n\n---\nلإلغاء الاشتراك، أرسل: إلغاء`;
          let sid: string | null = null;
          try {
            sid = await sendWhatsAppMessage(contact.phone, messageText);
          } catch (whatsappErr) {
            console.error("WhatsApp campaign send failed for", contact.phone, whatsappErr);
          }

          let conversation = await storage.getLatestConversation(req.user.tenantId, contact.id);
          if (conversation && conversation.status === "resolved") {
            await storage.updateConversation(conversation.id, req.user.tenantId, { status: "active", assignmentStatus: "ai_handling" } as any);
            conversation = await storage.getConversationById(conversation.id, req.user.tenantId);
          }
          if (!conversation) {
            const assignedAgentId = await storage.autoAssignConversation(req.user.tenantId);
            conversation = await storage.createConversation({
              tenantId: req.user.tenantId,
              contactId: contact.id,
              status: "active",
              channel: "whatsapp",
              aiHandled: false,
              assignedTo: assignedAgentId,
            });
            await storage.updateContact(contact.id, req.user.tenantId, {
              totalConversations: (contact.totalConversations || 0) + 1,
            });
            if (assignedAgentId) {
              await storage.incrementAgentMetric(assignedAgentId, req.user.tenantId, "totalConversations");
            }
          }

          const msg = await storage.createMessage({
            conversationId: conversation!.id,
            tenantId: req.user.tenantId,
            senderType: "system",
            content: `📢 حملة "${campaign.title}": ${baseText}`,
            twilioSid: sid,
          });

          io.to(`tenant:${req.user.tenantId}`).emit("new_message", {
            conversationId: conversation.id,
            message: msg,
          });

          await storage.createCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            tenantId: req.user.tenantId,
            status: "sent",
            sentAt: new Date(),
          });

          await storage.createMessageLog({
            tenantId: req.user.tenantId,
            contactId: contact.id,
            conversationId: conversation?.id,
            templateName: campaign.templateName,
            messageType: "campaign",
            direction: "outbound",
            channel: "whatsapp",
            delivered: true,
            twilioSid: sid,
            sentAt: new Date(),
          });

          deliveredCount++;
        } catch (sendErr: any) {
          await storage.createCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            tenantId: req.user.tenantId,
            status: "failed",
            error: sendErr.message,
          });

          await storage.createMessageLog({
            tenantId: req.user.tenantId,
            contactId: contact.id,
            templateName: campaign.templateName,
            messageType: "campaign",
            direction: "outbound",
            channel: "whatsapp",
            failed: true,
            errorReason: sendErr.message,
            sentAt: new Date(),
          });
        }
      }

      await storage.updateCampaign(campaign.id, req.user.tenantId, { deliveredCount } as any);

      res.json({
        success: true,
        totalRecipients: targetContacts.length,
        deliveredCount,
        skippedNoOptIn: skippedCount,
        cappedByDailyLimit: cappedByLimit,
      });
    } catch (err) {
      console.error("Campaign send error:", err);
      res.status(500).json({ message: "خطأ في إرسال الحملة" });
    }
  });

  app.get("/api/campaigns/:id/logs", authMiddleware, async (req: any, res) => {
    try {
      const campaign = await storage.getCampaignById(req.params.id);
      if (!campaign || campaign.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الحملة غير موجودة" });
      }
      const logs = await storage.getCampaignLogsByCampaign(req.params.id);
      res.json(logs);
    } catch (err) {
      console.error("Campaign logs error:", err);
      res.status(500).json({ message: "خطأ في جلب سجلات الحملة" });
    }
  });

  app.post("/api/campaigns/generate-image", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ message: "يجب تقديم وصف للصورة" });
      }
      const { generateImageBuffer } = await import("./replit_integrations/image/client");
      const buffer = await generateImageBuffer(prompt, "1024x1024");

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)" });
      }

      const filename = `campaign_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      const imageUrl = `/uploads/campaigns/${filename}`;
      res.json({ imageUrl });
    } catch (err) {
      console.error("Image generation error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الصورة" });
    }
  });

  app.post("/api/campaigns/upload-image", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { base64Data } = req.body;
      if (!base64Data) {
        return res.status(400).json({ message: "لم يتم تقديم بيانات الصورة" });
      }

      const match = base64Data.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ message: "نوع الصورة غير مدعوم. الأنواع المسموحة: png, jpg, jpeg, webp" });
      }

      const ext = match[1] === "jpeg" ? "jpg" : match[1];
      const buffer = Buffer.from(match[2], "base64");

      if (buffer.length > 10 * 1024 * 1024) {
        return res.status(400).json({ message: "حجم الصورة يتجاوز الحد المسموح (10 ميجابايت)" });
      }

      const filename = `campaign_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.${ext}`;
      const filepath = path.join(UPLOADS_DIR, filename);
      fs.writeFileSync(filepath, buffer);

      const imageUrl = `/uploads/campaigns/${filename}`;
      res.json({ imageUrl });
    } catch (err) {
      console.error("Image upload error:", err);
      res.status(500).json({ message: "خطأ في رفع الصورة" });
    }
  });

  app.post("/api/campaigns/generate-text", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { description, tone } = req.body;
      if (!description) {
        return res.status(400).json({ message: "يجب تقديم وصف الحملة" });
      }
      const { openai } = await import("./replit_integrations/image/client");
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `أنت كاتب محتوى تسويقي محترف. اكتب رسالة تسويقية قصيرة ومقنعة بالعربية لإرسالها عبر واتساب. النبرة: ${tone || "احترافية"}. الرسالة يجب أن تكون مختصرة (أقل من 500 حرف) ومناسبة للواتساب.`,
          },
          {
            role: "user",
            content: `اكتب رسالة تسويقية عن: ${description}`,
          },
        ],
        max_tokens: 300,
      });
      const text = completion.choices[0]?.message?.content || "";
      res.json({ text });
    } catch (err) {
      console.error("Text generation error:", err);
      res.status(500).json({ message: "خطأ في إنشاء النص" });
    }
  });

  // ==================== NUMBER HEALTH & COMPLIANCE ====================

  app.get("/api/number-health", authMiddleware, async (req: any, res) => {
    try {
      const health = await storage.getNumberHealth(req.user.tenantId);
      const tenant = await storage.getTenant(req.user.tenantId);
      let riskLevel: "safe" | "warning" | "danger" = "safe";
      if (health.blockRate > 3) riskLevel = "danger";
      else if (health.blockRate > 1) riskLevel = "warning";

      res.json({
        ...health,
        qualityRating: tenant?.qualityRating || "unknown",
        riskLevel,
        warmupDaysRemaining: tenant?.warmupDaysRemaining || 0,
        firstCampaignApproved: tenant?.firstCampaignApproved || false,
      });
    } catch (err) {
      console.error("Number health error:", err);
      res.status(500).json({ message: "خطأ في جلب صحة الرقم" });
    }
  });

  app.get("/api/message-logs", authMiddleware, async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getMessageLogsByTenant(req.user.tenantId, limit);
      res.json(logs);
    } catch (err) {
      console.error("Message logs error:", err);
      res.status(500).json({ message: "خطأ في جلب سجلات الرسائل" });
    }
  });

  app.patch("/api/tenant/daily-limit", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const { dailySendLimit } = req.body;
      if (typeof dailySendLimit !== "number" || dailySendLimit < 1) {
        return res.status(400).json({ message: "الحد اليومي غير صالح" });
      }
      const updated = await storage.updateTenant(req.user.tenantId, { dailySendLimit });
      res.json(updated);
    } catch (err) {
      console.error("Daily limit error:", err);
      res.status(500).json({ message: "خطأ في تحديث الحد اليومي" });
    }
  });

  app.post("/api/tenant/approve-first-campaign", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "فقط المدير يمكنه الموافقة" });
      }
      const updated = await storage.updateTenant(req.user.tenantId, { firstCampaignApproved: true });
      res.json(updated);
    } catch (err) {
      console.error("Approve campaign error:", err);
      res.status(500).json({ message: "خطأ في الموافقة على الحملة" });
    }
  });

  // ==================== PRODUCTS ====================

  app.get("/api/products", authMiddleware, async (req: any, res) => {
    try {
      const search = req.query.search as string | undefined;
      const list = await storage.getProductsByTenant(req.user.tenantId, search);
      res.json(list);
    } catch (err) {
      console.error("Products list error:", err);
      res.status(500).json({ message: "خطأ في جلب المنتجات" });
    }
  });

  app.get("/api/products/:id", authMiddleware, async (req: any, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product || product.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المنتج غير موجود" });
      }
      res.json(product);
    } catch (err) {
      console.error("Product get error:", err);
      res.status(500).json({ message: "خطأ في جلب المنتج" });
    }
  });

  app.post("/api/products", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const parsed = productCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: parsed.error.errors });
      }
      const product = await storage.createProduct({
        ...parsed.data,
        tenantId: req.user.tenantId,
      });
      res.status(201).json(product);
    } catch (err) {
      console.error("Product create error:", err);
      res.status(500).json({ message: "خطأ في إنشاء المنتج" });
    }
  });

  app.patch("/api/products/:id", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getProductById(req.params.id);
      if (!existing || existing.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المنتج غير موجود" });
      }
      const updated = await storage.updateProduct(req.params.id, req.user.tenantId, req.body);
      res.json(updated);
    } catch (err) {
      console.error("Product update error:", err);
      res.status(500).json({ message: "خطأ في تحديث المنتج" });
    }
  });

  app.delete("/api/products/:id", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const existing = await storage.getProductById(req.params.id);
      if (!existing || existing.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المنتج غير موجود" });
      }
      await storage.deleteProduct(req.params.id, req.user.tenantId);
      res.json({ success: true });
    } catch (err) {
      console.error("Product delete error:", err);
      res.status(500).json({ message: "خطأ في حذف المنتج" });
    }
  });

  app.post("/api/products/:id/send", authMiddleware, async (req: any, res) => {
    try {
      const product = await storage.getProductById(req.params.id);
      if (!product || product.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المنتج غير موجود" });
      }
      const { contactId } = req.body;
      if (!contactId) {
        return res.status(400).json({ message: "يجب تحديد جهة الاتصال" });
      }
      const contact = await storage.getContactById(contactId, req.user.tenantId);
      if (!contact) {
        return res.status(404).json({ message: "جهة الاتصال غير موجودة" });
      }
      const priceText = product.price ? `${product.price} ${product.currency || "SAR"}` : "";
      const messageText = `📦 *${product.name}*\n${product.description || ""}\n${priceText ? `💰 السعر: ${priceText}` : ""}${product.link ? `\n🔗 ${product.link}` : ""}`;

      let sid: string | null = null;
      try {
        sid = await sendWhatsAppMessage(contact.phone, messageText);
      } catch (sendErr) {
        console.error("WhatsApp product send failed:", sendErr);
      }

      let conversation = await storage.getLatestConversation(req.user.tenantId, contact.id);
      if (conversation && conversation.status === "resolved") {
        await storage.updateConversation(conversation.id, req.user.tenantId, { status: "active", assignmentStatus: "ai_handling" } as any);
        conversation = await storage.getConversationById(conversation.id, req.user.tenantId);
      }
      if (!conversation) {
        const assignedAgentId = await storage.autoAssignConversation(req.user.tenantId);
        conversation = await storage.createConversation({
          tenantId: req.user.tenantId,
          contactId: contact.id,
          status: "active",
          channel: "whatsapp",
          aiHandled: false,
          assignedTo: assignedAgentId,
        });
        await storage.updateContact(contact.id, req.user.tenantId, {
          totalConversations: (contact.totalConversations || 0) + 1,
        });
        if (assignedAgentId) {
          await storage.incrementAgentMetric(assignedAgentId, req.user.tenantId, "totalConversations");
        }
      }

      const msg = await storage.createMessage({
        conversationId: conversation!.id,
        tenantId: req.user.tenantId,
        senderType: "system",
        content: messageText,
        twilioSid: sid,
      });

      io.to(`tenant:${req.user.tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: msg,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Product send error:", err);
      res.status(500).json({ message: "خطأ في إرسال المنتج" });
    }
  });

  // ==================== Internal Messages (Team Chat) ====================

  app.get("/api/team-members", authMiddleware, async (req: any, res) => {
    try {
      const members = await storage.getUsersByTenant(req.user.tenantId);
      const filtered = members
        .filter((m: any) => m.id !== req.user.id)
        .map((m: any) => ({ id: m.id, name: m.name, email: m.email, role: m.role, status: m.status }));
      res.json(filtered);
    } catch (err) {
      console.error("Team members error:", err);
      res.status(500).json({ message: "خطأ في جلب أعضاء الفريق" });
    }
  });

  app.get("/api/internal-messages/:userId", authMiddleware, async (req: any, res) => {
    try {
      const targetUser = await storage.getUserById(req.params.userId);
      if (!targetUser || targetUser.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المستخدم غير موجود" });
      }
      const messages = await storage.getInternalMessages(req.user.tenantId, req.user.id, req.params.userId);
      res.json(messages);
    } catch (err) {
      console.error("Internal messages error:", err);
      res.status(500).json({ message: "خطأ في جلب الرسائل" });
    }
  });

  app.post("/api/internal-messages", authMiddleware, async (req: any, res) => {
    try {
      const { receiverId, message } = req.body;
      if (!receiverId || !message?.trim()) {
        return res.status(400).json({ message: "المستلم والرسالة مطلوبان" });
      }

      const receiver = await storage.getUserById(receiverId);
      if (!receiver || receiver.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المستلم غير موجود" });
      }

      const msg = await storage.createInternalMessage({
        tenantId: req.user.tenantId,
        senderId: req.user.id,
        receiverId,
        message: message.trim().slice(0, 5000),
      });

      io.to(`user:${receiverId}`).emit("internal_message", msg);
      io.to(`user:${req.user.id}`).emit("internal_message", msg);

      res.json(msg);
    } catch (err) {
      console.error("Send internal message error:", err);
      res.status(500).json({ message: "خطأ في إرسال الرسالة" });
    }
  });

  app.get("/api/orders/stats", authMiddleware, async (req: any, res) => {
    try {
      const stats = await storage.getOrderStats(req.user.tenantId);
      res.json(stats);
    } catch (err) {
      console.error("Order stats error:", err);
      res.status(500).json({ message: "خطأ في جلب إحصائيات الطلبات" });
    }
  });

  app.get("/api/orders", authMiddleware, async (req: any, res) => {
    try {
      const status = req.query.status as string | undefined;
      const ordersList = await storage.getOrdersByTenant(req.user.tenantId, status);
      res.json(ordersList);
    } catch (err) {
      console.error("Get orders error:", err);
      res.status(500).json({ message: "خطأ في جلب الطلبات" });
    }
  });

  app.get("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const order = await storage.getOrderById(req.params.id, req.user.tenantId);
      if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
      const items = await storage.getOrderItemsByOrder(order.id);
      const orderPayments = await storage.getPaymentsByOrder(order.id);
      res.json({ ...order, items, payments: orderPayments });
    } catch (err) {
      console.error("Get order error:", err);
      res.status(500).json({ message: "خطأ في جلب الطلب" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: any, res) => {
    try {
      const data = { ...req.body, tenantId: req.user.tenantId };
      const order = await storage.createOrder(data);
      res.status(201).json(order);
    } catch (err) {
      console.error("Create order error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الطلب" });
    }
  });

  app.patch("/api/orders/:id", authMiddleware, async (req: any, res) => {
    try {
      const order = await storage.updateOrder(req.params.id, req.user.tenantId, req.body);
      if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
      res.json(order);
    } catch (err) {
      console.error("Update order error:", err);
      res.status(500).json({ message: "خطأ في تحديث الطلب" });
    }
  });

  app.post("/api/orders/:id/items", authMiddleware, async (req: any, res) => {
    try {
      const order = await storage.getOrderById(req.params.id, req.user.tenantId);
      if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
      const item = await storage.createOrderItem({ ...req.body, orderId: order.id, tenantId: req.user.tenantId });
      res.status(201).json(item);
    } catch (err) {
      console.error("Create order item error:", err);
      res.status(500).json({ message: "خطأ في إضافة عنصر" });
    }
  });

  app.get("/api/orders/:id/payments", authMiddleware, async (req: any, res) => {
    try {
      const order = await storage.getOrderById(req.params.id, req.user.tenantId);
      if (!order) return res.status(404).json({ message: "الطلب غير موجود" });
      const orderPayments = await storage.getPaymentsByOrder(order.id);
      res.json(orderPayments);
    } catch (err) {
      console.error("Get payments error:", err);
      res.status(500).json({ message: "خطأ في جلب المدفوعات" });
    }
  });

  app.post("/api/payments", authMiddleware, async (req: any, res) => {
    try {
      const payment = await storage.createPayment({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(payment);
    } catch (err) {
      console.error("Create payment error:", err);
      res.status(500).json({ message: "خطأ في إنشاء الدفعة" });
    }
  });

  app.patch("/api/payments/:id", authMiddleware, async (req: any, res) => {
    try {
      const payment = await storage.updatePayment(req.params.id, req.user.tenantId, req.body);
      if (!payment) return res.status(404).json({ message: "الدفعة غير موجودة" });
      res.json(payment);
    } catch (err) {
      console.error("Update payment error:", err);
      res.status(500).json({ message: "خطأ في تحديث الدفعة" });
    }
  });

  app.get("/api/vendors", authMiddleware, async (req: any, res) => {
    try {
      const vendorsList = await storage.getVendorsByTenant(req.user.tenantId);
      res.json(vendorsList);
    } catch (err) {
      console.error("Get vendors error:", err);
      res.status(500).json({ message: "خطأ في جلب الموردين" });
    }
  });

  app.post("/api/vendors", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const vendor = await storage.createVendor({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(vendor);
    } catch (err) {
      console.error("Create vendor error:", err);
      res.status(500).json({ message: "خطأ في إنشاء المورد" });
    }
  });

  app.patch("/api/vendors/:id", authMiddleware, managerOrAdmin, async (req: any, res) => {
    try {
      const vendor = await storage.updateVendor(req.params.id, req.user.tenantId, req.body);
      if (!vendor) return res.status(404).json({ message: "المورد غير موجود" });
      res.json(vendor);
    } catch (err) {
      console.error("Update vendor error:", err);
      res.status(500).json({ message: "خطأ في تحديث المورد" });
    }
  });

  app.post("/api/vendors/:id/transactions", authMiddleware, async (req: any, res) => {
    try {
      const tx = await storage.createVendorTransaction({ ...req.body, vendorId: req.params.id, tenantId: req.user.tenantId });
      res.status(201).json(tx);
    } catch (err) {
      console.error("Create vendor transaction error:", err);
      res.status(500).json({ message: "خطأ في إنشاء العملية" });
    }
  });

  app.get("/api/vendors/:id/transactions", authMiddleware, async (req: any, res) => {
    try {
      const txs = await storage.getVendorTransactionsByVendor(req.params.id, req.user.tenantId);
      res.json(txs);
    } catch (err) {
      console.error("Get vendor transactions error:", err);
      res.status(500).json({ message: "خطأ في جلب العمليات" });
    }
  });

  return { httpServer, io };
}
