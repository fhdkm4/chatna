import { useState, useEffect, useCallback } from "react";
import { DollarSign, Check, X, Clock, AlertTriangle, Loader2, ImageIcon, RefreshCw, TrendingUp, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface PendingPayment {
  id: string;
  tenant_id: string;
  conversation_id: string;
  customer_phone: string;
  image_url: string;
  amount: string;
  currency: string;
  vision_data: any;
  status: string;
  created_at: string;
  customer_name: string | null;
}

interface FinanceStats {
  totalSales: number;
  confirmedCount: number;
  pendingCount: number;
}

export function FinanceApproval() {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [paymentsRes, statsRes] = await Promise.all([
        authFetch("/api/finance/pending"),
        authFetch("/api/finance/stats"),
      ]);
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getSlaStatus = (dateStr: string): { label: string; color: string } => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin <= 10) return { label: "ضمن SLA", color: "bg-green-500/10 text-green-500 border-green-500/30" };
    if (diffMin <= 20) return { label: "قارب على التأخر", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" };
    return { label: "تجاوز SLA", color: "bg-red-500/10 text-red-500 border-red-500/30" };
  };

  const handleConfirm = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await authFetch(`/api/finance/${id}/confirm`, { method: "POST" });
      if (res.ok) {
        toast({ title: "تم تأكيد الدفعة بنجاح" });
        setPayments(prev => prev.filter(p => p.id !== id));
        fetchData();
      } else {
        toast({ title: "خطأ في تأكيد الدفعة", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await authFetch(`/api/finance/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason || "تم رفض الإيصال" }),
      });
      if (res.ok) {
        toast({ title: "تم رفض الدفعة" });
        setPayments(prev => prev.filter(p => p.id !== id));
        setRejectId(null);
        setRejectReason("");
        fetchData();
      } else {
        toast({ title: "خطأ في رفض الدفعة", variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ في الاتصال", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "الآن";
    if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `منذ ${diffHr} ساعة`;
    return d.toLocaleDateString("ar-SA");
  };

  const isOverdue = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - d.getTime()) > 20 * 60 * 1000;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-foreground" data-testid="text-finance-title">المالية والمدفوعات</h2>
          <p className="text-sm text-muted-foreground mt-1">مراجعة واعتماد إيصالات الدفع</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchData} data-testid="button-refresh-finance">
          <RefreshCw className="w-4 h-4 ml-2" />
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-total-sales">
                {stats ? `${stats.totalSales.toLocaleString("ar-SA")} ر.س` : "---"}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عمليات مؤكدة</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-confirmed-count">
                {stats?.confirmedCount ?? 0}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">بانتظار المراجعة</p>
              <p className="text-lg font-bold text-foreground" data-testid="text-pending-count">
                {stats?.pendingCount ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {payments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mb-4 opacity-40" />
          <p className="text-lg font-medium">لا توجد مدفوعات معلقة</p>
          <p className="text-sm mt-1">ستظهر الإيصالات الجديدة هنا تلقائياً</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            إيصالات بانتظار المراجعة ({payments.length})
          </h3>
          {payments.map((payment) => (
            <div
              key={payment.id}
              data-testid={`card-payment-${payment.id}`}
              className={`bg-card border rounded-xl p-4 ${
                isOverdue(payment.created_at) ? "border-red-500/50 bg-red-500/5" : "border-border"
              }`}
            >
              <div className="flex items-start gap-4">
                <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                  {payment.image_url ? (
                    <img
                      src={payment.image_url}
                      alt="إيصال"
                      className="w-full h-full object-cover rounded-lg"
                      data-testid={`img-receipt-${payment.id}`}
                    />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-muted-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground" data-testid={`text-customer-${payment.id}`}>
                      {payment.customer_name || payment.customer_phone || "عميل"}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${getSlaStatus(payment.created_at).color}`} data-testid={`badge-sla-${payment.id}`}>
                      {getSlaStatus(payment.created_at).label}
                    </span>
                    {payment.vision_data?.confidence && (
                      <span className="text-[10px] text-muted-foreground">
                        الثقة: {Math.round(payment.vision_data.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground mb-2">
                    <span className="flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" />
                      <span data-testid={`text-amount-${payment.id}`}>
                        {payment.amount ? `${parseFloat(payment.amount).toLocaleString("ar-SA")} ${payment.currency || "SAR"}` : "غير محدد"}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(payment.created_at)}
                    </span>
                  </div>

                  {payment.vision_data && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 mb-2">
                      {payment.vision_data.bankName && <span className="ml-3">البنك: {payment.vision_data.bankName}</span>}
                      {payment.vision_data.transactionId && <span className="ml-3">المرجع: {payment.vision_data.transactionId}</span>}
                      {payment.vision_data.date && <span>التاريخ: {payment.vision_data.date}</span>}
                    </div>
                  )}

                  {rejectId === payment.id ? (
                    <div className="flex gap-2 mt-2">
                      <input
                        type="text"
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="سبب الرفض (اختياري)"
                        className="flex-1 px-3 py-1.5 text-sm bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        data-testid={`input-reject-reason-${payment.id}`}
                      />
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleReject(payment.id)}
                        disabled={actionLoading === payment.id}
                        data-testid={`button-confirm-reject-${payment.id}`}
                      >
                        {actionLoading === payment.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "تأكيد الرفض"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setRejectId(null); setRejectReason(""); }}
                        data-testid={`button-cancel-reject-${payment.id}`}
                      >
                        إلغاء
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => handleConfirm(payment.id)}
                        disabled={actionLoading === payment.id}
                        className="bg-primary text-white hover:bg-primary/90"
                        data-testid={`button-confirm-${payment.id}`}
                      >
                        {actionLoading === payment.id ? (
                          <Loader2 className="w-3 h-3 animate-spin ml-1" />
                        ) : (
                          <Check className="w-3.5 h-3.5 ml-1" />
                        )}
                        تأكيد الحجز
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRejectId(payment.id)}
                        disabled={actionLoading === payment.id}
                        data-testid={`button-reject-${payment.id}`}
                      >
                        <X className="w-3.5 h-3.5 ml-1" />
                        رفض
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
