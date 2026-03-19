import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabaseClient";
import { setAuthToken } from "@/lib/authToken";
import { config } from "@/lib/config";

interface AuthProfile {
  id: string;
  role: "admin" | "client" | string;
  display_name?: string | null;
}

interface AuthContextValue {
  loading: boolean;
  user: { id: string; email?: string | null } | null;
  profile: AuthProfile | null;
  clientIds: string[];
  clients: Array<{ id: string; name: string }>;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string } | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(token: string) {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/api/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error("Failed to load profile");
  }

  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);

  const loadProfile = async (token: string) => {
    const data = await fetchProfile(token);
    setUser(data.user || null);
    setProfile(data.profile || null);
    setClientIds(data.clientIds || []);
    setClients(data.clients || []);
  };

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      if (session?.access_token) {
        setAuthToken(session.access_token);
        try {
          await loadProfile(session.access_token);
        } catch (err) {
          console.warn(err);
        }
      } else {
        setAuthToken(null);
        setUser(null);
        setProfile(null);
        setClientIds([]);
        setClients([]);
      }

      if (mounted) setLoading(false);
    };

    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.access_token) {
        setAuthToken(session.access_token);
        try {
          await loadProfile(session.access_token);
        } catch (err) {
          console.warn(err);
        }
      } else {
        setAuthToken(null);
        setUser(null);
        setProfile(null);
        setClientIds([]);
        setClients([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) {
      await loadProfile(data.session.access_token);
    }
  };

  const value: AuthContextValue = {
    loading,
    user,
    profile,
    clientIds,
    clients,
    isAdmin: profile?.role === "admin",
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
