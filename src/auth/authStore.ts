import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { clearOrgId, clearRole, clearTokens, getAccessToken, getOrgId, setOrgId } from '@/lib/apiClient';
import { getSession, onAuthStateChange, signOut as supaSignOut } from '@/auth/supabaseAuth';

type AuthState = {
  isAuthenticated: boolean;
  orgId: string | null;
  setOrgId: (orgId: string) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [orgIdState, setOrgIdState] = useState<string | null>(() => getOrgId());
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(getAccessToken()));

  useEffect(() => {
    let alive = true;

    (async () => {
      const session = await getSession();
      if (!alive) return;
      setIsAuthenticated(Boolean(session) || Boolean(getAccessToken()));
    })();

    const unsub = onAuthStateChange((session) => {
      const hasToken = Boolean(getAccessToken());
      setIsAuthenticated(Boolean(session) || hasToken);
      if (!session && !hasToken) {
        clearOrgId();
        setOrgIdState(null);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, []);

  const value = useMemo<AuthState>(() => {
    return {
      isAuthenticated,
      orgId: orgIdState,
      setOrgId: (orgId: string) => {
        setOrgId(orgId);
        setOrgIdState(orgId);
      },
      signOut: async () => {
        await supaSignOut();
        clearTokens();
        clearOrgId();
        clearRole();
        setOrgIdState(null);
        setIsAuthenticated(false);
      },
    };
  }, [isAuthenticated, orgIdState]);

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
