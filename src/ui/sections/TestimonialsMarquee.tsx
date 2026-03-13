const testimonials = [
  {
    name: 'Dra. Ana Paula',
    role: 'Advogada • Previdenciário',
    text: 'O fluxo de atendimento ficou muito mais rápido. Em poucos cliques eu encontro histórico, prazos e documentos.',
  },
  {
    name: 'Dr. Marcelo',
    role: 'Escritório • Cível',
    text: 'O painel é limpo e funciona bem no celular. Dá pra operar no dia a dia sem ficar “caçando” botão.',
  },
  {
    name: 'Fernanda',
    role: 'Paralegal',
    text: 'A parte de clientes e casos ficou organizada. A automação com n8n economiza um tempo absurdo.',
  },
  {
    name: 'Dr. Ricardo',
    role: 'Criminal',
    text: 'Gostei do modelo multi-tenant: consigo separar tudo por equipe/filial sem misturar dados.',
  },
];

function Card({ name, role, text }: (typeof testimonials)[number]) {
  return (
    <div className="w-[320px] shrink-0 rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="text-sm text-white/80">{text}</div>
      <div className="mt-4">
        <div className="text-sm font-semibold text-white">{name}</div>
        <div className="text-xs text-white/60">{role}</div>
      </div>
    </div>
  );
}

export function TestimonialsMarquee() {
  // Marquee CSS-only simples: duplicamos a lista e animamos translateX.
  const items = [...testimonials, ...testimonials];

  return (
    <div className="overflow-hidden">
      <div className="flex gap-4 [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
        <div className="flex min-w-full animate-[marquee_22s_linear_infinite] gap-4">
          {items.map((t, idx) => (
            <Card key={`${t.name}-${idx}`} {...t} />
          ))}
        </div>
      </div>
    </div>
  );
}
