import { useState, useEffect, useCallback } from "react";
import { BarChart3, MessageSquare, Clock, Bot, Users, Loader2, TrendingUp, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth";

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

export function StatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(7);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        authFetch("/api/conversations/stats/overview"),
        authFetch(`/api/conversations/analytics?days=${period}`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
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
  ];

  const maxCount = analytics?.dailyConversations?.length
    ? Math.max(...analytics.dailyConversations.map(d => Number(d.count)), 1)
    : 1;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">لوحة الإحصائيات</h2>
        </div>
        <div className="flex items-center gap-1">
          <Calendar className="w-4 h-4 text-gray-500 ml-2" />
          {[7, 30].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={period === d ? "default" : "ghost"}
              data-testid={`button-period-${d}`}
              onClick={() => { setLoading(true); setPeriod(d); }}
              className={`text-xs h-7 ${period === d ? "bg-emerald-600" : "text-gray-400"}`}
            >
              {d === 7 ? "٧ أيام" : "٣٠ يوم"}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mb-8">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              data-testid={`stat-card-${card.label}`}
              className={`bg-[#111827]/50 border ${card.border} rounded-xl p-5 transition-all hover:bg-[#111827]/80`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white mb-1">{card.value}</div>
              <div className="text-xs text-gray-400">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="max-w-4xl">
          <h3 className="text-sm font-semibold text-white mb-4">المحادثات اليومية</h3>
          <div className="bg-[#111827]/50 border border-white/5 rounded-xl p-5">
            {analytics?.dailyConversations && analytics.dailyConversations.length > 0 ? (
              <div className="flex items-end gap-1 h-40">
                {analytics.dailyConversations.map((day, i) => {
                  const height = (Number(day.count) / maxCount) * 100;
                  const dateStr = new Date(day.date).toLocaleDateString("ar-SA", { month: "short", day: "numeric" });
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1" data-testid={`chart-bar-${i}`}>
                      <span className="text-[9px] text-gray-400">{day.count}</span>
                      <div
                        className="w-full bg-emerald-500/30 rounded-t-sm min-h-[4px] transition-all"
                        style={{ height: `${Math.max(height, 4)}%` }}
                      />
                      <span className="text-[8px] text-gray-600 whitespace-nowrap">{dateStr}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
                لا توجد بيانات للفترة المحددة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
