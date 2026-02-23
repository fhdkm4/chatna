import { useState, useEffect, useCallback } from "react";
import {
  Plus, Megaphone, Send, Calendar, Users, Loader2, Trash2,
  Sparkles, Image as ImageIcon, Type, Eye, ArrowLeft, ArrowRight,
  CheckCircle, Clock, XCircle, Target, Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import type { Campaign, Contact } from "@shared/schema";

type WizardStep = "info" | "content" | "audience" | "review";

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>("info");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingText, setGeneratingText] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savingSend, setSavingSend] = useState(false);
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    description: "",
    imageUrl: "",
    messageText: "",
    ctaType: "none",
    ctaValue: "",
    targetType: "all",
    targetTags: [] as string[],
    targetContactIds: [] as string[],
    imagePrompt: "",
    textTone: "احترافية",
  });

  const fetchCampaigns = useCallback(async () => {
    try {
      const res = await authFetch("/api/campaigns");
      if (res.ok) setCampaigns(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await authFetch("/api/contacts");
      if (res.ok) setContacts(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchCampaigns(); fetchContacts(); }, [fetchCampaigns, fetchContacts]);

  const openWizard = () => {
    setForm({
      title: "", description: "", imageUrl: "", messageText: "",
      ctaType: "none", ctaValue: "", targetType: "all",
      targetTags: [], targetContactIds: [], imagePrompt: "", textTone: "احترافية",
    });
    setWizardStep("info");
    setShowWizard(true);
  };

  const generateImage = async () => {
    if (!form.imagePrompt) return;
    setGeneratingImage(true);
    try {
      const res = await authFetch("/api/campaigns/generate-image", {
        method: "POST",
        body: JSON.stringify({ prompt: form.imagePrompt }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm(f => ({ ...f, imageUrl: data.imageUrl }));
        toast({ title: "تم إنشاء الصورة بنجاح" });
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) { toast({ title: "خطأ في إنشاء الصورة", variant: "destructive" }); }
    finally { setGeneratingImage(false); }
  };

  const generateText = async () => {
    if (!form.description) return;
    setGeneratingText(true);
    try {
      const res = await authFetch("/api/campaigns/generate-text", {
        method: "POST",
        body: JSON.stringify({ description: form.description, tone: form.textTone }),
      });
      if (res.ok) {
        const data = await res.json();
        setForm(f => ({ ...f, messageText: data.text }));
        toast({ title: "تم إنشاء النص بنجاح" });
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) { toast({ title: "خطأ في إنشاء النص", variant: "destructive" }); }
    finally { setGeneratingText(false); }
  };

  const buildPayload = () => ({
    title: form.title,
    description: form.description || "",
    imageUrl: form.imageUrl || "",
    messageText: form.messageText || "",
    ctaType: form.ctaType,
    ctaValue: form.ctaValue || "",
    targetType: form.targetType,
    targetTags: form.targetTags,
    targetContactIds: form.targetContactIds,
    status: "draft",
  });

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      if (res.ok) {
        toast({ title: "تم حفظ الحملة كمسودة" });
        setShowWizard(false);
        fetchCampaigns();
      } else {
        const err = await res.json().catch(() => ({ message: "خطأ في الخادم" }));
        toast({ title: "خطأ في حفظ الحملة", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      console.error("Save draft error:", err);
      toast({ title: "خطأ في حفظ الحملة", description: "تحقق من اتصال الإنترنت وحاول مرة أخرى", variant: "destructive" });
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSendNow = async () => {
    setSavingSend(true);
    try {
      const res = await authFetch("/api/campaigns", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      if (res.ok) {
        const campaign = await res.json();
        setSending(campaign.id);
        const sendRes = await authFetch(`/api/campaigns/${campaign.id}/send`, { method: "POST" });
        if (sendRes.ok) {
          const result = await sendRes.json();
          toast({ title: "تم إرسال الحملة", description: `تم الإرسال إلى ${result.deliveredCount} من ${result.totalRecipients} جهة اتصال` });
        } else {
          const err = await sendRes.json().catch(() => ({ message: "خطأ غير معروف" }));
          toast({ title: "خطأ في الإرسال", description: err.message, variant: "destructive" });
        }
        setSending(null);
        setShowWizard(false);
        fetchCampaigns();
      } else {
        const err = await res.json().catch(() => ({ message: "خطأ في الخادم" }));
        toast({ title: "خطأ في حفظ الحملة", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      console.error("Send campaign error:", err);
      toast({ title: "خطأ في إرسال الحملة", description: "تحقق من اتصال الإنترنت وحاول مرة أخرى", variant: "destructive" });
      setSending(null);
    } finally {
      setSavingSend(false);
    }
  };

  const sendCampaign = async (id: string) => {
    setSending(id);
    try {
      const res = await authFetch(`/api/campaigns/${id}/send`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        toast({ title: "تم إرسال الحملة", description: `تم الإرسال إلى ${result.deliveredCount} من ${result.totalRecipients}` });
        fetchCampaigns();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) { toast({ title: "خطأ في الإرسال", variant: "destructive" }); }
    finally { setSending(null); }
  };

  const deleteCampaign = async (id: string) => {
    try {
      const res = await authFetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم حذف الحملة" });
        fetchCampaigns();
      }
    } catch (err) { toast({ title: "خطأ في الحذف", variant: "destructive" }); }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "sent": return <Badge className="bg-emerald-500/20 text-emerald-400 border-0"><CheckCircle className="w-3 h-3 ml-1" />تم الإرسال</Badge>;
      case "scheduled": return <Badge className="bg-blue-500/20 text-blue-400 border-0"><Clock className="w-3 h-3 ml-1" />مجدولة</Badge>;
      case "failed": return <Badge className="bg-red-500/20 text-red-400 border-0"><XCircle className="w-3 h-3 ml-1" />فشل</Badge>;
      default: return <Badge className="bg-gray-500/20 text-gray-400 border-0">مسودة</Badge>;
    }
  };

  const getTargetLabel = (campaign: Campaign) => {
    if (campaign.targetType === "all") return "جميع جهات الاتصال";
    if (campaign.targetType === "tags") return `حسب العلامات (${campaign.targetTags?.length || 0})`;
    if (campaign.targetType === "specific") return `${campaign.targetContactIds?.length || 0} جهة اتصال`;
    return "غير محدد";
  };

  const wizardSteps: { id: WizardStep; label: string; icon: typeof Megaphone }[] = [
    { id: "info", label: "معلومات الحملة", icon: Megaphone },
    { id: "content", label: "المحتوى", icon: Type },
    { id: "audience", label: "الجمهور", icon: Target },
    { id: "review", label: "مراجعة وإرسال", icon: Eye },
  ];

  const currentStepIndex = wizardSteps.findIndex(s => s.id === wizardStep);

  const canProceed = () => {
    switch (wizardStep) {
      case "info": return form.title.length > 0;
      case "content": return form.messageText.length > 0;
      case "audience": return true;
      case "review": return true;
    }
  };

  const uniqueTags = Array.from(new Set(contacts.flatMap(c => (c as any).tags || [])));

  const renderWizardContent = () => {
    switch (wizardStep) {
      case "info":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300 mb-1.5 block">عنوان الحملة *</Label>
              <Input
                data-testid="input-campaign-title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="مثال: عرض نهاية الأسبوع"
                className="bg-[#1a2235] border-white/10 text-white"
              />
            </div>
            <div>
              <Label className="text-gray-300 mb-1.5 block">وصف الحملة</Label>
              <Textarea
                data-testid="input-campaign-description"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="وصف مختصر عن الحملة والعرض..."
                className="bg-[#1a2235] border-white/10 text-white min-h-[100px]"
              />
            </div>
          </div>
        );

      case "content":
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#0d1321] border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <Wand2 className="w-4 h-4 text-emerald-400" />
                <Label className="text-gray-300">إنشاء نص بالذكاء الاصطناعي</Label>
              </div>
              <div className="flex gap-2 mb-2">
                <Select value={form.textTone} onValueChange={v => setForm(f => ({ ...f, textTone: v }))}>
                  <SelectTrigger className="bg-[#1a2235] border-white/10 text-white w-40" data-testid="select-text-tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2235] border-white/10">
                    <SelectItem value="احترافية">احترافية</SelectItem>
                    <SelectItem value="ودية">ودية</SelectItem>
                    <SelectItem value="حماسية">حماسية</SelectItem>
                    <SelectItem value="رسمية">رسمية</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  data-testid="button-generate-text"
                  onClick={generateText}
                  disabled={generatingText || !form.description}
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {generatingText ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Sparkles className="w-4 h-4 ml-1" />}
                  إنشاء نص
                </Button>
              </div>
              {!form.description && <p className="text-xs text-gray-500">أضف وصفاً للحملة أولاً في الخطوة السابقة</p>}
            </div>

            <div>
              <Label className="text-gray-300 mb-1.5 block">نص الرسالة *</Label>
              <Textarea
                data-testid="input-campaign-message"
                value={form.messageText}
                onChange={e => setForm(f => ({ ...f, messageText: e.target.value }))}
                placeholder="اكتب نص الرسالة هنا أو استخدم الذكاء الاصطناعي..."
                className="bg-[#1a2235] border-white/10 text-white min-h-[120px]"
              />
            </div>

            <div className="p-4 rounded-lg bg-[#0d1321] border border-white/5">
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                <Label className="text-gray-300">صورة الحملة (اختياري)</Label>
              </div>
              <div className="flex gap-2 mb-2">
                <Input
                  data-testid="input-image-prompt"
                  value={form.imagePrompt}
                  onChange={e => setForm(f => ({ ...f, imagePrompt: e.target.value }))}
                  placeholder="وصف الصورة المراد إنشاءها..."
                  className="bg-[#1a2235] border-white/10 text-white flex-1"
                />
                <Button
                  data-testid="button-generate-image"
                  onClick={generateImage}
                  disabled={generatingImage || !form.imagePrompt}
                  variant="outline"
                  className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                >
                  {generatingImage ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <ImageIcon className="w-4 h-4 ml-1" />}
                  إنشاء
                </Button>
              </div>
              {form.imageUrl && (
                <div className="mt-3">
                  <img src={form.imageUrl} alt="Campaign" className="w-full max-w-xs rounded-lg border border-white/10" data-testid="img-campaign-preview" />
                </div>
              )}
            </div>

            <div>
              <Label className="text-gray-300 mb-1.5 block">رابط CTA (اختياري)</Label>
              <div className="flex gap-2">
                <Select value={form.ctaType} onValueChange={v => setForm(f => ({ ...f, ctaType: v }))}>
                  <SelectTrigger className="bg-[#1a2235] border-white/10 text-white w-36" data-testid="select-cta-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1a2235] border-white/10">
                    <SelectItem value="none">بدون</SelectItem>
                    <SelectItem value="link">رابط</SelectItem>
                    <SelectItem value="phone">هاتف</SelectItem>
                  </SelectContent>
                </Select>
                {form.ctaType !== "none" && (
                  <Input
                    data-testid="input-cta-value"
                    value={form.ctaValue}
                    onChange={e => setForm(f => ({ ...f, ctaValue: e.target.value }))}
                    placeholder={form.ctaType === "link" ? "https://..." : "+966..."}
                    className="bg-[#1a2235] border-white/10 text-white flex-1"
                  />
                )}
              </div>
            </div>
          </div>
        );

      case "audience":
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-gray-300 mb-3 block">استهداف الجمهور</Label>
              <div className="space-y-2">
                {[
                  { value: "all", label: "جميع جهات الاتصال", desc: `${contacts.length} جهة اتصال` },
                  { value: "tags", label: "حسب العلامات", desc: "اختر علامات محددة" },
                  { value: "specific", label: "جهات اتصال محددة", desc: "اختر يدوياً" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    data-testid={`button-target-${opt.value}`}
                    onClick={() => setForm(f => ({ ...f, targetType: opt.value, targetTags: [], targetContactIds: [] }))}
                    className={`w-full p-3 rounded-lg border text-right transition-all ${
                      form.targetType === opt.value
                        ? "border-emerald-500/50 bg-emerald-500/10"
                        : "border-white/10 bg-[#1a2235] hover:border-white/20"
                    }`}
                  >
                    <div className="font-medium text-white text-sm">{opt.label}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {form.targetType === "tags" && uniqueTags.length > 0 && (
              <div>
                <Label className="text-gray-300 mb-2 block">اختر العلامات</Label>
                <div className="flex flex-wrap gap-2">
                  {uniqueTags.map(tag => (
                    <button
                      key={tag}
                      data-testid={`button-tag-${tag}`}
                      onClick={() => setForm(f => ({
                        ...f,
                        targetTags: f.targetTags.includes(tag)
                          ? f.targetTags.filter(t => t !== tag)
                          : [...f.targetTags, tag]
                      }))}
                      className={`px-3 py-1 rounded-full text-sm transition-all ${
                        form.targetTags.includes(tag)
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/50"
                          : "bg-[#1a2235] text-gray-400 border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.targetType === "specific" && (
              <div>
                <Label className="text-gray-300 mb-2 block">اختر جهات الاتصال</Label>
                <ScrollArea className="h-48 rounded-lg border border-white/10 bg-[#1a2235]">
                  <div className="p-2 space-y-1">
                    {contacts.map(contact => (
                      <button
                        key={contact.id}
                        data-testid={`button-contact-${contact.id}`}
                        onClick={() => setForm(f => ({
                          ...f,
                          targetContactIds: f.targetContactIds.includes(contact.id)
                            ? f.targetContactIds.filter(id => id !== contact.id)
                            : [...f.targetContactIds, contact.id]
                        }))}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-right transition-all ${
                          form.targetContactIds.includes(contact.id)
                            ? "bg-emerald-500/10 border border-emerald-500/30"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                          {(contact.name || contact.phone).charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-white truncate">{contact.name || contact.phone}</div>
                          <div className="text-xs text-gray-500">{contact.phone}</div>
                        </div>
                        {form.targetContactIds.includes(contact.id) && (
                          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
                <p className="text-xs text-gray-500 mt-1">تم اختيار {form.targetContactIds.length} جهة اتصال</p>
              </div>
            )}
          </div>
        );

      case "review":
        return (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#0d1321] border border-white/5">
              <h4 className="text-sm font-medium text-gray-300 mb-2">ملخص الحملة</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">العنوان:</span>
                  <span className="text-white" data-testid="review-title">{form.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">الجمهور:</span>
                  <span className="text-white">
                    {form.targetType === "all" ? `جميع جهات الاتصال (${contacts.length})` :
                     form.targetType === "tags" ? `حسب العلامات (${form.targetTags.length} علامة)` :
                     `${form.targetContactIds.length} جهة اتصال`}
                  </span>
                </div>
                {form.ctaType !== "none" && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">CTA:</span>
                    <span className="text-white">{form.ctaValue}</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label className="text-gray-300 mb-1.5 block text-sm">نص الرسالة</Label>
              <div className="p-3 rounded-lg bg-[#1a2235] border border-white/10 text-sm text-gray-300 whitespace-pre-wrap" data-testid="review-message">
                {form.messageText || <span className="text-gray-500 italic">لم يتم إدخال نص</span>}
              </div>
            </div>

            {form.imageUrl && (
              <div>
                <Label className="text-gray-300 mb-1.5 block text-sm">صورة الحملة</Label>
                <img src={form.imageUrl} alt="Campaign" className="w-full max-w-xs rounded-lg border border-white/10" />
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">الحملات التسويقية</h2>
            <p className="text-xs text-gray-500">{campaigns.length} حملة</p>
          </div>
        </div>
        <Button data-testid="button-new-campaign" onClick={openWizard} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4 ml-1" /> حملة جديدة
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <h3 className="text-gray-400 font-medium mb-1">لا توجد حملات</h3>
              <p className="text-gray-500 text-sm mb-4">أنشئ حملتك التسويقية الأولى</p>
              <Button data-testid="button-create-first-campaign" onClick={openWizard} variant="outline" className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                <Plus className="w-4 h-4 ml-1" /> إنشاء حملة
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map(campaign => (
                <div
                  key={campaign.id}
                  data-testid={`card-campaign-${campaign.id}`}
                  className="p-4 rounded-xl bg-[#111827] border border-white/5 hover:border-white/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-medium text-white">{campaign.title}</h3>
                      {campaign.description && <p className="text-sm text-gray-400 mt-0.5 line-clamp-1">{campaign.description}</p>}
                    </div>
                    {getStatusBadge(campaign.status)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {getTargetLabel(campaign)}
                    </span>
                    {campaign.totalRecipients ? (
                      <span className="flex items-center gap-1">
                        <Send className="w-3 h-3" />
                        {campaign.deliveredCount}/{campaign.totalRecipients} تم الإرسال
                      </span>
                    ) : null}
                    {campaign.createdAt && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(campaign.createdAt).toLocaleDateString("ar-SA")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    {campaign.status === "draft" && (
                      <Button
                        data-testid={`button-send-campaign-${campaign.id}`}
                        size="sm"
                        onClick={() => sendCampaign(campaign.id)}
                        disabled={sending === campaign.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                      >
                        {sending === campaign.id ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Send className="w-3 h-3 ml-1" />}
                        إرسال الآن
                      </Button>
                    )}
                    <Button
                      data-testid={`button-delete-campaign-${campaign.id}`}
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteCampaign(campaign.id)}
                      className="text-gray-500 hover:text-red-400 hover:bg-red-400/10 text-xs"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={showWizard} onOpenChange={setShowWizard}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-400" /> إنشاء حملة جديدة
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-1 mb-4 shrink-0">
            {wizardSteps.map((step, i) => (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  data-testid={`button-wizard-step-${step.id}`}
                  onClick={() => {
                    if (i <= currentStepIndex) setWizardStep(step.id);
                  }}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all ${
                    wizardStep === step.id
                      ? "bg-emerald-500/20 text-emerald-400"
                      : i < currentStepIndex
                        ? "text-emerald-400/60"
                        : "text-gray-500"
                  }`}
                >
                  <step.icon className="w-3 h-3" />
                  <span className="hidden sm:inline">{step.label}</span>
                </button>
                {i < wizardSteps.length - 1 && (
                  <div className={`flex-1 h-px mx-1 ${i < currentStepIndex ? "bg-emerald-500/30" : "bg-white/10"}`} />
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1" style={{ maxHeight: "calc(85vh - 200px)" }}>
            {renderWizardContent()}
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/10 shrink-0">
            <Button
              data-testid="button-wizard-back"
              variant="ghost"
              onClick={() => {
                const prev = wizardSteps[currentStepIndex - 1];
                if (prev) setWizardStep(prev.id);
              }}
              disabled={currentStepIndex === 0}
              className="text-gray-400"
            >
              <ArrowRight className="w-4 h-4 ml-1" /> السابق
            </Button>
            <div className="flex gap-2">
              {wizardStep === "review" ? (
                <>
                  <Button
                    data-testid="button-save-draft"
                    variant="outline"
                    onClick={handleSaveDraft}
                    disabled={savingDraft || savingSend}
                    className="border-white/20 text-gray-300"
                  >
                    {savingDraft ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
                    حفظ كمسودة
                  </Button>
                  <Button
                    data-testid="button-send-now"
                    onClick={handleSendNow}
                    disabled={savingDraft || savingSend || !!sending}
                    className="bg-emerald-600 text-white"
                  >
                    {savingSend || sending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Send className="w-4 h-4 ml-1" />}
                    إرسال الآن
                  </Button>
                </>
              ) : (
                <Button
                  data-testid="button-wizard-next"
                  onClick={() => {
                    const next = wizardSteps[currentStepIndex + 1];
                    if (next) setWizardStep(next.id);
                  }}
                  disabled={!canProceed()}
                  className="bg-emerald-600 text-white"
                >
                  التالي <ArrowLeft className="w-4 h-4 mr-1" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
