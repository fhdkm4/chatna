import { db } from "../db";
import { users, conversations } from "@shared/schema";
import { eq, and, or, asc, count } from "drizzle-orm";
import { storage } from "../storage";
import type { Tenant } from "@shared/schema";

export function isWithinWorkingHours(tenant: Tenant): boolean {
  const workingHours = tenant.workingHours as any;
  if (!workingHours) return true;

  const now = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayName = dayNames[now.getDay()];

  const todayHours = workingHours[todayName] || workingHours.default;
  if (!todayHours) return true;
  if (todayHours.closed || todayHours.off) return false;

  const startStr = todayHours.start || todayHours.from || "08:00";
  const endStr = todayHours.end || todayHours.to || "17:00";

  const [startH, startM] = startStr.split(":").map(Number);
  const [endH, endM] = endStr.split(":").map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}

export const HANDOVER_KEYWORDS = [
  "موظف", "بشري", "كلم موظف", "تحويل", "وكيل", "ممثل",
  "أبي أكلم شخص", "ابي اكلم شخص", "كلمني موظف", "تكلم مع موظف",
  "أريد التحدث مع شخص", "اريد موظف", "أبغى موظف", "ابغى موظف",
  "human", "agent", "representative", "talk to someone", "real person",
  "transfer", "speak to agent", "connect me"
];

export function isHandoverRequest(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return HANDOVER_KEYWORDS.some(kw => normalized.includes(kw.toLowerCase()));
}

interface AssignmentResult {
  agentId: string | null;
  agentName: string | null;
  reason: "assigned" | "no_agents_available" | "manual_mode";
}

export async function assignConversationToAgent(tenantId: string, conversationId: string): Promise<AssignmentResult> {
  const tenant = await storage.getTenant(tenantId);
  if (!tenant) {
    return { agentId: null, agentName: null, reason: "no_agents_available" };
  }

  if (tenant.assignmentMode === "manual") {
    return { agentId: null, agentName: null, reason: "manual_mode" };
  }

  const maxOpen = tenant.maxOpenConversationsPerUser || 5;

  const onlineAgents = await db.select().from(users)
    .where(and(
      eq(users.tenantId, tenantId),
      eq(users.role, "agent"),
      eq(users.status, "online"),
    ));

  if (onlineAgents.length === 0) {
    return { agentId: null, agentName: null, reason: "no_agents_available" };
  }

  const eligibleAgents: { id: string; name: string; activeChats: number; lastAssignedAt: Date | null }[] = [];
  for (const agent of onlineAgents) {
    const activeCount = await storage.getActiveConversationCountByAgent(agent.id);
    if (activeCount < maxOpen) {
      eligibleAgents.push({
        id: agent.id,
        name: agent.name,
        activeChats: activeCount,
        lastAssignedAt: agent.lastAssignedAt,
      });
    }
  }

  if (eligibleAgents.length === 0) {
    return { agentId: null, agentName: null, reason: "no_agents_available" };
  }

  let chosenAgent: { id: string; name: string };

  if (tenant.assignmentMode === "least_busy") {
    eligibleAgents.sort((a, b) => a.activeChats - b.activeChats);
    chosenAgent = eligibleAgents[0];
  } else {
    eligibleAgents.sort((a, b) => {
      if (!a.lastAssignedAt && !b.lastAssignedAt) return 0;
      if (!a.lastAssignedAt) return -1;
      if (!b.lastAssignedAt) return 1;
      return a.lastAssignedAt.getTime() - b.lastAssignedAt.getTime();
    });
    chosenAgent = eligibleAgents[0];
  }

  const existingConv = await storage.getConversationById(conversationId, tenantId);
  const previousAssignee = existingConv?.assignedTo || null;

  await storage.updateConversation(conversationId, tenantId, {
    assignedTo: chosenAgent.id,
    status: "active",
    assignmentStatus: "assigned",
  });

  await db.update(users)
    .set({ lastAssignedAt: new Date() })
    .where(eq(users.id, chosenAgent.id));

  await storage.incrementAgentMetric(chosenAgent.id, tenantId, "totalConversations");

  await storage.createActivityLog({
    tenantId,
    userId: chosenAgent.id,
    action: "auto_assigned",
    details: { conversationId },
  });

  await storage.createAssignmentLog({
    tenantId,
    conversationId,
    previousAssignee,
    newAssignee: chosenAgent.id,
    assignedBy: "ai",
  });

  return { agentId: chosenAgent.id, agentName: chosenAgent.name, reason: "assigned" };
}
