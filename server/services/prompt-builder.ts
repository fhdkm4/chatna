import type { AiKnowledge, Message } from "@shared/schema";

interface TenantProfile {
  name: string;
  businessDescription?: string | null;
  businessType?: string | null;
  businessIndustry?: string | null;
  contactPhone?: string | null;
  website?: string | null;
  workingHours?: any;
  address?: string | null;
  aiTone?: string | null;
  welcomeMessage?: string | null;
  offHoursMessage?: string | null;
  aiPersonalityInstructions?: string | null;
  defaultEscalationMessage?: string | null;
  languagePreference?: string | null;
  aiSystemPrompt?: string | null;
}

interface PromptContext {
  tenant: TenantProfile;
  knowledgeEntries: AiKnowledge[];
  recentMessages: Message[];
  customerMessage: string;
}

const TONE_MAP: Record<string, string> = {
  friendly: "ودود ولطيف، استخدم تعبيرات دافئة",
  formal: "رسمي ومهني، استخدم لغة محترمة ومنظمة",
  casual: "عفوي ومريح، تحدث بأسلوب قريب وبسيط",
  professional: "احترافي ودقيق، ركّز على المعلومات المفيدة",
};

function buildBaseSystem(): string {
  return `أنت مساعد خدمة عملاء ذكي يعمل عبر واتساب.`;
}

function buildTenantIdentity(tenant: TenantProfile): string {
  const lines: string[] = [];
  lines.push(`أنت تمثّل "${tenant.name}" حصرياً.`);
  lines.push(`اسمك هو مساعد ${tenant.name}.`);
  if (tenant.businessType) {
    lines.push(`مجال العمل: ${tenant.businessType}.`);
  }
  if (tenant.businessDescription) {
    lines.push(`وصف النشاط: ${tenant.businessDescription}`);
  }
  return lines.join("\n");
}

function buildStyleLayer(tenant: TenantProfile): string {
  const tone = tenant.aiTone || "friendly";
  const toneDesc = TONE_MAP[tone] || TONE_MAP["friendly"];
  const lines: string[] = [];
  lines.push(`أسلوب الرد: ${toneDesc}.`);
  if (tenant.aiPersonalityInstructions) {
    lines.push(`تعليمات إضافية للشخصية: ${tenant.aiPersonalityInstructions}`);
  }
  const langPref = tenant.languagePreference || "auto";
  if (langPref === "auto") {
    lines.push("رد بنفس لغة العميل تلقائياً (عربي أو إنجليزي).");
  } else if (langPref === "ar") {
    lines.push("رد دائماً باللغة العربية.");
  } else if (langPref === "en") {
    lines.push("رد دائماً باللغة الإنجليزية.");
  }
  return lines.join("\n");
}

function buildBusinessInfo(tenant: TenantProfile): string {
  const lines: string[] = [];
  if (tenant.contactPhone) {
    lines.push(`رقم التواصل: ${tenant.contactPhone}`);
  }
  if (tenant.website) {
    lines.push(`الموقع الإلكتروني: ${tenant.website}`);
  }
  if (tenant.address) {
    lines.push(`العنوان: ${tenant.address}`);
  }
  if (tenant.workingHours) {
    try {
      const wh = typeof tenant.workingHours === "string"
        ? JSON.parse(tenant.workingHours)
        : tenant.workingHours;
      if (wh.description) {
        lines.push(`أوقات العمل: ${wh.description}`);
      } else if (wh.start && wh.end) {
        lines.push(`أوقات العمل: من ${wh.start} إلى ${wh.end}`);
        if (wh.days) {
          lines.push(`أيام العمل: ${wh.days}`);
        }
      }
    } catch {}
  }
  if (lines.length === 0) return "";
  return `معلومات النشاط:\n${lines.join("\n")}`;
}

function buildStrictRules(tenant: TenantProfile): string {
  const escalationMsg = tenant.defaultEscalationMessage
    || `سأحوّلك لفريق ${tenant.name} المتخصص للمساعدة`;
  const rules = [
    `تمثّل "${tenant.name}" فقط ولا تذكر أي شركة أو علامة تجارية أخرى.`,
    "رد بنفس لغة العميل.",
    "لا تتجاوز 150 كلمة في الرد الواحد.",
    "لا تختلق معلومات غير موجودة في قاعدة المعرفة أو معلومات النشاط.",
    `عند عدم معرفة الإجابة، قل: "${escalationMsg}".`,
    "لا تكشف أنك نظام ذكاء اصطناعي إلا إذا سُئلت مباشرة.",
    "لا تناقش مواضيع خارج نطاق خدمات ومنتجات الشركة.",
  ];
  return `القواعد الإلزامية:\n${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

function buildKnowledgeBase(entries: AiKnowledge[]): string {
  if (entries.length === 0) return "";
  const items = entries.map(k => {
    const title = k.title ? `[${k.title}] ` : "";
    return `- ${title}${k.content}`;
  });
  return `قاعدة المعرفة (استخدمها للرد على أسئلة العملاء):\n${items.join("\n")}`;
}

function buildConversationContext(messages: Message[]): string {
  if (messages.length === 0) return "";
  return "سياق المحادثة السابقة متاح لك. استخدمه لفهم السياق والرد بشكل متسق.";
}

function isTourismTenant(tenant: TenantProfile): boolean {
  const check = (v: string | null | undefined) => {
    if (!v) return false;
    const lower = v.toLowerCase();
    return ["travel", "tourism", "سياحة", "سفر", "سياحه"].some(k => lower.includes(k));
  };
  return check(tenant.businessIndustry) || check(tenant.businessType);
}

function buildTourismLayer(tenant: TenantProfile): string {
  return `[تخصص صناعة السياحة والسفر]

أنت مستشار سفر وسياحة محترف يعمل في ${tenant.name}. لديك خبرة واسعة في:
- حجوزات الطيران (محلية ودولية)
- الباقات السياحية والعروض
- الفنادق والإقامة
- التأشيرات ومتطلبات السفر

عند طلب حجز طيران (كلمات مثل: طيران، تذاكر، رحلة، حجز طيران، تذكرة):
1. اسأل عن الوجهة (إلى أين؟)
2. اسأل عن مدينة المغادرة (من أين؟)
3. اسأل عن تاريخ السفر
4. اسأل عن تاريخ العودة (اختياري)
5. اسأل عن عدد المسافرين
6. اسأل عن درجة الطيران (اقتصادية/رجال أعمال/أولى) - اختياري
لا تسأل كل البيانات دفعة واحدة - اسأل سؤالين أو ثلاثة كحد أقصى في كل رد.

عند طلب باقة سياحية (كلمات مثل: بكج، باقة، باقات، عروض سياحية):
1. ابحث في المنتجات المتوفرة واعرضها بشكل جذاب
2. اسأل عن التفاصيل (التاريخ، عدد الأشخاص، الميزانية)

عند استلام صورة إيصال تحويل بنكي:
1. أكد استلام الإيصال
2. أخبر العميل أن الفريق المالي سيراجعه

كن دقيقاً في المعلومات ولا تختلق أسعار أو رحلات غير موجودة.`;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const layers: string[] = [];

  layers.push(buildBaseSystem());
  layers.push(buildTenantIdentity(ctx.tenant));
  layers.push(buildStyleLayer(ctx.tenant));

  const bizInfo = buildBusinessInfo(ctx.tenant);
  if (bizInfo) layers.push(bizInfo);

  layers.push(buildStrictRules(ctx.tenant));

  if (isTourismTenant(ctx.tenant)) {
    layers.push(buildTourismLayer(ctx.tenant));
  }

  if (ctx.tenant.aiSystemPrompt) {
    layers.push(`تعليمات مخصصة من الإدارة:\n${ctx.tenant.aiSystemPrompt}`);
  }

  const kb = buildKnowledgeBase(ctx.knowledgeEntries);
  if (kb) layers.push(kb);

  const convCtx = buildConversationContext(ctx.recentMessages);
  if (convCtx) layers.push(convCtx);

  return layers.join("\n\n");
}
