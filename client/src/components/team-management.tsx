import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Users, Trash2, Shield, UserCircle, Loader2, Star, MessageSquare, Zap, SmilePlus, Pencil, Check, X, Search, Filter, ArrowUpDown, CheckCircle, Bot, Power, UserCog, AlertTriangle, Crown, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { authFetch } from "@/lib/auth";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface MemberStats {
  openConversations: number;
  resolvedConversations: number;
  aiTransferred: number;
  avgResponseTimeSeconds: number;
}

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  isActive: boolean;
  jobTitle: string | null;
  avatarUrl: string | null;
  createdAt: string;
  stats?: MemberStats;
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

interface TeamManagementProps {
  onlineAgents?: Set<string>;
}

function getRatingColor(avg: number) {
  if (avg >= 4) return "text-emerald-400 border-emerald-500/30";
  if (avg >= 3) return "text-amber-400 border-amber-500/30";
  return "text-red-400 border-red-500/30";
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

const ROLE_LABELS: Record<string, string> = {
  admin: "مدير",
  manager: "مشرف",
  agent: "موظف",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "border-amber-500/30 text-amber-400",
  manager: "border-purple-500/30 text-purple-400",
  agent: "border-blue-500/30 text-blue-400",
};

const ROLE_ICONS: Record<string, typeof Shield> = {
  admin: Shield,
  manager: Crown,
  agent: UserCircle,
};

export function TeamManagement({ onlineAgents = new Set() }: TeamManagementProps) {
  const { user: currentUser } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "agent" });
  const [saving, setSaving] = useState(false);
  const [ratingStats, setRatingStats] = useState<Map<string, RatingStat>>(new Map());
  const [ratingsDialogOpen, setRatingsDialogOpen] = useState(false);
  const [ratingsDialogAgent, setRatingsDialogAgent] = useState<TeamMember | null>(null);
  const [agentRatings, setAgentRatings] = useState<AgentRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState<string | null>(null);
  const [jobTitleInput, setJobTitleInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "activity">("activity");
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState({ name: "", role: "", maxConcurrentChats: 10 });
  const [editSaving, setEditSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "delete" | "toggle"; member: TeamMember } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const isSelf = (memberId: string) => currentUser?.id === memberId;
  const adminCount = useMemo(() => members.filter(m => m.role === "admin" && m.isActive !== false).length, [members]);

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

  useEffect(() => {
    fetchTeam();
    fetchRatingStats();
  }, [fetchTeam, fetchRatingStats]);

  const filteredMembers = useMemo(() => {
    let result = [...members];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(m => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));
    }
    if (roleFilter !== "all") {
      result = result.filter(m => m.role === roleFilter);
    }
    if (sortBy === "activity") {
      result.sort((a, b) => {
        const aTotal = (a.stats?.openConversations || 0) + (a.stats?.resolvedConversations || 0);
        const bTotal = (b.stats?.openConversations || 0) + (b.stats?.resolvedConversations || 0);
        return bTotal - aTotal;
      });
    } else {
      result.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    }
    return result;
  }, [members, searchQuery, roleFilter, sortBy]);

  const startEditJobTitle = (e: React.MouseEvent, member: TeamMember) => {
    e.stopPropagation();
    setEditingJobTitle(member.id);
    setJobTitleInput(member.jobTitle || "");
  };

  const saveJobTitle = async (e: React.MouseEvent | null, memberId: string) => {
    if (e) e.stopPropagation();
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

  const openRatingsDialog = async (e: React.MouseEvent, member: TeamMember) => {
    e.stopPropagation();
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
        setForm({ name: "", email: "", password: "", role: "agent" });
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

  const handleDelete = async () => {
    if (!confirmDialog || confirmDialog.type !== "delete") return;
    const { member } = confirmDialog;
    setConfirmLoading(true);
    try {
      const res = await authFetch(`/api/team/${member.id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم الحذف", description: `تم حذف ${member.name}` });
        fetchTeam();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في الحذف", variant: "destructive" });
    } finally {
      setConfirmLoading(false);
      setConfirmDialog(null);
    }
  };

  const handleToggleActive = async () => {
    if (!confirmDialog || confirmDialog.type !== "toggle") return;
    const { member } = confirmDialog;
    setConfirmLoading(true);
    try {
      const res = await authFetch(`/api/team/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !member.isActive }),
      });
      if (res.ok) {
        const action = member.isActive ? "تعطيل" : "تفعيل";
        toast({ title: "تم بنجاح", description: `تم ${action} حساب ${member.name}` });
        fetchTeam();
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في تغيير حالة الحساب", variant: "destructive" });
    } finally {
      setConfirmLoading(false);
      setConfirmDialog(null);
    }
  };

  const openEditDialog = (e: React.MouseEvent, member: TeamMember) => {
    e.stopPropagation();
    setEditMember(member);
    setEditForm({
      name: member.name,
      role: member.role,
      maxConcurrentChats: 10,
    });
  };

  const handleEditSave = async () => {
    if (!editMember) return;
    setEditSaving(true);
    try {
      const updates: any = {};
      if (editForm.name.trim() && editForm.name.trim() !== editMember.name) {
        updates.name = editForm.name.trim();
      }
      if (editForm.role !== editMember.role) {
        updates.role = editForm.role;
      }
      if (Object.keys(updates).length === 0) {
        setEditMember(null);
        return;
      }
      const res = await authFetch(`/api/team/${editMember.id}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        toast({ title: "تم التحديث", description: `تم تحديث بيانات ${editMember.name}` });
        fetchTeam();
        setEditMember(null);
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "خطأ", description: "فشل في التحديث", variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  };

  const isOnline = (member: TeamMember) => onlineAgents.has(member.id) || member.status === "online";

  const canDeleteMember = (member: TeamMember) => {
    if (isSelf(member.id)) return false;
    if (member.role === "admin" && adminCount <= 1) return false;
    return true;
  };

  const canToggleMember = (member: TeamMember) => {
    if (isSelf(member.id)) return false;
    if (member.role === "admin" && member.isActive && adminCount <= 1) return false;
    return true;
  };

  const canChangeRole = (member: TeamMember) => {
    if (isSelf(member.id)) return false;
    return true;
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0d1321]/50 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-semibold text-white">إدارة الفريق</h2>
          <Badge variant="secondary" className="text-[10px] bg-white/5 text-gray-300" data-testid="badge-member-count">
            {members.length} عضو
          </Badge>
        </div>
        <Button size="sm" data-testid="button-add-agent" onClick={() => setShowDialog(true)} className="bg-emerald-600 text-xs">
          <Plus className="w-3 h-3 ml-1" />
          إضافة موظف
        </Button>
      </div>

      <div className="px-6 pt-4 pb-2 space-y-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              data-testid="input-search-team"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم أو البريد..."
              className="pr-9 bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 text-sm h-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-32 bg-[#0a0f1a] border-white/10 text-white text-sm h-9" data-testid="select-role-filter">
              <Filter className="w-3.5 h-3.5 ml-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-white/10">
              <SelectItem value="all" className="text-white">الكل</SelectItem>
              <SelectItem value="admin" className="text-white">مدير</SelectItem>
              <SelectItem value="manager" className="text-white">مشرف</SelectItem>
              <SelectItem value="agent" className="text-white">موظف</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "name" | "activity")}>
            <SelectTrigger className="w-36 bg-[#0a0f1a] border-white/10 text-white text-sm h-9" data-testid="select-sort-by">
              <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-gray-400" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#111827] border-white/10">
              <SelectItem value="activity" className="text-white">حسب النشاط</SelectItem>
              <SelectItem value="name" className="text-white">حسب الاسم</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 p-6 pt-2 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Users className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">لا توجد نتائج</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {filteredMembers.map((member) => {
              const stat = ratingStats.get(member.id);
              const stats = member.stats;
              const RoleIcon = ROLE_ICONS[member.role] || UserCircle;
              return (
                <div
                  key={member.id}
                  data-testid={`team-member-${member.id}`}
                  onClick={() => navigate(`/team/${member.id}`)}
                  className={`bg-[#111827]/50 border rounded-lg p-4 group cursor-pointer hover:border-white/10 transition-colors ${
                    member.isActive === false ? "border-red-500/20 opacity-60" : "border-white/5"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {member.avatarUrl ? (
                          <img
                            src={member.avatarUrl}
                            alt={member.name}
                            className={`w-10 h-10 rounded-full object-cover border border-white/10 ${member.isActive === false ? "grayscale" : ""}`}
                          />
                        ) : (
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                            member.isActive === false ? "bg-gray-600" :
                            member.role === "admin" ? "bg-gradient-to-br from-amber-400 to-amber-600" :
                            member.role === "manager" ? "bg-gradient-to-br from-purple-400 to-purple-600" :
                            "bg-gradient-to-br from-blue-400 to-blue-600"
                          }`}>
                            {member.name.charAt(0)}
                          </div>
                        )}
                        <div
                          data-testid={`status-indicator-${member.id}`}
                          className={`absolute -bottom-0.5 -left-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#111827] transition-colors ${
                            member.isActive === false ? "bg-red-500" :
                            isOnline(member) ? "bg-emerald-500" : "bg-gray-500"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span data-testid={`text-member-name-${member.id}`} className="text-sm font-medium text-white">{member.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1.5 ${ROLE_COLORS[member.role] || ROLE_COLORS.agent}`}
                          >
                            <RoleIcon className="w-2.5 h-2.5 ml-0.5" />
                            {ROLE_LABELS[member.role] || member.role}
                          </Badge>
                          {member.isActive === false ? (
                            <Badge variant="outline" className="text-[9px] px-1.5 border-red-500/30 text-red-400">
                              معطّل
                            </Badge>
                          ) : (
                            <span className={`text-[9px] ${isOnline(member) ? "text-emerald-400" : "text-gray-500"}`}>
                              {isOnline(member) ? "متصل" : "غير متصل"}
                            </span>
                          )}
                          {isSelf(member.id) && (
                            <span className="text-[9px] text-emerald-400/60">(أنت)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {editingJobTitle === member.id ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <Input
                                data-testid={`input-job-title-${member.id}`}
                                value={jobTitleInput}
                                onChange={(e) => setJobTitleInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveJobTitle(null, member.id); if (e.key === "Escape") setEditingJobTitle(null); }}
                                placeholder="المسمى الوظيفي"
                                className="text-xs bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500 w-40"
                                autoFocus
                              />
                              <Button size="icon" variant="ghost" data-testid={`button-save-job-title-${member.id}`} onClick={(e) => saveJobTitle(e, member.id)} className="text-emerald-400">
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button size="icon" variant="ghost" data-testid={`button-cancel-job-title-${member.id}`} onClick={(e) => { e.stopPropagation(); setEditingJobTitle(null); }} className="text-gray-400">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 group/title">
                              <span data-testid={`text-job-title-${member.id}`} className="text-xs text-gray-400">
                                {member.jobTitle || "—"}
                              </span>
                              {!isSelf(member.id) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  data-testid={`button-edit-job-title-${member.id}`}
                                  onClick={(e) => startEditJobTitle(e, member)}
                                  className="opacity-0 group-hover/title:opacity-100 transition-opacity text-gray-500 h-5 w-5"
                                >
                                  <Pencil className="w-3 h-3" />
                                </Button>
                              )}
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
                        onClick={(e) => openRatingsDialog(e, member)}
                        className="text-xs text-gray-400"
                      >
                        <Star className="w-3 h-3 ml-1" />
                        التقييمات
                      </Button>
                      {!isSelf(member.id) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon"
                              variant="ghost"
                              data-testid={`button-member-menu-${member.id}`}
                              className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-[#111827] border-white/10 text-white min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem
                              data-testid={`menu-edit-title-${member.id}`}
                              onClick={(e) => { e.stopPropagation(); startEditJobTitle(e as any, member); }}
                              className="text-gray-300 text-xs cursor-pointer focus:bg-white/5 focus:text-white"
                            >
                              <Pencil className="w-3.5 h-3.5 ml-2" />
                              تعديل المسمى الوظيفي
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-testid={`menu-edit-member-${member.id}`}
                              onClick={(e) => { e.stopPropagation(); openEditDialog(e as any, member); }}
                              className="text-gray-300 text-xs cursor-pointer focus:bg-white/5 focus:text-white"
                            >
                              <UserCog className="w-3.5 h-3.5 ml-2" />
                              تعديل البيانات والصلاحية
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-white/5" />
                            {canToggleMember(member) && (
                              <DropdownMenuItem
                                data-testid={`menu-toggle-${member.id}`}
                                onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "toggle", member }); }}
                                className={`text-xs cursor-pointer focus:bg-white/5 ${member.isActive === false ? "text-emerald-400 focus:text-emerald-300" : "text-amber-400 focus:text-amber-300"}`}
                              >
                                <Power className="w-3.5 h-3.5 ml-2" />
                                {member.isActive === false ? "تفعيل الحساب" : "تعطيل الحساب"}
                              </DropdownMenuItem>
                            )}
                            {canDeleteMember(member) && (
                              <DropdownMenuItem
                                data-testid={`menu-delete-${member.id}`}
                                onClick={(e) => { e.stopPropagation(); setConfirmDialog({ type: "delete", member }); }}
                                className="text-red-400 text-xs cursor-pointer focus:bg-red-500/10 focus:text-red-300"
                              >
                                <Trash2 className="w-3.5 h-3.5 ml-2" />
                                حذف العضو
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <div
                    data-testid={`performance-bar-${member.id}`}
                    className="mt-3 pt-3 border-t border-white/5 flex items-center gap-4 flex-wrap"
                  >
                    <div className="flex items-center gap-1.5" data-testid={`metric-open-${member.id}`}>
                      <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{stats?.openConversations || 0}</span> مفتوحة
                      </span>
                    </div>
                    <span className="text-gray-600 text-xs">|</span>
                    <div className="flex items-center gap-1.5" data-testid={`metric-resolved-${member.id}`}>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{stats?.resolvedConversations || 0}</span> مغلقة
                      </span>
                    </div>
                    <span className="text-gray-600 text-xs">|</span>
                    <div className="flex items-center gap-1.5" data-testid={`metric-ai-transferred-${member.id}`}>
                      <Bot className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{stats?.aiTransferred || 0}</span> من AI
                      </span>
                    </div>
                    <span className="text-gray-600 text-xs">|</span>
                    <div className="flex items-center gap-1.5" data-testid={`metric-response-time-${member.id}`}>
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-gray-300">
                        <span className="text-white font-semibold">{formatResponseTime(stats?.avgResponseTimeSeconds || 0)}</span>
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
            <div className="space-y-2">
              <Label className="text-gray-300 text-xs">الصلاحية</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger className="bg-[#0a0f1a] border-white/10 text-white" data-testid="select-new-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#111827] border-white/10">
                  <SelectItem value="agent" className="text-white">موظف</SelectItem>
                  <SelectItem value="manager" className="text-white">مشرف</SelectItem>
                  <SelectItem value="admin" className="text-white">مدير</SelectItem>
                </SelectContent>
              </Select>
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

      <Dialog open={!!editMember} onOpenChange={(open) => { if (!open) setEditMember(null); }}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-md" data-testid="dialog-edit-member">
          <DialogHeader>
            <DialogTitle className="text-white">تعديل بيانات {editMember?.name}</DialogTitle>
          </DialogHeader>
          {editMember && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">الاسم</Label>
                <Input
                  data-testid="input-edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="اسم الموظف"
                  className="bg-[#0a0f1a] border-white/10 text-white placeholder:text-gray-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-gray-300 text-xs">الصلاحية</Label>
                {canChangeRole(editMember) ? (
                  <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                    <SelectTrigger className="bg-[#0a0f1a] border-white/10 text-white" data-testid="select-edit-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111827] border-white/10">
                      <SelectItem value="agent" className="text-white">موظف</SelectItem>
                      <SelectItem value="manager" className="text-white">مشرف</SelectItem>
                      <SelectItem value="admin" className="text-white">مدير</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-sm text-gray-400 bg-[#0a0f1a] border border-white/10 rounded-md px-3 py-2">
                    {ROLE_LABELS[editMember.role] || editMember.role}
                    <span className="text-[10px] text-gray-500 mr-2">(لا يمكنك تغيير دورك)</span>
                  </div>
                )}
                {editForm.role !== editMember.role && editMember.role === "admin" && adminCount <= 1 && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    لا يمكن تغيير دور آخر مدير في المنظمة
                  </p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setEditMember(null)} className="text-gray-400">
                  إلغاء
                </Button>
                <Button
                  data-testid="button-save-edit"
                  onClick={handleEditSave}
                  disabled={editSaving || (editForm.role !== editMember.role && editMember.role === "admin" && adminCount <= 1)}
                  className="bg-emerald-600"
                >
                  {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-sm" data-testid="dialog-confirm-action">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {confirmDialog?.type === "delete" ? "تأكيد الحذف" : confirmDialog?.member?.isActive === false ? "تأكيد التفعيل" : "تأكيد التعطيل"}
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              {confirmDialog?.type === "delete" ? (
                <>هل أنت متأكد من حذف <span className="text-white font-medium">{confirmDialog?.member?.name}</span>؟ لا يمكن التراجع عن هذا الإجراء.</>
              ) : confirmDialog?.member?.isActive === false ? (
                <>هل تريد إعادة تفعيل حساب <span className="text-white font-medium">{confirmDialog?.member?.name}</span>؟ سيتمكن من تسجيل الدخول مجدداً.</>
              ) : (
                <>هل تريد تعطيل حساب <span className="text-white font-medium">{confirmDialog?.member?.name}</span>؟ لن يتمكن من تسجيل الدخول حتى يتم تفعيله مجدداً.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="ghost" onClick={() => setConfirmDialog(null)} className="text-gray-400" disabled={confirmLoading}>
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-action"
              onClick={confirmDialog?.type === "delete" ? handleDelete : handleToggleActive}
              disabled={confirmLoading}
              className={confirmDialog?.type === "delete" ? "bg-red-600 hover:bg-red-700" : confirmDialog?.member?.isActive === false ? "bg-emerald-600" : "bg-amber-600 hover:bg-amber-700"}
            >
              {confirmLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmDialog?.type === "delete" ? "حذف" : confirmDialog?.member?.isActive === false ? "تفعيل" : "تعطيل"}
            </Button>
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
