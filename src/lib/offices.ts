import { getAuthedUser, requireSupabase } from '@/lib/supabaseDb';
import { captureTeamRequestIdentity } from '@/lib/teamRequestIdentityData';
import { normalizeInvitationRole } from '@/lib/officeInvitationRole';

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

function invitationError(message: string) {
  if (message.includes('office_invitation: invite_history_requires_existing_account')) return new Error('Este e-mail já tem um convite encerrado no histórico. Preserve o registro e use “Vincular conta existente” após criar a conta no Supabase.');
  if (/account_required/.test(message)) return new Error('A conta ainda não existe. Cadastre a pessoa em Authentication → Users no Supabase e depois volte aqui para vinculá-la.');
  if (/confirmed_email_required/.test(message)) return new Error('O e-mail da conta ainda não está confirmado. Confira a conta no Supabase antes de vinculá-la.');
  if (/account_identity_conflict/.test(message)) return new Error('Não foi possível confirmar uma única conta para esse e-mail. Confira a identidade no Supabase antes de vinculá-la.');
  if (/membership_role_conflict/.test(message)) return new Error('A conta já está vinculada com outro papel. O acesso existente foi preservado; confira o papel na equipe.');
  if (/pending_role_conflict/.test(message)) return new Error('Já existe um convite pendente com outro papel. Confira os convites da equipe antes de criar outro.');
  if (/already_member/.test(message)) return new Error('Este e-mail já pertence a um membro do escritório.');
  if (/invite_conflict|invitation_conflict/.test(message)) return new Error('Já existe um convite pendente com outro papel. Confira os convites da equipe antes de criar outro.');
  if (/forbidden|management_required|administrator_required/.test(message)) return new Error('Somente a administração do escritório pode gerenciar os convites.');
  if (/invite_not_found|invitation_not_found|invite_unavailable/.test(message)) return new Error('Convite indisponível, revogado ou destinado a outro e-mail.');
  if (/invalid.*role/.test(message)) return new Error('Escolha Colaborador ou Administrador.');
  if (/invalid.*email/.test(message)) return new Error('Informe um e-mail válido.');
  if (/schema cache|does not exist|Could not find the function/i.test(message)) return new Error('O cadastro da equipe está aguardando a atualização do serviço. Tente novamente após a implantação.');
  return new Error('Não foi possível confirmar a alteração do convite. Atualize a lista antes de tentar novamente.');
}

async function invitationRpc(name: string, args: Record<string, unknown>, expectedUserId?: string) {
  const sb = requireSupabase();
  const actor = await captureTeamRequestIdentity(sb.auth, getAuthedUser, expectedUserId);
  const { data, error } = await actor.bind(sb.rpc(name, args));
  await actor.assertCurrent();
  if (error) throw invitationError(error.message);
  return data as unknown;
}

function invitationRows(data: unknown): OfficeInviteRow[] {
  if (!Array.isArray(data)) throw new Error('O serviço não confirmou a lista de convites.');
  for (const row of data) confirmedInvitation(row);
  return (data as OfficeInviteRow[]).filter(row => row.accepted_at === null && row.revoked_at === null);
}

function invitationObject<T extends object>(data: unknown): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('O serviço não confirmou a alteração. Atualize a lista antes de tentar novamente.');
  return data as T;
}

const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function confirmedInvitation(data: unknown): OfficeInviteRow {
  const row = invitationObject<OfficeInviteRow>(data);
  if (!isUuid(row.id) || !isUuid(row.office_id) || typeof row.email !== 'string' || typeof row.role !== 'string' || typeof row.created_at !== 'string' || !('accepted_at' in row) || !('revoked_at' in row)) {
    throw new Error('O serviço não confirmou os dados do convite. Atualize a lista antes de continuar.');
  }
  return row;
}

function confirmedMembership(data: unknown, expectedOfficeId?: string) {
  const row = invitationObject<{ id: string; office_id: string; user_id: string; role: string }>(data);
  if (!isUuid(row.id) || !isUuid(row.office_id) || !isUuid(row.user_id) || !['admin', 'user'].includes(row.role) || (expectedOfficeId && row.office_id !== expectedOfficeId)) {
    throw new Error('O serviço não confirmou o vínculo com o escritório. Atualize a equipe antes de tentar novamente.');
  }
  return row;
}

export async function listMyOfficeInvites(expectedUserId?: string) {
  return invitationRows(await invitationRpc('office_invitation_list_mine', {}, expectedUserId));
}

export async function listOfficeInvites(officeId: string, expectedUserId: string) {
  return invitationRows(await invitationRpc('office_invitation_list', { p_office_id: officeId }, expectedUserId));
}

export async function acceptOfficeInvite(inviteId: string, expectedUserId?: string) {
  return confirmedMembership(await invitationRpc('office_invitation_accept', { p_invite_id: inviteId }, expectedUserId));
}

export async function createOfficeInvite(args: { officeId: string; email: string; role: string }, expectedUserId?: string): Promise<OfficeInviteRow> {
  const email = args.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  const row = confirmedInvitation(await invitationRpc('office_invitation_create', {
    p_office_id: args.officeId, p_email: email, p_role: normalizeInvitationRole(args.role),
  }, expectedUserId));
  if (row.office_id !== args.officeId || row.email.trim().toLowerCase() !== email || normalizeInvitationRole(row.role) !== normalizeInvitationRole(args.role)) throw new Error('O serviço não confirmou o convite solicitado. Confira a lista antes de tentar novamente.');
  return row;
}

export async function addExistingOfficeMember(args: { officeId: string; email: string; role: string }, expectedUserId: string) {
  const email = args.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  const row = confirmedMembership(await invitationRpc('office_invitation_add_existing', {
    p_office_id: args.officeId, p_email: email, p_role: normalizeInvitationRole(args.role),
  }, expectedUserId), args.officeId);
  if (row.role !== normalizeInvitationRole(args.role)) throw new Error('O serviço não confirmou o papel solicitado. Confira a equipe antes de tentar novamente.');
  return row;
}

export async function revokeOfficeInvite(inviteId: string, officeId: string, expectedUserId: string) {
  return confirmedInvitation(await invitationRpc('office_invitation_revoke', { p_office_id: officeId, p_invite_id: inviteId }, expectedUserId));
}
