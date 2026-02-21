import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";
import { registerSchema, loginSchema, createAgentSchema, users as usersTable, messages as messagesTable } from "@shared/schema";
import { parseIncomingMessage, sendWhatsAppMessage } from "./services/twilio";
import { checkAutoReply, generateAiResponse } from "./services/ai";
import { count, sql as sqlHelper } from "drizzle-orm";

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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
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

  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.issues });
      }

      const { companyName, email, password, name } = parsed.data;

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "البريد الإلكتروني مستخدم بالفعل" });
      }

      const tenant = await storage.createTenant({ name: companyName });
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
  app.get("/api/team", authMiddleware, async (req: any, res) => {
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

  app.post("/api/team", authMiddleware, adminOnly, async (req: any, res) => {
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

  // Twilio webhook
  app.post("/api/webhook/twilio", async (req, res) => {
    res.set("Content-Type", "text/xml");
    res.status(200).send("<Response></Response>");

    try {
      const incoming = parseIncomingMessage(req.body);
      if (!incoming.from || (!incoming.content && !incoming.mediaUrl)) return;

      const phone = incoming.from.replace("whatsapp:", "");

      let tenantId: string | null = null;
      let contact = null;

      const allContact = await storage.getContactByPhone("*", phone);

      if (!tenantId) {
        const { db: database } = await import("./db");
        const { tenants: tenantsTable } = await import("@shared/schema");
        const allT = await database.select().from(tenantsTable).limit(1);
        if (allT.length > 0) {
          tenantId = allT[0].id;
        } else {
          return;
        }
      }

      contact = await storage.getContactByPhone(tenantId, phone);
      if (!contact) {
        contact = await storage.createContact({
          tenantId,
          phone,
          name: incoming.profileName || null,
        });
      }

      let conversation = await storage.getActiveConversation(tenantId, contact.id);
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

      if (conversation.aiPaused) return;

      const tenant = await storage.getTenant(tenantId);
      if (!tenant?.aiEnabled) return;

      if (incoming.mediaUrl && !incoming.content) return;

      const autoReplyContent = await checkAutoReply(tenantId, messageContent);
      if (autoReplyContent) {
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

      const aiResponse = await generateAiResponse(
        tenantId,
        conversation.id,
        messageContent,
        tenant.aiSystemPrompt,
      );

      if (aiResponse.confidence >= 0.6) {
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
        const aiMsg = await storage.createMessage({
          conversationId: conversation.id,
          tenantId,
          senderType: "system",
          content: `[تم تحويل المحادثة لموظف] ${aiResponse.content}`,
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
            console.error("Twilio send failed:", err);
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

      if (!isInternal && (conversation.status === "waiting" || conversation.aiPaused)) {
        await storage.updateConversation(conversation.id, {
          status: "active",
          assignedTo: req.user.id,
          aiPaused: false,
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

  app.post("/api/ai/auto-replies", authMiddleware, async (req: any, res) => {
    try {
      const reply = await storage.createAutoReply({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.patch("/api/ai/auto-replies/:id", authMiddleware, async (req: any, res) => {
    try {
      const reply = await storage.updateAutoReply(req.params.id, req.body);
      res.json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/ai/auto-replies/:id", authMiddleware, async (req: any, res) => {
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

  app.post("/api/quick-replies", authMiddleware, async (req: any, res) => {
    try {
      const reply = await storage.createQuickReply({ ...req.body, tenantId: req.user.tenantId });
      res.status(201).json(reply);
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
    }
  });

  app.delete("/api/quick-replies/:id", authMiddleware, async (req: any, res) => {
    try {
      await storage.deleteQuickReply(req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ message: "خطأ" });
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

  return httpServer;
}
