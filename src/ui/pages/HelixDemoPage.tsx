import { Suspense, lazy } from 'react';
import { BRAND } from '@/lib/brand';

const Hero = lazy(() => import('@/components/ui/helix-hero').then((m) => ({ default: m.Hero })));

export function HelixDemoPage() {
  return (
    <Suspense
      fallback={
        <section className="app-bg-dark min-h-[70vh] rounded-3xl border border-white/10 bg-white/5 p-8 text-white/70">
          Carregando demo visual…
        </section>
      }
    >
      <Hero
        title={BRAND.fullName}
        description="CRM jurídico premium para clientes, casos, tarefas, agenda e documentos — com visual moderno e estável no celular."
      />
    </Suspense>
  );
}
