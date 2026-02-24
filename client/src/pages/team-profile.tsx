import { useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, authFetch } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ArrowRight, Shield, UserCircle, MessageSquare, CheckCircle, Loader2, Send, Circle, Camera, Pencil, Check, X, Crown, Ban, Power, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  isActive: boolean;
  jobTitle: string | null;
  avatarUrl: string | null;
  maxConcurrentChats: number;
  createdAt: string;
  stats: {
    openConversations: number;
    resolvedConversations: number;
    activeChats: number;
  };
}

const ROLE_LABELS: Record<string, string> = { admin: "مدير", manager: "مشرف", agent: "موظف" };
const ROLE_COLORS: Record<string, string> = { admin: "border-amber-500/30 text-amber-400", manager: "border-purple-500/30 text-purple-400", agent: "border-blue-500/30 text-blue-400" };
const ROLE_AVATAR_COLORS: Record<string, string> = { admin: "bg-gradient-to-br from-amber-400 to-amber-600", manager: "bg-gradient-to-br from-purple-400 to-purple-600", agent: "bg-gradient-to-br from-blue-400 to-blue-600" };

export default function TeamProfile() {
  const [, params] = useRoute("/team/:userId");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState(false);
  const [jobTitleValue, setJobTitleValue] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<"delete" | "toggle" | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const { data: profile, isLoading, error } = useQuery<ProfileData>({
    queryKey: ["/api/team", params?.userId, "profile"],
    queryFn: async () => {
      const res = await authFetch(`/api/team/${params?.userId}/profile`);
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    enabled: !!params?.userId,
  });

  const avatarMutation = useMutation({
    mutationFn: async (avatarUrl: string) => {
      const res = await authFetch("/api/profile/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", params?.userId, "profile"] });
      toast({ title: "تم تحديث الصورة الشخصية بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ في تحديث الصورة", variant: "destructive" });
    },
  });

  const jobTitleMutation = useMutation({
    mutationFn: async (jobTitle: string | null) => {
      const res = await authFetch(`/api/team/${params?.userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle }),
      });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", params?.userId, "profile"] });
      setEditingJobTitle(false);
      toast({ title: "تم تحديث المسمى الوظيفي بنجاح" });
    },
    onError: () => {
      toast({ title: "خطأ في تحديث المسمى الوظيفي", variant: "destructive" });
    },
  });

  const roleMutation = useMutation({
    mutationFn: async (role: string) => {
      const res = await authFetch(`/api/team/${params?.userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team", params?.userId, "profile"] });
      toast({ title: "تم تغيير الصلاحية بنجاح" });
    },
    onError: (err: Error) => {
      toast({ title: "خطأ", description: err.message, variant: "destructive" });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast({ title: "يرجى اختيار صورة (JPG, PNG, WebP, GIF)", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "حجم الصورة يجب أن لا يتجاوز 5 ميغابايت", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    try {
      const urlRes = await authFetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("url-fail");
      const { uploadURL, objectPath } = await urlRes.json();

      await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      await avatarMutation.mutateAsync(objectPath);
    } catch {
      toast({ title: "خطأ في رفع الصورة", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleActive = async () => {
    if (!profile) return;
    setConfirmLoading(true);
    try {
      const res = await authFetch(`/api/team/${profile.id}/disable`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled: profile.isActive }),
      });
      if (res.ok) {
        const action = profile.isActive ? "تعطيل" : "تفعيل";
        toast({ title: `تم ${action} حساب ${profile.name}` });
        queryClient.invalidateQueries({ queryKey: ["/api/team", params?.userId, "profile"] });
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "فشل في تغيير حالة الحساب", variant: "destructive" });
    } finally {
      setConfirmLoading(false);
      setConfirmDialog(null);
    }
  };

  const handleDelete = async () => {
    if (!profile) return;
    setConfirmLoading(true);
    try {
      const res = await authFetch(`/api/team/${profile.id}`, { method: "DELETE" });
      if (res.ok) {
        toast({ title: "تم الحذف", description: `تم حذف ${profile.name}` });
        navigate("/");
      } else {
        const err = await res.json();
        toast({ title: "خطأ", description: err.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "خطأ", description: "فشل في الحذف", variant: "destructive" });
    } finally {
      setConfirmLoading(false);
      setConfirmDialog(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" data-testid="loading-spinner" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[#0a0f1a] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400 text-lg" data-testid="text-error-message">لم يتم العثور على الموظف</p>
        <Button variant="ghost" data-testid="button-back-error" onClick={() => navigate("/")} className="text-emerald-400">
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للوحة التحكم
        </Button>
      </div>
    );
  }

  const isOnline = profile.status === "online";
  const isSelf = user?.id === profile.id;
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen bg-[#0a0f1a] text-white" dir="rtl">
      <div className="max-w-2xl mx-auto py-10 px-6">
        <Button
          variant="ghost"
          data-testid="button-back-dashboard"
          onClick={() => navigate("/")}
          className="text-gray-400 mb-6"
        >
          <ArrowRight className="w-4 h-4 ml-2" />
          العودة للوحة التحكم
        </Button>

        <div className="bg-[#111827]/80 border border-white/5 rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              {profile.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt={profile.name}
                  data-testid="img-avatar"
                  className={`w-24 h-24 rounded-full object-cover border-2 border-white/10 ${profile.isActive === false ? "grayscale" : ""}`}
                />
              ) : (
                <div
                  data-testid="img-avatar-placeholder"
                  className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white ${
                    profile.isActive === false ? "bg-gray-600" : (ROLE_AVATAR_COLORS[profile.role] || ROLE_AVATAR_COLORS.agent)
                  }`}
                >
                  {profile.name.charAt(0)}
                </div>
              )}
              <div
                data-testid="status-indicator"
                className={`absolute bottom-1 left-1 w-4 h-4 rounded-full border-2 border-[#111827] ${
                  profile.isActive === false ? "bg-red-500" : isOnline ? "bg-emerald-500" : "bg-gray-500"
                }`}
              />
              {isSelf && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    data-testid="input-avatar-file"
                    onChange={handleFileSelect}
                  />
                  <button
                    data-testid="button-change-avatar"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer disabled:cursor-wait"
                  >
                    {isUploading ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </button>
                </>
              )}
            </div>

            <div className="text-center">
              <h1 data-testid="text-profile-name" className="text-xl font-bold text-white">
                {profile.name}
              </h1>
              {editingJobTitle ? (
                <div className="flex items-center gap-2 mt-1 justify-center">
                  <Input
                    data-testid="input-job-title"
                    value={jobTitleValue}
                    onChange={(e) => setJobTitleValue(e.target.value)}
                    maxLength={120}
                    className="h-8 w-48 text-sm text-center bg-[#0a0f1a] border-white/10 text-white"
                    placeholder="المسمى الوظيفي"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") jobTitleMutation.mutate(jobTitleValue.trim() || null);
                      if (e.key === "Escape") setEditingJobTitle(false);
                    }}
                  />
                  <button
                    data-testid="button-save-job-title"
                    onClick={() => jobTitleMutation.mutate(jobTitleValue.trim() || null)}
                    disabled={jobTitleMutation.isPending}
                    className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    {jobTitleMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button
                    data-testid="button-cancel-job-title"
                    onClick={() => setEditingJobTitle(false)}
                    className="p-1 text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1 mt-1 justify-center group/jt">
                  <p data-testid="text-profile-job-title" className="text-sm text-gray-400">
                    {profile.jobTitle || "\u2014"}
                  </p>
                  {isAdmin && !isSelf && (
                    <button
                      data-testid="button-edit-job-title"
                      onClick={() => {
                        setJobTitleValue(profile.jobTitle || "");
                        setEditingJobTitle(true);
                      }}
                      className="p-1 text-gray-500 hover:text-emerald-400 opacity-0 group-hover/jt:opacity-100 transition-all"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                <Badge
                  variant="outline"
                  data-testid="badge-role"
                  className={`text-xs ${ROLE_COLORS[profile.role] || ROLE_COLORS.agent}`}
                >
                  {profile.role === "admin" ? <Shield className="w-3 h-3 ml-1" /> :
                   profile.role === "manager" ? <Crown className="w-3 h-3 ml-1" /> :
                   <UserCircle className="w-3 h-3 ml-1" />}
                  {ROLE_LABELS[profile.role] || profile.role}
                </Badge>
                {profile.isActive === false ? (
                  <Badge
                    variant="outline"
                    data-testid="badge-status"
                    className="text-xs border-red-500/30 text-red-400"
                  >
                    <Ban className="w-2 h-2 ml-1" />
                    حساب معطّل
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    data-testid="badge-status"
                    className={`text-xs ${
                      isOnline
                        ? "border-emerald-500/30 text-emerald-400"
                        : "border-gray-500/30 text-gray-400"
                    }`}
                  >
                    <Circle className={`w-2 h-2 ml-1 ${isOnline ? "fill-emerald-400" : "fill-gray-500"}`} />
                    {isOnline ? "متصل" : "غير متصل"}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2" dir="ltr" data-testid="text-profile-email">{profile.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-8">
            <div
              data-testid="stat-open-conversations"
              className="bg-[#0a0f1a]/60 border border-white/5 rounded-xl p-5 text-center"
            >
              <MessageSquare className="w-6 h-6 text-blue-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{profile.stats.openConversations}</p>
              <p className="text-xs text-gray-400 mt-1">محادثات مفتوحة</p>
            </div>
            <div
              data-testid="stat-resolved-conversations"
              className="bg-[#0a0f1a]/60 border border-white/5 rounded-xl p-5 text-center"
            >
              <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <p className="text-2xl font-bold text-white">{profile.stats.resolvedConversations}</p>
              <p className="text-xs text-gray-400 mt-1">محادثات مغلقة</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {!isSelf && (
              <Button
                data-testid="button-send-message"
                onClick={() => navigate(`/?view=team-chat&chatWith=${profile.id}`)}
                className="w-full bg-emerald-600 text-white"
              >
                <Send className="w-4 h-4 ml-2" />
                مراسلة داخلية
              </Button>
            )}
          </div>

          {isAdmin && !isSelf && (
            <div className="mt-6 pt-6 border-t border-white/5">
              <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-400" />
                إجراءات المدير
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">تغيير الصلاحية</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={selectedRole || profile.role}
                      onValueChange={(v) => setSelectedRole(v)}
                    >
                      <SelectTrigger className="flex-1 bg-[#0a0f1a] border-white/10 text-white text-sm h-9" data-testid="select-profile-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111827] border-white/10">
                        <SelectItem value="agent" className="text-white">موظف</SelectItem>
                        <SelectItem value="manager" className="text-white">مشرف</SelectItem>
                        <SelectItem value="admin" className="text-white">مدير</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      data-testid="button-save-role"
                      disabled={(!selectedRole || selectedRole === profile.role) || roleMutation.isPending}
                      onClick={() => { if (selectedRole && selectedRole !== profile.role) roleMutation.mutate(selectedRole); }}
                      className="bg-emerald-600 text-xs"
                    >
                      {roleMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "حفظ"}
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    data-testid="button-toggle-disable"
                    onClick={() => setConfirmDialog("toggle")}
                    variant="outline"
                    className={`flex-1 text-xs ${
                      profile.isActive === false
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    }`}
                  >
                    <Power className="w-3.5 h-3.5 ml-1.5" />
                    {profile.isActive === false ? "تفعيل الحساب" : "تعطيل الحساب"}
                  </Button>
                  <Button
                    data-testid="button-delete-member"
                    onClick={() => setConfirmDialog("delete")}
                    variant="outline"
                    className="flex-1 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5 ml-1.5" />
                    حذف العضو
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={(open) => { if (!open) setConfirmDialog(null); }}>
        <DialogContent className="bg-[#111827] border-white/10 text-white max-w-sm" data-testid="dialog-confirm-profile-action">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {confirmDialog === "delete" ? "تأكيد الحذف" : profile.isActive === false ? "تأكيد التفعيل" : "تأكيد التعطيل"}
            </DialogTitle>
            <DialogDescription className="text-gray-400 pt-2">
              {confirmDialog === "delete" ? (
                <>هل أنت متأكد من حذف <span className="text-white font-medium">{profile.name}</span>؟ لا يمكن التراجع عن هذا الإجراء.</>
              ) : profile.isActive === false ? (
                <>هل تريد إعادة تفعيل حساب <span className="text-white font-medium">{profile.name}</span>؟</>
              ) : (
                <>هل تريد تعطيل حساب <span className="text-white font-medium">{profile.name}</span>؟ لن يتمكن من تسجيل الدخول.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="ghost" onClick={() => setConfirmDialog(null)} className="text-gray-400" disabled={confirmLoading}>
              إلغاء
            </Button>
            <Button
              data-testid="button-confirm-profile-action"
              onClick={confirmDialog === "delete" ? handleDelete : handleToggleActive}
              disabled={confirmLoading}
              className={confirmDialog === "delete" ? "bg-red-600 hover:bg-red-700" : profile.isActive === false ? "bg-emerald-600" : "bg-amber-600 hover:bg-amber-700"}
            >
              {confirmLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmDialog === "delete" ? "حذف" : profile.isActive === false ? "تفعيل" : "تعطيل"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
