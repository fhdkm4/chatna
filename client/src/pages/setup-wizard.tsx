import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatnaLogo } from "@/components/chatna-logo";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { SiWhatsapp } from "react-icons/si";
import { Check, ChevronLeft, ChevronRight, MessageSquare, Bot, Users, Loader2, ArrowLeft } from "lucide-react";

const steps = [
  { id: 1, title: "ربط واتساب", icon: MessageSquare, description: "ربط حسابك بـ WhatsApp Business API" },
  { id: 2, title: "إعداد الذكاء الاصطناعي", icon: Bot, description: "تخصيص مساعد الذكاء الاصطناعي" },
  { id: 3, title: "دعوة الفريق", icon: Users, description: "أضف أعضاء فريقك" },
];

export default function SetupWizard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("أنت مساعد خدمة عملاء محترف. قم بالرد على استفسارات العملاء بلطف واحترافية باللغة العربية.");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("agent");
  const [invitations, setInvitations] = useState<Array<{ email: string; role: string }>>([]);

  const handleSaveAi = async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/settings", { aiSystemPrompt: aiPrompt, aiEnabled: true });
      toast({ title: "تم حفظ إعدادات الذكاء الاصطناعي" });
      setCurrentStep(3);
    } catch {
      toast({ title: "خطأ", description: "فشل حفظ الإعدادات", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/invitations", { email: inviteEmail, role: inviteRole });
      setInvitations([...invitations, { email: inviteEmail, role: inviteRole }]);
      setInviteEmail("");
      toast({ title: "تم إرسال الدعوة" });
    } catch {
      toast({ title: "خطأ", description: "فشل إرسال الدعوة", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      await apiRequest("PATCH", "/api/settings", { setupCompleted: true });
      setLocation("/");
    } catch {
      setLocation("/");
    }
  };

  const roleLabels: Record<string, string> = { admin: "مدير", manager: "مشرف", agent: "موظف" };

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center mb-4">
            <ChatnaLogo height={64} />
          </div>
          <p className="text-gray-400 text-sm">أكمل الخطوات التالية لبدء استخدام منصتك</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-10">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors" style={
                currentStep === step.id ? { backgroundColor: "rgba(110,192,71,0.2)", color: "#6EC047" } :
                currentStep > step.id ? { backgroundColor: "rgba(110,192,71,0.1)", color: "#6EC047" } : { backgroundColor: "rgba(255,255,255,0.05)", color: "#6b7280" }
              }>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={
                  currentStep > step.id ? { backgroundColor: "#6EC047", color: "white" } :
                  currentStep === step.id ? { backgroundColor: "rgba(110,192,71,0.3)", color: "#6EC047" } : { backgroundColor: "rgba(255,255,255,0.1)", color: "#6b7280" }
                }>
                  {currentStep > step.id ? <Check className="w-4 h-4" /> : step.id}
                </div>
                <span className="text-sm font-medium hidden sm:inline">{step.title}</span>
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px bg-white/10 mx-1" />}
            </div>
          ))}
        </div>

        <div className="bg-[#111827]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-8">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <MessageSquare className="w-12 h-12 text-[#6EC047] mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-2">ربط WhatsApp Business API</h2>
                <p className="text-gray-400 text-sm">قم بربط حسابك في Meta لبدء استقبال رسائل واتساب</p>
              </div>

              <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-amber-400 text-sm mb-2 font-medium">ملاحظة هامة</p>
                <p className="text-gray-400 text-xs">ربط WhatsApp Business API يتطلب حساب Meta Business. يمكنك إتمام هذا الربط لاحقاً من صفحة الإعدادات.</p>
              </div>

              <Button
                data-testid="button-connect-meta"
                className="w-full bg-[#1877F2] text-white font-medium py-3"
                onClick={() => toast({ title: "قريباً", description: "ستتوفر هذه الميزة قريباً بعد إضافة بيانات Meta App" })}
              >
                <SiWhatsapp className="w-5 h-5 ml-2" />
                ربط حساب Meta Business
              </Button>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" className="text-gray-400" onClick={() => setCurrentStep(2)}>
                  تخطي هذه الخطوة
                  <ChevronLeft className="w-4 h-4 mr-1" />
                </Button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Bot className="w-12 h-12 text-[#6EC047] mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-2">إعداد الذكاء الاصطناعي</h2>
                <p className="text-gray-400 text-sm">خصص تعليمات مساعد الذكاء الاصطناعي</p>
              </div>

              <div className="space-y-3">
                <Label className="text-gray-300 text-sm">تعليمات المساعد (System Prompt)</Label>
                <Textarea
                  data-testid="input-ai-prompt"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  rows={5}
                  className="bg-[#0a0f1a] border-white/10 text-white resize-none"
                  placeholder="أدخل التعليمات التي سيتبعها مساعد الذكاء الاصطناعي عند الرد على العملاء..."
                />
                <p className="text-gray-500 text-xs">يمكنك تعديل هذه التعليمات لاحقاً من صفحة الإعدادات</p>
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" className="text-gray-400" onClick={() => setCurrentStep(1)}>
                  <ChevronRight className="w-4 h-4 ml-1" />
                  السابق
                </Button>
                <Button className="bg-[#6EC047] text-white" onClick={handleSaveAi} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ والمتابعة"}
                </Button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <Users className="w-12 h-12 text-[#6EC047] mx-auto mb-3" />
                <h2 className="text-xl font-semibold mb-2">دعوة أعضاء الفريق</h2>
                <p className="text-gray-400 text-sm">أرسل دعوات لأعضاء فريقك للانضمام</p>
              </div>

              <div className="flex gap-3">
                <Input
                  data-testid="input-wizard-invite-email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="البريد الإلكتروني"
                  dir="ltr"
                  className="flex-1 bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 text-left"
                />
                <select
                  data-testid="select-wizard-invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="bg-[#0a0f1a] border border-white/10 rounded-md px-3 text-white text-sm"
                >
                  <option value="agent">موظف</option>
                  <option value="manager">مشرف</option>
                </select>
                <Button data-testid="button-wizard-send-invite" className="bg-[#6EC047] text-white" onClick={handleInvite} disabled={loading || !inviteEmail}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "دعوة"}
                </Button>
              </div>

              {invitations.length > 0 && (
                <div className="space-y-2 mt-4">
                  <Label className="text-gray-400 text-xs">الدعوات المرسلة</Label>
                  {invitations.map((inv, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5">
                      <span className="text-sm text-gray-300" dir="ltr">{inv.email}</span>
                      <span className="text-xs px-2 py-1 rounded" style={{ color: "#6EC047", backgroundColor: "rgba(110,192,71,0.1)" }}>{roleLabels[inv.role]}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between mt-6">
                <Button variant="ghost" className="text-gray-400" onClick={() => setCurrentStep(2)}>
                  <ChevronRight className="w-4 h-4 ml-1" />
                  السابق
                </Button>
                <Button className="bg-[#6EC047] text-white" onClick={handleFinish} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنهاء الإعداد والبدء"}
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="text-center mt-6">
          <Button variant="ghost" className="text-gray-500 text-sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-4 h-4 ml-1" />
            تخطي الإعداد والذهاب للوحة التحكم
          </Button>
        </div>
      </div>
    </div>
  );
}
