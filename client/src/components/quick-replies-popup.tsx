import { useState, useEffect } from "react";
import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch } from "@/lib/auth";
import type { QuickReply } from "@shared/schema";

interface QuickRepliesPopupProps {
  onSelect: (content: string) => void;
  onClose: () => void;
}

export function QuickRepliesPopup({ onSelect, onClose }: QuickRepliesPopupProps) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReplies = async () => {
      try {
        const res = await authFetch("/api/quick-replies");
        if (res.ok) {
          const data = await res.json();
          setReplies(data);
        }
      } catch (err) {
        console.error("Failed to fetch quick replies:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReplies();
  }, []);

  return (
    <div className="absolute bottom-full right-0 left-0 mb-2 bg-[#111827] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 text-emerald-400" />
          <span className="text-xs font-medium text-white">ردود سريعة</span>
        </div>
        <Button size="icon" variant="ghost" onClick={onClose} className="w-6 h-6 text-gray-400">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <ScrollArea className="max-h-48">
        {loading ? (
          <div className="p-4 text-center text-gray-500 text-xs">جاري التحميل...</div>
        ) : replies.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-xs">لا توجد ردود سريعة</div>
        ) : (
          <div className="p-1">
            {replies.map((reply) => (
              <button
                key={reply.id}
                data-testid={`quick-reply-${reply.id}`}
                onClick={() => onSelect(reply.content)}
                className="w-full text-right p-2.5 rounded-md hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-white">{reply.title}</span>
                  {reply.shortcut && (
                    <span className="text-[9px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">
                      /{reply.shortcut}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5 truncate">{reply.content}</p>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
