import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";
import type { Message, AiKnowledge } from "@shared/schema";

const anthropic = new Anthropic({
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
});

const DEFAULT_SYSTEM_PROMPT = `أنت مساعد خدمة عملاء ذكي. رد بنفس لغة العميل (عربي أو إنجليزي). كن ودوداً ومحترفاً. لو ما تعرف الجواب، قل "دقيقة وأحوّلك لموظف متخصص". لا تخترع معلومات. الردود مختصرة ومفيدة.`;

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
    const knowledgeEntries = await storage.getKnowledgeByTenant(tenantId);
    const recentMessages = await storage.getRecentMessages(conversationId, 10);

    const knowledgeContext = knowledgeEntries.length > 0
      ? `\n\nمعلومات قاعدة المعرفة:\n${knowledgeEntries.map(k => `- ${k.title || ""}: ${k.content}`).join("\n")}`
      : "";

    const systemPrompt = (customSystemPrompt || DEFAULT_SYSTEM_PROMPT) + knowledgeContext;

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

    const stopReason = response.stop_reason;
    let confidence = 0.85;

    if (content.includes("أحوّلك") || content.includes("موظف متخصص") || content.includes("لا أعرف") || content.includes("لست متأكد")) {
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
