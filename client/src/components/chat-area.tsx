import { useState, useRef, useEffect } from "react";
import { Send, Zap, PanelRightOpen, Bot, UserCircle, Check, CheckCheck, UserPlus, FileDown, Image } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickRepliesPopup } from "@/components/quick-replies-popup";
import { AssignAgentPopup } from "@/components/assign-agent-popup";
import type { ConversationWithDetails } from "@/pages/dashboard";
import type { Message, Conversation } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface ChatAreaProps {
  conversation: ConversationWithDetails | null;
  messages: Message[];
  onSend: (content: string) => void;
  onToggleContact: () => void;
  onUpdateConversation: (id: string, updates: Partial<Conversation>) => void;
  onAssignAgent: (conversationId: string, agentId: string | null) => void;
  user: { id: string; name: string; role: string };
}

function getMessageBorderColor(senderType: string) {
  switch (senderType) {
    case "ai": return "border-r-emerald-500";
    case "agent": return "border-r-blue-500";
    case "customer": return "border-r-gray-500";
    case "system": return "border-r-amber-500";
    default: return "border-r-gray-500";
  }
}

function getMessageBg(senderType: string) {
  switch (senderType) {
    case "ai": return "bg-emerald-500/5";
    case "agent": return "bg-blue-500/5";
    case "customer": return "bg-white/5";
    case "system": return "bg-amber-500/5";
    default: return "bg-white/5";
  }
}

function MediaDisplay({ mediaUrl, mediaType }: { mediaUrl: string; mediaType: string | null }) {
  if (!mediaUrl) return null;

  if (mediaType?.startsWith("image")) {
    return (
      <div className="mt-2 rounded-lg overflow-hidden max-w-[300px]">
        <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
          <img
            src={mediaUrl}
            alt="صورة مرفقة"
            className="w-full h-auto rounded-lg border border-white/10"
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
      className="mt-2 flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg p-3 hover:bg-white/10 transition-colors max-w-[300px]"
    >
      <FileDown className="w-5 h-5 text-emerald-400 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-white truncate">ملف مرفق</p>
        <p className="text-[10px] text-gray-500">{mediaType || "ملف"}</p>
      </div>
    </a>
  );
}

export function ChatArea({ conversation, messages, onSend, onToggleContact, onUpdateConversation, onAssignAgent, user }: ChatAreaProps) {
  const [input, setInput] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
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
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0a0f1a]/50 text-gray-500">
        <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
          <Bot className="w-10 h-10 text-emerald-500/40" />
        </div>
        <p className="text-lg font-medium text-gray-400">اختر محادثة للبدء</p>
        <p className="text-sm mt-1 text-gray-600">يمكنك اختيار محادثة من القائمة</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-[#0a0f1a]/50 min-w-0">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-4 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white">
            {conversation.contact?.name?.[0] || "؟"}
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">
              {conversation.contact?.name || conversation.contact?.phone || "جهة اتصال"}
            </h3>
            <span className="text-[10px] text-gray-500">{conversation.contact?.phone}</span>
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
                : "border-gray-500/30 text-gray-400"
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
              className="text-xs text-gray-400 h-7"
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
          {conversation.status !== "resolved" && (
            <Button
              size="sm"
              variant="ghost"
              data-testid="button-resolve"
              onClick={() => onUpdateConversation(conversation.id, { status: "resolved" })}
              className="text-xs text-gray-400 h-7"
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
            className="text-gray-400"
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
            className={`max-w-[75%] rounded-lg p-3 border-r-2 ${getMessageBorderColor(msg.senderType)} ${getMessageBg(msg.senderType)} ${
              msg.senderType === "agent" ? "mr-auto" : "ml-auto"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {msg.senderType === "ai" && (
                <Bot className="w-3 h-3 text-emerald-400" />
              )}
              {msg.senderType === "agent" && (
                <UserCircle className="w-3 h-3 text-blue-400" />
              )}
              <span className="text-[10px] text-gray-500">
                {msg.senderType === "ai" ? "مساعد ذكي" : msg.senderType === "agent" ? user.name : msg.senderType === "system" ? "النظام" : "العميل"}
              </span>
              {msg.aiConfidence != null && (
                <Badge variant="outline" className={`text-[8px] px-1 py-0 ${
                  msg.aiConfidence >= 0.6
                    ? "border-emerald-500/30 text-emerald-400"
                    : "border-amber-500/30 text-amber-400"
                }`}>
                  {Math.round(msg.aiConfidence * 100)}%
                </Badge>
              )}
              <span className="text-[9px] text-gray-600 mr-auto">
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
            {msg.senderType === "agent" && (
              <div className="flex justify-start mt-1">
                <CheckCheck className="w-3 h-3 text-emerald-400/50" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-white/5 bg-[#0d1321]/50 shrink-0 relative">
        {showQuickReplies && (
          <QuickRepliesPopup
            onSelect={(content) => {
              setInput(content);
              setShowQuickReplies(false);
              inputRef.current?.focus();
            }}
            onClose={() => setShowQuickReplies(false)}
          />
        )}
        <div className="flex items-end gap-2">
          <Button
            size="icon"
            variant="ghost"
            data-testid="button-quick-replies"
            onClick={() => setShowQuickReplies(!showQuickReplies)}
            className="text-gray-400 shrink-0"
          >
            <Zap className="w-4 h-4" />
          </Button>
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              data-testid="input-message"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="اكتب رسالة..."
              rows={1}
              className="w-full bg-[#0a0f1a] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-gray-500 resize-none focus:outline-none focus:border-emerald-500/30 transition-colors"
              style={{ minHeight: "40px", maxHeight: "120px" }}
            />
          </div>
          <Button
            size="icon"
            data-testid="button-send-message"
            onClick={handleSend}
            disabled={!input.trim()}
            className="bg-emerald-600 shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
