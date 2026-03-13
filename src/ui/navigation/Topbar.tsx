import { Search, Bell, Moon, Sun, Menu, X, LayoutDashboard, Users, Briefcase, Calendar, CheckSquare, Coins, Sparkles, Building2, Cog, HardDrive, BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { useAuth } from '@/auth/authStore';
import { getStoredTheme, setTheme, type AppTheme } from '@/lib/theme';
import { cn } from '@/ui/utils/cn';

const mobileItems = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/clientes', label: 'Clientes', icon: Users },
  { to: '/app/casos', label: 'Casos', icon: Briefcase },
  { to: '/app/publicacoes', label: 'PJe / Intimações', icon: BellRing },
  { to: '/app/agenda', label: 'Agenda', icon: Calendar },
  { to: '/app/tarefas', label: 'Tarefas', icon: CheckSquare },
  { to: '/app/financeiro', label: 'Financeiro', icon: Coins },
  { to: '/app/drive', label: 'Smart Drive', icon: HardDrive },
  { to: '/app/relatorios-ia', label: 'Relatórios com IA', icon: Sparkles },
  { to: '/app/portal', label: 'Portal do Cliente', icon: Building2 },
  { to: '/app/configuracoes', label: 'Configurações', icon: Cog },
];

export function Topbar() {
  const auth = useAuth();
  const [theme, setThemeState] = useState<AppTheme>('dark');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  function onToggleTheme() {
    const next: AppTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-white/10 bg-neutral-950/80 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white md:hidden"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">Bem-vindo de volta</div>
              <div className="text-xs text-white/60">Visão geral do escritório</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white/80 sm:flex">
              <Search className="h-4 w-4" />
              <input
                className="w-64 bg-transparent text-sm outline-none placeholder:text-white/40"
                placeholder="Buscar cliente, processo, tarefa..."
                disabled
              />
            </div>
            <button
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Alternar tema claro/escuro"
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
              aria-label="Notificações"
            >
              <Bell className="h-4 w-4" />
            </button>

            {auth.isAuthenticated ? (
              <button
                onClick={() => void auth.signOut()}
                className="hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10 sm:block"
              >
                Sair
              </button>
            ) : null}

            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-300/30 to-white/5" />
          </div>
        </div>
      </header>

      {/* Mobile Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-sm" 
            onClick={() => setMenuOpen(false)}
          />
          <div className="relative flex w-64 flex-col bg-neutral-900 shadow-2xl">
            <div className="flex h-16 items-center justify-between px-4 border-b border-white/10">
              <span className="font-semibold text-white">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="text-white/60 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-4">
              {mobileItems.map((it) => (
                <NavLink
                  key={it.to}
                  to={it.to}
                  end={it.to === '/app'}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors',
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
              <div className="mt-4 border-t border-white/10 pt-4">
                <button
                  onClick={() => {
                    auth.signOut();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10"
                >
                  Sair do sistema
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
