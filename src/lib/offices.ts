import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';

export type OfficeInviteRow = {
  id: string;
  office_id: string;
  email: string;
  role: string;
  created_at: string;
  accepted_at: string | null;
  accepted_by_user_id: string | null;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
};

export async function listMyOfficeInvites() {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { data, error } = await sb
    .from('office_invites')
    .select('id,office_id,email,role,created_at,accepted_at,accepted_by_user_id,revoked_at,revoked_by_user_id')
    .ilike('email', String(user.email || '').toLowerCase())
    .is('accepted_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data || []) as OfficeInviteRow[];
}

export async function acceptOfficeInvite(inviteId: string) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  // Get invite
  const { data: inv, error: invErr } = await sb
    .from('office_invites')
    .select('id,office_id,role,accepted_at,revoked_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);
  if (!inv) throw new Error('Convite não encontrado.');
  if ((inv as any).revoked_at) throw new Error('Convite revogado.');
  if ((inv as any).accepted_at) throw new Error('Convite já aceito.');

  // Join office (idempotent: if already member, continue)
  const { error: mErr } = await sb
    .from('office_members')
    .insert({ office_id: (inv as any).office_id, user_id: user.id, role: (inv as any).role } as any);

  if (mErr && !String(mErr.message || '').toLowerCase().includes('duplicate')) {
    throw new Error(mErr.message);
  }

  // Mark invite as accepted (even if membership already existed)
  const { error: upErr } = await sb
    .from('office_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by_user_id: user.id } as any)
    .eq('id', inviteId)
    .is('accepted_at', null);

  if (upErr) throw new Error(upErr.message);

  return { ok: true };
}

export async function createOfficeInvite(args: { officeId: string; email: string; role: string }) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const email = args.email.trim().toLowerCase();
  if (!email) throw new Error('E-mail inválido.');

  const { error } = await sb.from('office_invites').insert({
    office_id: args.officeId,
    email,
    role: args.role,
    created_by_user_id: user.id,
  } as any);

  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function revokeOfficeInvite(inviteId: string, officeId: string) {
  const sb = requireSupabase();
  const user = await getAuthedUser();

  const { error } = await sb
    .from('office_invites')
    .update({ revoked_at: new Date().toISOString(), revoked_by_user_id: user.id } as any)
    .eq('id', inviteId)
    .eq('office_id', officeId);

  if (error) throw new Error(error.message);
  return { ok: true };
}
