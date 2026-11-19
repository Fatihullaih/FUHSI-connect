export const SESSION_TOKEN_KEY = 'fuhsi_session_token';

export function getSessionToken(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const st = sessionStorage.getItem(SESSION_TOKEN_KEY);
      if (st && st.trim()) return st.trim();
    }
    if (typeof localStorage !== 'undefined') {
      const lt = localStorage.getItem(SESSION_TOKEN_KEY);
      if (lt && lt.trim()) return lt.trim();
    }
  } catch {}
  return '';
}

export function setSessionToken(token: string, isAdmin: boolean = false): void {
  const clean = (token || '').trim();
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (clean) sessionStorage.setItem(SESSION_TOKEN_KEY, clean);
      else sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
    if (typeof localStorage !== 'undefined') {
      // Never persist Admin bearer tokens in cross-session localStorage
      if (clean && !isAdmin) {
        localStorage.setItem(SESSION_TOKEN_KEY, clean);
      } else {
        localStorage.removeItem(SESSION_TOKEN_KEY);
      }
    }
  } catch {}
}

export function clearSessionToken(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {}
}

export function clearAllClientAuthCaches(): void {
  clearSessionToken();
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('fuhsi_active_user');
    }
    if (typeof localStorage !== 'undefined') {
      const staticKeys = [
        'fuhsi_active_user',
        'fuhsi_users_db',
        'fuhsi_direct_messages_db',
        'fuhsi_verifications_db',
        'fuhsi_verif_candidates_db',
        'fuhsi_reports_db',
        'fuhsi_broadcast_notifications',
        'fuhsi_last_profile_save',
      ];
      staticKeys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith('fuhsi_user_notifications_') ||
          k.startsWith('fuhsi_notifications_read_') ||
          k.startsWith('fuhsi_notifications_v1_')
        ) {
          toDelete.push(k);
        }
      }
      toDelete.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
    }
  } catch {}
}

export function stripSensitiveUserFields<T extends Record<string, any>>(user: T): T {
  if (!user || typeof user !== 'object') return user;
  const copy: any = { ...user };
  delete copy.password;
  delete copy.savedPassword;
  delete copy.passwordHash;
  return copy;
}

export function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  const baseUrl = String((import.meta as any).env?.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
  if (baseUrl && typeof input === 'string' && input.startsWith('/api/')) {
    return `${baseUrl}${input}`;
  }
  return input;
}

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const resolvedInput = resolveApiUrl(input);
  const urlStr = typeof resolvedInput === 'string' ? resolvedInput : resolvedInput instanceof URL ? resolvedInput.toString() : '';
  const isLoginOrPublicAuth =
    urlStr.includes('/api/auth/login') ||
    urlStr.includes('/api/auth/register') ||
    urlStr.includes('/api/auth/forgot-identify') ||
    urlStr.includes('/api/auth/verify-reset-identity') ||
    urlStr.includes('/api/auth/reset-password');

  const res = await fetch(resolvedInput, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && !isLoginOrPublicAuth && !urlStr.includes('/api/auth/session')) {
    if (typeof window !== 'undefined') {
      clearSessionToken();
      window.dispatchEvent(new CustomEvent('fuhsi_session_expired'));
    }
  }
  return res;
}
