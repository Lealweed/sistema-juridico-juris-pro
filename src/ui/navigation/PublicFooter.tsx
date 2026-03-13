export function PublicFooter() {
  return (
    <footer className="border-t border-black/10 bg-white/50">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-2 text-sm text-neutral-700">
          <div className="text-neutral-950 font-semibold">Castro de Oliveira Advocacia</div>
          <div className="text-neutral-700">
            Site institucional e informativo. Atendimento mediante análise do caso concreto.
          </div>
          <div className="mt-4 text-xs text-neutral-600">
            © {new Date().getFullYear()} Castro de Oliveira Advocacia. Todos os direitos reservados.
          </div>
        </div>
      </div>
    </footer>
  );
}
