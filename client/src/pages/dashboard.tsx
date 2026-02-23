import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, authFetch } from "@/lib/auth";
import { useLocation } from "wouter";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConversationList } from "@/components/conversation-list";
import { ChatArea } from "@/components/chat-area";
import { ContactPanel } from "@/components/contact-panel";
import { KnowledgeBase } from "@/components/knowledge-base";
import { AutoReplies } from "@/components/auto-replies";
import { AiSettings } from "@/components/ai-settings";
import { CompanyIdentity } from "@/components/company-identity";
import { StatsOverview } from "@/components/stats-overview";
import { TeamManagement } from "@/components/team-management";
import { TeamMonitoring } from "@/components/team-monitoring";
import { Campaigns } from "@/components/campaigns";
import { ProductCatalog } from "@/components/product-catalog";
import { io, Socket } from "socket.io-client";
import type { Conversation, Message, Contact } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export type ActiveView = "chat" | "contacts" | "ai" | "ai-settings" | "company-identity" | "analytics" | "settings" | "team" | "monitoring" | "campaigns" | "catalog";
export type ConversationFilter = "all" | "active" | "waiting" | "resolved";

export interface ConversationWithDetails extends Conversation {
  contact?: Contact;
  lastMessage?: Message;
  unreadCount?: number;
  assignedAgent?: { id: string; name: string; email: string } | null;
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function showBrowserNotification(title: string, body: string) {
  if ("Notification" in window && Notification.permission === "granted") {
    if (document.hidden) {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: "jawab-notification",
      });
    }
  }
}

function playNotificationSound(type: "assignment" | "escalation" | "message" = "message") {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.gain.value = 0.3;

    if (type === "assignment") {
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      oscillator.start();
      setTimeout(() => { oscillator.frequency.value = 1100; }, 150);
      setTimeout(() => { oscillator.frequency.value = 1320; }, 300);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6);
      setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 600);
    } else if (type === "escalation") {
      oscillator.frequency.value = 600;
      oscillator.type = "triangle";
      oscillator.start();
      setTimeout(() => { oscillator.frequency.value = 800; }, 200);
      setTimeout(() => { oscillator.frequency.value = 600; }, 400);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
      setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 800);
    } else {
      oscillator.frequency.value = 523;
      oscillator.type = "sine";
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 300);
    }
  } catch (e) {
    // Audio not supported
  }
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeView, setActiveView] = useState<ActiveView>("chat");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<ConversationWithDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [onlineAgents, setOnlineAgents] = useState<Set<string>>(new Set());
  const [delayedConversations, setDelayedConversations] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }

    requestNotificationPermission();

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on("new_message", (data: { conversationId: string; message: Message }) => {
      if (selectedConversation?.id === data.conversationId) {
        setMessages((prev) => [...prev, data.message]);
      }

      if (data.message.senderType === "customer") {
        playNotificationSound("message");
        showBrowserNotification(
          "رسالة جديدة - جواب",
          data.message.content?.substring(0, 80) || "رسالة جديدة"
        );
      }

      fetchConversations();
    });

    socket.on("escalation", (data: { conversationId: string; reason: string }) => {
      playNotificationSound("escalation");
      toast({
        title: "تنبيه: محادثة تحتاج تدخل",
        description: data.reason || "ثقة الذكاء الاصطناعي منخفضة",
        variant: "destructive",
      });
      showBrowserNotification("تنبيه - جواب", "محادثة تحتاج تدخل بشري");
      fetchConversations();
    });

    socket.on("new_assignment", (data: { conversationId: string; contactName: string; contactPhone: string; lastMessage: string; priority: string; agentName: string }) => {
      playNotificationSound("assignment");
      toast({
        title: "📋 محادثة جديدة معيّنة لك",
        description: `عميل: ${data.contactName}\n${data.lastMessage?.substring(0, 60) || ""}`,
        variant: "default",
        duration: 10000,
      });
      showBrowserNotification(
        "محادثة جديدة - جواب",
        `تم تعيين محادثة ${data.contactName} لك`
      );
      fetchConversations();
    });

    socket.on("conversation_updated", (_data: { conversationId: string; status: string; assignedTo?: string }) => {
      fetchConversations();
    });

    socket.on("agent_status", (data: { userId: string; status: string }) => {
      setOnlineAgents((prev) => {
        const next = new Set(prev);
        if (data.status === "online") {
          next.add(data.userId);
        } else {
          next.delete(data.userId);
        }
        return next;
      });
    });

    socket.on("delay_alert", (data: { conversationId: string }) => {
      setDelayedConversations((prev) => new Set(prev).add(data.conversationId));
      toast({
        title: "⏰ تنبيه تأخير",
        description: "مرّت 10 دقائق على رسالة عميل بدون رد!",
        variant: "destructive",
      });
      showBrowserNotification("تنبيه تأخير - جواب", "محادثة لم يتم الرد عليها منذ أكثر من 10 دقائق");
      fetchConversations();
    });

    return () => {
      socket.disconnect();
    };
  }, [token]);

  const fetchConversations = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (searchQuery) params.set("search", searchQuery);
      const res = await authFetch(`/api/conversations?${params}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
        const delayed = new Set<string>();
        for (const c of data) {
          if (c.delayAlerted) delayed.add(c.id);
        }
        if (delayed.size > 0) {
          setDelayedConversations((prev) => {
            const next = new Set(prev);
            delayed.forEach((id) => next.add(id));
            return next;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    } finally {
      setLoading(false);
    }
  }, [filter, searchQuery]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  }, []);

  const selectConversation = useCallback((conv: ConversationWithDetails) => {
    setSelectedConversation(conv);
    fetchMessages(conv.id);
  }, [fetchMessages]);

  const sendMessage = useCallback(async (content: string, isInternal?: boolean) => {
    if (!selectedConversation) return;
    try {
      const res = await authFetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, isInternal: isInternal || false }),
      });
      if (res.ok) {
        const msg = await res.json();
        setMessages((prev) => [...prev, msg]);
        fetchConversations();
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [selectedConversation, fetchConversations]);

  const updateConversation = useCallback(async (id: string, updates: Partial<Conversation>) => {
    try {
      await authFetch(`/api/conversations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      fetchConversations();
      if (selectedConversation?.id === id) {
        setSelectedConversation((prev) => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      console.error("Failed to update conversation:", err);
    }
  }, [selectedConversation, fetchConversations]);

  const transferConversation = useCallback(async (conversationId: string, toAgentId: string, reason?: string) => {
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ toAgentId, reason }),
      });
      if (res.ok) {
        toast({
          title: "تم التحويل",
          description: "تم تحويل المحادثة بنجاح",
        });
        fetchConversations();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      console.error("Failed to transfer conversation:", err);
    }
  }, [fetchConversations]);

  const assignAgent = useCallback(async (conversationId: string, agentId: string | null) => {
    try {
      const res = await authFetch(`/api/conversations/${conversationId}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        toast({
          title: agentId ? "تم التعيين" : "تم إلغاء التعيين",
          description: agentId ? "تم تعيين الموظف للمحادثة" : "تم إلغاء تعيين الموظف",
        });
        fetchConversations();
      }
    } catch (err) {
      console.error("Failed to assign agent:", err);
    }
  }, [fetchConversations]);

  if (!user) return null;

  const renderMainContent = () => {
    if ((activeView === "settings" || activeView === "ai-settings" || activeView === "company-identity") && user?.role !== "admin") {
      setActiveView("chat");
      return null;
    }
    if ((activeView === "team" || activeView === "monitoring" || activeView === "campaigns") && user?.role !== "admin" && user?.role !== "manager") {
      setActiveView("chat");
      return null;
    }

    switch (activeView) {
      case "ai":
        return <KnowledgeBase />;
      case "ai-settings":
        return <AiSettings onNavigateToKnowledgeBase={() => setActiveView("ai")} />;
      case "company-identity":
        return <CompanyIdentity />;
      case "analytics":
        return <StatsOverview />;
      case "settings":
        return <AutoReplies />;
      case "team":
        return <TeamManagement onlineAgents={onlineAgents} />;
      case "monitoring":
        return <TeamMonitoring onlineAgents={onlineAgents} />;
      case "campaigns":
        return <Campaigns />;
      case "catalog":
        return <ProductCatalog />;
      default:
        return (
          <div className="flex h-full">
            <ConversationList
              conversations={conversations}
              selected={selectedConversation}
              onSelect={(conv) => {
                selectConversation(conv);
                setDelayedConversations((prev) => {
                  const next = new Set(prev);
                  next.delete(conv.id);
                  return next;
                });
              }}
              filter={filter}
              onFilterChange={setFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              loading={loading}
              delayedConversations={delayedConversations}
            />
            <ChatArea
              conversation={selectedConversation}
              messages={messages}
              onSend={sendMessage}
              onToggleContact={() => setShowContactPanel(!showContactPanel)}
              onUpdateConversation={updateConversation}
              onAssignAgent={assignAgent}
              onTransfer={transferConversation}
              user={user}
            />
            {showContactPanel && selectedConversation?.contact && (
              <ContactPanel
                contact={selectedConversation.contact}
                onClose={() => setShowContactPanel(false)}
              />
            )}
          </div>
        );
    }
  };

  return (
    <div className="h-screen flex bg-[#0a0f1a] text-white overflow-hidden" dir="rtl">
      <NavSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        user={user}
        onLogout={() => { logout(); setLocation("/login"); }}
      />
      <div className="flex-1 flex flex-col min-w-0">
        {renderMainContent()}
      </div>
    </div>
  );
}
