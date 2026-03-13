import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/ui/widgets/Card';
import { getMyOfficeId } from '@/lib/officeContext';
import { getMyOfficeRole } from '@/lib/roles';
import { getOfficeSettings, updateOfficeSettings, type OfficeSettings } from '@/lib/officeSettings';

export function AgendaSettingsPage() {
  const [role, setRole] = useState('');
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [row, setRow] = useState<OfficeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deadlineTime, setDeadlineTime] = useState('09:00');
  const [commitmentMinutes, setCommitmentMinutes] = useState(30);
  const [officeWhatsapp, setOfficeWhatsapp] = useState('');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const [r, oid] = await Promise.all([getMyOfficeRole().catch(() => ''), getMyOfficeId().catch(() => null)]);
      setRole(r);
      setOfficeId(oid);
      if (!oid) throw new Error('Escritório não encontrado.');

      const s = await getOfficeSettings(oid);
      setRow(s);
      setDeadlineTime(String(s.agenda_deadline_default_time || '09:00').slice(0, 5));
      setCommitmentMinutes(Number(s.agenda_commitment_default_minutes_before || 30));
      setOfficeWhatsapp((s.office_whatsapp || '').toString());
      setTimezone(s.timezone || 'America/Sao_Paulo');
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar configurações.');
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSave() {
    if (role !== 'admin') {
      setError('Apenas admin pode alterar as configurações da agenda.');
      return;
    }
    if (!officeId) return;

    const mins = Math.max(0, Math.min(60 * 24, Number(commitmentMinutes) || 0));

    setSaving(true);
    setError(null);

    try {
      await updateOfficeSettings(officeId, {
        agenda_deadline_default_time: deadlineTime,
        agenda_commitment_default_minutes_before: mins,
        office_whatsapp: officeWhatsapp.trim() || null,
        timezone,
      });
      setSaving(false);
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao salvar.');
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Configurações da Agenda</h1>
          <p className="text-sm text-white/60">Padrões por escritório (admin).</p>
        </div>
        <Link to="/app/agenda" className="btn-ghost">
          Voltar
        </Link>
      </div>

      {error ? <div className="text-sm text-red-200">{error}</div> : null}

      <Card>
        {loading ? <div className="text-sm text-white/70">Carregando…</div> : null}

        {!loading && row ? (
          <div className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-sm text-white/80">
                Prazo: horário padrão do lembrete
                <input className="input" type="time" value={deadlineTime} onChange={(e) => setDeadlineTime(e.target.value)} />
              </label>

              <label className="text-sm text-white/80">
                Compromisso: minutos antes
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={1440}
                  value={commitmentMinutes}
                  onChange={(e) => setCommitmentMinutes(Number(e.target.value))}
                />
              </label>

              <label className="text-sm text-white/80">
                WhatsApp do escritório (para receber lembretes)
                <input className="input" value={officeWhatsapp} onChange={(e) => setOfficeWhatsapp(e.target.value)} placeholder="Ex.: 5511999999999" inputMode="tel" />
              </label>

              <label className="text-sm text-white/80">
                Timezone
                <input className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="btn-primary" onClick={() => void onSave()} disabled={saving || role !== 'admin'}>
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
              {role !== 'admin' ? <div className="text-xs text-white/50">Somente admin pode alterar.</div> : null}
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="text-sm font-semibold text-white">Como funciona</div>
        <div className="mt-2 text-sm text-white/70">
          Esses valores são usados como padrão quando você criar lembretes automáticos (WhatsApp) para itens da agenda.
          Você ainda poderá ajustar lembretes caso a caso.
        </div>
      </Card>
    </div>
  );
}
