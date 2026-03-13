import { env } from '@/env';
import { storageGet, storageRemove, storageSet } from '@/lib/storage';

const ACCESS_KEY = 'castrocrm.accessToken';
const REFRESH_KEY = 'castrocrm.refreshToken';
const ORG_KEY = 'castrocrm.orgId';
const ROLE_KEY = 'castrocrm.role';

export type Tokens = { accessToken: string; refreshToken: string };

export function getAccessToken() {
  return storageGet(ACCESS_KEY);
}

export function getRefreshToken() {
  return storageGet(REFRESH_KEY);
}

export function setTokens(t: Tokens) {
  storageSet(ACCESS_KEY, t.accessToken);
  storageSet(REFRESH_KEY, t.refreshToken);
}

export function clearTokens() {
  storageRemove(ACCESS_KEY);
  storageRemove(REFRESH_KEY);
}

export function getOrgId() {
  return storageGet(ORG_KEY);
}

export function setOrgId(orgId: string) {
  storageSet(ORG_KEY, orgId);
}

export function clearOrgId() {
  storageRemove(ORG_KEY);
}

export function getRole() {
  return storageGet(ROLE_KEY);
}

export function setRole(role: string) {
  storageSet(ROLE_KEY, role);
}

export function clearRole() {
  storageRemove(ROLE_KEY);
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await fetch(`${env.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as any;
  if (!json?.accessToken || !json?.refreshToken) return null;

  setTokens({ accessToken: json.accessToken, refreshToken: json.refreshToken });
  return json.accessToken as string;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${env.apiBaseUrl}${path}`;

  const headers = new Headers(init.headers || {});
  headers.set('Content-Type', headers.get('Content-Type') || 'application/json');

  const orgId = getOrgId();
  if (orgId) headers.set('X-Org-Id', orgId);

  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const doFetch = () => fetch(url, { ...init, headers });

  let res = await doFetch();

  if (res.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      headers.set('Authorization', `Bearer ${newAccess}`);
      res = await doFetch();
    } else {
      clearTokens();
      clearOrgId();
      clearRole();
    }
  }

  return res;
}
