import { useState, useEffect, useCallback } from "react";
import { Plus, Settings, Pencil, Trash2, Zap, X, Loader2, ToggleLeft, ToggleRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { AutoReply } from "@shared/schema";

export function AutoReplies() {
  const [replies, setReplies] = useState<AutoReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<AutoReply | null>(null);
  const [form, setForm] = useState({ triggerType: "keyword", triggerValue: "", response: "", priority: 0 });
  const [saving, setSaving] = useState(false);
  const [ratingEnabled, setRatingEnabled] = useState(true);
  const [ratingMessage, setRatingMessage] = useState("");
  const [ratingDelayMinutes, setRatingDelayMinutes] = useState(2);
  const [savingRating, setSavingRating] = useState(false);
  const { toast } = useToast();

  const fetchReplies = useCallback(async () => {
    try {
      const res = await authFetch("/api/ai/auto-replies");
      if (res.ok) setReplies(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await authFetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setRatingEnabled(data.ratingEnabled ?? true);
        setRatingMessage(data.ratingMessage || "");
        setRatingDelayMinutes(data.ratingDelayMinutes ?? 2);
      }
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchReplies(); fetchSettings(); }, [fetchReplies, fetchSettings]);

  const saveRatingSettings = async () => {
    setSavingRating(true);
    try {
      const res = await authFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ ratingEnabled, ratingMessage, ratingDelayMinutes }),
      });
      if (res.ok) {
        toast({ title: "تم حفظ إعدادات التقييم" });
      }
    } catch (err) {
      toast({ title: "خطأ في حفظ الإعدادات", variant: "destructive" });
    } finally { setSavingRating(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ triggerType: "keyword", triggerValue: "", response: "", priority: 0 });
    setShowDialog(true);
  };

  const openEdit = (reply: AutoReply) => {
    setEditing(reply);
    setForm({
      triggerType: reply.triggerType,
      triggerValue: reply.triggerValue,
      response: reply.response,
      priority: reply.priority || 0,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.triggerValue.trim() || !form.response.trim()) return;
    setSaving(true);
    try {
      const url = editing ? `/api/ai/auto-replies/${editing.id}` : "/api/ai/auto-replies";
      const method = editing ? "PATCH" : "POST";
      const res = await authFetch(url, { method, body: JSON.stringify(form) });
      if (res.ok) {
        toast({ title: editing ? "تم التحديث" : "تمت الإضافة" });
        setShowDialog(false);
        fetchReplies();
      }
    } catch (err) {
      toast({ title: "خطأ", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await authFetch(`/api/ai/auto-replies/${id}`, { method: "DELETE" });
      fetchReplies();
    } catch (err) { console.error(err); }
  };

  const toggleActive = async (reply: AutoReply) => {
    try {
      await authFetch(`/api/ai/auto-replies/${reply.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !reply.isActive }),
      });
      fetchReplies();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">الردود التلقائية</h2>
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-300">
            {replies.length}
          </Badge>
        </div>
        <Button size="sm" data-testid="button-add-auto-reply" onClick={openCreate} className="bg-emerald-600 text-xs">
          <Plus className="w-3 h-3 ml-1" />
          إضافة رد
        </Button>
      </div>

      <ScrollArea className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Zap className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">لا توجد ردود تلقائية</p>
            <p className="text-xs mt-1">أضف ردود تلقائية للرد على الكلمات المفتاحية</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {replies.map((reply) => (
              <div
                key={reply.id}
                data-testid={`auto-reply-${reply.id}`}
                className={`bg-[#111827]/50 border rounded-lg p-4 group transition-all ${
                  reply.isActive ? "border-emerald-500/20" : "border-white/5 opacity-60"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">
                        {reply.triggerType === "keyword" ? "كلمة مفتاحية" : reply.triggerType === "exact" ? "تطابق تام" : "نمط"}
                      </Badge>
                      <code className="text-xs text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded" dir="ltr">
                        {reply.triggerValue}
                      </code>
                    </div>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap">{reply.response}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleActive(reply)}
                      className="text-gray-400 hover:text-emerald-400 transition-colors"
                      data-testid={`toggle-reply-${reply.id}`}
                    >
                      {reply.isActive ? (
                        <ToggleRight className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-5 h-5" />
                      )}
                    </button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(reply)} className="w-7 h-7 text-gray-400 opacity-0 group-hover:opacity-100">
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(reply.id)} className="w-7 h-7 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100">
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="border-t border-white/5 px-6 py-6">
        <div className="flex items-center gap-2 mb-4">
          <Star className="w-5 h-5 text-amber-400" />
          <h3 className="text-sm font-semibold text-white">إعدادات تقييم العملاء</h3>
        </div>
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center justify-between bg-[#111827]/50 border border-white/5 rounded-lg p-4">
            <div>
              <p className="text-sm text-white font-medium">تفعيل التقييم التلقائي</p>
              <p className="text-xs text-gray-400 mt-0.5">إرسال طلب تقييم للعميل بعد إغلاق المحادثة</p>
            </div>
            <button
              onClick={() => setRatingEnabled(!ratingEnabled)}
              className="text-gray-400 hover:text-emerald-400 transition-colors"
              data-testid="toggle-rating-enabled"
            >
              {ratingEnabled ? (
                <ToggleRight className="w-7 h-7 text-emerald-400" />
              ) : (
                <ToggleLeft className="w-7 h-7" />
              )}
            </button>
          </div>

          {ratingEnabled && (
            <>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">مدة الانتظار قبل إرسال التقييم (بالدقائق)</Label>
                <Input
                  type="number"
                  min={0}
                  max={60}
                  value={ratingDelayMinutes}
                  onChange={(e) => setRatingDelayMinutes(parseInt(e.target.value) || 0)}
                  className="bg-[#0a0f1a] border-white/10 text-white w-32"
                  data-testid="input-rating-delay"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">رسالة طلب التقييم</Label>
                <Textarea
                  value={ratingMessage}
                  onChange={(e) => setRatingMessage(e.target.value)}
                  placeholder="شكراً لتواصلك معنا! كيف تقيّم الخدمة؟"
                  className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 min-h-[80px]"
                  data-testid="input-rating-message"
                />
              </div>
              <Button
                onClick={saveRatingSettings}
                disabled={savingRating}
                className="bg-emerald-600 text-xs"
                data-testid="button-save-rating-settings"
              >
                {savingRating ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ إعدادات التقييم"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">{editing ? "تعديل الرد" : "إضافة رد تلقائي"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">نوع المحفز</Label>
              <Select value={form.triggerType} onValueChange={(v) => setForm({ ...form, triggerType: v })}>
                <SelectTrigger className="bg-[#0a0f1a] border-white/10 text-white" data-testid="select-trigger-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111827] border-white/10 text-white">
                  <SelectItem value="keyword">كلمة مفتاحية</SelectItem>
                  <SelectItem value="exact">تطابق تام</SelectItem>
                  <SelectItem value="pattern">نمط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">قيمة المحفز</Label>
              <Input
                data-testid="input-trigger-value"
                value={form.triggerValue}
                onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                placeholder="مثال: السعر، المواعيد"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">الرد</Label>
              <Textarea
                data-testid="input-auto-response"
                value={form.response}
                onChange={(e) => setForm({ ...form, response: e.target.value })}
                placeholder="اكتب الرد التلقائي..."
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 min-h-[100px]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400">إلغاء</Button>
              <Button data-testid="button-save-auto-reply" onClick={handleSave} disabled={saving} className="bg-emerald-600">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
