import { Link } from 'react-router-dom';

import { ShimmerButton } from '@/ui/primitives/ShimmerButton';

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
    title: 'Cível',
    items: ['Contratos', 'Responsabilidade civil', 'Cobranças e acordos'],
  },
  {
    title: 'Criminal',
    items: ['Orientação e acompanhamento', 'Defesa técnica', 'Atuação em fases investigatórias e processuais'],
  },
  {
    title: 'Empresarial',
    items: ['Apoio a rotinas empresariais', 'Contratos e negociações', 'Prevenção de riscos'],
  },
  {
    title: 'Família',
    items: ['Divórcio e dissolução', 'Guarda e convivência', 'Pensão e alimentos'],
  },
  {
    title: 'Trabalhista',
    items: ['Orientação em relações de trabalho', 'Acordos e tratativas', 'Acompanhamento de demandas'],
  },
];

const team = [
  {
    name: 'Letícia Oliveira',
    role: 'Advogada',
    oab: 'OAB/PA 28811',
    bio: 'Atuação com foco em orientação jurídica, análise técnica e acompanhamento responsável de demandas cíveis e familiares.',
  },
  {
    name: 'Zuleide Castro',
    role: 'Advogada',
    bio: 'Atendimento humanizado e condução estratégica de casos, com comunicação clara e organização de informações do cliente.',
  },
  {
    name: 'Victor',
    role: 'Controller Jurídico',
    bio: 'Gestão interna, padronização de rotinas e apoio à organização de documentos, prazos e atendimentos do escritório.',
  },
  {
    name: 'Olga',
    role: 'Assessora Jurídica',
    bio: 'Apoio operacional e jurídico: triagem de informações, preparação de documentos e suporte ao fluxo de atendimento.',
  },
  {
    name: 'Maria',
    role: 'Assessora Jurídica',
    bio: 'Suporte ao time jurídico, organização de demandas e acompanhamento de atividades para manter o atendimento ágil e preciso.',
  },
];

const address = {
  line1: 'Avenida Tupinambá, 19 — Galeria Parque 610, Sala 01',
  line2: 'Bairro Parque dos Carajás, Parauapebas — Pará, CEP 68515-000',
};

const mapsUrl =
  'https://www.google.com/maps/search/?api=1&query=' +
  encodeURIComponent(
    'Avenida Tupinambá, 19 Galeria parque 610 Sala 01 Bairro Parque dos Carajás, Parauapebas - Pará 68515-000'
  );

const whatsappE164 = '5591983485747';
const whatsappDisplay = '(91) 98348-5747';
const cityDisplay = 'Parauapebas — Pará';

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
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 md:pb-32 md:pt-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_50%)]" />
        
        <div className="grid gap-16 md:grid-cols-2 md:items-center">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-3 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5 text-xs font-medium text-neutral-800 shadow-sm backdrop-blur-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-50"></span>
                <span className="relative inline-flex size-2 rounded-full bg-gold"></span>
              </span>
              {cityDisplay}
            </div>

            <h1 className="mt-8 text-5xl font-light leading-[1.1] tracking-tight text-neutral-900 md:text-7xl font-serif">
              Castro de Oliveira
              <span className="block mt-2 font-medium text-transparent bg-clip-text bg-gradient-to-r from-gold to-[rgba(180,145,45,1)]">Advocacia</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg font-light leading-relaxed text-neutral-600">
              Atendimento jurídico com padrão premium. Unimos o rigor técnico da advocacia à tecnologia para garantir clareza, organização e excelência.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row items-center">
              <a href={`https://wa.me/${whatsappE164}`} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                <ShimmerButton className="w-full sm:w-auto !px-8 !py-3.5 !text-base shadow-xl shadow-gold/20 hover:scale-105 transition-transform duration-300">Falar no WhatsApp</ShimmerButton>
              </a>
              <Link
                to="/app"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full border border-neutral-200 bg-white px-8 py-3.5 text-sm font-medium text-neutral-800 transition-all hover:border-gold hover:bg-neutral-50 sm:w-auto shadow-sm"
              >
                Acesso Restrito
                <span className="text-gold transition-transform group-hover:translate-x-1">→</span>
              </Link>
            </div>

            <div className="mt-14 grid grid-cols-3 gap-6 border-t border-neutral-200/60 pt-8">
              <div>
                <div className="text-xl font-light text-neutral-900 font-serif">100%</div>
                <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Sigilo Absoluto</div>
              </div>
              <div>
                <div className="text-xl font-light text-neutral-900 font-serif">24/7</div>
                <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Portal Exclusivo</div>
              </div>
              <div>
                <div className="text-xl font-light text-neutral-900 font-serif">Ágil</div>
                <div className="mt-1 text-xs text-neutral-500 uppercase tracking-widest">Gestão de Prazos</div>
              </div>
            </div>
          </div>

          <div className="relative lg:ml-auto w-full max-w-lg">
            <div className="absolute -inset-10 rounded-[40px] bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.15),transparent_60%)] blur-3xl" />

            <div className="relative overflow-hidden rounded-[32px] border border-white/50 bg-white/80 p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)] backdrop-blur-xl">
              <div className="mb-8 flex flex-col items-center justify-center space-y-4">
                <div className="grid size-20 place-items-center rounded-2xl bg-gradient-to-br from-gold/20 to-gold/5 text-3xl font-serif text-gold shadow-inner border border-gold/10">
                  CO
                </div>
                <div className="text-center">
                  <div className="text-lg font-serif text-neutral-900">Portal do Cliente</div>
                  <div className="text-xs tracking-widest uppercase text-gold mt-1">Ambiente Seguro</div>
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { title: 'Acompanhamento processual', desc: 'Acesso em tempo real aos andamentos' },
                  { title: 'Smart Drive Privado', desc: 'Envio seguro de documentos e provas' },
                  { title: 'Comunicação Oficial', desc: 'Histórico de atividades e prazos do caso' },
                ].map((item, i) => (
                  <div key={i} className="group rounded-2xl border border-neutral-100 bg-white/60 p-4 transition-all hover:border-gold/30 hover:bg-white hover:shadow-md hover:shadow-gold/5">
                    <div className="flex items-center gap-3">
                      <div className="size-2 rounded-full bg-gold/50 group-hover:bg-gold transition-colors" />
                      <div>
                        <div className="text-sm font-medium text-neutral-900">{item.title}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{item.desc}</div>
                      </div>
                    </div>
                  </div>
                ))}
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
                O Castro de Oliveira Advocacia foi fundado com o propósito de oferecer uma advocacia organizada, ágil e absolutamente transparente. 
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
                  to="/app"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-8 py-4 text-sm font-bold text-neutral-900 transition-all hover:bg-gold hover:text-white group"
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
