import { AuthSession, StaffAccount } from '../types';

// Keep Bearer token strictly in JS memory (never in localStorage or sessionStorage)
let inMemoryBearerToken: string | null = null;

export function setAuthBearerToken(token: string | null): void {
  inMemoryBearerToken = token;
}

export function getAuthBearerToken(): string | null {
  return inMemoryBearerToken;
}

export function getAuthHeaders(): Record<string, string> {
  if (!inMemoryBearerToken) return {};
  return { Authorization: `Bearer ${inMemoryBearerToken}` };
}

async function parseJsonSafe<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface AuthStatusResponse {
  ok: boolean;
  envConfigured: boolean;
  hasClaimedAdmin: boolean;
  adminConfigured: boolean;
  staffCount: number;
}

export interface LoginResponse {
  ok: boolean;
  token?: string;
  session?: AuthSession;
  locked?: boolean;
  error?: string;
}

export async function fetchAuthStatus(): Promise<AuthStatusResponse> {
  const res = await fetch('/api/auth/status');
  const data = await parseJsonSafe<AuthStatusResponse>(res);
  if (!res.ok || !data || !data.ok) {
    throw new Error('Imeshindwa kuangalia hali ya utambulisho wa mfumo.');
  }
  return data;
}

export async function bootstrapAdminAccount(params: {
  username: string;
  password: string;
  fullName: string;
}): Promise<{ token: string; session: AuthSession }> {
  const res = await fetch('/api/auth/bootstrap-admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseJsonSafe<LoginResponse>(res);
  if (!res.ok || !data || !data.ok || !data.token || !data.session) {
    throw new Error(data?.error || 'Imeshindwa kufungua akaunti ya Msimamizi Mkuu.');
  }
  return { token: data.token, session: data.session };
}

export async function loginWithCredentials(
  username: string,
  password: string,
): Promise<{ token: string; session: AuthSession }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const data = await parseJsonSafe<LoginResponse>(res);
  if (!res.ok || !data || !data.ok || !data.token || !data.session) {
    const err = new Error(
      data?.error || 'Jina la mtumiaji au nenosiri si sahihi. Tafadhali jaribu tena.',
    ) as Error & { locked?: boolean };
    err.locked = Boolean(data?.locked);
    throw err;
  }
  return { token: data.token, session: data.session };
}

export async function fetchCurrentSession(): Promise<{
  valid: boolean;
  locked?: boolean;
  error?: string;
  session?: AuthSession;
}> {
  if (!inMemoryBearerToken) {
    return { valid: false, error: 'Hakuna kikao.' };
  }
  const res = await fetch('/api/auth/me', {
    headers: { ...getAuthHeaders() },
  });
  const data = await parseJsonSafe<{
    ok?: boolean;
    locked?: boolean;
    error?: string;
    session?: AuthSession;
  }>(res);
  if (!res.ok || !data || !data.ok || !data.session) {
    return {
      valid: false,
      locked: Boolean(data?.locked),
      error: data?.error || 'Kikao kimeisha au akaunti imefungwa.',
    };
  }
  return { valid: true, session: data.session };
}

export async function hashStaffPasswordOnServer(password: string): Promise<string> {
  const res = await fetch('/api/staff/hash-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ password }),
  });
  const data = await parseJsonSafe<{ ok?: boolean; passwordHash?: string; error?: string }>(res);
  if (!res.ok || !data || !data.ok || !data.passwordHash) {
    throw new Error(data?.error || 'Imeshindwa kulinda nenosiri la mfanyakazi.');
  }
  return data.passwordHash;
}

export async function syncStaffDirectoryToServer(staffAccounts: StaffAccount[]): Promise<void> {
  if (!inMemoryBearerToken) return;
  const res = await fetch('/api/staff/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      staffAccounts: staffAccounts.map((s) => ({
        id: s.id,
        fullName: s.fullName,
        roleTitle: s.roleTitle,
        username: s.username,
        passwordHash: s.passwordHash,
        accountStatus: s.accountStatus,
        lockReason: s.lockReason || '',
        permissions: s.permissions,
        lastLoginAt: s.lastLoginAt || '',
      })),
    }),
  });
  if (!res.ok) {
    const data = await parseJsonSafe<{ error?: string }>(res);
    throw new Error(data?.error || 'Imeshindwa kusawazisha wafanyakazi kwenye seva.');
  }
}
