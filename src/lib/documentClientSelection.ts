import type { ClientLite } from './types';

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve a link only against clients already loaded for the authorized office. */
export function findRequestedDocumentClient(
  clients: readonly ClientLite[],
  requestedClientId: string | null,
): ClientLite | null {
  if (!requestedClientId || !canonicalUuid.test(requestedClientId)) return null;
  const id = requestedClientId.toLowerCase();
  return clients.find(client => client.id === id) || null;
}
