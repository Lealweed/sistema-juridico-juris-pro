import { BRAND } from '@/lib/brand';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import {
  Bell, Briefcase, Building2, Calendar, CheckSquare, Cog, Coins,
  LayoutDashboard, Sparkles, TrendingUp, Users, HardDrive, BellRing,
  ClipboardList, ReceiptText, FileText, ClipboardCheck, Handshake,
} from 'lucide-react';
import { cn } from '@/ui/utils/cn';
import { getMyOfficeRole } from '@/lib/roles';

type SidebarItem = { to: string; label: string; icon: LucideIcon; adminOnly?: boolean };
const items: SidebarItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/triagem', label: 'Triagem / Leads', icon: ClipboardList },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/casos', label: 'Casos / Processos', icon: Briefcase },
  { to: '/app/agenda', label: 'Agenda', icon: Calendar },
  { to: '/app/tarefas', label: 'Tarefas e prazos', icon: CheckSquare },
  { to: '/app/financeiro', label: 'Financeiro', icon: Coins, adminOnly: true },
  { to: '/app/financeiro/parceiros', label: 'Parcerias', icon: Handshake, adminOnly: true },
  { to: '/app/recibos', label: 'Recibos', icon: ReceiptText },
  { to: '/app/documentos/gerar', label: 'Gerar documentos', icon: FileText },
  { to: '/app/drive', label: 'Smart Drive', icon: HardDrive },
  { to: '/app/notificacoes', label: 'Notificações', icon: Bell },
  { to: '/app/publicacoes', label: 'PJe / Intimações', icon: BellRing },
  { to: '/app/produtividade', label: 'Produtividade', icon: TrendingUp },
  { to: '/app/relatorios-ia', label: 'Relatórios com IA', icon: Sparkles },
  { to: '/app/relatorio-atividades', label: 'Meu relatório diário', icon: ClipboardList },
  { to: '/app/relatorios-equipe', label: 'Relatórios da equipe', icon: ClipboardCheck, adminOnly: true },
  { to: '/portal', label: 'Portal do cliente', icon: Building2 },
  { to: '/app/configuracoes', label: 'Configurações', icon: Cog },
];

export function Sidebar() {
  const [myRole, setMyRole] = useState('');
  const isAdmin = ['admin', 'owner', 'administrator'].includes(myRole);
  const visibleItems = items.filter((item) => item.to.startsWith('/app/financeiro')
    ? isAdmin
    : !item.adminOnly || isAdmin);

  useEffect(() => {
    let alive = true;
    void getMyOfficeRole().then((role) => { if (alive) setMyRole(role || ''); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  return (
    <aside className="workspace-sidebar sticky top-0 hidden h-dvh w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#0d1418] text-white md:flex xl:w-[260px]">
      <NavLink to="/app" className="flex h-[108px] shrink-0 items-center px-6" aria-label={`${BRAND.name}, dashboard`}>
        <img src={BRAND.logoDark} alt={BRAND.fullName} className="max-h-[84px] w-full object-contain" />
      </NavLink>
      <nav className="flex-1 legacy-space-y-1 overflow-y-auto px-2 pb-4" aria-label="Navegação principal">
        {visibleItems.map((it) => (
          <NavLink
            key={it.to} to={it.to} end={it.to === '/app' || it.to === '/app/financeiro'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 rounded-md px-4 py-2.5 text-[13px] font-medium transition-colors',
              isActive ? 'bg-[#b49a68] text-white' : 'text-[#d3d7d9] hover:bg-white/5 hover:text-white',
            )}
          >
            <it.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="mx-5 shrink-0 border-t border-white/10 py-4 text-xs leading-relaxed text-white/50">
        <div className="font-medium text-white/80">{BRAND.name}</div>
        Gestão do escritório
      </div>
    </aside>
  );
}
