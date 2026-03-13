import { getRole as getStoredRole } from '@/lib/apiClient';
import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

function normalizeRole(role: string | null | undefined) {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return '';

  // Backend membership roles (OWNER/ADMIN/FINANCE/...) and office roles (admin/finance/...)
  if (r === 'owner') return 'admin';
  if (r === 'administrator') return 'admin';
  return r;
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
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error) {
      const live = normalizeRole((data as any)?.role || '');
      if (live) return live;
    }
  } catch {
    // ignore and fallback to stored role
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
