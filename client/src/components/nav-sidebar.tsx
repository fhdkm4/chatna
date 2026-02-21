import { MessageSquare, Users, Brain, BarChart3, Settings, LogOut } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ActiveView } from "@/pages/dashboard";

interface NavSidebarProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  user: { name: string; role: string };
  onLogout: () => void;
}

const navItems: { id: ActiveView; icon: typeof MessageSquare; label: string }[] = [
  { id: "chat", icon: MessageSquare, label: "المحادثات" },
  { id: "contacts", icon: Users, label: "جهات الاتصال" },
  { id: "ai", icon: Brain, label: "قاعدة المعرفة" },
  { id: "analytics", icon: BarChart3, label: "الإحصائيات" },
  { id: "settings", icon: Settings, label: "الإعدادات" },
];

export function NavSidebar({ activeView, onViewChange, user, onLogout }: NavSidebarProps) {
  return (
    <div className="w-16 bg-[#0d1321] border-l border-white/5 flex flex-col items-center py-4 shrink-0">
      <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-8">
        <SiWhatsapp className="w-5 h-5 text-emerald-400" />
      </div>

      <nav className="flex-1 flex flex-col items-center gap-1">
        {navItems.map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <button
                data-testid={`nav-${item.id}`}
                onClick={() => onViewChange(item.id)}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                  activeView === item.id
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                }`}
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
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-xs font-bold text-white">
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
