import { MessageSquare, Users, Brain, BarChart3, Settings, LogOut, UserCog, Activity, Megaphone, Package, Sparkles, Building2, MessagesSquare } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActiveView } from "@/pages/dashboard";

interface NavSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  user: { name: string; role: string };
  onLogout: () => void;
}

const navItems: { id: ActiveView; icon: typeof MessageSquare; label: string; minRole?: "admin" | "manager" }[] = [
  { id: "chat", icon: MessageSquare, label: "المحادثات" },
  { id: "contacts", icon: Users, label: "جهات الاتصال" },
  { id: "campaigns", icon: Megaphone, label: "الحملات التسويقية", minRole: "manager" },
  { id: "catalog", icon: Package, label: "كتالوج المنتجات" },
  { id: "team-chat", icon: MessagesSquare, label: "محادثات الفريق" },
  { id: "ai", icon: Brain, label: "قاعدة المعرفة" },
  { id: "ai-settings", icon: Sparkles, label: "إعدادات الذكاء الاصطناعي", minRole: "admin" },
  { id: "company-identity", icon: Building2, label: "هوية الشركة", minRole: "admin" },
  { id: "analytics", icon: BarChart3, label: "الإحصائيات" },
  { id: "team", icon: UserCog, label: "إدارة الفريق", minRole: "manager" },
  { id: "monitoring", icon: Activity, label: "مراقبة الفريق", minRole: "manager" },
  { id: "settings", icon: Settings, label: "الإعدادات", minRole: "admin" },
];

function hasMinRole(userRole: string, minRole: "admin" | "manager"): boolean {
  if (minRole === "admin") return userRole === "admin";
  if (minRole === "manager") return userRole === "admin" || userRole === "manager";
  return true;
}

export function NavSidebar({ activeView, onViewChange, user, onLogout }: NavSidebarProps) {
  const visibleItems = navItems.filter(item => !item.minRole || hasMinRole(user.role, item.minRole));

  return (
    <div className="w-16 bg-[#0d1321] border-l border-white/5 flex flex-col items-center py-4 shrink-0">
      <div className="mb-8 flex items-center justify-center">
        <img
          src="/chatna-logo.png"
          alt="Chatna"
          style={{
            height: "54px",
            width: "auto",
            objectFit: "contain",
            maxWidth: "52px",
            background: "transparent",
          }}
          decoding="sync"
          data-testid="sidebar-logo"
        />
      </div>

      <nav className="flex-1 flex flex-col items-center gap-1">
        {visibleItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                data-testid={`nav-${item.id}`}
                onClick={() => onViewChange(item.id)}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-all"
                style={activeView === item.id
                  ? { backgroundColor: "rgba(110, 192, 71, 0.2)", color: "#6EC047" }
                  : { color: "#6b7280" }
                }
                onMouseEnter={(e) => { if (activeView !== item.id) { e.currentTarget.style.color = "#d1d5db"; e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)"; }}}
                onMouseLeave={(e) => { if (activeView !== item.id) { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.backgroundColor = "transparent"; }}}
              >
                <item.icon className="w-5 h-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="bg-[#1a2235] text-white border-white/10">
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "linear-gradient(to bottom right, var(--primary-green), var(--primary-green-dark))" }}>
              {user.name.charAt(0)}
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-[#1a2235] text-white border-white/10">
            {user.name}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="button-logout"
              onClick={onLogout}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-[#1a2235] text-white border-white/10">
            تسجيل الخروج
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
