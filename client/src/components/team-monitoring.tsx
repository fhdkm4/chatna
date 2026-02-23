import { useState, useEffect, useCallback } from "react";
import { Activity, Users, MessageSquare, Clock, CheckCircle, Circle, RefreshCw, Loader2, ArrowLeftRight, UserCheck, Shield, UserCircle, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth";

interface AgentMonitor {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  activeChats: number;
  maxConcurrentChats: number;
  totalConversationsToday: number;
  resolvedToday: number;
  totalMessagesToday: number;
  avgResponseTimeSeconds: number;
}

interface MonitoringStats {
  totalActive: number;
  totalWaiting: number;
  totalResolved: number;
  avgResponseTime: number;
}

interface MonitoringData {
  agents: AgentMonitor[];
  stats?: MonitoringStats;
  summary?: MonitoringStats;
}

interface ActivityLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  details: any;
  createdAt: string;
}

interface RatingStat {
  agentId: string;
  avgRating: number;
  totalRatings: number;
}

interface TeamMonitoringProps {
  onlineAgents?: Set<string>;
}

export function TeamMonitoring({ onlineAgents = new Set() }: TeamMonitoringProps) {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [activities, setActivities] = useState<ActivityLogEntry[]>([]);
  const [ratingStats, setRatingStats] = useState<Map<string, RatingStat>>(new Map());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [monRes, actRes, ratRes] = await Promise.all([
        authFetch("/api/team/monitoring"),
        authFetch("/api/activity-log"),
        authFetch("/api/ratings/stats"),
      ]);
      if (monRes.ok) setData(await monRes.json());
      if (actRes.ok) setActivities(await actRes.json());
      if (ratRes.ok) {
        const stats: RatingStat[] = await ratRes.json();
        const map = new Map<string, RatingStat>();
        stats.forEach((s) => map.set(s.agentId, s));
        setRatingStats(map);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(() => { fetchData(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const isOnline = (agent: AgentMonitor) => onlineAgents.has(agent.id) || agent.status === "online";

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds} ثانية`;
    if (seconds < 3600) return `${Math.round(seconds / 60)} دقيقة`;
    return `${Math.round(seconds / 3600)} ساعة`;
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "conversation_assigned": return "تعيين محادثة";
      case "conversation_transferred": return "تحويل محادثة";
      case "conversation_resolved": return "إغلاق محادثة";
      case "message_sent": return "إرسال رسالة";
      default: return action;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "conversation_assigned": return UserCheck;
      case "conversation_transferred": return ArrowLeftRight;
      case "conversation_resolved": return CheckCircle;
      default: return MessageSquare;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case "conversation_assigned": return "text-blue-400";
      case "conversation_transferred": return "text-amber-400";
      case "conversation_resolved": return "text-emerald-400";
      default: return "text-gray-400";
    }
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleString("ar-SA", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" data-testid="monitoring-loading">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  const stats = data?.summary || data?.stats;
  const agents = data?.agents || [];

  const summaryCards = [
    {
      label: "محادثات نشطة",
      value: stats?.totalActive || 0,
      icon: MessageSquare,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    },
    {
      label: "بانتظار الرد",
      value: stats?.totalWaiting || 0,
      icon: Clock,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    },
    {
      label: "محادثات مغلقة",
      value: stats?.totalResolved || 0,
      icon: CheckCircle,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "متوسط وقت الرد",
      value: formatTime(stats?.avgResponseTime || 0),
      icon: Activity,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
    },
  ];

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between gap-2 px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white" data-testid="text-monitoring-title">مراقبة الفريق</h2>
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-300">
            {agents.length} موظف
          </Badge>
        </div>
        <Button size="sm" variant="ghost" data-testid="button-refresh-monitoring" onClick={() => { setLoading(true); fetchData(); }} className="text-gray-400 text-xs">
          <RefreshCw className="w-3 h-3 ml-1" />
          تحديث
        </Button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mb-8">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              data-testid={`stat-card-${card.label}`}
              className={`bg-[#111827]/50 border ${card.border} rounded-xl p-5 transition-all hover:bg-[#111827]/80`}
            >
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-white mb-1" data-testid={`stat-value-${card.label}`}>{card.value}</div>
              <div className="text-xs text-gray-400">{card.label}</div>
            </div>
          ))}
        </div>

        <div className="max-w-5xl mb-8">
          <h3 className="text-sm font-semibold text-white mb-4">أداء الموظفين</h3>
          <div className="bg-[#111827]/50 border border-white/5 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-agent-performance">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-right text-gray-400 text-xs font-medium p-4">الموظف</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">الحالة</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">محادثات نشطة</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">إجمالي المحادثات</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">تم الحل</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">متوسط وقت الرد</th>
                    <th className="text-right text-gray-400 text-xs font-medium p-4">تقييم العملاء</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const online = isOnline(agent);
                    return (
                      <tr key={agent.id} data-testid={`agent-row-${agent.id}`} className="border-b border-white/5 last:border-b-0">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                agent.role === "admin" ? "bg-gradient-to-br from-amber-400 to-amber-600" : "bg-gradient-to-br from-blue-400 to-blue-600"
                              }`}>
                                {agent.name.charAt(0)}
                              </div>
                              <div
                                data-testid={`status-indicator-${agent.id}`}
                                className={`absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded-full border-2 border-[#111827] ${
                                  online ? "bg-emerald-500" : "bg-gray-500"
                                }`}
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-white">{agent.name}</span>
                                <Badge
                                  variant="outline"
                                  className={`text-[9px] px-1.5 ${
                                    agent.role === "admin"
                                      ? "border-amber-500/30 text-amber-400"
                                      : "border-blue-500/30 text-blue-400"
                                  }`}
                                >
                                  {agent.role === "admin" ? (
                                    <><Shield className="w-2.5 h-2.5 ml-0.5" />مدير</>
                                  ) : (
                                    <><UserCircle className="w-2.5 h-2.5 ml-0.5" />موظف</>
                                  )}
                                </Badge>
                              </div>
                              <span className="text-xs text-gray-500">{agent.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <Circle className={`w-2.5 h-2.5 fill-current ${online ? "text-emerald-500" : "text-gray-500"}`} />
                            <span className={`text-xs ${online ? "text-emerald-400" : "text-gray-500"}`}>
                              {online ? "متصل" : "غير متصل"}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="text-white text-sm" data-testid={`active-chats-${agent.id}`}>{agent.activeChats}</span>
                          <span className="text-gray-500 text-xs"> / {agent.maxConcurrentChats}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-white text-sm" data-testid={`total-conversations-${agent.id}`}>
                            {agent.totalConversationsToday || 0}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-white text-sm" data-testid={`resolved-conversations-${agent.id}`}>
                            {agent.resolvedToday || 0}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-white text-sm" data-testid={`avg-response-${agent.id}`}>
                            {formatTime(agent.avgResponseTimeSeconds || 0)}
                          </span>
                        </td>
                        <td className="p-4">
                          {ratingStats.has(agent.id) ? (
                            <div className="flex items-center gap-1.5" data-testid={`rating-cell-${agent.id}`}>
                              <Star className={`w-3.5 h-3.5 fill-current ${
                                ratingStats.get(agent.id)!.avgRating >= 4 ? "text-emerald-400" :
                                ratingStats.get(agent.id)!.avgRating >= 3 ? "text-amber-400" : "text-red-400"
                              }`} />
                              <span className="text-white text-sm font-medium">
                                {ratingStats.get(agent.id)!.avgRating.toFixed(1)}
                              </span>
                              <span className="text-gray-500 text-xs">
                                ({ratingStats.get(agent.id)!.totalRatings})
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs" data-testid={`no-rating-${agent.id}`}>لا تقييمات</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 text-sm">
                        لا يوجد موظفين
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="max-w-5xl">
          <h3 className="text-sm font-semibold text-white mb-4">سجل النشاطات</h3>
          <div className="space-y-2">
            {activities.length > 0 ? (
              activities.slice(0, 20).map((entry) => {
                const ActionIcon = getActionIcon(entry.action);
                const colorClass = getActionColor(entry.action);
                return (
                  <div
                    key={entry.id}
                    data-testid={`activity-entry-${entry.id}`}
                    className="bg-[#111827]/50 border border-white/5 rounded-lg p-4 flex items-center gap-3"
                  >
                    <div className={`w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0`}>
                      <ActionIcon className={`w-4 h-4 ${colorClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-white font-medium">{getActionLabel(entry.action)}</span>
                        {entry.details?.agentName && (
                          <Badge variant="outline" className="text-[9px] border-white/10 text-gray-300">
                            {entry.details.agentName}
                          </Badge>
                        )}
                      </div>
                      {entry.details?.conversationId && (
                        <span className="text-xs text-gray-500 block truncate">
                          محادثة: {entry.details.conversationId.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0" data-testid={`activity-time-${entry.id}`}>
                      {formatTimestamp(entry.createdAt)}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="bg-[#111827]/50 border border-white/5 rounded-lg p-8 text-center text-gray-500 text-sm">
                لا توجد نشاطات مسجلة
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}