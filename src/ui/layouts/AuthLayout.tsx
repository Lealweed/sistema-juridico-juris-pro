import { Outlet } from 'react-router-dom';
import { BRAND } from '@/lib/brand';
import { getWorkspaceVisual } from '@/lib/workspaceVisual';

export default function AuthLayout() {
  const reference = getWorkspaceVisual() === 'reference';
  const logo = reference ? BRAND.logoLight : BRAND.logoDark;
  return (
    <div className={`${reference ? 'workspace-surface workspace-auth' : 'bg-neutral-950 text-neutral-100 app-bg-dark theme-dark'} min-h-dvh`}>
      <div className="mx-auto flex min-h-dvh max-w-[1100px] items-center px-4 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-2 lg:items-center">
          <div className="hidden lg:block">
            <img src={logo} alt={BRAND.fullName} className="mb-6 h-auto w-64 max-w-full object-contain" />
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
              <span className="size-1.5 rounded-full bg-amber-300" />
              {BRAND.fullName}
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight">CRM Jurídico</h1>
            <p className="mt-3 max-w-md text-sm text-white/70">
              Acesso interno para gestão de clientes, casos e rotina do escritório.
            </p>
            <div className="mt-8 grid gap-3">
              {[ 
                { t: 'Clientes', d: 'Cadastro e histórico centralizado.' },
                { t: 'Casos', d: 'Status, descrição e acompanhamento.' },
                { t: 'Segurança', d: 'Isolamento por organização (tenant).' },
              ].map((x) => (
                <div key={x.t} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white">{x.t}</div>
                  <div className="mt-1 text-sm text-white/70">{x.d}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <img src={logo} alt={BRAND.fullName} className="mx-auto mb-6 h-auto w-64 max-w-full object-contain lg:hidden" />
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
