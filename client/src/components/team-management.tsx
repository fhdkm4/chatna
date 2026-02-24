import { useState, useEffect, useCallback } from "react";
import { Plus, Users, Trash2, Shield, UserCircle, Loader2, Star, MessageSquare, Zap, SmilePlus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { authFetch } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

interface RatingStat {
  agentId: string;
  avgRating: number;
  totalRatings: number;
}

interface AgentRating {
  id: string;
  rating: number;
  contactName: string;
  contactPhone: string;
  createdAt: string;
}

interface AgentMonitorData {
  id: string;
  totalConversationsToday: number;
  resolvedToday: number;
  totalMessagesToday: number;
  avgResponseTimeSeconds: number;
  activeChats: number;
}

interface TeamManagementProps {
  onlineAgents?: Set<string>;
}

function getRatingColor(avg: number) {
  if (avg >= 4) return "text-emerald-400 border-emerald-500/30";
  if (avg >= 3) return "text-amber-400 border-amber-500/30";
  return "text-red-400 border-red-500/30";
}

function getRatingBadgeBg(rating: number) {
  if (rating >= 4) return "bg-emerald-500/20 text-emerald-400";
  if (rating >= 3) return "bg-amber-500/20 text-amber-400";
  return "bg-red-500/20 text-red-400";
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star
      key={i}
      className={`w-3 h-3 ${i < Math.round(rating) ? "fill-current" : "opacity-30"}`}
    />
  ));
}

function formatResponseTime(seconds: number) {
  if (!seconds || seconds === 0) return "—";
  if (seconds < 60) return `${Math.round(seconds)} ث`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} د`;
  return `${(seconds / 3600).toFixed(1)} س`;
}

export function TeamManagement({ onlineAgents = new Set() }: TeamManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [ratingStats, setRatingStats] = useState<Map<string, RatingStat>>(new Map());
  const [monitorData, setMonitorData] = useState<Map<string, AgentMonitorData>>(new Map());
  const [ratingsDialogOpen, setRatingsDialogOpen] = useState(false);
  const [ratingsDialogAgent, setRatingsDialogAgent] = useState<TeamMember | null>(null);
  const [agentRatings, setAgentRatings] = useState<AgentRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState<string | null>(null);
  const [jobTitleInput, setJobTitleInput] = useState("");
  const { toast } = useToast();

  const fetchTeam = useCallback(async () => {
    try {
      const res = await authFetch("/api/team");
      if (res.ok) setMembers(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRatingStats = useCallback(async () => {
    try {
      const res = await authFetch("/api/ratings/stats");
      if (res.ok) {
        const stats: RatingStat[] = await res.json();
        const map = new Map<string, RatingStat>();
        stats.forEach((s) => map.set(s.agentId, s));
        setRatingStats(map);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchMonitoring = useCallback(async () => {
    try {
      const res = await authFetch("/api/team/monitoring");
      if (res.ok) {
        const data = await res.json();
        const map = new Map<string, AgentMonitorData>();
        (data.agents || []).forEach((a: AgentMonitorData) => map.set(a.id, a));
        setMonitorData(map);
      }
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchTeam();
    fetchRatingStats();
    fetchMonitoring();
  }, [fetchTeam, fetchRatingStats, fetchMonitoring]);

  const startEditJobTitle = (member: TeamMember) => {
    setEditingJobTitle(member.id);
    setJobTitleInput(member.jobTitle || "");
  };

  const saveJobTitle = async (memberId: string) => {
    try {
      const res = await authFetch(`/api/team/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ jobTitle: jobTitleInput.trim() || null }),
      });
      if (res.ok) {
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, jobTitle: jobTitleInput.trim() || null } : m));
        toast({ title: "تم التحديث", description: "تم تحديث المسمى الوظيفي" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في تحديث المسمى الوظيفي", variant: "destructive" });
    }
    setEditingJobTitle(null);
  };

  const openRatingsDialog = async (member: TeamMember) => {
    setRatingsDialogAgent(member);
    setRatingsDialogOpen(true);
    setRatingsLoading(true);
    setAgentRatings([]);
    try {
      const res = await authFetch(`/api/ratings/agent/${member.id}`);
      if (res.ok) {
        setAgentRatings(await res.json());
      }
    } catch (err) {
      console.error(err);
    } finally {
      setRatingsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/team", {
        method: "POST",
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: "تم بنجاح", description: "تم إنشاء حساب الموظف" });
        setShowDialog(false);
        setForm({ name: "", email: "", password: "" });
        fetchTeam();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في إنشاء الحساب", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      const res = await authFetch(`/api/team/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم الحذف", description: `تم حذف ${name}` });
        fetchTeam();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في الحذف", variant: "destructive" });
    }
  };

  const isOnline = (member: TeamMember) => onlineAgents.has(member.id) || member.status === "online";

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">إدارة الفريق</h2>
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-300">
            {members.length} عضو
          </Badge>
        </div>
        <Button size="sm" data-testid="button-add-agent" onClick={() => setShowDialog(true)} className="bg-emerald-600 text-xs">
          <Plus className="w-3 h-3 ml-1" />
          إضافة موظف
        </Button>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {members.map((member) => {
              const stat = ratingStats.get(member.id);
              const monitor = monitorData.get(member.id);
              return (
                <div
                  key={member.id}
                  data-testid={`team-member-${member.id}`}
                  className="bg-[#111827]/50 border border-white/5 rounded-lg p-4 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                          member.role === "admin" ? "bg-gradient-to-br from-amber-400 to-amber-600" : "bg-gradient-to-br from-blue-400 to-blue-600"
                        }`}>
                          {member.name.charAt(0)}
                        </div>
                        <div
                          data-testid={`status-indicator-${member.id}`}
                          className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#111827] transition-colors ${
                            isOnline(member) ? "bg-emerald-500" : "bg-gray-500"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{member.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 ${
                              member.role === "admin"
                                ? "border-amber-500/30 text-amber-400"
                                : "border-blue-500/30 text-blue-400"
                            }`}
                          >
                            {member.role === "admin" ? (
                              <><Shield className="w-2.5 h-2.5 ml-0.5" />مدير</>
                            ) : (
                              <><UserCircle className="w-2.5 h-2.5 ml-0.5" />موظف</>
                            )}
                          </Badge>
                          <span className={`text-[9px] ${isOnline(member) ? "text-emerald-400" : "text-gray-500"}`}>
                            {isOnline(member) ? "متصل" : "غير متصل"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {editingJobTitle === member.id ? (
                            <div className="flex items-center gap-1">
                              <Input
                                data-testid={`input-job-title-${member.id}`}
                                value={jobTitleInput}
                                onChange={(e) => setJobTitleInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveJobTitle(member.id); if (e.key === "Escape") setEditingJobTitle(null); }}
                                placeholder="المسمى الوظيفي"
                                className="text-xs bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 w-40"
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" data-testid={`button-save-job-title-${member.id}`} onClick={() => saveJobTitle(member.id)} className="text-emerald-400">
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-cancel-job-title-${member.id}`} onClick={() => setEditingJobTitle(null)} className="text-gray-400">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/title">
                              <span data-testid={`text-job-title-${member.id}`} className="text-xs text-gray-400">
                                {member.jobTitle || "—"}
                              </span>
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-edit-job-title-${member.id}`}
                                onClick={() => startEditJobTitle(member)}
                                className="opacity-0 group-hover/title:opacity-100 transition-opacity text-gray-500"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{member.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`button-ratings-${member.id}`}
                        onClick={() => openRatingsDialog(member)}
                        className="text-xs text-gray-400"
                      >
                        <Star className="w-3 h-3 ml-1" />
                        التقييمات
                      </Button>
                      {member.role !== "admin" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          data-testid={`button-delete-agent-${member.id}`}
                          onClick={() => handleDelete(member.id, member.name)}
                          className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                  <div
                    data-testid={`performance-bar-${member.id}`}
                    className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4 flex-wrap"
                  >
                    <div className="flex items-center gap-1.5" data-testid={`metric-conversations-${member.id}`}>
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{monitor?.totalConversationsToday || 0}</span> محادثة
                      </span>
                    </div>
                    <span className="text-gray-600 text-xs">|</span>
                    <div className="flex items-center gap-1.5" data-testid={`metric-response-time-${member.id}`}>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{formatResponseTime(monitor?.avgResponseTimeSeconds || 0)}</span>
                      </span>
                    </div>
                    <span className="text-gray-600 text-xs">|</span>
                    <div className="flex items-center gap-1.5" data-testid={`metric-satisfaction-${member.id}`}>
                      <SmilePlus className="w-3.5 h-3.5 text-emerald-400" />
                      {stat ? (
                        <span className="text-xs text-gray-300">
                          <span className={`font-semibold ${
                            stat.avgRating >= 4 ? "text-emerald-400" :
                            stat.avgRating >= 3 ? "text-amber-400" : "text-red-400"
                          }`}>{stat.avgRating.toFixed(1)}</span>
                          <span className="text-gray-500">/5</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">إضافة موظف جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">الاسم</Label>
              <Input
                data-testid="input-agent-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="اسم الموظف"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">البريد الإلكتروني</Label>
              <Input
                data-testid="input-agent-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@example.com"
                dir="ltr"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">كلمة المرور</Label>
              <Input
                data-testid="input-agent-password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="كلمة مرور قوية"
                dir="ltr"
                className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="text-gray-400">
                إلغاء
              </Button>
              <Button data-testid="button-save-agent" onClick={handleCreate} disabled={saving} className="bg-emerald-600">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "إنشاء"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={ratingsDialogOpen} onOpenChange={setRatingsDialogOpen}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-lg" data-testid="dialog-agent-ratings">
          <DialogHeader>
            <DialogTitle className="text-white">
              تقييمات {ratingsDialogAgent?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {ratingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
              </div>
            ) : agentRatings.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm" data-testid="text-no-ratings">
                لا توجد تقييمات بعد
              </div>
            ) : (
              agentRatings.map((r) => (
                <div
                  key={r.id}
                  data-testid={`rating-item-${r.id}`}
                  className="bg-[#0d1321] border border-white/5 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-white">
                      {r.contactName || r.contactPhone}
                    </span>
                    <span className="text-[10px] text-gray-500" dir="ltr">
                      {r.contactPhone}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {new Date(r.createdAt).toLocaleDateString("ar-SA", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                  <Badge
                    variant="outline"
                    data-testid={`rating-value-${r.id}`}
                    className={`text-xs px-2 ${getRatingColor(r.rating)}`}
                  >
                    <span className="flex items-center gap-0.5">
                      {renderStars(r.rating)}
                      <span className="mr-1">{r.rating}/5</span>
                    </span>
                  </Badge>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
