import { useState, type FormEvent } from 'react';

import { supabase } from '@/lib/supabaseClient';

const areaOptions = [
  'Cível',
  'Trabalhista',
  'Empresarial',
  'Imobiliário',
  'Tributário',
] as const;

export function LeadForm() {
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [area, setArea] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!name.trim() || !whatsapp.trim() || !area || !description.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (!supabase) {
      setError('Serviço indisponível no momento. Tente novamente mais tarde.');
      return;
    }

    setLoading(true);
    try {
      const { error: rpcError } = await supabase.rpc('submit_lead', {
        p_name: name.trim(),
        p_whatsapp: whatsapp.trim(),
        p_area: area,
        p_description: description.trim(),
      });

      if (rpcError) throw rpcError;

      setSuccess(true);
      setName('');
      setWhatsapp('');
      setArea('');
      setDescription('');
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || (typeof err === 'string' ? err : 'Erro inesperado no servidor.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-brand-gold/20 bg-brand-gold/5 p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <h3 className="text-xl font-serif font-medium text-neutral-900">Solicitação recebida!</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          Sua solicitação foi recebida! Nossa equipe entrará em contato via WhatsApp em breve.
        </p>
        <button
          type="button"
          onClick={() => setSuccess(false)}
          className="mt-6 text-sm font-semibold text-brand-gold hover:text-brand-gold-dark transition-colors"
        >
          Enviar outra mensagem
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5">
      {/* Nome */}
      <div>
        <label htmlFor="lead-name" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Nome Completo
        </label>
        <input
          id="lead-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome completo"
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
        />
      </div>

      {/* WhatsApp */}
      <div>
        <label htmlFor="lead-whatsapp" className="mb-1.5 block text-sm font-medium text-neutral-700">
          WhatsApp
        </label>
        <input
          id="lead-whatsapp"
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="(00) 00000-0000"
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
        />
      </div>

      {/* Área */}
      <div>
        <label htmlFor="lead-area" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Área de Interesse
        </label>
        <select
          id="lead-area"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20"
        >
          <option value="">Selecione uma área...</option>
          {areaOptions.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      {/* Descrição */}
      <div>
        <label htmlFor="lead-description" className="mb-1.5 block text-sm font-medium text-neutral-700">
          Descreva seu caso brevemente
        </label>
        <textarea
          id="lead-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva brevemente a situação para que possamos direcionar ao especialista adequado..."
          rows={4}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 resize-none"
        />
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Botão */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-gradient-to-r from-brand-gold to-brand-gold-dark px-8 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-gold/20 transition-all hover:shadow-xl hover:shadow-brand-gold/30 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Enviando…
          </span>
        ) : (
          'Enviar para Análise'
        )}
      </button>

      <p className="text-center text-xs text-neutral-400">
        Suas informações são protegidas e tratadas com sigilo absoluto.
      </p>
    </form>
  );
}
