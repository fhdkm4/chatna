import { useState } from "react";
import { X, Phone, Tag, StickyNote, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/lib/auth";
import type { Contact } from "@shared/schema";

interface ContactPanelProps {
  contact: Contact;
  onClose: () => void;
}

function getSentimentInfo(sentiment: string | null) {
  switch (sentiment) {
    case "positive": return { icon: TrendingUp, color: "text-emerald-400", label: "إيجابي", bg: "bg-emerald-500/10" };
    case "negative": return { icon: TrendingDown, color: "text-red-400", label: "سلبي", bg: "bg-red-500/10" };
    default: return { icon: Minus, color: "text-muted-foreground", label: "محايد", bg: "bg-gray-500/10" };
  }
}

export function ContactPanel({ contact, onClose }: ContactPanelProps) {
  const [notes, setNotes] = useState(contact.notes || "");
  const [saving, setSaving] = useState(false);
  const sentimentInfo = getSentimentInfo(contact.sentiment);
  const SentimentIcon = sentimentInfo.icon;

  const saveNotes = async () => {
    setSaving(true);
    try {
      await authFetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        body: JSON.stringify({ notes }),
      });
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-[300px] border-r border-border bg-card flex flex-col shrink-0">
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <h3 className="text-sm font-medium text-foreground">معلومات العميل</h3>
        <Button size="icon" variant="ghost" onClick={onClose} data-testid="button-close-panel" className="text-muted-foreground">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xl font-bold text-foreground mb-3">
            {contact.name?.[0] || "؟"}
          </div>
          <h4 className="text-base font-medium text-foreground">{contact.name || "بدون اسم"}</h4>
          <div className="flex items-center justify-center gap-1.5 mt-1 text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span className="text-xs" dir="ltr">{contact.phone}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">المشاعر</span>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${sentimentInfo.bg} ${sentimentInfo.color}`}>
              <SentimentIcon className="w-3 h-3" />
              {sentimentInfo.label}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">عدد المحادثات</span>
            <span className="text-xs text-foreground">{contact.totalConversations || 0}</span>
          </div>
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Tag className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">العلامات</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px] bg-muted/40 text-foreground/80">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <StickyNote className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">ملاحظات داخلية</span>
          </div>
          <Textarea
            data-testid="input-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="أضف ملاحظات عن العميل..."
            className="bg-background border-border text-foreground placeholder:text-muted-foreground text-xs resize-none min-h-[100px]"
          />
          <Button
            size="sm"
            data-testid="button-save-notes"
            onClick={saveNotes}
            disabled={saving}
            className="mt-2 w-full bg-emerald-600 text-xs"
          >
            {saving ? "جاري الحفظ..." : "حفظ الملاحظات"}
          </Button>
        </div>
      </div>
    </div>
  );
}
