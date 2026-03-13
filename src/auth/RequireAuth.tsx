import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '@/auth/authStore';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export function RequireAuth() {
  const auth = useAuth();
  const loc = useLocation();

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    // Keep user_profiles up to date (email is used for office invites)
    (async () => {
      try {
        const sb = requireSupabase();
        const user = await getAuthedUser();
        const email = (user as any)?.email || null;
        const display = (user as any)?.user_metadata?.full_name || (user as any)?.user_metadata?.name || null;

        await sb
          .from('user_profiles')
          .upsert({ user_id: user.id, email, display_name: display } as any, { onConflict: 'user_id' });
      } catch {
        // ignore
      }
    })();
  }, [auth.isAuthenticated]);

  if (!auth.isAuthenticated) {
    return <Navigate to="/app/login" replace state={{ from: loc.pathname }} />;
  }

  return <Outlet />;
}
