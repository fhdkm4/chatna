import { GoogleGenerativeAI } from "@google/generative-ai";
import { storage } from "../storage";
import type { Message, AiKnowledge } from "@shared/schema";
import { buildSystemPrompt } from "./prompt-builder";

const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || ""
);

interface AiResponse {
  content: string;
  confidence: number;
}

export async function checkAutoReply(tenantId: string, messageContent: string): Promise<string | null> {
  const autoReplies = await storage.getActiveAutoReplies(tenantId);

  for (const reply of autoReplies) {
    const lowerContent = messageContent.toLowerCase();
    const lowerTrigger = reply.triggerValue.toLowerCase();

    switch (reply.triggerType) {
      case "exact":
        if (lowerContent === lowerTrigger) return reply.response;
        break;
      case "keyword":
        if (lowerContent.includes(lowerTrigger)) return reply.response;
        break;
      case "pattern":
        try {
          const regex = new RegExp(reply.triggerValue, "i");
          if (regex.test(messageContent)) return reply.response;
        } catch (e) {}
        break;
    }
  }

  return null;
}

export async function generateAiResponse(
  tenantId: string,
  conversationId: string,
  customerMessage: string,
  customSystemPrompt?: string | null,
): Promise<AiResponse> {
  try {
    const tenant = await storage.getTenant(tenantId);
    const knowledgeEntries = await storage.getActiveKnowledge(tenantId);
    const recentMessages = await storage.getRecentMessages(conversationId, 10);

    const systemPrompt = buildSystemPrompt({
      tenant: {
        name: tenant?.name || "الشركة",
        businessDescription: tenant?.businessDescription,
        businessType: tenant?.businessType,
        contactPhone: tenant?.contactPhone,
        website: tenant?.website,
        workingHours: tenant?.workingHours,
        address: tenant?.address,
        aiTone: tenant?.aiTone,
        welcomeMessage: tenant?.welcomeMessage,
        offHoursMessage: tenant?.offHoursMessage,
        aiPersonalityInstructions: tenant?.aiPersonalityInstructions,
        defaultEscalationMessage: tenant?.defaultEscalationMessage,
        languagePreference: tenant?.languagePreference,
        aiSystemPrompt: tenant?.aiSystemPrompt,
      },
      knowledgeEntries,
      recentMessages,
      customerMessage,
    });

    const chatHistory = recentMessages.map(msg => ({
      role: msg.senderType === "customer" ? "user" : "model",
      parts: [{ text: msg.content }],
    }));

    if (chatHistory.length === 0 || chatHistory[chatHistory.length - 1].role !== "user") {
      chatHistory.push({ role: "user", parts: [{ text: customerMessage }] });
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({
      history: chatHistory.slice(0, -1),
    });

    const lastMessage = chatHistory[chatHistory.length - 1];
    const result = await chat.sendMessage(lastMessage.parts[0].text);
    const content = result.response.text() || "عذراً، لم أتمكن من معالجة طلبك.";

    let confidence = 0.85;

    if (content.includes("أحوّلك") || content.includes("موظف متخصص") || content.includes("لا أعرف") || content.includes("لست متأكد") || content.includes("فريق")) {
      confidence = 0.4;
    } else if (knowledgeEntries.length > 0) {
      confidence = 0.92;
    }

    return { content, confidence };
  } catch (error) {
    console.error("AI service error:", error);
    return {
      content: "عذراً، حدث خطأ في النظام. سيتم تحويلك لموظف متخصص.",
      confidence: 0.1,
    };
  }
}
