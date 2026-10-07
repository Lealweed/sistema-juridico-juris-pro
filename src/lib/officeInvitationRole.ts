export type InvitationRole = 'admin' | 'user';

/** Existing staff labels never grant administration in the legacy database. */
export function normalizeInvitationRole(value: string): InvitationRole {
  switch (value.trim().toLowerCase()) {
    case 'admin': return 'admin';
    case 'user': case 'lawyer': case 'advogado': case 'secretary': case 'member': case 'staff':
    case 'assistant': case 'colaborador': case 'finance': return 'user';
    default: throw new Error('Escolha Colaborador ou Administrador.');
  }
}

export function invitationRoleLabel(value: string) {
  return value.trim().toLowerCase() === 'admin' ? 'Administrador' : 'Colaborador';
}
