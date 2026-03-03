import { classifyMessageLocal, classifyMessage } from "./ai-classifier";
import type { ClassificationResult, ClassificationEntities, Intent } from "./ai-classifier";
import { checkAutoReply, generateAiResponse } from "./ai";
import { handleAIMessage } from "./ai-handler";
import { storage } from "../storage";

export { classifyMessageLocal, classifyMessage };
export type { ClassificationResult, ClassificationEntities, Intent };

export async function classifyIntent(message: string, hasImage?: boolean): Promise<ClassificationResult> {
  if (hasImage) {
    return classifyMessage(message, true);
  }
  return classifyMessageLocal(message);
}

export function extractEntities(message: string): ClassificationEntities {
  const result = classifyMessageLocal(message);
  return result.entities;
}

export async function generateReply(
  tenantId: string,
  conversationId: string,
  message: string,
  systemPrompt?: string | null,
): Promise<{ content: string; confidence: number }> {
  const autoReply = await checkAutoReply(tenantId, message);
  if (autoReply) {
    return { content: autoReply, confidence: 1.0 };
  }

  return generateAiResponse(tenantId, conversationId, message, systemPrompt);
}

export async function analyzeReceipt(params: {
  tenantId: string;
  conversationId: string;
  customerPhone: string;
  message: string;
  imageBase64: string;
  imageMimeType: string;
  mediaUrl?: string;
}) {
  return handleAIMessage({
    tenantId: params.tenantId,
    conversationId: params.conversationId,
    customerPhone: params.customerPhone,
    userMessage: params.message,
    imageBase64: params.imageBase64,
    imageMimeType: params.imageMimeType,
    mediaUrl: params.mediaUrl,
  });
}
