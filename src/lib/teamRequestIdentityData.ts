type UserIdentity = { id: string };
type HeaderQuery = { setHeader(name: string, value: string): unknown };
type AuthPort = {
  getSession: () => Promise<{ data: { session: { access_token: string; user: UserIdentity } | null }; error: unknown }>;
  getUser: (token: string) => Promise<{ data: { user: UserIdentity | null }; error: unknown }>;
};

export class TeamRequestIdentityChangedError extends Error {
  readonly code = 'TEAM_REQUEST_IDENTITY_CHANGED' as const;
  constructor() {
    super('A conta mudou durante a confirmação. Abra novamente a tela antes de continuar.');
    this.name = 'TeamRequestIdentityChangedError';
  }
}
export function isTeamRequestIdentityChangedError(error: unknown): error is TeamRequestIdentityChangedError {
  return error instanceof TeamRequestIdentityChangedError;
}
const changedIdentity = () => new TeamRequestIdentityChangedError();

/** Request credentials stay inside closures; no token is returned as data or kept in UI state. */
export async function captureTeamRequestIdentity(auth: AuthPort, currentUser: () => Promise<UserIdentity>, expectedUserId?: string) {
  const original = await currentUser();
  const userId = expectedUserId ?? original.id;
  if (!userId || original.id !== userId) throw changedIdentity();
  const { data, error } = await auth.getSession();
  const session = data.session;
  if (error || !session?.access_token || session.user.id !== userId) throw changedIdentity();
  const token = session.access_token;
  const { data: verified, error: verificationError } = await auth.getUser(token);
  if (verificationError || verified.user?.id !== userId) throw changedIdentity();
  const assertCurrent = async () => {
    if ((await currentUser()).id !== userId) throw changedIdentity();
    // getUser can finish with the token captured before a local sign-in switch.
    // Check the SDK session again after that response, before using its result.
    const { data: latest, error: latestError } = await auth.getSession();
    if (latestError || !latest.session?.access_token || latest.session.user.id !== userId) throw changedIdentity();
  };
  await assertCurrent();
  return {
    userId,
    assertCurrent,
    bind<Query extends HeaderQuery>(query: Query): Query {
      query.setHeader('Authorization', `Bearer ${token}`);
      return query;
    },
    invoke<Result>(send: (headers: { Authorization: string }) => Promise<Result>): Promise<Result> {
      return send({ Authorization: `Bearer ${token}` });
    },
  };
}
