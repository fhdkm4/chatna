import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import type { Message, AiKnowledge } from "@shared/schema";
import { buildSystemPrompt } from "./prompt-builder";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || undefined,
});

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

    const chatMessages: Anthropic.MessageParam[] = recentMessages.map(msg => ({
      role: msg.senderType === "customer" ? "user" as const : "assistant" as const,
      content: msg.content,
    }));

    if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].role !== "user") {
      chatMessages.push({ role: "user", content: customerMessage });
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: chatMessages,
    });

    const textContent = response.content.find(c => c.type === "text");
    const content = textContent?.text || "عذراً، لم أتمكن من معالجة طلبك.";

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
