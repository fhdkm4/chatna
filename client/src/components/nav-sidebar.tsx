import { MessageSquare, Users, Brain, BarChart3, Settings, LogOut, UserCog, Activity, Megaphone, Package, Sparkles, Building2, MessagesSquare, Sun, Moon, Receipt } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/lib/theme";
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
  { id: "finance", icon: Receipt, label: "المالية", minRole: "manager" },
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
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="w-16 bg-sidebar border-l border-sidebar-border flex flex-col items-center py-2 shrink-0 h-full">
      <div className="mb-3 flex items-center justify-center shrink-0">
        <img
          src="/chatna-icon.png"
          alt="Chatna"
          className="h-8 w-auto object-contain"
          decoding="sync"
          data-testid="sidebar-logo"
        />
      </div>

      <nav className="flex-1 flex flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden min-h-0 py-1 scrollbar-hide">
        {visibleItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                data-testid={`nav-${item.id}`}
                onClick={() => onViewChange(item.id)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all shrink-0 ${
                  activeView === item.id
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <item.icon className="w-[18px] h-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="bg-popover text-popover-foreground border-popover-border">
              {item.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>

      <div className="flex flex-col items-center gap-1 pt-2 border-t border-sidebar-border mt-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="button-toggle-theme"
              onClick={toggleTheme}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-popover text-popover-foreground border-popover-border">
            {theme === "dark" ? "الوضع النهاري" : "الوضع الليلي"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white cursor-default" style={{ background: "linear-gradient(to bottom right, var(--primary-green), var(--primary-green-dark))" }}>
              {user.name.charAt(0)}
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-popover text-popover-foreground border-popover-border">
            {user.name}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              data-testid="button-logout"
              onClick={onLogout}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-popover text-popover-foreground border-popover-border">
            تسجيل الخروج
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
