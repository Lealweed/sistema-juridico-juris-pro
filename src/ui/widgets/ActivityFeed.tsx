export function ActivityFeed() {
  const items = [
    { when: 'Hoje 10:12', text: 'Novo lead criado: Empresa Alfa (Consumidor).' },
    { when: 'Ontem 18:40', text: 'Tarefa concluída: enviar proposta para Ana Souza.' },
    { when: 'Ontem 09:05', text: 'Mensagem WhatsApp recebida: Carlos Lima.' },
  ];

  return (
    <div className="mt-3 space-y-2">
      {items.map((it) => (
        <div key={it.when + it.text} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="text-xs text-white/50">{it.when}</div>
          <div className="mt-1 text-sm text-white/80">{it.text}</div>
        </div>
      ))}
    </div>
  );
}
