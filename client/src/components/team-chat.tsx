import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Send, MessageSquare, Circle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import type { InternalMessage } from "@shared/schema";
import type { Socket } from "socket.io-client";

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface TeamChatProps {
  socket: Socket | null;
}

export function TeamChat({ socket }: TeamChatProps) {
  const { user } = useAuth();
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [messageText, setMessageText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: members = [], isLoading: membersLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team-members"],
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<InternalMessage[]>({
    queryKey: ["/api/internal-messages", selectedMember?.id],
    enabled: !!selectedMember,
  });

  const sendMutation = useMutation({
    mutationFn: async (data: { receiverId: string; message: string }) => {
      await apiRequest("POST", "/api/internal-messages", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-messages", selectedMember?.id] });
    },
  });

  useEffect(() => {
    if (!socket) return;

    const handler = (msg: InternalMessage) => {
      if (
        selectedMember &&
        ((msg.senderId === selectedMember.id && msg.receiverId === user?.id) ||
          (msg.senderId === user?.id && msg.receiverId === selectedMember.id))
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/internal-messages", selectedMember.id] });
      }
    };

    socket.on("internal_message", handler);
    return () => {
      socket.off("internal_message", handler);
    };
  }, [socket, selectedMember, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (selectedMember) {
      inputRef.current?.focus();
    }
  }, [selectedMember]);

  const handleSend = useCallback(() => {
    if (!messageText.trim() || !selectedMember) return;
    sendMutation.mutate({ receiverId: selectedMember.id, message: messageText.trim() });
    setMessageText("");
  }, [messageText, selectedMember, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredMembers = members.filter((m) =>
    !searchQuery || m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const roleLabel = (role: string) => {
    switch (role) {
      case "admin": return "مسؤول";
      case "manager": return "مدير";
      case "agent": return "موظف";
      default: return role;
    }
  };

  return (
    <div className="flex h-full" data-testid="team-chat-container">
      <div className="w-80 border-l border-white/5 bg-[#0d1321] flex flex-col shrink-0">
        <div className="p-4 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white mb-3" data-testid="text-team-chat-title">
            المحادثات الداخلية
          </h2>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              data-testid="input-team-search"
              placeholder="بحث عن عضو..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 bg-white/5 border-white/10 text-white placeholder:text-gray-500 h-9 text-sm"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {membersLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">جاري التحميل...</div>
          ) : filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">لا يوجد أعضاء</div>
          ) : (
            <div className="p-2">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  data-testid={`member-${member.id}`}
                  onClick={() => setSelectedMember(member)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg text-right transition-all ${
                    selectedMember?.id === member.id
                      ? "bg-emerald-500/15 border border-emerald-500/30"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-white">
                      {member.name.charAt(0)}
                    </div>
                    <Circle
                      className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 ${
                        member.status === "online" ? "text-emerald-400 fill-emerald-400" : "text-gray-600 fill-gray-600"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{member.name}</div>
                    <div className="text-xs text-gray-500">{roleLabel(member.role)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      <div className="flex-1 flex flex-col bg-[#0a0f1a] min-w-0">
        {selectedMember ? (
          <>
            <div className="px-6 py-4 border-b border-white/5 bg-[#0d1321] flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-sm font-bold text-white">
                  {selectedMember.name.charAt(0)}
                </div>
                <Circle
                  className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 ${
                    selectedMember.status === "online" ? "text-emerald-400 fill-emerald-400" : "text-gray-600 fill-gray-600"
                  }`}
                />
              </div>
              <div>
                <div className="font-semibold text-white" data-testid="text-selected-member-name">
                  {selectedMember.name}
                </div>
                <div className="text-xs text-gray-400">
                  {roleLabel(selectedMember.role)} · {selectedMember.status === "online" ? "متصل" : "غير متصل"}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              {messagesLoading ? (
                <div className="text-center text-gray-500 text-sm py-8">جاري تحميل الرسائل...</div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 text-sm py-8" data-testid="text-no-messages">
                  لا توجد رسائل بعد. ابدأ المحادثة!
                </div>
              ) : (
                <div className="space-y-3 max-w-3xl mx-auto">
                  {messages.map((msg) => {
                    const isMine = msg.senderId === user?.id;
                    return (
                      <div
                        key={msg.id}
                        data-testid={`message-${msg.id}`}
                        className={`flex ${isMine ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                            isMine
                              ? "bg-emerald-500/20 text-emerald-50 rounded-br-md"
                              : "bg-white/10 text-gray-200 rounded-bl-md"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${isMine ? "text-emerald-400/60" : "text-gray-500"}`}>
                            {msg.createdAt ? formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true, locale: ar }) : ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <div className="px-4 py-3 border-t border-white/5 bg-[#0d1321]">
              <div className="flex items-center gap-2 max-w-3xl mx-auto">
                <Input
                  ref={inputRef}
                  data-testid="input-internal-message"
                  placeholder="اكتب رسالة..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-white/5 border-white/10 text-white placeholder:text-gray-500"
                  disabled={sendMutation.isPending}
                />
                <Button
                  data-testid="button-send-internal"
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  size="icon"
                  className="bg-emerald-500 hover:bg-emerald-600 text-white shrink-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center" data-testid="text-select-member-prompt">
              <MessageSquare className="w-16 h-16 text-gray-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-400">المحادثات الداخلية</h3>
              <p className="text-sm text-gray-600 mt-1">اختر عضو من الفريق لبدء المحادثة</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
