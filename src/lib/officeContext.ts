import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

let _cachedOfficeId: string | null = null;
let _cachedOfficeAt = 0;

export async function getMyOfficeId() {
  const now = Date.now();
  if (_cachedOfficeId && now - _cachedOfficeAt < 10_000) return _cachedOfficeId;

  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { data, error } = await sb
    .from('office_members')
    .select('office_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  _cachedOfficeId = (data as any)?.office_id || null;
  _cachedOfficeAt = now;
  return _cachedOfficeId;
}

export type OfficeMemberProfile = { user_id: string; display_name: string | null; email: string | null };

export async function listOfficeMemberProfiles(officeId: string): Promise<OfficeMemberProfile[]> {
  const sb = requireSupabase();
  await getAuthedUser();

  const { data: ms, error: mErr } = await sb.from('office_members').select('user_id').eq('office_id', officeId).limit(500);
  if (mErr) throw new Error(mErr.message);

  const ids = Array.from(new Set((ms || []).map((m: any) => m.user_id).filter(Boolean)));
  if (!ids.length) return [];

  const { data: profs, error: pErr } = await sb.from('user_profiles').select('user_id,email,display_name').in('user_id', ids).limit(500);
  if (pErr) throw new Error(pErr.message);

  const sorted = (profs || []) as any[];
  sorted.sort((a, b) => String(a.display_name || a.email || '').localeCompare(String(b.display_name || b.email || '')));
  return sorted as OfficeMemberProfile[];
}
