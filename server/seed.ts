import { storage } from "./storage";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { tenants } from "@shared/schema";

export async function seedDatabase() {
  try {
    const existingTenants = await db.select().from(tenants).limit(1);
    if (existingTenants.length > 0) {
      console.log("Database already seeded, skipping...");
      return;
    }

    console.log("Seeding database...");

    const tenant = await storage.createTenant({
      name: "شركة التقنية الذكية",
      phone: "+966501234567",
      plan: "starter",
      aiEnabled: true,
      aiSystemPrompt: "أنت مساعد خدمة عملاء لشركة التقنية الذكية. نحن نقدم خدمات تقنية متنوعة تشمل تطوير التطبيقات، استضافة المواقع، والدعم الفني. ساعات العمل: الأحد-الخميس 9 صباحاً - 5 مساءً. رد بنفس لغة العميل.",
      maxAgents: 5,
    });

    const passwordHash = await bcrypt.hash("admin123", 10);
    await storage.createUser({
      tenantId: tenant.id,
      email: "admin@jawab.sa",
      passwordHash,
      name: "أحمد المدير",
      role: "admin",
      status: "online",
    });

    const agentHash = await bcrypt.hash("agent123", 10);
    await storage.createUser({
      tenantId: tenant.id,
      email: "agent@jawab.sa",
      passwordHash: agentHash,
      name: "سارة الدعم",
      role: "agent",
      status: "online",
    });

    const contact1 = await storage.createContact({
      tenantId: tenant.id,
      phone: "+966501111111",
      name: "محمد العلي",
      tags: ["VIP", "عميل قديم"],
      sentiment: "positive",
      totalConversations: 5,
    });

    const contact2 = await storage.createContact({
      tenantId: tenant.id,
      phone: "+966502222222",
      name: "نورة السعيد",
      tags: ["جديد"],
      sentiment: "neutral",
      totalConversations: 1,
    });

    const contact3 = await storage.createContact({
      tenantId: tenant.id,
      phone: "+966503333333",
      name: "خالد الحربي",
      tags: ["دعم فني"],
      sentiment: "negative",
      totalConversations: 3,
    });

    const conv1 = await storage.createConversation({
      tenantId: tenant.id,
      contactId: contact1.id,
      status: "active",
      channel: "whatsapp",
      aiHandled: true,
    });

    await storage.createMessage({
      conversationId: conv1.id,
      tenantId: tenant.id,
      senderType: "customer",
      content: "السلام عليكم، أبغى أسأل عن أسعار تطوير التطبيقات",
    });

    await storage.createMessage({
      conversationId: conv1.id,
      tenantId: tenant.id,
      senderType: "ai",
      content: "وعليكم السلام! أهلاً بك في شركة التقنية الذكية. أسعار تطوير التطبيقات تبدأ من 5,000 ريال للتطبيقات البسيطة وتصل إلى 50,000 ريال للمشاريع المتقدمة. هل تبي تفاصيل أكثر عن نوع التطبيق اللي تبيه؟",
      aiConfidence: 0.92,
    });

    await storage.createMessage({
      conversationId: conv1.id,
      tenantId: tenant.id,
      senderType: "customer",
      content: "أبغى تطبيق متجر إلكتروني مع ربط بطرق دفع",
    });

    const conv2 = await storage.createConversation({
      tenantId: tenant.id,
      contactId: contact2.id,
      status: "waiting",
      channel: "whatsapp",
      aiHandled: false,
    });

    await storage.createMessage({
      conversationId: conv2.id,
      tenantId: tenant.id,
      senderType: "customer",
      content: "مرحبا، عندي مشكلة في الموقع ما يفتح",
    });

    await storage.createMessage({
      conversationId: conv2.id,
      tenantId: tenant.id,
      senderType: "system",
      content: "[تم تحويل المحادثة لموظف] العميلة تواجه مشكلة تقنية تحتاج متابعة فنية",
      aiConfidence: 0.35,
    });

    const conv3 = await storage.createConversation({
      tenantId: tenant.id,
      contactId: contact3.id,
      status: "resolved",
      channel: "whatsapp",
      aiHandled: true,
      resolvedAt: new Date(),
    });

    await storage.createMessage({
      conversationId: conv3.id,
      tenantId: tenant.id,
      senderType: "customer",
      content: "كم ساعات الدعم الفني؟",
    });

    await storage.createMessage({
      conversationId: conv3.id,
      tenantId: tenant.id,
      senderType: "ai",
      content: "ساعات الدعم الفني: الأحد إلى الخميس من 9 صباحاً إلى 5 مساءً. للحالات الطارئة، يمكنك التواصل على رقم الطوارئ 0501234567.",
      aiConfidence: 0.95,
    });

    await storage.createMessage({
      conversationId: conv3.id,
      tenantId: tenant.id,
      senderType: "customer",
      content: "شكراً جزيلاً",
    });

    await storage.createMessage({
      conversationId: conv3.id,
      tenantId: tenant.id,
      senderType: "ai",
      content: "العفو! سعيدين بخدمتك. لا تتردد بالتواصل معنا في أي وقت.",
      aiConfidence: 0.98,
    });

    await storage.createKnowledge({
      tenantId: tenant.id,
      title: "ساعات العمل",
      content: "ساعات العمل الرسمية: الأحد إلى الخميس من 9 صباحاً إلى 5 مساءً. الجمعة والسبت إجازة. للحالات الطارئة: 0501234567",
      category: "عام",
    });

    await storage.createKnowledge({
      tenantId: tenant.id,
      title: "أسعار الخدمات",
      content: "تطوير تطبيقات الجوال: يبدأ من 5,000 ريال\nتطوير المواقع: يبدأ من 3,000 ريال\nالاستضافة: تبدأ من 200 ريال/شهر\nالدعم الفني: 500 ريال/شهر\nتصميم الهوية: يبدأ من 2,000 ريال",
      category: "أسعار",
    });

    await storage.createKnowledge({
      tenantId: tenant.id,
      title: "سياسة الاسترجاع",
      content: "يمكن استرجاع المبلغ خلال 14 يوم من بداية المشروع إذا لم يبدأ العمل. بعد بداية التطوير، يتم خصم نسبة العمل المنجز.",
      category: "سياسات",
    });

    await storage.createAutoReply({
      tenantId: tenant.id,
      triggerType: "keyword",
      triggerValue: "السعر",
      response: "أسعارنا تبدأ من 3,000 ريال لتطوير المواقع و5,000 ريال لتطبيقات الجوال. تبي تفاصيل أكثر؟",
      isActive: true,
      priority: 10,
    });

    await storage.createAutoReply({
      tenantId: tenant.id,
      triggerType: "keyword",
      triggerValue: "ساعات العمل",
      response: "ساعات العمل: الأحد-الخميس، 9 صباحاً - 5 مساءً. كيف نقدر نساعدك؟",
      isActive: true,
      priority: 5,
    });

    await storage.createQuickReply({
      tenantId: tenant.id,
      title: "ترحيب",
      content: "أهلاً بك! كيف أقدر أساعدك اليوم؟",
      shortcut: "hi",
    });

    await storage.createQuickReply({
      tenantId: tenant.id,
      title: "انتظار",
      content: "لحظة من فضلك، بتحقق من المعلومات وأرد عليك",
      shortcut: "wait",
    });

    await storage.createQuickReply({
      tenantId: tenant.id,
      title: "شكراً",
      content: "شكراً لتواصلك معنا! هل تحتاج أي شيء ثاني؟",
      shortcut: "thx",
    });

    await storage.createQuickReply({
      tenantId: tenant.id,
      title: "إغلاق",
      content: "شكراً لتواصلك معنا. لا تتردد بالتواصل في أي وقت. يومك سعيد!",
      shortcut: "close",
    });

    console.log("Database seeded successfully!");
    console.log("Demo login: admin@jawab.sa / admin123");
  } catch (err) {
    console.error("Seed error:", err);
  }
}
