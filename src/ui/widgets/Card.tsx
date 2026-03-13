import { cn } from '@/ui/utils/cn';

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-white/10 bg-neutral-950/45 p-4 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-5 transition-all duration-300 hover:shadow-[0_20px_80px_rgba(37,99,235,0.15)] hover:-translate-y-1',
        className
      )}
    >
      {children}
    </section>
  );
}
