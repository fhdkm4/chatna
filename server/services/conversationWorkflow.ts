import { classifyIntent } from "./aiMessageProcessor";
import { generateAiResponse } from "./ai";
import { handleAIMessage } from "./ai-handler";
import { simulateTypingDelay } from "./typing-delay";
import { sendWhatsAppMessage } from "./twilio";
import { isHandoverRequest } from "./assignment";
import { checkAutoReply } from "./ai";
import {
  initWorkflow,
  updateWorkflow,
  getNextQuestion,
  createOrderFromWorkflow,
  getWorkflowSummaryAr,
  isBookingIntent,
} from "./order-workflow";
import { storage } from "../storage";
import type { Server as SocketServer } from "socket.io";

export interface ProcessResult {
  handled: boolean;
  action: "auto_reply" | "workflow" | "order_created" | "receipt" | "ai_reply" | "escalation" | "skipped";
  reply?: string;
  orderId?: string;
  confidence?: number;
}

export async function processIncomingMessage(params: {
  tenantId: string;
  conversationId: string;
  contactId: string;
  customerPhone: string;
  messageContent: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  imageBase64?: string;
  imageMimeType?: string;
  io: SocketServer;
  onEscalation?: (conversationId: string, tenantId: string, customerPhone: string, reason: string) => Promise<void>;
}): Promise<ProcessResult> {
  const {
    tenantId,
    conversationId,
    contactId,
    customerPhone,
    messageContent,
    mediaUrl,
    mediaType,
    io,
  } = params;

  const conversation = await storage.getConversationById(conversationId, tenantId);
  if (!conversation) {
    return { handled: false, action: "skipped" };
  }

  if (conversation.aiPaused) {
    console.log("⏸️ AI paused for conversation", conversationId);
    return { handled: false, action: "skipped" };
  }

  if (conversation.assignmentStatus === "assigned") {
    const recentMessages = await storage.getRecentMessages(conversationId, 5);
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const agentActiveRecently = recentMessages.some(
      m => m.senderType === "agent" && m.createdAt && new Date(m.createdAt) > twoMinutesAgo
    );
    if (agentActiveRecently) {
      console.log("👤 Agent actively chatting, skipping AI for", conversationId);
      return { handled: false, action: "skipped" };
    }
    console.log("🔄 Auto-switching to AI handling for", conversationId);
    await storage.updateConversation(conversationId, tenantId, { assignmentStatus: "ai_handling" } as any);
  }

  const escalate = params.onEscalation || (async () => {});

  if (isHandoverRequest(messageContent)) {
    console.log("🙋 Handover requested");
    await escalate(conversationId, tenantId, customerPhone, "طلب تحويل لموظف بشري");
    return { handled: true, action: "escalation" };
  }

  const tenant = await storage.getTenant(tenantId);
  if (!tenant?.aiEnabled) {
    console.log("❌ AI disabled for tenant", tenantId);
    return { handled: false, action: "skipped" };
  }

  if (mediaUrl && !messageContent && mediaType && !mediaType.startsWith("image")) {
    return { handled: false, action: "skipped" };
  }

  const autoReplyContent = await checkAutoReply(tenantId, messageContent);
  if (autoReplyContent) {
    console.log("✅ Auto-reply matched");
    await simulateTypingDelay(autoReplyContent);
    const sid = await sendWhatsAppMessage(customerPhone, autoReplyContent);
    const aiMsg = await storage.createMessage({
      conversationId,
      tenantId,
      senderType: "ai",
      content: autoReplyContent,
      aiConfidence: 1.0,
      twilioSid: sid,
    });
    await storage.createMessageLog({
      tenantId,
      contactId,
      conversationId,
      messageType: "auto_reply",
      direction: "outbound",
      channel: "whatsapp",
      delivered: !!sid,
      failed: !sid,
      twilioSid: sid,
      sentAt: new Date(),
    });
    await storage.updateConversation(conversationId, tenantId, { aiHandled: true });
    io.to(`tenant:${tenantId}`).emit("new_message", { conversationId, message: aiMsg });
    return { handled: true, action: "auto_reply", reply: autoReplyContent, confidence: 1.0 };
  }

  const existingCtx = await storage.getAiContext(conversationId, tenantId);
  const hasActiveWorkflow = existingCtx?.context && (existingCtx.context as any).workflowState;

  const classification = await classifyIntent(messageContent, !!mediaUrl);
  console.log("🧩 Classification:", classification.intent, "confidence:", classification.confidence);

  if (isBookingIntent(classification.intent) || hasActiveWorkflow) {
    let workflowState;
    if (hasActiveWorkflow) {
      const savedState = (existingCtx!.context as any).workflowState;
      workflowState = updateWorkflow(savedState, classification.entities);
      console.log("🔄 Workflow updated, missing:", workflowState.missingFields);
    } else {
      workflowState = initWorkflow(classification);
      console.log("🆕 Workflow started for:", classification.intent, "missing:", workflowState.missingFields);
    }

    let replyText: string;
    let action: ProcessResult["action"] = "workflow";
    let orderId: string | undefined;

    if (workflowState.stage === "ready") {
      const result = await createOrderFromWorkflow(workflowState, tenantId, conversationId, contactId);
      workflowState = result.state;
      orderId = result.orderId;
      const summary = getWorkflowSummaryAr(workflowState);
      replyText = `تم تسجيل طلبك بنجاح!\n\n${summary}\n\nسيتم التواصل معك قريباً من أحد موظفينا لتأكيد التفاصيل والسعر.`;
      action = "order_created";
      io.to(`tenant:${tenantId}`).emit("new_order", { orderId: result.orderId, conversationId });
    } else {
      const question = getNextQuestion(workflowState);
      replyText = question || "شكراً، سأتحقق من التفاصيل.";
    }

    await storage.upsertAiContext(
      conversationId,
      tenantId,
      workflowState.stage === "order_created" ? "completed" : "active",
      { workflowState },
    );

    await simulateTypingDelay(replyText);
    const sid = await sendWhatsAppMessage(customerPhone, replyText);
    if (!sid) {
      console.warn("⚠️ Failed to send workflow reply via WhatsApp for", conversationId);
    }
    const aiMsg = await storage.createMessage({
      conversationId,
      tenantId,
      senderType: "ai",
      content: replyText,
      aiConfidence: classification.confidence,
      twilioSid: sid,
    });
    await storage.createMessageLog({
      tenantId,
      contactId,
      conversationId,
      messageType: "ai_reply",
      direction: "outbound",
      channel: "whatsapp",
      delivered: !!sid,
      failed: !sid,
      twilioSid: sid,
      sentAt: new Date(),
    });
    await storage.updateConversation(conversationId, tenantId, { aiHandled: true, aiFailedAttempts: 0 });
    io.to(`tenant:${tenantId}`).emit("new_message", { conversationId, message: aiMsg });

    if (workflowState.stage === "order_created") {
      await storage.updateConversation(conversationId, tenantId, { assignmentStatus: "waiting" } as any);
    }

    return { handled: true, action, reply: replyText, orderId, confidence: classification.confidence };
  }

  const isTravelTenant = tenant.businessType &&
    ["travel", "tourism", "سياحة", "سفر", "سياحه"].some(k =>
      (tenant.businessType || "").toLowerCase().includes(k)
    );

  const hasImage = mediaType === "image" || (mediaUrl && mediaType?.startsWith("image"));
  if ((classification.intent === "payment_receipt" || hasImage) && (mediaUrl || params.imageBase64) && isTravelTenant) {
    console.log("📎 Receipt detected via classifier");
    if (params.imageBase64 && params.imageMimeType) {
      const aiResult = await handleAIMessage({
        tenantId,
        conversationId,
        customerPhone,
        userMessage: messageContent || "[صورة]",
        imageBase64: params.imageBase64,
        imageMimeType: params.imageMimeType,
        mediaUrl: mediaUrl || undefined,
      });

      if (aiResult && aiResult.receiptData?.isReceipt) {
        await simulateTypingDelay(aiResult.reply);
        const sid = await sendWhatsAppMessage(customerPhone, aiResult.reply);
        const aiMsg = await storage.createMessage({
          conversationId,
          tenantId,
          senderType: "ai",
          content: aiResult.reply,
          aiConfidence: aiResult.confidence,
          twilioSid: sid,
        });
        io.to(`tenant:${tenantId}`).emit("new_message", { conversationId, message: aiMsg });
        io.to(`tenant:${tenantId}`).emit("payment_received", {
          conversationId,
          message: "إيصال جديد بانتظار المراجعة",
        });
        return { handled: true, action: "receipt", reply: aiResult.reply, confidence: aiResult.confidence };
      }
    }
  }

  console.log("🧠 Generating AI response for:", messageContent.substring(0, 80));
  const aiResponse = await generateAiResponse(
    tenantId,
    conversationId,
    messageContent,
    tenant.aiSystemPrompt,
  );
  console.log("🧠 AI response confidence:", aiResponse.confidence);

  const contact = contactId ? await storage.getContactById(contactId, tenantId) : null;
  const shouldEscalateSentiment = contact?.sentiment === "negative" && aiResponse.confidence < 0.8;

  if (shouldEscalateSentiment) {
    console.log("⚠️ Negative sentiment + low confidence, escalating");
    await escalate(conversationId, tenantId, customerPhone, "sentiment سلبي + priority عالي");
    return { handled: true, action: "escalation" };
  }

  if (aiResponse.confidence >= 0.6) {
    await simulateTypingDelay(aiResponse.content);
    const sid = await sendWhatsAppMessage(customerPhone, aiResponse.content);
    const aiMsg = await storage.createMessage({
      conversationId,
      tenantId,
      senderType: "ai",
      content: aiResponse.content,
      aiConfidence: aiResponse.confidence,
      twilioSid: sid,
    });
    await storage.createMessageLog({
      tenantId,
      contactId,
      conversationId,
      messageType: "ai_reply",
      direction: "outbound",
      channel: "whatsapp",
      delivered: !!sid,
      failed: !sid,
      twilioSid: sid,
      sentAt: new Date(),
    });
    await storage.updateConversation(conversationId, tenantId, { aiHandled: true, aiFailedAttempts: 0 });
    io.to(`tenant:${tenantId}`).emit("new_message", { conversationId, message: aiMsg });
    return { handled: true, action: "ai_reply", reply: aiResponse.content, confidence: aiResponse.confidence };
  }

  const currentFailures = (conversation.aiFailedAttempts || 0) + 1;
  if (currentFailures >= 2) {
    console.log("⚠️ AI failed twice, escalating");
    await escalate(conversationId, tenantId, customerPhone, "فشل AI بعد محاولتين");
    return { handled: true, action: "escalation" };
  }

  await storage.updateConversation(conversationId, tenantId, { aiFailedAttempts: currentFailures });
  await simulateTypingDelay(aiResponse.content);
  const sid = await sendWhatsAppMessage(customerPhone, aiResponse.content);
  const aiMsg = await storage.createMessage({
    conversationId,
    tenantId,
    senderType: "ai",
    content: aiResponse.content,
    aiConfidence: aiResponse.confidence,
    twilioSid: sid,
  });
  await storage.createMessageLog({
    tenantId,
    contactId,
    conversationId,
    messageType: "ai_reply",
    direction: "outbound",
    channel: "whatsapp",
    delivered: !!sid,
    failed: !sid,
    twilioSid: sid,
    sentAt: new Date(),
  });
  io.to(`tenant:${tenantId}`).emit("new_message", { conversationId, message: aiMsg });
  return { handled: true, action: "ai_reply", reply: aiResponse.content, confidence: aiResponse.confidence };
}
