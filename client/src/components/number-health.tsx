import { useState, useEffect, useCallback } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle, Activity, Send, Eye, Loader2, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authFetch, useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface NumberHealth {
  blockRate: number;
  deliveryRate: number;
  readRate: number;
  dailySent: number;
  dailyLimit: number;
  qualityRating: string;
  riskLevel: "safe" | "warning" | "danger";
  warmupDaysRemaining: number;
  firstCampaignApproved: boolean;
}

export function NumberHealthDashboard() {
  const [health, setHealth] = useState<NumberHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingLimit, setEditingLimit] = useState(false);
  const [newLimit, setNewLimit] = useState("");
  const [approving, setApproving] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await authFetch("/api/number-health");
      if (res.ok) setHealth(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  const updateDailyLimit = async () => {
    const limit = parseInt(newLimit);
    if (!limit || limit < 1) return;
    try {
      const res = await authFetch("/api/tenant/daily-limit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailySendLimit: limit }),
      });
      if (res.ok) {
        toast({ title: "تم تحديث الحد اليومي بنجاح" });
        setEditingLimit(false);
        fetchHealth();
      }
    } catch (err) {
      toast({ title: "خطأ في تحديث الحد", variant: "destructive" });
    }
  };

  const approveCampaigns = async () => {
    setApproving(true);
    try {
      const res = await authFetch("/api/tenant/approve-first-campaign", {
        method: "POST",
      });
      if (res.ok) {
        toast({ title: "تمت الموافقة على إرسال الحملات" });
        fetchHealth();
      }
    } catch (err) {
      toast({ title: "خطأ في الموافقة", variant: "destructive" });
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8" data-testid="number-health-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!health) return null;

  const riskConfig = {
    safe: { color: "bg-green-500/10 text-green-500 border-green-500/30", icon: CheckCircle, label: "آمن" },
    warning: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30", icon: AlertTriangle, label: "تحذير" },
    danger: { color: "bg-red-500/10 text-red-500 border-red-500/30", icon: XCircle, label: "خطر" },
  };

  const risk = riskConfig[health.riskLevel];
  const RiskIcon = risk.icon;
  const dailyPercent = health.dailyLimit > 0 ? Math.round((health.dailySent / health.dailyLimit) * 100) : 0;

  return (
    <div className="space-y-4" data-testid="number-health-dashboard">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">صحة الرقم والامتثال</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border ${risk.color}`} data-testid="card-risk-level">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RiskIcon className="h-4 w-4" />
              مستوى الخطر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{risk.label}</div>
            <p className="text-xs text-muted-foreground mt-1">
              تقييم الجودة: {health.qualityRating === "unknown" ? "غير محدد" : health.qualityRating}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-block-rate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400" />
              نسبة الحظر
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${health.blockRate > 3 ? "text-red-500" : health.blockRate > 1 ? "text-yellow-500" : "text-green-500"}`}>
              {health.blockRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {health.blockRate > 3 ? "مرتفعة — يجب التوقف فوراً" : health.blockRate > 1 ? "تحتاج مراقبة" : "ممتازة"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-delivery-rate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Send className="h-4 w-4 text-blue-400" />
              نسبة التوصيل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-400">{health.deliveryRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">معدل وصول الرسائل</p>
          </CardContent>
        </Card>

        <Card data-testid="card-read-rate">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Eye className="h-4 w-4 text-purple-400" />
              نسبة التفاعل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">{health.readRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">معدل قراءة الرسائل</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-daily-limit">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              الإرسال اليومي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{health.dailySent}</span>
              <span className="text-muted-foreground">/ {health.dailyLimit}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div
                className={`h-2 rounded-full transition-all ${dailyPercent > 90 ? "bg-red-500" : dailyPercent > 70 ? "bg-yellow-500" : "bg-primary"}`}
                style={{ width: `${Math.min(dailyPercent, 100)}%` }}
              />
            </div>
            {health.warmupDaysRemaining > 0 && (
              <Badge variant="outline" className="mt-2 text-yellow-500 border-yellow-500/30">
                فترة تسخين: {health.warmupDaysRemaining} يوم متبقي
              </Badge>
            )}
            {user?.role === "admin" && (
              <div className="mt-3">
                {editingLimit ? (
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={newLimit}
                      onChange={(e) => setNewLimit(e.target.value)}
                      placeholder="الحد الجديد"
                      className="h-8 w-24"
                      data-testid="input-daily-limit"
                    />
                    <Button size="sm" variant="outline" onClick={updateDailyLimit} data-testid="button-save-limit">
                      حفظ
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingLimit(false)} data-testid="button-cancel-limit">
                      إلغاء
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => { setEditingLimit(true); setNewLimit(String(health.dailyLimit)); }} data-testid="button-edit-limit">
                    <Settings className="h-3 w-3 ml-1" />
                    تعديل الحد
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-campaign-approval">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4" />
              حالة الموافقة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {health.firstCampaignApproved ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-green-500 font-medium">معتمد للإرسال</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <span className="text-yellow-500 font-medium">يحتاج موافقة إدارية</span>
                </div>
                {user?.role === "admin" && (
                  <Button
                    size="sm"
                    onClick={approveCampaigns}
                    disabled={approving}
                    data-testid="button-approve-campaigns"
                  >
                    {approving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
                    الموافقة على الحملات
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {health.riskLevel === "danger" && (
        <Card className="border-red-500/30 bg-red-500/5" data-testid="card-danger-alert">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-500">تنبيه: خطر تقييد الرقم</p>
                <p className="text-sm text-muted-foreground mt-1">
                  نسبة الحظر مرتفعة. يُنصح بإيقاف جميع الحملات فوراً ومراجعة قوائم الاتصال والتأكد من جودة المحتوى المُرسل. الاستمرار قد يؤدي لتقييد الرقم بشكل دائم.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
