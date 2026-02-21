import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { SiWhatsapp } from "react-icons/si";
import { Loader2 } from "lucide-react";

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
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const url = isLogin ? "/api/auth/login" : "/api/auth/register";
      const body = isLogin
        ? { email: form.email, password: form.password }
        : form;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "حدث خطأ");

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
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <SiWhatsapp className="w-7 h-7 text-emerald-400" />
            </div>
            <h1 className="text-3xl font-bold text-white">جواب</h1>
          </div>
          <p className="text-gray-400 text-sm">
            منصة خدمة العملاء الذكية عبر واتساب
          </p>
        </div>

        <div className="bg-[#111827]/80 backdrop-blur-xl border border-white/5 rounded-2xl p-8">
          <div className="flex gap-2 mb-6 bg-[#0a0f1a] rounded-lg p-1">
            <button
              type="button"
              onClick={() => setIsLogin(true)}
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
              onClick={() => setIsLogin(false)}
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

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">اسم الشركة</Label>
                  <Input
                    data-testid="input-company-name"
                    value={form.companyName}
                    onChange={(e) =>
                      setForm({ ...form, companyName: e.target.value })
                    }
                    placeholder="مثال: شركة التقنية"
                    className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300 text-sm">الاسم الكامل</Label>
                  <Input
                    data-testid="input-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: أحمد محمد"
                    className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">البريد الإلكتروني</Label>
              <Input
                data-testid="input-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
                dir="ltr"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 text-left"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">كلمة المرور</Label>
              <Input
                data-testid="input-password"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm({ ...form, password: e.target.value })
                }
                placeholder="••••••••"
                dir="ltr"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 focus:border-emerald-500/50 focus:ring-emerald-500/20 text-left"
              />
            </div>

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
        </div>

        <p className="text-center text-gray-500 text-xs mt-6">
          Jawab &copy; 2026 - جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
