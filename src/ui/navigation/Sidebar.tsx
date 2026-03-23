import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  Cog,
  Coins,
  LayoutDashboard,
  Sparkles,
  TrendingUp,
  Users,
  HardDrive,
  BellRing,
} from 'lucide-react';
import { cn } from '@/ui/utils/cn';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

const items = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/produtividade', label: 'Produtividade', icon: TrendingUp },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/casos', label: 'Casos', icon: Briefcase },
  { to: '/app/notificacoes', label: 'Notificacoes', icon: Bell },
  { to: '/app/publicacoes', label: 'PJe / Intimações', icon: BellRing },
  { to: '/app/agenda', label: 'Agenda', icon: Calendar },
  { to: '/app/tarefas', label: 'Tarefas', icon: CheckSquare },
  { to: '/app/financeiro', label: 'Financeiro', icon: Coins },
  { to: '/app/drive', label: 'Smart Drive', icon: HardDrive },
  { to: '/app/relatorios-ia', label: 'Relatórios com IA', icon: Sparkles },
  { to: '/portal', label: 'Portal do Cliente', icon: Building2 },
  { to: '/app/configuracoes', label: 'Configurações', icon: Cog },
];

export function Sidebar() {
  const [userName, setUserName] = useState<string>('Carregando...');
  
  useEffect(() => {
    (async () => {
      try {
        const sb = requireSupabase();
        const user = await getAuthedUser();
        
        const { data: profile } = await sb
          .from('user_profiles')
          .select('display_name, email')
          .eq('user_id', user.id)
          .maybeSingle();
          
        const name = profile?.display_name || profile?.email?.split('@')[0] || 'Usuário';
        setUserName(name);
      } catch {
        setUserName('Usuário');
      }
    })();
  }, []);

  return (
    <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-neutral-950/70 backdrop-blur-xl md:block">
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
          <BarChart3 className="h-5 w-5 text-amber-400" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white">CRM Jurídico</div>
          <div className="text-xs text-white/60">SaaS multi-tenant</div>
        </div>
      </div>

      <nav className="px-2 py-3">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/app'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-amber-400/10 text-white ring-1 ring-amber-400/20'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              )
            }
          >
            <it.icon className="h-4 w-4" />
            {it.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto p-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs font-semibold text-white">Usuário Logado</div>
          <div className="mt-1 text-sm text-white/80">{userName}</div>
          <div className="mt-2 text-[10px] uppercase font-bold text-amber-200/70 tracking-wider">Lima, Lopes & Diógenes</div>
        </div>
      </div>
    </aside>
  );
}
