import { useState, useEffect, useCallback } from "react";
import { Plus, Brain, Pencil, Trash2, BookOpen, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { AiKnowledge } from "@shared/schema";

export function KnowledgeBase() {
  const [entries, setEntries] = useState<AiKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<AiKnowledge | null>(null);
  const [form, setForm] = useState({ title: "", content: "", category: "" });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchEntries = useCallback(async () => {
    try {
      const res = await authFetch("/api/ai/knowledge");
      if (res.ok) {
        setEntries(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", content: "", category: "" });
    setShowDialog(true);
  };

  const openEdit = (entry: AiKnowledge) => {
    setEditing(entry);
    setForm({ title: entry.title || "", content: entry.content, category: entry.category || "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/ai/knowledge/${editing.id}` : "/api/ai/knowledge";
      const method = editing ? "PATCH" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(form) });
      if (res.ok) {
        toast({ title: editing ? "تم التحديث" : "تمت الإضافة", description: "تم حفظ المعلومة بنجاح" });
        setShowDialog(false);
        fetchEntries();
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في الحفظ", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await authFetch(`/api/ai/knowledge/${id}`, { method: "DELETE" });
      toast({ title: "تم الحذف", description: "تم حذف المعلومة بنجاح" });
      fetchEntries();
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في الحذف", variant: "destructive" });
    }
  };

  const categories = Array.from(new Set(entries.map(e => e.category).filter(Boolean))) as string[];

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">قاعدة المعرفة</h2>
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-300">
            {entries.length} عنصر
          </Badge>
        </div>
        <Button size="sm" data-testid="button-add-knowledge" onClick={openCreate} className="bg-emerald-600 text-xs">
          <Plus className="w-3 h-3 ml-1" />
          إضافة معلومة
        </Button>
      </div>

      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <BookOpen className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">لا توجد معلومات في قاعدة المعرفة</p>
            <p className="text-xs mt-1">أضف معلومات لتحسين ردود المساعد الذكي</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {categories.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {categories.map((cat) => (
                  <Badge key={cat} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400">
                    {cat}
                  </Badge>
                ))}
              </div>
            )}
            {entries.map((entry) => (
              <div
                key={entry.id}
                data-testid={`knowledge-${entry.id}`}
                className="bg-[#111827]/50 border border-white/5 rounded-lg p-4 group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-white">{entry.title || "بدون عنوان"}</h4>
                      {entry.category && (
                        <Badge variant="outline" className="text-[9px] px-1.5 border-white/10 text-gray-400">
                          {entry.category}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-3 whitespace-pre-wrap">{entry.content}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(entry)} className="w-7 h-7 text-gray-400">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(entry.id)} className="w-7 h-7 text-gray-400 hover:text-red-400">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? "تعديل المعلومة" : "إضافة معلومة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">العنوان</Label>
              <Input
                data-testid="input-knowledge-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="عنوان المعلومة"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">التصنيف</Label>
              <Input
                data-testid="input-knowledge-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="مثال: الأسعار، المنتجات"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">المحتوى</Label>
              <Textarea
                data-testid="input-knowledge-content"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="اكتب المعلومات التي سيستخدمها المساعد الذكي..."
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 min-h-[150px]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400">
                إلغاء
              </Button>
              <Button data-testid="button-save-knowledge" onClick={handleSave} disabled={saving} className="bg-emerald-600">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
