import { useState, useRef, useEffect } from "react";
import { Send, Zap, PanelRightOpen, Bot, UserCircle, Check, CheckCheck, UserPlus, FileDown, Eye, EyeOff, ArrowLeftRight, X, Loader2, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickRepliesPopup } from "@/components/quick-replies-popup";
import { AssignAgentPopup } from "@/components/assign-agent-popup";
import { authFetch } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import type { ConversationWithDetails } from "@/pages/dashboard";
import type { Message, Conversation } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface ChatAreaProps {
  conversation: ConversationWithDetails | null;
  messages: Message[];
  onSend: (content: string, isInternal?: boolean) => void;
  onToggleContact: () => void;
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void;
  onAssignAgent: (conversationId: string, agentId: string | null) => void;
  onTransfer?: (conversationId: string, toAgentId: string, reason?: string) => void;
  user: { id: string; name: string; role: string };
}

function getMessageBorderColor(senderType: string, isInternal?: boolean | null) {
  if (isInternal) return "border-r-amber-400";
  switch (senderType) {
    case "ai": return "border-r-emerald-500";
    case "agent": return "border-r-blue-500";
    case "internal": return "border-r-amber-400";
    case "customer": return "border-r-gray-500";
    case "system": return "border-r-amber-500";
    default: return "border-r-gray-500";
  }
}

function getMessageBg(senderType: string, isInternal?: boolean | null) {
  if (isInternal) return "bg-amber-500/10 border border-amber-500/20";
  switch (senderType) {
    case "ai": return "bg-emerald-500/5";
    case "agent": return "bg-blue-500/5";
    case "internal": return "bg-amber-500/10 border border-amber-500/20";
    case "customer": return "bg-muted/40";
    case "system": return "bg-amber-500/5";
    default: return "bg-muted/40";
  }
}

function MediaDisplay({ mediaUrl, mediaType }: { mediaUrl: string; mediaType: string | null }) {
  if (!mediaUrl) return null;

  if (mediaType?.startsWith("image") || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)/i)) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden max-w-[300px]">
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={mediaUrl}
            alt="صورة مرفقة"
            className="w-full h-auto rounded-lg border border-border"
            data-testid="media-image"
          />
        </a>
      </div>
    );
  }

  return (
    <a
      href={mediaUrl}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="media-file"
      className="mt-2 flex items-center gap-2 bg-muted/40 border border-border rounded-lg p-3 hover:bg-muted/60 transition-colors max-w-[300px]"
    >
      <FileDown className="w-5 h-5 text-emerald-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-foreground truncate">ملف مرفق</p>
        <p className="text-[10px] text-muted-foreground">{mediaType || "ملف"}</p>
      </div>
    </a>
  );
}

function TransferPopup({ conversationId, currentAgentId, onTransfer, onClose }: {
  conversationId: string;
  currentAgentId: string;
  onTransfer: (toAgentId: string, reason?: string) => void;
  onClose: () => void;
}) {
  const [agents, setAgents] = useState<{ id: string; name: string; email: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await authFetch("/api/team/available");
        if (res.ok) {
          const data = await res.json();
          setAgents(data.filter((a: any) => a.id !== currentAgentId));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, [currentAgentId]);

  return (
    <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">تحويل المحادثة</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground/80" data-testid="button-close-transfer">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="سبب التحويل (اختياري)"
          data-testid="input-transfer-reason"
          className="w-full bg-muted/40 border border-border rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500/50"
        />
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        </div>
      ) : agents.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          لا يوجد موظفين متاحين
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {agents.map((agent) => (
            <button
              key={agent.id}
              data-testid={`button-transfer-to-${agent.id}`}
              onClick={() => onTransfer(agent.id, reason || undefined)}
              className="w-full px-3 py-2 flex items-center gap-2 text-right hover:bg-muted/40 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                {agent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs text-foreground truncate">{agent.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{agent.role === "admin" ? "مدير" : agent.role === "manager" ? "مشرف" : "موظف"}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SendToColleaguePopup({ conversationId, contactName, onClose }: {
  conversationId: string;
  contactName: string;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<{ id: string; name: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await authFetch("/api/team-members");
        if (res.ok) {
          setMembers(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const handleSend = async (memberId: string) => {
    setSending(memberId);
    try {
      const message = `راجع هذه المحادثة مع ${contactName}: /conversations/${conversationId}`;
      await apiRequest("POST", "/api/internal-messages", { receiverId: memberId, message });
      setSent((prev) => new Set(prev).add(memberId));
    } catch (err) {
      console.error(err);
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="absolute top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden" data-testid="popup-send-to-colleague">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground">إرسال لزميل</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground/80" data-testid="button-close-send-colleague">
          <X className="w-3 h-3" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        </div>
      ) : members.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
          لا يوجد أعضاء في الفريق
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {members.map((member) => (
            <button
              key={member.id}
              data-testid={`button-send-to-${member.id}`}
              onClick={() => handleSend(member.id)}
              disabled={sending === member.id || sent.has(member.id)}
              className="w-full px-3 py-2 flex items-center gap-2 text-right hover:bg-muted/40 transition-colors disabled:opacity-50"
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-[10px] font-bold text-foreground shrink-0">
                {member.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs text-foreground truncate">{member.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {member.role === "admin" ? "مسؤول" : member.role === "manager" ? "مدير" : "موظف"}
                </p>
              </div>
              {sending === member.id ? (
                <Loader2 className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
              ) : sent.has(member.id) ? (
                <Check className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Forward className="w-3 h-3 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChatArea({ conversation, messages, onSend, onToggleContact, onUpdateConversation, onAssignAgent, onTransfer, user }: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [isInternalMode, setIsInternalMode] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showSendColleague, setShowSendColleague] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim(), isInternalMode);
    setInput("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background/80 text-muted-foreground">
        <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
          <Bot className="w-10 h-10 text-emerald-500/40" />
        </div>
        <p className="text-lg font-medium text-muted-foreground">اختر محادثة للبدء</p>
        <p className="text-sm mt-1 text-muted-foreground">يمكنك اختيار محادثة من القائمة</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-background/80 min-w-0">
      <div className="h-14 border-b border-border flex items-center justify-between px-4 bg-card/80 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-foreground">
            {conversation.contact?.name?.[0] || "؟"}
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">
              {conversation.contact?.name || conversation.contact?.phone || "جهة اتصال"}
            </h3>
            <span className="text-[10px] text-muted-foreground">{conversation.contact?.phone}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {conversation.aiPaused && (
            <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 bg-amber-500/10">
              AI متوقف
            </Badge>
          )}
          {conversation.aiHandled && !conversation.aiPaused && (
            <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
              AI نشط
            </Badge>
          )}
          {(conversation as any).assignedAgent && (
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400 bg-blue-500/10">
              {(conversation as any).assignedAgent.name}
            </Badge>
          )}
          <Badge
            variant="outline"
            className={`text-[10px] ${
              conversation.status === "active"
                ? "border-emerald-500/30 text-emerald-400"
                : conversation.status === "waiting"
                ? "border-amber-500/30 text-amber-400"
                : "border-gray-500/30 text-muted-foreground"
            }`}
          >
            {conversation.status === "active" ? "نشط" : conversation.status === "waiting" ? "بانتظار" : "مغلق"}
          </Badge>
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              data-testid="button-assign-agent"
              onClick={() => setShowAssign(!showAssign)}
              className="text-xs text-muted-foreground h-7"
            >
              <UserPlus className="w-3 h-3 ml-1" />
              تعيين
            </Button>
            {showAssign && (
              <AssignAgentPopup
                conversationId={conversation.id}
                currentAgentId={conversation.assignedTo}
                onAssign={(agentId: string | null) => {
                  onAssignAgent(conversation.id, agentId);
                  setShowAssign(false);
                }}
                onClose={() => setShowAssign(false)}
              />
            )}
          </div>
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              data-testid="button-send-to-colleague"
              onClick={() => setShowSendColleague(!showSendColleague)}
              className="text-xs text-muted-foreground h-7"
            >
              <Forward className="w-3 h-3 ml-1" />
              إرسال لزميل
            </Button>
            {showSendColleague && (
              <SendToColleaguePopup
                conversationId={conversation.id}
                contactName={conversation.contact?.name || conversation.contact?.phone || "عميل"}
                onClose={() => setShowSendColleague(false)}
              />
            )}
          </div>
          {conversation.assignedTo && onTransfer && (user.role === "admin" || user.role === "manager") && (
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                data-testid="button-transfer"
                onClick={() => setShowTransfer(!showTransfer)}
                className="text-xs text-muted-foreground h-7"
              >
                <ArrowLeftRight className="w-3 h-3 ml-1" />
                تحويل
              </Button>
              {showTransfer && (
                <TransferPopup
                  conversationId={conversation.id}
                  currentAgentId={conversation.assignedTo}
                  onTransfer={(toAgentId, reason) => {
                    onTransfer(conversation.id, toAgentId, reason);
                    setShowTransfer(false);
                  }}
                  onClose={() => setShowTransfer(false)}
                />
              )}
            </div>
          )}
          {conversation.status !== "resolved" && (
            <Button
              size="sm"
              variant="ghost"
              data-testid="button-resolve"
              onClick={() => onUpdateConversation(conversation.id, { status: "resolved" })}
              className="text-xs text-muted-foreground h-7"
            >
              <Check className="w-3 h-3 ml-1" />
              إغلاق
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-toggle-contact"
            onClick={onToggleContact}
            className="text-muted-foreground"
          >
            <PanelRightOpen className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            data-testid={`message-${msg.id}`}
            className={`max-w-[75%] rounded-lg p-3 border-r-2 ${getMessageBorderColor(msg.senderType, msg.isInternal)} ${getMessageBg(msg.senderType, msg.isInternal)} ${
              msg.senderType === "customer" ? "ml-auto" : "mr-auto"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {msg.isInternal && (
                <EyeOff className="w-3 h-3 text-amber-400" />
              )}
              {msg.senderType === "ai" && (
                <Bot className="w-3 h-3 text-emerald-400" />
              )}
              {(msg.senderType === "agent" || msg.senderType === "internal") && !msg.isInternal && (
                <UserCircle className="w-3 h-3 text-blue-400" />
              )}
              <span className="text-[10px] text-muted-foreground">
                {msg.isInternal
                  ? "ملاحظة داخلية"
                  : msg.senderType === "ai"
                  ? "مساعد ذكي"
                  : msg.senderType === "agent" || msg.senderType === "internal"
                  ? user.name
                  : msg.senderType === "system"
                  ? "النظام"
                  : "العميل"}
              </span>
              {msg.isInternal && (
                <Badge variant="outline" className="text-[8px] px-1 py-0 border-amber-500/30 text-amber-400 bg-amber-500/10">
                  همس
                </Badge>
              )}
              {msg.aiConfidence != null && (
                <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
                  msg.aiConfidence >= 0.6
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-amber-500/30 text-amber-400"
                }`}>
                  {Math.round(msg.aiConfidence * 100)}%
                </Badge>
              )}
              <span className="text-[9px] text-muted-foreground mr-auto">
                {msg.createdAt
                  ? formatDistanceToNow(new Date(msg.createdAt), { locale: ar, addSuffix: true })
                  : ""}
              </span>
            </div>
            <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
              {msg.content}
            </p>
            {msg.mediaUrl && (
              <MediaDisplay mediaUrl={msg.mediaUrl} mediaType={msg.mediaType} />
            )}
            {msg.senderType === "agent" && !msg.isInternal && (
              <div className="flex justify-start mt-1">
                <CheckCheck className="w-3 h-3 text-emerald-400/50" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border bg-card/80 shrink-0 relative">
        {showQuickReplies && (
          <QuickRepliesPopup
            onSelect={(content) => {
              onSend(content, false);
              setShowQuickReplies(false);
            }}
            onClose={() => setShowQuickReplies(false)}
          />
        )}
        {isInternalMode && (
          <div className="flex items-center gap-2 mb-2 px-2">
            <EyeOff className="w-3 h-3 text-amber-400" />
            <span className="text-[11px] text-amber-400">وضع الهمس - الملاحظة لن تُرسل للعميل</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-quick-replies"
            onClick={() => setShowQuickReplies(!showQuickReplies)}
            className="text-muted-foreground shrink-0"
            title="ردود سريعة"
          >
            <Zap className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-internal-note"
            onClick={() => setIsInternalMode(!isInternalMode)}
            className={`shrink-0 ${isInternalMode ? "text-amber-400 bg-amber-500/10" : "text-muted-foreground"}`}
            title="ملاحظة داخلية (همس)"
          >
            {isInternalMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              data-testid="input-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isInternalMode ? "اكتب ملاحظة داخلية..." : "اكتب رسالة..."}
              rows={1}
              className={`w-full bg-background border rounded-lg px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none transition-colors ${
                isInternalMode
                  ? "border-amber-500/30 focus:border-amber-500/50"
                  : "border-border focus:border-emerald-500/30"
              }`}
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
          </div>
          <Button
            size="icon"
            data-testid="button-send-message"
            onClick={handleSend}
            disabled={!input.trim()}
            className={`shrink-0 ${isInternalMode ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
