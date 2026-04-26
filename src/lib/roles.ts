import { getRole as getStoredRole } from '@/lib/apiClient';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';


function hasAdmTag(text: string | null | undefined) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  return /(^|\W)adm(\W|$)/i.test(normalized);
}

function normalizeRole(role: string | null | undefined) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return '';

  // Canonical app roles.
  if (r === 'owner' || r === 'admin' || r === 'administrator' || r === 'adm') return 'admin';
  if (r === 'advogado' || r === 'lawyer' || r === 'finance') return 'finance';
  if (r === 'colaborador' || r === 'member' || r === 'staff' || r === 'assistant' || r === 'secretary') return 'colaborador';
  return r;
}

export function isCollaboratorRole(role: string | null | undefined) {
  return normalizeRole(role) === 'colaborador';
}

export async function getMyOfficeRole() {
  // Prefer live role from Supabase office_members to avoid stale localStorage role.
  try {
    const sb = requireSupabase();
    const user = await getAuthedUser();

    const { data, error } = await sb
      .from('office_members')
      .select('role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error) {
      const live = normalizeRole(data?.role || '');
      if (live) return live;
    }
  } catch {
    // ignore and fallback to stored role
  }


  // Shortcut: membros com tag ADM no nome/email também recebem permissão administrativa.
  try {
    const sb = requireSupabase();
    const user = await getAuthedUser();
    const { data: myProfile } = await sb
      .from('user_profiles')
      .select('display_name,email')
      .eq('user_id', user.id)
      .maybeSingle();

    if (hasAdmTag(myProfile?.display_name) || hasAdmTag(myProfile?.email)) {
      return 'admin';
    }
  } catch {
    // ignore
  }

  // Fallback to backend role stored in localStorage
  const stored = normalizeRole(getStoredRole());
  return stored;
}

export async function requireRole(allowed: string[]) {
  const normalizedAllowed = allowed.map((x) => normalizeRole(x));
  const role = await getMyOfficeRole().catch(() => '');
  if (!role) return false;
  return normalizedAllowed.includes(role);
}


export function isAdminRole(role: string | null | undefined) {
  return normalizeRole(role) === 'admin';
}
