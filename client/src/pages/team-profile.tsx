import { useRef, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth, authFetch } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { ArrowRight, Shield, UserCircle, MessageSquare, CheckCircle, Loader2, Send, Circle, Camera, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
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

export default function TeamProfile() {
  const [, params] = useRoute("/team/:userId");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingJobTitle, setEditingJobTitle] = useState(false);
  const [jobTitleValue, setJobTitleValue] = useState("");

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
                  className="w-24 h-24 rounded-full object-cover border-2 border-white/10"
                />
              ) : (
                <div
                  data-testid="img-avatar-placeholder"
                  className={`w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white ${
                    profile.role === "admin"
                      ? "bg-gradient-to-br from-amber-400 to-amber-600"
                      : "bg-gradient-to-br from-blue-400 to-blue-600"
                  }`}
                >
                  {profile.name.charAt(0)}
                </div>
              )}
              <div
                data-testid="status-indicator"
                className={`absolute bottom-1 left-1 w-4 h-4 rounded-full border-2 border-[#111827] ${
                  isOnline ? "bg-emerald-500" : "bg-gray-500"
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
                    maxLength={100}
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
              <div className="flex items-center justify-center gap-2 mt-2">
                <Badge
                  variant="outline"
                  data-testid="badge-role"
                  className={`text-xs ${
                    profile.role === "admin"
                      ? "border-amber-500/30 text-amber-400"
                      : "border-blue-500/30 text-blue-400"
                  }`}
                >
                  {profile.role === "admin" ? (
                    <><Shield className="w-3 h-3 ml-1" />مدير</>
                  ) : (
                    <><UserCircle className="w-3 h-3 ml-1" />موظف</>
                  )}
                </Badge>
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

          {!isSelf && (
            <div className="mt-6">
              <Button
                data-testid="button-send-message"
                onClick={() => navigate("/")}
                className="w-full bg-emerald-600 text-white"
              >
                <Send className="w-4 h-4 ml-2" />
                مراسلة داخلية
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
