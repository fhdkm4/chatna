import { useState, useEffect, useCallback } from "react";
import { BarChart3, MessageSquare, Clock, Bot, Users, Loader2, TrendingUp, Calendar, Download, DollarSign, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface Stats {
  active: number;
  waiting: number;
  resolved: number;
  total: number;
  aiResolutionRate: number;
  totalContacts: number;
}

interface Analytics {
  dailyConversations: { date: string; count: number }[];
  totalConversations: number;
  aiReplyRatio: number;
  avgResponseTime: number;
  period: number;
}

interface FinanceStats {
  totalSales: number;
  confirmedCount: number;
  pendingCount: number;
}

export function StatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [financeStats, setFinanceStats] = useState<FinanceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, analyticsRes, financeRes] = await Promise.all([
        authFetch("/api/conversations/stats/overview"),
        authFetch(`/api/conversations/analytics?days=${period}`),
        authFetch("/api/finance/stats"),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      if (financeRes.ok) setFinanceStats(await financeRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} ثانية`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
    return `${Math.round(seconds / 3600)} ساعة`;
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const summaryCards = [
    {
      label: "محادثات نشطة",
      value: stats?.active || 0,
      icon: MessageSquare,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "بانتظار الرد",
      value: stats?.waiting || 0,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      label: "محادثات مغلقة",
      value: stats?.resolved || 0,
      icon: BarChart3,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "نسبة رد AI",
      value: `${analytics?.aiReplyRatio || 0}%`,
      icon: Bot,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      label: "متوسط وقت الرد",
      value: formatTime(analytics?.avgResponseTime || 0),
      icon: TrendingUp,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      label: "إجمالي جهات الاتصال",
      value: stats?.totalContacts || 0,
      icon: Users,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "border-pink-500/20",
    },
    {
      label: "إجمالي المبيعات",
      value: financeStats ? `${financeStats.totalSales.toLocaleString("ar-SA")} ر.س` : "---",
      icon: DollarSign,
      color: "text-green-400",
      bg: "bg-green-500/10",
      border: "border-green-500/20",
    },
    {
      label: "عمليات ناجحة",
      value: financeStats?.confirmedCount || 0,
      icon: CheckCircle2,
      color: "text-teal-400",
      bg: "bg-teal-500/10",
      border: "border-teal-500/20",
    },
  ];

  const maxCount = analytics?.dailyConversations?.length
    ? Math.max(...analytics.dailyConversations.map(d => Number(d.count)), 1)
    : 1;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-card/80 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-foreground">لوحة الإحصائيات</h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            data-testid="button-export-csv"
            onClick={async () => {
              setExporting(true);
              try {
                const res = await authFetch("/api/export/contacts");
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "contacts_report.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "تم التصدير", description: "تم تنزيل تقرير جهات الاتصال" });
                }
              } catch (err) {
                toast({ title: "خطأ", description: "فشل في التصدير", variant: "destructive" });
              } finally {
                setExporting(false);
              }
            }}
            className="text-xs text-muted-foreground h-7 ml-2"
          >
            {exporting ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : <Download className="w-3 h-3 ml-1" />}
            تصدير CSV
          </Button>
          <Calendar className="w-4 h-4 text-muted-foreground ml-2" />
          {[7, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={period === d ? "default" : "ghost"}
              data-testid={`button-period-${d}`}
              onClick={() => { setLoading(true); setPeriod(d); }}
              className={`text-xs h-7 ${period === d ? "bg-emerald-600" : "text-muted-foreground"}`}
            >
              {d === 7 ? "٧ أيام" : "٣٠ يوم"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mb-8">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              data-testid={`stat-card-${card.label}`}
              className={`bg-card/60 border ${card.border} rounded-xl p-5 transition-all hover:bg-popover/80`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground mb-1">{card.value}</div>
              <div className="text-xs text-muted-foreground">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="max-w-4xl">
          <h3 className="text-sm font-semibold text-foreground mb-4">المحادثات اليومية</h3>
          <div className="bg-card/60 border border-border rounded-xl p-5">
            {analytics?.dailyConversations && analytics.dailyConversations.length > 0 ? (
              <div className="flex items-end gap-1 h-40">
                {analytics.dailyConversations.map((day, i) => {
                  const height = (Number(day.count) / maxCount) * 100;
                  const dateStr = new Date(day.date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" data-testid={`chart-bar-${i}`}>
                      <span className="text-[9px] text-muted-foreground">{day.count}</span>
                      <div
                        className="w-full bg-emerald-500/30 rounded-t-sm min-h-[4px] transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-[8px] text-muted-foreground whitespace-nowrap">{dateStr}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                لا توجد بيانات للفترة المحددة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
