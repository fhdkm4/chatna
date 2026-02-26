import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatnaLogo } from "@/components/chatna-logo";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { SiWhatsapp } from "react-icons/si";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function AcceptInvitation() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const token = new URLSearchParams(search).get("token") || "";
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [invitation, setInvitation] = useState<any>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) {
      setError("رابط الدعوة غير صالح");
      setChecking(false);
      return;
    }
    fetch(`/api/auth/invitation-info?token=${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.email) {
          setInvitation(data);
        } else {
          setError(data.message || "الدعوة غير صالحة أو منتهية الصلاحية");
        }
      })
      .catch(() => setError("حدث خطأ في التحقق من الدعوة"))
      .finally(() => setChecking(false));
  }, [token]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name || form.name.trim().length < 2) errs.name = "الاسم يجب أن يكون حرفين على الأقل";
    if (!form.password || form.password.length < 6) errs.password = "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    if (form.password !== form.confirmPassword) errs.confirmPassword = "كلمتا المرور غير متطابقتين";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: form.name, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "حدث خطأ");

      setAuth(data.user, data.token);
      toast({ title: "تم قبول الدعوة", description: "مرحباً بك في الفريق!" });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const roleLabels: Record<string, string> = { admin: "مدير", manager: "مشرف", agent: "موظف" };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] relative overflow-hidden" dir="rtl">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: "rgba(110,192,71,0.05)" }} />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl" style={{ backgroundColor: "rgba(110,192,71,0.05)" }} />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center mb-4">
            <ChatnaLogo height={36} />
          </div>
          <p className="text-gray-400 text-sm">قبول دعوة الانضمام للفريق</p>
        </div>

        <div className="bg-[#111827]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-8">
          {checking ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#6EC047" }} />
              <p className="text-gray-400 text-sm">جاري التحقق من الدعوة...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-400 text-sm">{error}</p>
              <Button variant="outline" onClick={() => setLocation("/login")} className="mt-4 border-white/10 text-gray-300">
                العودة لتسجيل الدخول
              </Button>
            </div>
          ) : invitation ? (
            <>
              <div className="mb-6 p-4 rounded-lg border" style={{ backgroundColor: "rgba(110,192,71,0.05)", borderColor: "rgba(110,192,71,0.1)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5" style={{ color: "#6EC047" }} />
                  <span className="font-medium text-sm" style={{ color: "#6EC047" }}>دعوة صالحة</span>
                </div>
                <p className="text-gray-400 text-xs">
                  تمت دعوتك للانضمام كـ <span className="text-white font-medium">{roleLabels[invitation.role] || invitation.role}</span>
                </p>
                <p className="text-gray-500 text-xs mt-1" dir="ltr">{invitation.email}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">الاسم الكامل</Label>
                  <Input
                    data-testid="input-invite-name"
                    value={form.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors((p) => ({ ...p, name: "" })); }}
                    placeholder="مثال: أحمد محمد"
                    className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 ${errors.name ? "border-red-500/50" : ""}`}
                  />
                  {errors.name && <p className="text-red-400 text-xs">{errors.name}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">كلمة المرور <span className="text-gray-500">(6 أحرف على الأقل)</span></Label>
                  <Input
                    data-testid="input-invite-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => { setForm({ ...form, password: e.target.value }); setErrors((p) => ({ ...p, password: "" })); }}
                    placeholder="••••••••"
                    dir="ltr"
                    className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 text-left ${errors.password ? "border-red-500/50" : ""}`}
                  />
                  {errors.password && <p className="text-red-400 text-xs">{errors.password}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">تأكيد كلمة المرور</Label>
                  <Input
                    data-testid="input-invite-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); setErrors((p) => ({ ...p, confirmPassword: "" })); }}
                    placeholder="••••••••"
                    dir="ltr"
                    className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 text-left ${errors.confirmPassword ? "border-red-500/50" : ""}`}
                  />
                  {errors.confirmPassword && <p className="text-red-400 text-xs">{errors.confirmPassword}</p>}
                </div>
                <Button type="submit" disabled={loading} data-testid="button-accept-invitation" className="w-full text-white font-medium py-2.5 mt-2" style={{ backgroundColor: "#6EC047" }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "قبول الدعوة والانضمام"}
                </Button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
