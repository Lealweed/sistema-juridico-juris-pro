import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '@/auth/authStore';

const DEFAULT_ORG_ID = '47669bf5-24b9-43b1-8cd3-fe7abf918c48';

export function OrgSelectPage() {
  const nav = useNavigate();
  const auth = useAuth();

  const [orgId, setOrgIdState] = useState(auth.orgId || DEFAULT_ORG_ID);
  const canContinue = useMemo(() => Boolean(orgId), [orgId]);

  function onContinue() {
    if (!orgId) return;
    auth.setOrgId(orgId);
    nav('/app');
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-xl font-semibold">Selecionar organização</div>
        <div className="mt-1 text-sm text-white/60">
          No momento, o backend ainda não lista organizações. Use o Org ID manual (vamos automatizar isso na FASE 5).
        </div>

        <div className="mt-6 grid gap-3">
          <label className="text-sm text-white/80">
            Org ID (UUID)
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none"
              value={orgId}
              onChange={(e) => setOrgIdState(e.target.value.trim())}
              placeholder={DEFAULT_ORG_ID}
            />
          </label>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/70">
            Para teste, você pode usar este Org ID padrão: <span className="text-white">{DEFAULT_ORG_ID}</span>
          </div>

          <button
            disabled={!canContinue}
            onClick={onContinue}
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-white/90 disabled:opacity-60"
          >
            Continuar
          </button>

          <button
            onClick={() => auth.signOut()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
