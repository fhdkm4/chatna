import { Search, MessageSquare, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConversationWithDetails, ConversationFilter } from "@/pages/dashboard";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface ConversationListProps {
  conversations: ConversationWithDetails[];
  selected: ConversationWithDetails | null;
  onSelect: (conv: ConversationWithDetails) => void;
  filter: ConversationFilter;
  onFilterChange: (f: ConversationFilter) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
  delayedConversations?: Set<string>;
}

const filters: { id: ConversationFilter; label: string }[] = [
  { id: "all", label: "الكل" },
  { id: "active", label: "نشط" },
  { id: "waiting", label: "بانتظار" },
  { id: "resolved", label: "مغلق" },
];

function getStatusColor(status: string) {
  switch (status) {
    case "active": return "bg-emerald-500";
    case "waiting": return "bg-amber-500";
    case "resolved": return "bg-gray-500";
    default: return "bg-gray-500";
  }
}

function getInitials(name?: string | null) {
  if (!name) return "؟";
  return name.split(" ").map(w => w[0]).join("").slice(0, 2);
}

export function ConversationList({
  conversations,
  selected,
  onSelect,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  loading,
  delayedConversations,
}: ConversationListProps) {
  return (
    <div className="w-[340px] border-l border-white/5 bg-[#0d1321] flex flex-col shrink-0">
      <div className="p-4 border-b border-white/5">
        <h2 className="text-lg font-semibold text-white mb-3">المحادثات</h2>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input
            data-testid="input-search-conversations"
            type="search"
            placeholder="بحث..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pr-10 bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 text-sm"
          />
        </div>
        <div className="flex gap-1 mt-3">
          {filters.map((f) => (
            <button
              key={f.id}
              data-testid={`filter-${f.id}`}
              onClick={() => onFilterChange(f.id)}
              className={`flex-1 text-xs py-1.5 rounded-md transition-all font-medium ${
                filter === f.id
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400 hover:bg-white/5"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-3 p-3">
                <Skeleton className="w-10 h-10 rounded-full bg-white/5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24 bg-white/5" />
                  <Skeleton className="h-3 w-full bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <MessageSquare className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        ) : (
          <div className="p-2">
            {conversations.map((conv) => {
              const isDelayed = delayedConversations?.has(conv.id) || conv.delayAlerted;
              return (
              <button
                key={conv.id}
                data-testid={`conversation-${conv.id}`}
                onClick={() => onSelect(conv)}
                className={`w-full flex gap-3 p-3 rounded-lg transition-all text-right ${
                  isDelayed
                    ? "bg-red-500/15 border border-red-500/30 animate-pulse"
                    : selected?.id === conv.id
                      ? "bg-emerald-500/10 border border-emerald-500/20"
                      : "hover:bg-white/5 border border-transparent"
                }`}
              >
                <div className="relative shrink-0">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                    isDelayed
                      ? "bg-gradient-to-br from-red-400/80 to-red-600/80"
                      : "bg-gradient-to-br from-emerald-400/80 to-emerald-600/80"
                  }`}>
                    {getInitials(conv.contact?.name)}
                  </div>
                  <div className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-[#0d1321] ${isDelayed ? "bg-red-500" : getStatusColor(conv.status || "active")}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={`text-sm font-medium truncate ${isDelayed ? "text-red-400" : "text-white"}`}>
                      {conv.contact?.name || conv.contact?.phone || "جهة اتصال"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isDelayed && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" data-testid={`delay-icon-${conv.id}`} />
                      )}
                      <span className="text-[10px] text-gray-500">
                        {conv.updatedAt
                          ? formatDistanceToNow(new Date(conv.updatedAt), { locale: ar, addSuffix: true })
                          : ""}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-gray-400 truncate">
                      {conv.lastMessage?.content || "لا توجد رسائل"}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {isDelayed && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-500/40 text-red-400 bg-red-500/10" data-testid={`delay-badge-${conv.id}`}>
                          متأخر
                        </Badge>
                      )}
                      {conv.aiHandled && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                          AI
                        </Badge>
                      )}
                      {(conv.unreadCount ?? 0) > 0 && (
                        <span className="min-w-[18px] h-[18px] rounded-full bg-emerald-500 text-[10px] font-bold text-white flex items-center justify-center px-1">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {conv.contact?.tags && conv.contact.tags.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {conv.contact.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
