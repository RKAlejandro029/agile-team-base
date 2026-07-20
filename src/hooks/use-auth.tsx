import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "consultant" | "ceo";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  // Display-priority role: ceo > admin > consultant. Good for showing a label,
  // but NOT for gating admin-level capability — use isAdmin for that, since a
  // CEO should get everything an admin gets, plus more.
  role: AppRole | null;
  // True for both plain admins and the CEO. Use this for "admin-view" gating
  // (approving leave, seeing all tickets/consultants, the Team page, etc).
  isAdmin: boolean;
  // True only for the literal CEO. Use this for CEO-exclusive behavior
  // (History/Reports tabs, exemption from clocking in/filing leave, granting admin).
  isCeo: boolean;
  // Which sidebar tabs this person has been granted, e.g. ["dashboard","time","calendar"].
  // CEO customizes this per-person from the Team page. Role-gated tabs (Team,
  // History, Reports) still require isAdmin/isCeo on top of this — allowedTabs
  // only controls the everyday tabs, it's not a way to grant admin-level pages.
  allowedTabs: string[];
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEFAULT_TABS = ["dashboard", "time", "leave", "messages", "email", "calendar", "tickets"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isCeo, setIsCeo] = useState(false);
  const [allowedTabs, setAllowedTabs] = useState<string[]>(DEFAULT_TABS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => fetchRole(s.user.id), 0);
      } else {
        setRole(null);
        setIsAdmin(false);
        setIsCeo(false);
        setAllowedTabs(DEFAULT_TABS);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        fetchRole(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function fetchRole(userId: string) {
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .order("role", { ascending: true }),
      supabase.from("profiles").select("allowed_tabs").eq("id", userId).maybeSingle(),
    ]);
    const roles = (roleRows ?? []).map((r) => r.role as AppRole);
    const ceo = roles.includes("ceo");
    const admin = roles.includes("admin");
    setIsCeo(ceo);
    setIsAdmin(admin || ceo);
    setRole(ceo ? "ceo" : admin ? "admin" : (roles[0] ?? "consultant"));
    setAllowedTabs(profile?.allowed_tabs ?? DEFAULT_TABS);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        role,
        isAdmin,
        isCeo,
        allowedTabs,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
