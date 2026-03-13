import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type OfficeSettings = {
  office_id: string;
  agenda_deadline_default_time: string; // 'HH:MM:SS' or 'HH:MM'
  agenda_commitment_default_minutes_before: number;
  office_whatsapp: string | null;
  timezone: string;
  updated_at: string;
};

export async function getOfficeSettings(officeId: string): Promise<OfficeSettings> {
  const sb = requireSupabase();
  await getAuthedUser();

  // ensure row exists
  try {
    await sb.rpc('ensure_office_settings', { p_office_id: officeId } as any);
  } catch {
    // ignore
  }

  const { data, error } = await sb
    .from('office_settings')
    .select('office_id,agenda_deadline_default_time,agenda_commitment_default_minutes_before,office_whatsapp,timezone,updated_at')
    .eq('office_id', officeId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return {
      office_id: officeId,
      agenda_deadline_default_time: '09:00',
      agenda_commitment_default_minutes_before: 30,
      office_whatsapp: null,
      timezone: 'America/Sao_Paulo',
      updated_at: new Date().toISOString(),
    };
  }

  return data as any;
}

export async function updateOfficeSettings(
  officeId: string,
  patch: Partial<Pick<OfficeSettings, 'agenda_deadline_default_time' | 'agenda_commitment_default_minutes_before' | 'office_whatsapp' | 'timezone'>>,
) {
  const sb = requireSupabase();
  await getAuthedUser();

  const { error } = await sb
    .from('office_settings')
    .upsert({ office_id: officeId, ...patch, updated_at: new Date().toISOString() } as any, { onConflict: 'office_id' })
    .select('office_id')
    .maybeSingle();

  if (error) throw new Error(error.message);
  return { ok: true };
}
