import type { Express } from "express";
import type { Server } from "http";
import { Server as SocketServer } from "socket.io";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { registerSchema, loginSchema } from "@shared/schema";
import { parseIncomingMessage, sendWhatsAppMessage } from "./services/twilio";
import { checkAutoReply, generateAiResponse } from "./services/ai";

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

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    const token = socket.handshake.auth.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        socket.join(`tenant:${decoded.tenantId}`);
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

  app.post("/api/webhook/twilio", async (req, res) => {
    res.set("Content-Type", "text/xml");
    res.status(200).send("<Response></Response>");

    try {
      const incoming = parseIncomingMessage(req.body);
      if (!incoming.from || !incoming.content) return;

      const phone = incoming.from.replace("whatsapp:", "");

      const allTenants = await storage.getContactsByTenant("*");
      let tenantId: string | null = null;
      let contact = null;

      const allContacts = await storage.getContactByPhone("*", phone);

      if (!tenantId) {
        const { db } = await import("./db");
        const { tenants: tenantsTable } = await import("@shared/schema");
        const allT = await db.select().from(tenantsTable).limit(1);
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

      const customerMessage = await storage.createMessage({
        conversationId: conversation.id,
        tenantId,
        senderType: "customer",
        content: incoming.content,
        mediaUrl: incoming.mediaUrl,
        mediaType: incoming.mediaType,
        twilioSid: incoming.messageSid,
      });

      io.to(`tenant:${tenantId}`).emit("new_message", {
        conversationId: conversation.id,
        message: customerMessage,
      });

      const tenant = await storage.getTenant(tenantId);
      if (!tenant?.aiEnabled) return;

      const autoReplyContent = await checkAutoReply(tenantId, incoming.content);
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
        incoming.content,
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
        await storage.updateConversation(conversation.id, { status: "waiting" });
        io.to(`tenant:${tenantId}`).emit("escalation", {
          conversationId: conversation.id,
          message: aiMsg,
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

  app.get("/api/conversations", authMiddleware, async (req: any, res) => {
    try {
      const status = req.query.status as string;
      const convs = await storage.getConversationsByTenant(req.user.tenantId, status);
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

  app.get("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    try {
      const msgs = await storage.getMessagesByConversation(req.params.id);
      res.json(msgs);
    } catch (err) {
      console.error("Get messages error:", err);
      res.status(500).json({ message: "خطأ في جلب الرسائل" });
    }
  });

  app.post("/api/conversations/:id/messages", authMiddleware, async (req: any, res) => {
    try {
      const { content } = req.body;
      if (!content) return res.status(400).json({ message: "محتوى الرسالة مطلوب" });

      const conversation = await storage.getConversationById(req.params.id);
      if (!conversation) return res.status(404).json({ message: "المحادثة غير موجودة" });

      let twilioSid: string | null = null;
      if (conversation.contactId) {
        const contact = await storage.getContactById(conversation.contactId);
        if (contact) {
          try {
            twilioSid = await sendWhatsAppMessage(`whatsapp:${contact.phone}`, content);
          } catch (err) {
            console.error("Twilio send failed:", err);
          }
        }
      }

      const msg = await storage.createMessage({
        conversationId: conversation.id,
        tenantId: req.user.tenantId,
        senderType: "agent",
        senderId: req.user.id,
        content,
        twilioSid,
      });

      if (conversation.status === "waiting") {
        await storage.updateConversation(conversation.id, { status: "active", assignedTo: req.user.id });
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

  return httpServer;
}
