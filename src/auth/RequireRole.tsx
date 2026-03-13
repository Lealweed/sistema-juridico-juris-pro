import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { requireRole } from '@/lib/roles';

export function RequireRole({ allowed }: { allowed: string[] }) {
  const loc = useLocation();
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const yes = await requireRole(allowed);
      if (!alive) return;

      // Temporary fail-open for authenticated JWT users on finance/admin routes
      // while role sources are being stabilized across environments.
      // if (!yes) {
      //   const hasJwt = Boolean(getAccessToken());
      //   const isFinanceGuard = allowed.includes('admin') || allowed.includes('finance');
      //   if (hasJwt && isFinanceGuard) {
      //     setOk(true);
      //     return;
      //   }
      // }

      setOk(yes);
    })();

    return () => {
      alive = false;
    };
  }, [allowed.join('|')]);

  if (ok === null) {
    return <div className="p-4 text-sm text-white/70">Verificando permissões…</div>;
  }

  if (!ok) {
    return <Navigate to="/app" replace state={{ from: loc.pathname }} />;
  }

  return <Outlet />;
}
