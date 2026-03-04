import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import { buildSystemPrompt } from "./prompt-builder";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
);

interface HandleAIMessageParams {
  tenantId: string;
  conversationId: string;
  customerPhone: string;
  userMessage: string;
  messageHistory?: any[];
  imageBase64?: string;
  imageMimeType?: string;
  mediaUrl?: string;
}

interface HandleAIMessageResult {
  reply: string;
  confidence: number;
  newStatus?: string;
  receiptData?: {
    isReceipt: boolean;
    amount?: number;
    currency?: string;
    bankName?: string;
    transactionId?: string;
    date?: string;
    confidence?: number;
  };
}

const TRAVEL_KEYWORDS = ["طيران", "تذاكر", "flight", "رحلة", "حجز طيران", "تذكرة"];
const PACKAGE_KEYWORDS = ["بكج", "باقة", "package", "باقات", "عروض سياحية"];

function isTravelBusiness(businessType: string | null | undefined): boolean {
  if (!businessType) return false;
  const t = businessType.toLowerCase();
  return ["travel", "tourism", "سياحة", "سفر", "سياحه"].some(k => t.includes(k));
}

function detectIntent(message: string): "flight" | "package" | "general" {
  const lower = message.toLowerCase();
  if (TRAVEL_KEYWORDS.some(k => lower.includes(k))) return "flight";
  if (PACKAGE_KEYWORDS.some(k => lower.includes(k))) return "package";
  return "general";
}

async function analyzeReceiptWithVision(imageBase64: string, mimeType: string): Promise<any> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType,
          data: imageBase64,
        },
      },
      {
        text: `Analyze this image. If it's a bank transfer receipt or payment confirmation, extract the following as JSON ONLY (no other text):
{
  "isReceipt": true/false,
  "amount": number or null,
  "currency": "SAR" or detected currency,
  "bankName": "bank name" or null,
  "transactionId": "reference number" or null,
  "date": "YYYY-MM-DD" or null,
  "confidence": 0.0-1.0
}
If it's NOT a receipt, return: {"isReceipt": false, "confidence": 0}
Return ONLY the JSON, nothing else.`,
      },
    ]);

    const text = result.response.text() || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return { isReceipt: false, confidence: 0 };
  } catch (error) {
    console.error("Vision analysis error:", error);
    return { isReceipt: false, confidence: 0 };
  }
}

export async function handleAIMessage(params: HandleAIMessageParams): Promise<HandleAIMessageResult> {
  const { tenantId, conversationId, customerPhone, userMessage, imageBase64, imageMimeType, mediaUrl } = params;

  try {
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return { reply: "عذرا، حدث خطأ في النظام.", confidence: 0.1 };
    }

    const isTravelTenant = isTravelBusiness(tenant.businessType);
    const aiContext = await storage.getAiContext(conversationId, tenantId);

    if (imageBase64 && imageMimeType && isTravelTenant) {
      const visionResult = await analyzeReceiptWithVision(imageBase64, imageMimeType);

      if (visionResult.isReceipt && visionResult.confidence > 0.7) {
        await storage.createAiPayment({
          tenantId,
          conversationId,
          customerPhone,
          imageUrl: mediaUrl || "",
          amount: visionResult.amount?.toString() || "0",
          currency: visionResult.currency || "SAR",
          visionData: visionResult,
          status: "pending",
        });

        await storage.upsertAiContext(conversationId, tenantId, "awaiting_payment", aiContext?.context);

        return {
          reply: "تم استلام الإيصال بنجاح. جاري مراجعته من قبل الفريق المالي وسيتم تأكيد الحجز في أقرب وقت.",
          confidence: 0.95,
          newStatus: "awaiting_payment",
          receiptData: visionResult,
        };
      }
    }

    const intent = isTravelTenant ? detectIntent(userMessage) : "general";

    if (intent === "flight" && isTravelTenant) {
      const contextData = (aiContext?.context as any) || {};
      const travelPrompt = buildTravelCollectionPrompt(contextData, userMessage, tenant);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: travelPrompt,
      });

      const result = await model.generateContent(userMessage);
      const reply = result.response.text() || "";

      let newStatus: string | undefined;
      let cleanReply = reply;

      if (reply.includes("|||STATUS:awaiting_price|||")) {
        newStatus = "awaiting_price";
        cleanReply = reply.replace("|||STATUS:awaiting_price|||", "").trim();
        await storage.upsertAiContext(conversationId, tenantId, "awaiting_price", extractTravelData(userMessage, contextData));
      } else {
        const updatedContext = extractTravelData(userMessage, contextData);
        await storage.upsertAiContext(conversationId, tenantId, aiContext?.status || "active", updatedContext);
      }

      return { reply: cleanReply, confidence: 0.9, newStatus };
    }

    if (intent === "package" && isTravelTenant) {
      const tenantProducts = await storage.searchTenantProducts(tenantId);
      let productInfo = "";
      if (tenantProducts.length > 0) {
        productInfo = "\n\nالباقات المتوفرة:\n" + tenantProducts.map(p =>
          `- ${p.name}: ${p.description || ""} | السعر: ${p.price || "يحدد لاحقا"} ${p.currency || "SAR"}`
        ).join("\n");
      }

      const knowledgeEntries = await storage.getActiveKnowledge(tenantId);
      const recentMessages = await storage.getRecentMessages(conversationId, 10);

      const systemPrompt = buildSystemPrompt({
        tenant: {
          name: tenant.name,
          businessDescription: tenant.businessDescription,
          businessType: tenant.businessType,
          businessIndustry: tenant.businessIndustry,
          contactPhone: tenant.contactPhone,
          website: tenant.website,
          workingHours: tenant.workingHours,
          address: tenant.address,
          aiTone: tenant.aiTone,
          welcomeMessage: tenant.welcomeMessage,
          offHoursMessage: tenant.offHoursMessage,
          aiPersonalityInstructions: tenant.aiPersonalityInstructions,
          defaultEscalationMessage: tenant.defaultEscalationMessage,
          languagePreference: tenant.languagePreference,
          aiSystemPrompt: tenant.aiSystemPrompt,
        },
        knowledgeEntries,
        recentMessages,
        customerMessage: userMessage,
      });

      const fullPrompt = systemPrompt + "\n\n[معلومات الباقات]" + productInfo +
        "\n\nعند عرض الباقات، اعرضها بشكل جذاب ومنظم. إذا طلب العميل حجز باقة معينة، اسأله عن التفاصيل (التاريخ، عدد الأشخاص).";

      const chatHistory = recentMessages.map(msg => ({
        role: msg.senderType === "customer" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));
      if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== "user") {
        chatHistory.push({ role: "user", parts: [{ text: userMessage }] });
      }

      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: fullPrompt,
      });

      const chat = model.startChat({
        history: chatHistory.slice(0, -1),
      });

      const lastMsg = chatHistory[chatHistory.length - 1];
      const result = await chat.sendMessage(lastMsg.parts[0].text);
      const reply = result.response.text() || "";
      return { reply, confidence: 0.9 };
    }

    return null as any;
  } catch (error) {
    console.error("AI Handler error:", error);
    return {
      reply: "عذرا، حدث خطأ في معالجة طلبك. سيتم تحويلك لموظف متخصص.",
      confidence: 0.1,
    };
  }
}

function buildTravelCollectionPrompt(contextData: any, message: string, tenant: any): string {
  const lang = tenant.languagePreference === "en" ? "English" : "Arabic";
  const tone = tenant.aiTone || "friendly";
  const personality = tenant.aiPersonalityInstructions || "";

  const collected: string[] = [];
  if (contextData.destination) collected.push(`الوجهة: ${contextData.destination}`);
  if (contextData.origin) collected.push(`المغادرة من: ${contextData.origin}`);
  if (contextData.departureDate) collected.push(`تاريخ الذهاب: ${contextData.departureDate}`);
  if (contextData.returnDate) collected.push(`تاريخ العودة: ${contextData.returnDate}`);
  if (contextData.passengers) collected.push(`عدد المسافرين: ${contextData.passengers}`);
  if (contextData.flightClass) collected.push(`الدرجة: ${contextData.flightClass}`);

  const missing: string[] = [];
  if (!contextData.destination) missing.push("الوجهة");
  if (!contextData.origin) missing.push("مدينة المغادرة");
  if (!contextData.departureDate) missing.push("تاريخ السفر");
  if (!contextData.passengers) missing.push("عدد المسافرين");

  let prompt = `أنت مستشار سفر محترف يعمل في ${tenant.name}. ${personality}
تحدث بلغة ${lang} وبأسلوب ${tone}.

مهمتك: جمع بيانات حجز الطيران من العميل.

البيانات المطلوبة:
1. الوجهة (إلى أين؟)
2. مدينة المغادرة (من أين؟)
3. تاريخ السفر
4. تاريخ العودة (اختياري)
5. عدد المسافرين
6. درجة الطيران (اقتصادية/رجال أعمال/أولى) - اختياري

`;

  if (collected.length > 0) {
    prompt += `البيانات المجمعة حتى الآن:\n${collected.join("\n")}\n\n`;
  }
  if (missing.length > 0) {
    prompt += `البيانات الناقصة: ${missing.join("، ")}\n\n`;
    prompt += `اسأل العميل عن البيانات الناقصة بشكل طبيعي ومهذب. لا تسأل كل البيانات دفعة واحدة.\n`;
  }

  if (missing.length === 0 || (contextData.destination && contextData.origin && contextData.departureDate && contextData.passengers)) {
    prompt += `\nتم جمع جميع البيانات الأساسية. أخبر العميل أن الفريق سيتواصل معه قريبا بالأسعار المتوفرة.
أضف في نهاية ردك بالضبط هذا النص: |||STATUS:awaiting_price|||`;
  }

  return prompt;
}

function extractTravelData(message: string, existingData: any): any {
  const data = { ...existingData };
  const lower = message.toLowerCase();

  const cities = ["الرياض", "جدة", "الدمام", "المدينة", "مكة", "أبها", "تبوك", "القصيم",
    "دبي", "القاهرة", "إسطنبول", "لندن", "باريس", "كوالالمبور", "بانكوك", "جورجيا", "أذربيجان"];

  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) {
      if (!data.destination) {
        data.destination = city;
      } else if (!data.origin) {
        data.origin = city;
      }
    }
  }

  const dateMatch = message.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-]?(\d{2,4})?/);
  if (dateMatch) {
    if (!data.departureDate) {
      data.departureDate = dateMatch[0];
    } else if (!data.returnDate) {
      data.returnDate = dateMatch[0];
    }
  }

  const numMatch = message.match(/(\d+)\s*(شخص|أشخاص|مسافر|مسافرين|person|people)/i);
  if (numMatch) {
    data.passengers = parseInt(numMatch[1]);
  }

  if (lower.includes("اقتصاد") || lower.includes("economy")) data.flightClass = "economy";
  if (lower.includes("رجال أعمال") || lower.includes("business")) data.flightClass = "business";
  if (lower.includes("أولى") || lower.includes("first")) data.flightClass = "first";

  return data;
}
