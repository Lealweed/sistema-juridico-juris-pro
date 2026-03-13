import { type ButtonHTMLAttributes } from 'react';

import { cn } from '@/ui/utils/cn';

type Props = ButtonHTMLAttributes<HTMLButtonElement>;

// Botão simples com brilho discreto (sem dependências).
export function ShimmerButton({ className, children, ...props }: Props) {
  return (
    <button
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-neutral-950 shadow-sm transition hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbfaf7]',
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute inset-0 opacity-70">
        <span className="absolute -inset-x-10 -top-10 h-20 rotate-12 bg-gradient-to-r from-transparent via-white/30 to-transparent blur-md" />
      </span>
      <span className="relative">{children}</span>
    </button>
  );
}
