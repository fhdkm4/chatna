import { useState, useEffect, useCallback } from "react";
import { Plus, Users, Trash2, Shield, UserCircle, Loader2 } from "lucide-react";
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
  createdAt: string;
}

interface TeamManagementProps {
  onlineAgents?: Set<string>;
}

export function TeamManagement({ onlineAgents = new Set() }: TeamManagementProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
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

  useEffect(() => { fetchTeam(); }, [fetchTeam]);

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
            {members.map((member) => (
              <div
                key={member.id}
                data-testid={`team-member-${member.id}`}
                className="bg-[#111827]/50 border border-white/5 rounded-lg p-4 flex items-center justify-between group"
              >
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
                    <div className="flex items-center gap-2">
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
                    <span className="text-xs text-gray-500">{member.email}</span>
                  </div>
                </div>
                {member.role !== "admin" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    data-testid={`button-delete-agent-${member.id}`}
                    onClick={() => handleDelete(member.id, member.name)}
                    className="w-8 h-8 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
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
    </div>
  );
}
