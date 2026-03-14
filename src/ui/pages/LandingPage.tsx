import { Link } from 'react-router-dom';

import { LeadForm } from '@/ui/widgets/LeadForm';

function SectionTitle({ kicker, title, desc }: { kicker: string; title: string; desc: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold">{kicker}</div>
      <div className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-gold to-transparent opacity-50" />
      <h2 className="mt-6 text-3xl font-light tracking-tight text-neutral-900 md:text-5xl font-serif">{title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-neutral-600 md:text-lg">{desc}</p>
    </div>
  );
}

const areas = [
  {
    title: 'Direito Civil e Contratos',
    items: ['Elaboração e Revisão de Contratos', 'Responsabilidade Civil', 'Recuperação de Crédito e Execuções'],
  },
  {
    title: 'Direito Empresarial',
    items: ['Societário e M&A', 'Blindagem Patrimonial', 'Compliance e LGPD'],
  },
  {
    title: 'Direito Trabalhista Patronal',
    items: ['Auditoria e Prevenção de Passivos', 'Defesa em Reclamações Trabalhistas', 'Negociações Coletivas'],
  },
  {
    title: 'Direito Imobiliário',
    items: ['Due Diligence Imobiliária', 'Regularização de Imóveis', 'Usucapião e Desapropriação'],
  },
  {
    title: 'Direito Tributário',
    items: ['Planejamento Tributário', 'Defesas Fiscais e Administrativas', 'Recuperação de Tributos'],
  },
];

const team = [
  {
    name: 'Dr. Lima',
    role: 'Sócio Fundador',
    oab: 'OAB/PA',
    bio: 'Especialista em Direito Empresarial com ampla atuação em M&A e estruturação societária.',
  },
  {
    name: 'Dra. Lopes',
    role: 'Sócia Diretora',
    oab: 'OAB/PA',
    bio: 'Foco em resolução de conflitos complexos, contencioso cível e contratos de alto valor agregado.',
  },
  {
    name: 'Dr. Diógenes',
    role: 'Sócio Diretor',
    oab: 'OAB/PA',
    bio: 'Mestre em Direito Tributário. Lidera a área fiscal com estratégias focadas em redução de passivo.',
  },
];

const address = {
  line1: 'Rua 06, Número 44 - Cidade Nova',
  line2: 'Parauapebas - PA, 68515-000',
};

const mapsUrl = 'https://www.google.com/maps';

const whatsappE164 = '5594984233181';
const whatsappDisplay = '(94) 98423-3181';

const testimonials = [
  { name: 'Ricardo P.', initials: 'RP', text: 'Profissionalismo impecável. Conduziram meu caso com total transparência e resolveram em tempo recorde. Recomendo de olhos fechados.', rating: 5 },
  { name: 'Juliana S.', initials: 'JS', text: 'Escritório extremamente organizado. O portal exclusivo para clientes me deu muita paz de espírito, conseguia acompanhar tudo pelo celular.', rating: 5 },
  { name: 'Empresa A. C.', initials: 'EA', text: 'A assessoria empresarial deles mudou a forma como fechamos contratos. Assertivos, diretos e sem juridiquês.', rating: 5 },
  { name: 'Marcos V.', initials: 'MV', text: 'Tive um problema trabalhista complexo e fui muito bem orientado. Eles focam na melhor estratégia sem falsas promessas.', rating: 5 },
  { name: 'Fernanda L.', initials: 'FL', text: 'Excelente atendimento desde a recepção até a advogada especialista. Muito respeito e ética profissional no trato com o cliente.', rating: 5 },
  { name: 'Carlos A.', initials: 'CA', text: 'Equipe sempre disponível e ágil. Ter os andamentos do tribunal atualizados na plataforma deles faz toda a diferença.', rating: 5 },
];

export function LandingPage() {
  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden bg-brand-black">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(212,175,55,0.12),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(212,175,55,0.06),transparent_60%)]" />
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-gold/30 to-transparent" />

        <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-24 md:pb-36 md:pt-40">
          <div className="grid gap-16 md:grid-cols-2 md:items-center">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-3 rounded-full border border-brand-gold/20 bg-brand-gold/5 px-4 py-1.5 text-xs font-medium text-brand-gold/90 backdrop-blur-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-gold opacity-50"></span>
                  <span className="relative inline-flex size-2 rounded-full bg-brand-gold"></span>
                </span>
                Belém — Pará
              </div>

              <h1 className="mt-8 text-5xl font-light leading-[1.1] tracking-tight text-white md:text-7xl font-serif">
                Lima, Lopes &<br />Diógenes
                <span className="mt-3 block text-3xl font-medium text-brand-gold md:text-4xl">Advogados Associados</span>
              </h1>

              <div className="mt-6 h-px w-16 bg-gradient-to-r from-brand-gold to-transparent" />

              <p className="mt-6 max-w-lg text-xl font-light leading-relaxed text-neutral-400 font-serif italic">
                Inteligência Estratégica. Resolução Resoluta.
              </p>

              <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-500">
                Excelência jurídica, inovação e resultados. Um escritório focado na resolução inteligente e estratégica de conflitos complexos.
              </p>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row items-center">
                <a href={`https://wa.me/${whatsappE164}`} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                  <button className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-brand-black shadow-lg shadow-brand-gold/20 transition-all hover:bg-brand-gold-dark hover:shadow-xl hover:shadow-brand-gold/30 hover:scale-[1.02]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Fale com a Equipe
                  </button>
                </a>
                <Link
                  to="/login"
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-brand-gold/30 bg-transparent px-8 py-4 text-sm font-semibold text-brand-gold transition-all hover:bg-brand-gold/10 hover:border-brand-gold/50 sm:w-auto"
                >
                  Acessar Portal
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>

              <div className="mt-14 grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
                <div>
                  <div className="text-xl font-light text-brand-gold font-serif">100%</div>
                  <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Sigilo Absoluto</div>
                </div>
                <div>
                  <div className="text-xl font-light text-brand-gold font-serif">24/7</div>
                  <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Portal Exclusivo</div>
                </div>
                <div>
                  <div className="text-xl font-light text-brand-gold font-serif">Ágil</div>
                  <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Gestão de Prazos</div>
                </div>
              </div>
            </div>

            <div className="relative lg:ml-auto w-full max-w-lg">
              <div className="absolute -inset-10 rounded-[40px] bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.12),transparent_60%)] blur-3xl" />

              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/5 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                <div className="mb-8 flex flex-col items-center justify-center space-y-4">
                  <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-brand-gold/20 to-brand-gold/5 text-3xl font-serif text-brand-gold shadow-inner border border-brand-gold/10">
                    LLD
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-serif text-white">Portal do Cliente</div>
                    <div className="text-xs tracking-widest uppercase text-brand-gold mt-1">Ambiente Seguro</div>
                  </div>
                </div>

                <div className="grid gap-4">
                  {[
                    { title: 'Acompanhamento processual', desc: 'Acesso em tempo real aos andamentos' },
                    { title: 'Smart Drive Privado', desc: 'Envio seguro de documentos e provas' },
                    { title: 'Comunicação Oficial', desc: 'Histórico de atividades e prazos do caso' },
                  ].map((item, i) => (
                    <div key={i} className="group rounded-2xl border border-white/10 bg-white/5 p-4 transition-all hover:border-brand-gold/30 hover:bg-white/10 hover:shadow-md hover:shadow-brand-gold/5">
                      <div className="flex items-center gap-3">
                        <div className="size-2 rounded-full bg-brand-gold/50 group-hover:bg-brand-gold transition-colors" />
                        <div>
                          <div className="text-sm font-medium text-white">{item.title}</div>
                          <div className="text-xs text-neutral-500 mt-0.5">{item.desc}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ÁREAS */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:py-32" id="areas">
        <SectionTitle
          kicker="ESPECIALIDADES"
          title="Atuação Jurídica Estratégica"
          desc="Assessoramos nossos clientes com clareza, transparência e alta capacidade técnica, visando sempre a melhor condução do cenário apresentado."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((a) => (
            <div key={a.title} className="group relative overflow-hidden rounded-3xl border border-neutral-100 bg-white p-8 transition-all hover:border-gold/30 hover:shadow-[0_20px_40px_-15px_rgba(212,175,55,0.1)]">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gold/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="text-xl font-serif text-neutral-900">{a.title}</div>
              
              <div className="mt-6 space-y-3">
                {a.items.map((it) => (
                  <div key={it} className="flex items-start gap-3">
                    <span className="mt-1.5 flex size-1.5 shrink-0 rounded-full bg-gold/60" />
                    <span className="text-sm text-neutral-600 leading-relaxed">{it}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ESCRITÓRIO */}
      <section className="bg-neutral-50 border-y border-neutral-200/60" id="escritorio">
        <div className="mx-auto max-w-7xl px-4 py-20 md:py-32">
          <div className="grid gap-16 md:grid-cols-2 md:items-center">
            <div>
              <div className="text-xs font-bold tracking-[0.3em] uppercase text-gold">O Escritório</div>
              <h2 className="mt-4 text-3xl font-light tracking-tight text-neutral-900 md:text-5xl font-serif">
                Princípios e<br/>Compromisso Ético
              </h2>
              <p className="mt-6 text-base text-neutral-600 leading-relaxed">
                Lima, Lopes & Diógenes Advocacia foi fundado com o propósito de oferecer uma advocacia organizada, ágil e absolutamente transparente. 
                Rejeitamos promessas irreais de resultado; focamos no estudo profundo de cada caso e na comunicação assertiva.
              </p>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {[
                  { title: 'Ética', desc: 'Respeito estrito às normas.' },
                  { title: 'Clareza', desc: 'Comunicação sem juridiquês.' },
                  { title: 'Estratégia', desc: 'Foco na melhor resolução.' },
                  { title: 'Tecnologia', desc: 'Prazos e dados seguros.' },
                ].map((v) => (
                  <div key={v.title} className="rounded-2xl border border-neutral-200/60 bg-white p-5 shadow-sm">
                    <div className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">{v.title}</div>
                    <div className="mt-2 text-sm text-neutral-500">{v.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative lg:ml-auto w-full max-w-md">
              <div className="absolute -inset-8 rounded-[40px] bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.15),transparent_60%)] blur-2xl" />
              <div className="relative overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-950 p-10 text-white shadow-2xl">
                <div className="text-xs font-bold tracking-[0.3em] text-gold uppercase">Diretriz Interna</div>
                <div className="mt-6 text-2xl font-serif font-light leading-snug">
                  "Atendimento voltado à orientação responsável, técnica apurada e absoluto respeito aos limites legais e factuais do caso concreto."
                </div>
                
                <div className="mt-10 h-px bg-white/10" />
                <div className="mt-6">
                  <div className="text-xs text-white/50 uppercase tracking-widest font-semibold mb-2">Central de Atendimento</div>
                  <a href={`https://wa.me/${whatsappE164}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-lg text-white hover:text-gold transition-colors">
                    {whatsappDisplay} <span className="text-gold">↗</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EQUIPE */}
      <section className="mx-auto max-w-7xl px-4 py-20 md:py-32" id="equipe">
        <SectionTitle
          kicker="Nossa Equipe"
          title="Profissionais Dedicados"
          desc="Uma estrutura coesa e organizada para garantir que a estratégia e o andamento do seu caso fluam com perfeição."
        />

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((m) => {
            const initials = m.name
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((s) => s[0]!.toUpperCase())
              .join('');

            return (
              <div key={m.name} className="group rounded-3xl border border-neutral-100 bg-white p-6 transition-all hover:border-gold/20 hover:shadow-lg hover:shadow-neutral-900/5">
                <div className="flex items-center gap-4 mb-5">
                  <div className="grid size-14 shrink-0 place-items-center rounded-full bg-neutral-50 border border-neutral-100 text-lg font-serif text-gold group-hover:scale-105 transition-transform">
                    {initials}
                  </div>
                  <div>
                    <div className="text-lg font-serif text-neutral-900">{m.name}</div>
                    <div className="text-sm font-medium text-gold">{m.role}</div>
                    {m.oab && <div className="text-xs text-neutral-400 mt-0.5">{m.oab}</div>}
                  </div>
                </div>
                <div className="text-sm leading-relaxed text-neutral-600">{m.bio}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="mx-auto max-w-7xl px-4 pb-20 md:pb-32" id="avaliacoes">
        <SectionTitle
          kicker="DEPOIMENTOS"
          title="O que dizem sobre nós"
          desc="Opiniões de quem confiou em nosso trabalho. A satisfação de nossos clientes é o maior atestado da nossa competência."
        />

        <div className="mt-16 w-full flex-col items-center justify-center overflow-hidden flex">
          <div className="group flex overflow-hidden p-2 [--gap:1.5rem] [gap:var(--gap)] flex-row [--duration:60s] w-full max-w-7xl relative">
            <div className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee flex-row group-hover:[animation-play-state:paused] w-full">
              {[...Array(3)].map((_, setIndex) =>
                testimonials.map((t, i) => (
                  <div key={`${setIndex}-${i}`} className="w-[350px] shrink-0 rounded-3xl border border-neutral-100 bg-white p-6 shadow-[0_20px_40px_-15px_rgba(212,175,55,0.05)] transition-transform hover:-translate-y-1">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="grid size-12 place-items-center rounded-full bg-gradient-to-br from-gold/20 to-gold/5 text-gold font-serif font-semibold border border-gold/10">
                        {t.initials}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-neutral-900">{t.name}</div>
                        <div className="text-xs text-gold flex gap-0.5 mt-0.5">
                          {[...Array(t.rating)].map((_, r) => (
                            <span key={r}>★</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-600 leading-relaxed italic">"{t.text}"</p>
                  </div>
                )),
              )}
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-white to-transparent" />
          </div>
          
          <div className="mt-8 text-center">
            <a href="https://g.page/r/YOUR_GOOGLE_MAPS_LINK_HERE/review" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-gold hover:text-gold/80 transition-colors">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"></path><polygon points="9 9 9 14 14 9 9 9"></polygon></svg>
              Avaliar no Google
            </a>
          </div>
        </div>
      </section>

      {/* FORMULÁRIO DE CONTATO INTELIGENTE */}
      <section className="bg-neutral-50 py-20 md:py-32" id="lead-form">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <div className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Atendimento Personalizado</div>
            <div className="mx-auto mt-4 h-px w-12 bg-gradient-to-r from-transparent via-gold to-transparent opacity-50" />
            <h2 className="mt-6 text-3xl font-light tracking-tight text-neutral-900 md:text-5xl font-serif">
              Conte seu caso para nossa equipe
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-neutral-600 md:text-lg">
              Preencha o formulário abaixo e nossa equipe jurídica entrará em contato pelo WhatsApp para uma análise inicial gratuita.
            </p>
          </div>
          <div className="mt-12">
            <LeadForm />
          </div>
        </div>
      </section>

      {/* CONTATO */}
      <section className="bg-neutral-950 text-white" id="contato">
        <div className="mx-auto max-w-7xl px-4 py-20 md:py-32">
          <div className="grid gap-12 md:grid-cols-2 lg:gap-24">
            <div>
              <div className="text-xs font-bold tracking-[0.3em] uppercase text-gold">Agende uma Consulta</div>
              <h2 className="mt-4 text-4xl font-light tracking-tight md:text-5xl font-serif">Fale com nossa<br/>equipe jurídica</h2>
              <p className="mt-6 text-lg text-neutral-400 font-light max-w-md">
                Envie uma mensagem descrevendo brevemente seu cenário. Retornaremos com agilidade para analisar a viabilidade do atendimento.
              </p>

              <div className="mt-10 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-gold">✦</div>
                  <div>
                    <div className="font-semibold text-white">WhatsApp Direto</div>
                    <a href={`https://wa.me/${whatsappE164}`} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-gold transition-colors block mt-1">
                      {whatsappDisplay}
                    </a>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-gold">✦</div>
                  <div>
                    <div className="font-semibold text-white">Endereço Presencial</div>
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-neutral-400 hover:text-gold transition-colors block mt-1 leading-relaxed">
                      {address.line1}<br/>{address.line2}
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.1),transparent_70%)]" />
              <div className="relative rounded-[32px] border border-white/10 bg-white/5 p-8 backdrop-blur-sm sm:p-10">
                <div className="text-2xl font-serif font-light mb-8">Acesso Restrito</div>
                
                <p className="text-neutral-400 mb-8 text-sm leading-relaxed">
                  Ambiente exclusivo para clientes e equipe técnica. Acompanhe processos, envie documentos e acesse prazos com total segurança e sigilo através da nossa plataforma.
                </p>

                <Link
                  to="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand-gold px-8 py-4 text-sm font-bold text-brand-black transition-all hover:bg-brand-gold-dark hover:shadow-lg hover:shadow-brand-gold/20 group"
                >
                  Entrar no Portal
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
                
                <div className="mt-6 text-center text-xs text-neutral-500">
                  Site com caráter exclusivamente informativo e institucional.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
