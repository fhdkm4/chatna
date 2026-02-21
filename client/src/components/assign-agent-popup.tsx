import { useState, useEffect } from "react";
import { UserCircle, X, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/auth";

interface Agent {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AssignAgentPopupProps {
  conversationId: string;
  currentAgentId: string | null;
  onAssign: (agentId: string | null) => void;
  onClose: () => void;
}

export function AssignAgentPopup({ conversationId, currentAgentId, onAssign, onClose }: AssignAgentPopupProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const res = await authFetch("/api/team");
        if (res.ok) setAgents(await res.json());
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchAgents();
  }, []);

  return (
    <div className="absolute top-full left-0 mt-1 w-56 bg-[#111827] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs text-gray-400">تعيين لموظف</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
          <X className="w-3 h-3" />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        </div>
      ) : (
        <div className="max-h-48 overflow-y-auto">
          {currentAgentId && (
            <button
              data-testid="button-unassign"
              onClick={() => onAssign(null)}
              className="w-full px-3 py-2 text-right text-xs text-amber-400 hover:bg-white/5 transition-colors border-b border-white/5"
            >
              إلغاء التعيين
            </button>
          )}
          {agents.map((agent) => (
            <button
              key={agent.id}
              data-testid={`button-assign-${agent.id}`}
              onClick={() => onAssign(agent.id)}
              className={`w-full px-3 py-2 flex items-center gap-2 text-right hover:bg-white/5 transition-colors ${
                currentAgentId === agent.id ? "bg-emerald-500/10" : ""
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {agent.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-xs text-white truncate">{agent.name}</p>
                <p className="text-[10px] text-gray-500 truncate">{agent.role === "admin" ? "مدير" : "موظف"}</p>
              </div>
              {currentAgentId === agent.id && (
                <span className="text-[9px] text-emerald-400">معيّن</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
