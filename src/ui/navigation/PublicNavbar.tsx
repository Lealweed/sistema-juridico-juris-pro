import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { ShimmerButton } from '@/ui/primitives/ShimmerButton';

const navItems = [
  { to: '/#areas', label: 'Áreas de atuação' },
  { to: '/#escritorio', label: 'O escritório' },
  { to: '/#equipe', label: 'Equipe' },
  { to: '/#contato', label: 'Contato' },
];

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-5 w-6">
      <span
        className={[
          'absolute left-0 top-0 h-[2px] w-6 rounded bg-white transition',
          open ? 'translate-y-[9px] rotate-45' : '',
        ].join(' ')}
      />
      <span
        className={[
          'absolute left-0 top-[9px] h-[2px] w-6 rounded bg-white transition',
          open ? 'opacity-0' : 'opacity-100',
        ].join(' ')}
      />
      <span
        className={[
          'absolute left-0 top-[18px] h-[2px] w-6 rounded bg-white transition',
          open ? '-translate-y-[9px] -rotate-45' : '',
        ].join(' ')}
      />
    </span>
  );
}

export function PublicNavbar() {
  const [open, setOpen] = useState(false);

  // ESC fecha o menu
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Trava scroll do body quando o menu está aberto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-brand-gold/10 bg-brand-black/95 backdrop-blur-xl supports-[backdrop-filter]:bg-brand-black/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <div className="grid size-10 place-items-center overflow-hidden rounded-xl border border-brand-gold/20 bg-brand-black">
            <img
              src="/brand/logo.jpg"
              alt="Lima, Lopes & Diógenes Advocacia"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-white">Lima, Lopes & Diógenes</div>
            <div className="text-xs text-brand-gold/70">Advocacia</div>
          </div>
        </Link>

        {/* Desktop */}
        <nav className="hidden items-center gap-5 md:flex">
          {navItems.map((item) => (
            <a key={item.label} href={item.to} className="text-sm text-neutral-400 transition hover:text-brand-gold">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden items-center gap-2 rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-black transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/20 md:inline-flex"
          >
            Área do Advogado
          </Link>

          <a href="#contato" className="hidden md:block">
            <ShimmerButton className="!border-brand-gold/20 !bg-brand-gold/10 !text-brand-gold hover:!bg-brand-gold/20">Falar no WhatsApp</ShimmerButton>
          </a>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-brand-gold/20 bg-brand-gold/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-gold/20 md:hidden"
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open ? (
        <div className="md:hidden">
          <button
            aria-label="Fechar menu"
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-0 top-0 z-50 h-dvh w-[86vw] max-w-sm border-l border-brand-gold/10 bg-brand-black p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Menu</div>
              <button
                type="button"
                className="rounded-lg border border-brand-gold/20 bg-brand-gold/10 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-2">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.to}
                  className="rounded-xl border border-brand-gold/10 bg-brand-gold/5 px-4 py-3 text-sm font-semibold text-white"
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="mt-6 grid gap-3">
              <a href="#contato" onClick={() => setOpen(false)}>
                <ShimmerButton className="w-full !border-brand-gold/20 !bg-brand-gold/10 !text-brand-gold">Falar no WhatsApp</ShimmerButton>
              </a>
              <Link
                to="/login"
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-gold px-4 py-3 text-sm font-bold text-brand-black"
                onClick={() => setOpen(false)}
              >
                Área do Advogado
              </Link>
            </div>

            <div className="mt-8 text-xs text-neutral-500">
              Site institucional e informativo.
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
