import { create } from "zustand";

interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

const stored = typeof window !== "undefined" ? localStorage.getItem("jawab_auth") : null;
const parsed = stored ? JSON.parse(stored) : { user: null, token: null };

export const useAuth = create<AuthState>((set, get) => ({
  user: parsed.user,
  token: parsed.token,
  setAuth: (user, token) => {
    localStorage.setItem("jawab_auth", JSON.stringify({ user, token }));
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem("jawab_auth");
    set({ user: null, token: null });
  },
  isAuthenticated: () => !!get().token,
}));

export function getAuthHeaders(): HeadersInit {
  const token = useAuth.getState().token;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...getAuthHeaders(), ...options.headers };
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    useAuth.getState().logout();
    window.location.href = "/login";
  }
  return res;
}
