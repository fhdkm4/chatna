import type { Express } from "express";
import express from "express";
import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { registerSchema, loginSchema, createAgentSchema, inviteAgentSchema, acceptInvitationSchema, insertCampaignSchema, insertProductSchema, users as usersTable, messages as messagesTable, conversations as conversationsTable, invitations as invitationsTable } from "@shared/schema";
import { z } from "zod";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { parseIncomingMessage, sendWhatsAppMessage } from "./services/twilio";
import { sendMetaWhatsAppMessage, sendMetaWhatsAppInteractiveButtons, markMessageAsRead } from "./services/meta-whatsapp";
import { checkAutoReply, generateAiResponse } from "./services/ai";
import { simulateTypingDelay } from "./services/typing-delay";
import { count, sql as sqlHelper, and, inArray, not, desc } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "jawab-default-secret";

interface AuthRequest extends Express.Request {
  user?: { id: string; tenantId: string; role: string };
}

function authMiddleware(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    next();
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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

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

  // Team management routes
  app.get("/api/team", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const teamMembers = await storage.getUsersByTenant(req.user.tenantId);
      res.json(teamMembers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      })));
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

      const { email, password, name } = parsed.data;

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
        role: "agent",
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

  app.delete("/api/team/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.params.id);
      if (!user || user.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "الموظف غير موجود" });
      }
      if (user.role === "admin") {
        return res.status(400).json({ message: "لا يمكن حذف حساب المدير" });
      }
      await storage.deleteUser(req.params.id);
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
      await storage.deleteInvitation(req.params.id);
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

      await storage.updateInvitation(invitation.id, { acceptedAt: new Date() } as any);

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
      const { aiEnabled, aiSystemPrompt, setupCompleted, name, assignmentMode, ratingEnabled, ratingMessage, ratingDelayMinutes } = req.body;
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

      const tenant = await storage.updateTenant(req.user.tenantId, updates);
      res.json(tenant);
    } catch (err) {
      console.error("Update settings error:", err);
      res.status(500).json({ message: "خطأ في تحديث الإعدادات" });
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
        const contact = await storage.getContactById(conv.contactId);
        if (!contact?.phone) continue;

        const tenant = await storage.getTenant(conv.tenantId);
        if (!tenant?.ratingEnabled) continue;

        const ratingMessage = tenant.ratingMessage ||
          "شكراً لتواصلك معنا! 🙏\nكيف تقيّم الخدمة اللي حصلت عليها؟\n\n1️⃣ ممتاز 😊\n2️⃣ جيد 👍\n3️⃣ سيئ 😞";

        await sendRatingRequest(conv.tenantId, contact.phone, ratingMessage);

        await storage.updateConversation(conv.conversationId, {
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
      await storage.updateContact(contact.id, { name: profileName });
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

        await storage.updateConversation(resolvedConv.id, {
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
        await storage.updateConversation(resolvedConv.id, {
          ratingRequested: false,
        } as any);
      }
    }

    let conversation = await storage.getLatestConversation(tenantId, contact.id);
    if (conversation && conversation.status === "resolved") {
      await storage.updateConversation(conversation.id, { status: "active" } as any);
      conversation = await storage.getConversationById(conversation.id);
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
      await storage.updateContact(contact.id, {
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

    if (conversation.aiPaused) return;

    const metaHandoverKeywords = [
      "موظف", "بشري", "كلم موظف", "تحويل", "وكيل", "ممثل",
      "أبي أكلم شخص", "ابي اكلم شخص", "كلمني موظف", "تكلم مع موظف",
      "أريد التحدث مع شخص", "اريد موظف", "أبغى موظف", "ابغى موظف",
      "human", "agent", "representative", "talk to someone", "real person",
      "transfer", "speak to agent", "connect me"
    ];
    const metaNormalizedMsg = messageContent.trim().toLowerCase();
    const metaIsHandover = metaHandoverKeywords.some(kw => metaNormalizedMsg.includes(kw.toLowerCase()));

    if (metaIsHandover) {
      const handoverReply = "جاري تحويلك إلى موظف بشري، الرجاء الانتظار... ⏳";
      await simulateTypingDelay(handoverReply);
      await sendWhatsAppMessage(senderPhone, handoverReply);
      const systemMsg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "system",
        content: handoverReply,
      });
      await storage.updateConversation(conversation.id, {
        status: "waiting",
        aiPaused: true,
        aiHandled: false,
      });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: systemMsg,
      });
      io.to(`tenant:${tenantId}`).emit("escalation", {
        conversationId: conversation.id,
        message: systemMsg,
        reason: "طلب تحويل لموظف بشري",
      });
      io.to(`tenant:${tenantId}`).emit("conversation_updated", {
        conversationId: conversation.id,
        status: "waiting",
      });
      return;
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant?.aiEnabled) return;

    const hasTextContent = messageContent && !messageContent.startsWith("[") ;
    if (!hasTextContent) return;

    const autoReplyContent = await checkAutoReply(tenantId, messageContent);
    if (autoReplyContent) {
      await simulateTypingDelay(autoReplyContent);
      await sendWhatsAppMessage(senderPhone, autoReplyContent);
      const aiMsg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "ai",
        content: autoReplyContent,
        aiConfidence: 1.0,
      });
      await storage.updateConversation(conversation.id, { aiHandled: true, delayAlerted: false });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: aiMsg,
      });
      return;
    }

    const aiResponse = await generateAiResponse(
      tenantId,
      conversation.id,
      messageContent,
      tenant.aiSystemPrompt,
    );

    if (aiResponse.confidence >= 0.6) {
      await simulateTypingDelay(aiResponse.content);
      await sendWhatsAppMessage(senderPhone, aiResponse.content);
      const aiMsg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "ai",
        content: aiResponse.content,
        aiConfidence: aiResponse.confidence,
      });
      await storage.updateConversation(conversation.id, { aiHandled: true, delayAlerted: false });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: aiMsg,
      });
    } else {
      const handoverNotice = "جاري تحويلك إلى موظف بشري، الرجاء الانتظار... ⏳";
      await sendWhatsAppMessage(senderPhone, handoverNotice);
      const aiMsg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "system",
        content: handoverNotice,
        aiConfidence: aiResponse.confidence,
      });
      await storage.updateConversation(conversation.id, {
        status: "waiting",
        aiPaused: true,
      });
      io.to(`tenant:${tenantId}`).emit("escalation", {
        conversationId: conversation.id,
        message: aiMsg,
        reason: "ثقة AI منخفضة",
      });
      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: aiMsg,
      });
      io.to(`tenant:${tenantId}`).emit("conversation_updated", {
        conversationId: conversation.id,
        status: "waiting",
      });
    }
  }

  app.get("/api/webhook/test", (_req, res) => {
    res.json({ status: "webhook is working" });
  });

  // Twilio webhook
  app.post("/api/webhook/twilio", async (req, res) => {
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
        await storage.updateConversation(conversation.id, { status: "active" } as any);
        conversation = await storage.getConversationById(conversation.id);
      }
      if (!conversation) {
        conversation = await storage.createConversation({
          tenantId,
          contactId: contact.id,
          status: "active",
          channel: "whatsapp",
          aiHandled: false,
        });
        await storage.updateContact(contact.id, {
          totalConversations: (contact.totalConversations || 0) + 1,
        });
      }

      const messageContent = incoming.content || (incoming.mediaType?.startsWith("image") ? "[صورة]" : "[ملف]");

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

      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: customerMessage,
      });

      console.log("🤖 AI check - aiPaused:", conversation.aiPaused, "conversationId:", conversation.id);

      if (conversation.aiPaused) {
        console.log("⏸️ AI paused for this conversation, skipping");
        return;
      }

      const handoverKeywords = [
        "موظف", "بشري", "كلم موظف", "تحويل", "وكيل", "ممثل",
        "أبي أكلم شخص", "ابي اكلم شخص", "كلمني موظف", "تكلم مع موظف",
        "أريد التحدث مع شخص", "اريد موظف", "أبغى موظف", "ابغى موظف",
        "human", "agent", "representative", "talk to someone", "real person",
        "transfer", "speak to agent", "connect me"
      ];
      const normalizedMsg = messageContent.trim().toLowerCase();
      const isHandoverRequest = handoverKeywords.some(kw => normalizedMsg.includes(kw.toLowerCase()));
      console.log("🔄 Handover check:", { message: normalizedMsg, isHandoverRequest });

      if (isHandoverRequest) {
        console.log("🙋 Handover requested! Pausing AI and setting status to waiting");
        const handoverReply = "جاري تحويلك إلى موظف بشري، الرجاء الانتظار... ⏳";
        await simulateTypingDelay(handoverReply);
        const sid = await sendWhatsAppMessage(incoming.from, handoverReply);
        const systemMsg = await storage.createMessage({
          conversationId: conversation.id,
          tenantId,
          senderType: "system",
          content: handoverReply,
          twilioSid: sid,
        });
        await storage.updateConversation(conversation.id, {
          status: "waiting",
          aiPaused: true,
          aiHandled: false,
        });
        io.to(`tenant:${tenantId}`).emit("new_message", {
          conversationId: conversation.id,
          message: systemMsg,
        });
        io.to(`tenant:${tenantId}`).emit("escalation", {
          conversationId: conversation.id,
          message: systemMsg,
          reason: "طلب تحويل لموظف بشري",
        });
        io.to(`tenant:${tenantId}`).emit("conversation_updated", {
          conversationId: conversation.id,
          status: "waiting",
        });
        return;
      }

      const tenant = await storage.getTenant(tenantId!);
      console.log("🏢 Tenant AI config - aiEnabled:", tenant?.aiEnabled, "tenantId:", tenantId);

      if (!tenant?.aiEnabled) {
        console.log("❌ AI is disabled for tenant, skipping AI response");
        return;
      }

      if (incoming.mediaUrl && !incoming.content) {
        console.log("📎 Media-only message, skipping AI");
        return;
      }

      console.log("🔍 Checking auto-replies for:", messageContent);
      const autoReplyContent = await checkAutoReply(tenantId!, messageContent);
      if (autoReplyContent) {
        console.log("✅ Auto-reply matched:", autoReplyContent);
        await simulateTypingDelay(autoReplyContent);
        const sid = await sendWhatsAppMessage(incoming.from, autoReplyContent);
        const aiMsg = await storage.createMessage({
          conversationId: conversation.id,
          tenantId,
          senderType: "ai",
          content: autoReplyContent,
          aiConfidence: 1.0,
          twilioSid: sid,
        });
        await storage.updateConversation(conversation.id, { aiHandled: true });
        io.to(`tenant:${tenantId}`).emit("new_message", {
          conversationId: conversation.id,
          message: aiMsg,
        });
        return;
      }

      console.log("🧠 Generating AI response for:", messageContent);
      const aiResponse = await generateAiResponse(
        tenantId!,
        conversation.id,
        messageContent,
        tenant.aiSystemPrompt,
      );
      console.log("🧠 AI response:", aiResponse.content.substring(0, 100), "confidence:", aiResponse.confidence);

      if (aiResponse.confidence >= 0.6) {
        await simulateTypingDelay(aiResponse.content);
        const sid = await sendWhatsAppMessage(incoming.from, aiResponse.content);
        const aiMsg = await storage.createMessage({
          conversationId: conversation.id,
          tenantId,
          senderType: "ai",
          content: aiResponse.content,
          aiConfidence: aiResponse.confidence,
          twilioSid: sid,
        });
        await storage.updateConversation(conversation.id, { aiHandled: true });
        io.to(`tenant:${tenantId}`).emit("new_message", {
          conversationId: conversation.id,
          message: aiMsg,
        });
      } else {
        const handoverNotice = "جاري تحويلك إلى موظف بشري، الرجاء الانتظار... ⏳";
        const escalationSid = await sendWhatsAppMessage(incoming.from, handoverNotice);
        const aiMsg = await storage.createMessage({
          conversationId: conversation.id,
          tenantId,
          senderType: "system",
          content: handoverNotice,
          aiConfidence: aiResponse.confidence,
          twilioSid: escalationSid,
        });
        await storage.updateConversation(conversation.id, {
          status: "waiting",
          aiPaused: true,
        });
        io.to(`tenant:${tenantId}`).emit("escalation", {
          conversationId: conversation.id,
          message: aiMsg,
          reason: "ثقة AI منخفضة",
        });
        io.to(`tenant:${tenantId}`).emit("new_message", {
          conversationId: conversation.id,
          message: aiMsg,
        });
        io.to(`tenant:${tenantId}`).emit("conversation_updated", {
          conversationId: conversation.id,
          status: "waiting",
        });
      }
    } catch (err) {
      console.error("Webhook error:", err);
    }
  });

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

  app.get("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    try {
      const conversation = await storage.getConversationById(req.params.id);
      if (!conversation || conversation.tenantId !== req.user.tenantId) {
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

      const conversation = await storage.getConversationById(req.params.id);
      if (!conversation) return res.status(404).json({ message: "المحادثة غير موجودة" });

      let twilioSid: string | null = null;
      if (!isInternal && conversation.contactId) {
        const contact = await storage.getContactById(conversation.contactId);
        if (contact) {
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
          await storage.updateConversation(conversation.id, updateData);
        }
        await storage.incrementAgentMetric(req.user.id, req.user.tenantId, "totalMessages");
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

      res.status(201).json(msg);
    } catch (err) {
      console.error("Send message error:", err);
      res.status(500).json({ message: "خطأ في إرسال الرسالة" });
    }
  });

  // Assign agent to conversation
  app.patch("/api/conversations/:id/assign", authMiddleware, async (req: any, res) => {
    try {
      const { agentId } = req.body;
      const conversation = await storage.getConversationById(req.params.id);
      if (!conversation || conversation.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      if (agentId) {
        const agent = await storage.getUserById(agentId);
        if (!agent || agent.tenantId !== req.user.tenantId) {
          return res.status(400).json({ message: "الموظف غير موجود" });
        }
      }

      const updated = await storage.updateConversation(req.params.id, { assignedTo: agentId || null });
      res.json(updated);
    } catch (err) {
      console.error("Assign agent error:", err);
      res.status(500).json({ message: "خطأ في تعيين الموظف" });
    }
  });

  app.patch("/api/conversations/:id", authMiddleware, async (req: any, res) => {
    try {
      const conv = await storage.updateConversation(req.params.id, req.body);
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
          await storage.updateConversation(conv.id, {
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
      const contact = await storage.updateContact(req.params.id, req.body);
      if (!contact) return res.status(404).json({ message: "جهة الاتصال غير موجودة" });
      res.json(contact);
    } catch (err) {
      console.error("Update contact error:", err);
      res.status(500).json({ message: "خطأ في تحديث جهة الاتصال" });
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
      const entry = await storage.updateKnowledge(req.params.id, req.body);
      res.json(entry);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/ai/knowledge/:id", authMiddleware, async (req: any, res) => {
    try {
      await storage.deleteKnowledge(req.params.id);
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
      const reply = await storage.updateAutoReply(req.params.id, req.body);
      res.json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/ai/auto-replies/:id", authMiddleware, adminOnly, async (req: any, res) => {
    try {
      await storage.deleteAutoReply(req.params.id);
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
      await storage.deleteQuickReply(req.params.id);
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

      const conversation = await storage.getConversationById(req.params.id);
      if (!conversation || conversation.tenantId !== req.user.tenantId) {
        return res.status(404).json({ message: "المحادثة غير موجودة" });
      }

      const targetAgent = await storage.getUserById(targetAgentId);
      if (!targetAgent || targetAgent.tenantId !== req.user.tenantId) {
        return res.status(400).json({ message: "الموظف غير موجود" });
      }

      const fromUser = await storage.getUserById(req.user.id);
      const fromName = fromUser?.name || "موظف";

      await storage.updateConversation(conversation.id, { assignedTo: targetAgentId });

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
      const updated = await storage.updateCampaign(req.params.id, req.body);
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
      await storage.deleteCampaign(req.params.id);
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

      let targetContacts: any[] = [];
      if (campaign.targetType === "all") {
        targetContacts = await storage.getContactsByTenant(req.user.tenantId);
      } else if (campaign.targetType === "tags" && campaign.targetTags?.length) {
        const allContacts = await storage.getContactsByTenant(req.user.tenantId);
        targetContacts = allContacts.filter((c: any) =>
          c.tags?.some((t: string) => campaign.targetTags!.includes(t))
        );
      } else if (campaign.targetType === "specific" && campaign.targetContactIds?.length) {
        const allContacts = await storage.getContactsByTenant(req.user.tenantId);
        targetContacts = allContacts.filter((c: any) =>
          campaign.targetContactIds!.includes(c.id)
        );
      }

      if (targetContacts.length === 0) {
        return res.status(400).json({ message: "لا يوجد جهات اتصال مستهدفة" });
      }

      await storage.updateCampaign(campaign.id, {
        status: "sent",
        sentAt: new Date(),
        totalRecipients: targetContacts.length,
      } as any);

      let deliveredCount = 0;
      for (const contact of targetContacts) {
        try {
          const messageText = campaign.messageText || campaign.title;
          let sid: string | null = null;
          try {
            sid = await sendWhatsAppMessage(contact.phone, messageText);
          } catch (whatsappErr) {
            console.error("WhatsApp campaign send failed for", contact.phone, whatsappErr);
          }

          let conversation = await storage.getLatestConversation(req.user.tenantId, contact.id);
          if (conversation && conversation.status === "resolved") {
            await storage.updateConversation(conversation.id, { status: "active" } as any);
            conversation = await storage.getConversationById(conversation.id);
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
            await storage.updateContact(contact.id, {
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
            content: `📢 حملة "${campaign.title}": ${messageText}`,
            twilioSid: sid,
          });

          io.to(`tenant:${req.user.tenantId}`).emit("new_message", {
            conversationId: conversation.id,
            message: msg,
          });

          await storage.createCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            status: "sent",
            sentAt: new Date(),
          });
          deliveredCount++;
        } catch (sendErr: any) {
          await storage.createCampaignLog({
            campaignId: campaign.id,
            contactId: contact.id,
            status: "failed",
            error: sendErr.message,
          });
        }
      }

      await storage.updateCampaign(campaign.id, { deliveredCount } as any);

      res.json({
        success: true,
        totalRecipients: targetContacts.length,
        deliveredCount,
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
      const updated = await storage.updateProduct(req.params.id, req.body);
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
      await storage.deleteProduct(req.params.id);
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
      const contact = await storage.getContactById(contactId);
      if (!contact || contact.tenantId !== req.user.tenantId) {
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
        await storage.updateConversation(conversation.id, { status: "active" } as any);
        conversation = await storage.getConversationById(conversation.id);
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
        await storage.updateContact(contact.id, {
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

  return httpServer;
}
