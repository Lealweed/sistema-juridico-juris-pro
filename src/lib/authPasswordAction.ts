export type PasswordAction = 'invite' | 'recovery' | null;

/** Read before Supabase consumes a successful authentication link. Contains no tokens. */
export function readPasswordAction(location: { search: string; hash: string }): PasswordAction {
  const type = new URLSearchParams(location.hash.replace(/^#/, '')).get('type');
  if (type === 'recovery') return 'recovery';
  if (type === 'invite' || new URLSearchParams(location.search).get('flow') === 'invite') return 'invite';
  return null;
}
