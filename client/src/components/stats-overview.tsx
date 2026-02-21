import { useState, useEffect } from "react";
import { BarChart3, MessageSquare, Clock, Bot, Users, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/auth";

interface Stats {
  active: number;
  waiting: number;
  resolved: number;
  total: number;
  aiResolutionRate: number;
  totalContacts: number;
}

export function StatsOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await authFetch("/api/conversations/stats/overview");
        if (res.ok) setStats(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const cards = [
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
      label: "نسبة حل AI",
      value: `${stats?.aiResolutionRate || 0}%`,
      icon: Bot,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
    {
      label: "إجمالي جهات الاتصال",
      value: stats?.totalContacts || 0,
      icon: Users,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
    {
      label: "إجمالي المحادثات",
      value: stats?.total || 0,
      icon: MessageSquare,
      color: "text-pink-400",
      bg: "bg-pink-500/10",
      border: "border-pink-500/20",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">لوحة الإحصائيات</h2>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl">
          {cards.map((card) => (
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
      </div>
    </div>
  );
}
