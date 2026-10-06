import { BRAND } from '@/lib/brand';

export function PublicFooter() {
  return (
    <footer className="border-t border-brand-gold/10 bg-brand-black">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-lg font-serif text-white">{BRAND.name}</div>
            <div className="mt-1 text-sm text-brand-gold/80">{BRAND.tagline}</div>
            <div className="mt-4 text-xs text-neutral-500 leading-relaxed">
              Site institucional e informativo. Atendimento mediante análise do caso concreto.
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-white mb-3">Contato</div>
            <div className="legacy-space-y-2 text-sm text-neutral-400">
              <a href="mailto:advkarolldiogenes@gmail.com" className="block hover:text-brand-gold transition-colors">advkarolldiogenes@gmail.com</a>
              <a href="https://wa.me/5594984233181" target="_blank" rel="noreferrer" className="block hover:text-brand-gold transition-colors">(94) 98423-3181</a>
              <a href={BRAND.websiteUrl} className="block hover:text-brand-gold transition-colors">{new URL(BRAND.websiteUrl).hostname}</a>
            </div>
          </div>

          <div>
            <div className="text-sm font-semibold text-white mb-3">Endereço</div>
            <div className="text-sm text-neutral-400 leading-relaxed">
              Rua 06, Número 44 - Cidade Nova<br />
              Parauapebas - PA, 68515-000
            </div>
            <div className="mt-3 text-sm text-neutral-500">Seg - Sex: 8h às 18h</div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/5 pt-6 text-xs text-neutral-600 text-center">
          © {new Date().getFullYear()} {BRAND.fullName}. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
