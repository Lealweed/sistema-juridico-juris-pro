import {
  Bell, BellRing, Briefcase, Building2, Calendar, CheckSquare, Coins, Cog,
  HardDrive, LayoutDashboard, Menu, Search, Sparkles, TrendingUp, Users, X,
  ReceiptText, FileText, ClipboardList, ChevronDown, LogOut, Handshake,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/authStore';
import { BRAND } from '@/lib/brand';
import { getMyOfficeRole } from '@/lib/roles';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { WorkspaceVisualSwitcher } from '@/ui/components/WorkspaceVisualSwitcher';
import { NotificationsBell } from '@/ui/components/NotificationsBell';
import { cn } from '@/ui/utils/cn';

const mobileItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/triagem', label: 'Triagem / Leads', icon: ClipboardList },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/casos', label: 'Casos / Processos', icon: Briefcase },
  { to: '/app/agenda', label: 'Agenda', icon: Calendar },
  { to: '/app/tarefas', label: 'Tarefas e prazos', icon: CheckSquare },
  { to: '/app/financeiro/parceiros', label: 'Parcerias', icon: Handshake, adminOnly: true },
  { to: '/app/recibos', label: 'Recibos', icon: ReceiptText },
  { to: '/app/documentos/gerar', label: 'Gerar documentos', icon: FileText },
  { to: '/app/financeiro', label: 'Financeiro', icon: Coins, adminOnly: true },
  { to: '/app/drive', label: 'Smart Drive', icon: HardDrive },
  { to: '/app/notificacoes', label: 'Notificações', icon: Bell },
  { to: '/app/publicacoes', label: 'PJe / Intimações', icon: BellRing },
  { to: '/app/produtividade', label: 'Produtividade', icon: TrendingUp },
  { to: '/app/relatorios-ia', label: 'Relatórios com IA', icon: Sparkles },
  { to: '/app/relatorio-atividades', label: 'Meu relatório diário', icon: ClipboardList },
  { to: '/app/relatorios-equipe', label: 'Relatórios da equipe', icon: Users, adminOnly: true },
  { to: '/portal', label: 'Portal do cliente', icon: Building2 },
  { to: '/app/configuracoes', label: 'Configurações', icon: Cog },
];

export function Topbar() {
  const auth = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [myRole, setMyRole] = useState('');
  const [userName, setUserName] = useState('Usuário');
  const isAdmin = ['admin', 'owner', 'administrator'].includes(myRole);
  const visibleMobileItems = useMemo(() => mobileItems.filter((item) => item.to.startsWith('/app/financeiro')
    ? isAdmin
    : !item.adminOnly || isAdmin), [isAdmin]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const role = await getMyOfficeRole().catch(() => '');
      if (alive) setMyRole(role || '');
      try {
        const user = await getAuthedUser();
        const { data } = await requireSupabase().from('user_profiles').select('display_name,email').eq('user_id', user.id).maybeSingle();
        if (alive) setUserName(data?.display_name || data?.email?.split('@')[0] || 'Usuário');
      } catch { /* Keep a neutral label when the profile is unavailable. */ }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!menuOpen && !profileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); setProfileOpen(false); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, profileOpen]);

  const initials = userName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const currentLabel = mobileItems.find((item) => item.to !== '/app' && location.pathname.startsWith(item.to))?.label || 'Dashboard';

  return (
    <>
      <header className="workspace-surface workspace-topbar sticky top-0 z-20 border-b border-[#e5e5e2] bg-white/95">
        <div className="flex h-[68px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMenuOpen(true)} className="rounded-md border border-[#deded8] p-2 text-[#253037] md:hidden" aria-label="Abrir menu">
              <Menu className="h-5 w-5" />
            </button>
            <span className="truncate text-sm font-semibold text-[#253037] sm:hidden">{currentLabel}</span>
            <Link to="/app/clientes" className="hidden w-[min(34vw,440px)] items-center gap-3 rounded-md border border-[#deded8] bg-[#fafafa] px-3 py-2.5 text-sm text-[#717778] sm:flex" aria-label="Abrir busca de clientes">
              <Search className="h-4 w-4 shrink-0" />
              <span>Buscar clientes no cadastro...</span>
            </Link>
          </div>
          <div className="flex min-w-0 items-center gap-3 sm:gap-5">
            <WorkspaceVisualSwitcher />
            {auth.isAuthenticated ? <NotificationsBell /> : null}
            <div className="relative">
              <button type="button" onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen} aria-label="Abrir menu do usuário" className="flex max-w-[210px] items-center gap-2 text-left sm:gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f0e9db] text-xs font-bold text-[#80673b]">{initials}</span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block truncate text-sm font-semibold text-[#172026]">{userName}</span>
                  <span className="block text-xs text-[#787c80]">{myRole ? (isAdmin ? 'Administração' : 'Equipe') : 'Escritório'}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-[#5c6469]" />
              </button>
              {profileOpen ? <div className="absolute right-0 top-[calc(100%+16px)] z-50 w-52 rounded-lg border border-[#deded8] bg-white p-2 shadow-lg">
                <div className="truncate px-3 py-2 text-xs font-semibold text-[#172026] sm:hidden">{userName}</div>
                <Link to="/app/configuracoes" onClick={() => setProfileOpen(false)} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#253037] hover:bg-[#f4f4f1]"><Cog className="size-4" />Configurações</Link>
                {auth.isAuthenticated ? <button type="button" onClick={() => { void auth.signOut(); setProfileOpen(false); }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-[#253037] hover:bg-[#f4f4f1]"><LogOut className="size-4" />Sair do sistema</button> : null}
              </div> : null}
            </div>
          </div>
        </div>
      </header>
      {menuOpen ? (
        <div className="workspace-navigation-dark fixed inset-0 z-50 flex md:hidden">
          <button className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-label="Fechar menu" />
          <div className="relative flex h-dvh w-[280px] max-w-[85vw] flex-col bg-[#0d1418] text-white shadow-2xl" role="dialog" aria-modal="true" aria-label="Navegação">
            <div className="flex h-[100px] shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5">
              <img src={BRAND.logoDark} alt={BRAND.name} className="h-16 min-w-0 flex-1 object-contain" />
              <button type="button" onClick={() => setMenuOpen(false)} className="p-1 text-white/70 hover:text-white" aria-label="Fechar navegação"><X className="size-5" /></button>
            </div>
            <nav className="flex-1 legacy-space-y-1 overflow-y-auto px-2 py-4" aria-label="Navegação móvel">
              {visibleMobileItems.map((it) => <NavLink key={it.to} to={it.to} end={it.to === '/app' || it.to === '/app/financeiro'} onClick={() => setMenuOpen(false)} className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium', isActive ? 'bg-[#b49a68] text-white' : 'text-white/75 hover:bg-white/5 hover:text-white')}><it.icon className="size-[18px]" strokeWidth={1.6} />{it.label}</NavLink>)}
              <button type="button" onClick={() => { void auth.signOut(); setMenuOpen(false); }} className="mt-4 flex w-full items-center gap-3 border-t border-white/10 px-4 py-4 text-sm text-white/75"><LogOut className="size-4" />Sair do sistema</button>
            </nav>
          </div>
        </div>
      ) : null}
    </>
  );
}
