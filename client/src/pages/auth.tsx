import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChatnaLogo } from "@/components/chatna-logo";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { SiWhatsapp, SiFacebook } from "react-icons/si";
import { Loader2, ShieldCheck, Tag } from "lucide-react";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { setAuth } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    companyName: "",
    discountCode: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!isLogin) {
      if (!form.companyName || form.companyName.trim().length < 2)
        errs.companyName = "اسم الشركة يجب أن يكون حرفين على الأقل";
      if (!form.name || form.name.trim().length < 2)
        errs.name = "الاسم يجب أن يكون حرفين على الأقل";
    }
    if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "يرجى إدخال بريد إلكتروني صحيح";
    if (!form.password || (!isLogin && form.password.length < 6))
      errs.password = isLogin ? "يرجى إدخال كلمة المرور" : "كلمة المرور يجب أن تكون 6 أحرف على الأقل";
    else if (isLogin && !form.password)
      errs.password = "يرجى إدخال كلمة المرور";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);
    try {
      const url = isLogin ? "/api/auth/login" : "/api/auth/register";
      const body = isLogin
        ? { email: form.email, password: form.password }
        : {
            email: form.email,
            password: form.password,
            name: form.name,
            companyName: form.companyName,
            discountCode: form.discountCode || undefined,
          };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          const fieldErrors: Record<string, string> = {};
          for (const err of data.errors) {
            const field = err.path?.[0];
            if (field) {
              const msgs: Record<string, string> = {
                companyName: "اسم الشركة يجب أن يكون حرفين على الأقل",
                name: "الاسم يجب أن يكون حرفين على الأقل",
                email: "يرجى إدخال بريد إلكتروني صحيح",
                password: "كلمة المرور يجب أن تكون 6 أحرف على الأقل",
              };
              fieldErrors[field] = msgs[field] || err.message;
            }
          }
          setErrors(fieldErrors);
          return;
        }
        throw new Error(data.message || "حدث خطأ");
      }

      setAuth(data.user, data.token);
      setLocation("/");
    } catch (err: any) {
      toast({
        title: "خطأ",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignup = () => {
    toast({
      title: "قريباً",
      description: "ربط حساب فيسبوك سيكون متاحاً قريباً. يرجى التسجيل بالبريد الإلكتروني حالياً.",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0f1a] relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/3 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <ChatnaLogo color="#00dc82" height={40} />
          </div>
          <p className="text-gray-400 text-sm">
            منصة خدمة العملاء الذكية عبر واتساب
          </p>
        </div>

        <div className="bg-[#111827]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-8">
          <div className="flex gap-2 mb-6 bg-[#0a0f1a] rounded-lg p-1">
            <button
              type="button"
              onClick={() => { setIsLogin(true); setErrors({}); }}
              data-testid="tab-login"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                isLogin
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400"
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              type="button"
              onClick={() => { setIsLogin(false); setErrors({}); }}
              data-testid="tab-register"
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                !isLogin
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-gray-400"
              }`}
            >
              حساب جديد
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleFacebookSignup}
            data-testid="button-facebook-signup"
            className="w-full mb-4 bg-[#1877F2]/10 border-[#1877F2]/30 text-[#1877F2] hover:bg-[#1877F2]/20 hover:text-[#1877F2] font-medium py-2.5"
          >
            <SiFacebook className="w-5 h-5 ml-2" />
            {isLogin ? "الدخول باستخدام فيسبوك" : "التسجيل باستخدام فيسبوك"}
          </Button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#111827] px-3 text-gray-500">أو</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">اسم الشركة</Label>
                  <Input
                    data-testid="input-company-name"
                    value={form.companyName}
                    onChange={(e) => {
                      setForm({ ...form, companyName: e.target.value });
                      setErrors((prev) => ({ ...prev, companyName: "" }));
                    }}
                    placeholder="مثال: شركة التقنية"
                    className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 ${errors.companyName ? "border-red-500/50" : ""}`}
                  />
                  {errors.companyName && <p className="text-red-400 text-xs" data-testid="error-company-name">{errors.companyName}</p>}
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">الاسم الكامل</Label>
                  <Input
                    data-testid="input-name"
                    value={form.name}
                    onChange={(e) => {
                      setForm({ ...form, name: e.target.value });
                      setErrors((prev) => ({ ...prev, name: "" }));
                    }}
                    placeholder="مثال: أحمد محمد"
                    className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 ${errors.name ? "border-red-500/50" : ""}`}
                  />
                  {errors.name && <p className="text-red-400 text-xs" data-testid="error-name">{errors.name}</p>}
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">البريد الإلكتروني</Label>
              <Input
                data-testid="input-email"
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value });
                  setErrors((prev) => ({ ...prev, email: "" }));
                }}
                placeholder="email@example.com"
                dir="ltr"
                className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 text-left ${errors.email ? "border-red-500/50" : ""}`}
              />
              {errors.email && <p className="text-red-400 text-xs" data-testid="error-email">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">كلمة المرور {!isLogin && <span className="text-gray-500">(6 أحرف على الأقل)</span>}</Label>
              <Input
                data-testid="input-password"
                type="password"
                value={form.password}
                onChange={(e) => {
                  setForm({ ...form, password: e.target.value });
                  setErrors((prev) => ({ ...prev, password: "" }));
                }}
                placeholder="••••••••"
                dir="ltr"
                className={`bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 text-left ${errors.password ? "border-red-500/50" : ""}`}
              />
              {errors.password && <p className="text-red-400 text-xs" data-testid="error-password">{errors.password}</p>}
            </div>

            {!isLogin && (
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  كود الخصم <span className="text-gray-500">(اختياري)</span>
                </Label>
                <Input
                  data-testid="input-discount-code"
                  value={form.discountCode}
                  onChange={(e) => setForm({ ...form, discountCode: e.target.value })}
                  placeholder="أدخل كود الخصم إن وجد"
                  dir="ltr"
                  className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 text-left"
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              data-testid="button-submit-auth"
              className="w-full bg-emerald-600 text-white font-medium py-2.5 mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isLogin ? (
                "تسجيل الدخول"
              ) : (
                "إنشاء حساب"
              )}
            </Button>
          </form>

          {!isLogin && (
            <div className="mt-5 flex items-start gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400 leading-relaxed" data-testid="text-whatsapp-api-notice">
                نحن نستخدم WhatsApp Business API الرسمي لضمان أمان رقمك وعدم تعرضه للحظر.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          Chatna &copy; 2026 - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
