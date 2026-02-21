import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth, authFetch } from "@/lib/auth";
import { useLocation } from "wouter";
import { NavSidebar } from "@/components/nav-sidebar";
import { ConversationList } from "@/components/conversation-list";
import { ChatArea } from "@/components/chat-area";
import { ContactPanel } from "@/components/contact-panel";
import { KnowledgeBase } from "@/components/knowledge-base";
import { AutoReplies } from "@/components/auto-replies";
import { StatsOverview } from "@/components/stats-overview";
import { io, Socket } from "socket.io-client";
import type { Conversation, Message, Contact } from "@shared/schema";

export type ActiveView = "chat" | "contacts" | "ai" | "analytics" | "settings";
export type ConversationFilter = "all" | "active" | "waiting" | "resolved";

export interface ConversationWithDetails extends Conversation {
  contact?: Contact;
  lastMessage?: Message;
  unreadCount?: number;
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
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) {
      setLocation("/login");
      return;
    }

    const socket = io({ auth: { token } });
    socketRef.current = socket;

    socket.on("new_message", (data: { conversationId: string; message: Message }) => {
      if (selectedConversation?.id === data.conversationId) {
        setMessages((prev) => [...prev, data.message]);
      }
      fetchConversations();
    });

    socket.on("escalation", () => {
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

  const sendMessage = useCallback(async (content: string) => {
    if (!selectedConversation) return;
    try {
      const res = await authFetch(`/api/conversations/${selectedConversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
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

  if (!user) return null;

  const renderMainContent = () => {
    switch (activeView) {
      case "ai":
        return <KnowledgeBase />;
      case "analytics":
        return <StatsOverview />;
      case "settings":
        return <AutoReplies />;
      default:
        return (
          <div className="flex h-full">
            <ConversationList
              conversations={conversations}
              selected={selectedConversation}
              onSelect={selectConversation}
              filter={filter}
              onFilterChange={setFilter}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              loading={loading}
            />
            <ChatArea
              conversation={selectedConversation}
              messages={messages}
              onSend={sendMessage}
              onToggleContact={() => setShowContactPanel(!showContactPanel)}
              onUpdateConversation={updateConversation}
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
