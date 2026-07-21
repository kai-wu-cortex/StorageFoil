import type { AuthUser } from '../shared/authTypes';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface AuthApi {
  login(username: string, password: string): Promise<AuthUser>;
  getMe(): Promise<AuthUser | null>;
  logout(): Promise<void>;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.displayName === 'string' &&
    (candidate.role === 'viewer' || candidate.role === 'admin')
  );
}

export async function parseAuthApiResponse(response: Response): Promise<AuthUser> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('登录服务返回了非 JSON 响应。');
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('登录服务响应格式无效。');
  }

  const envelope = payload as {
    success?: unknown;
    data?: unknown;
    message?: unknown;
  };
  if (envelope.success === true && isAuthUser(envelope.data)) {
    return envelope.data;
  }
  if (envelope.success === false && typeof envelope.message === 'string') {
    throw new Error(envelope.message);
  }

  throw new Error('登录服务响应格式无效。');
}

export function createAuthApi(fetcher: FetchLike = fetch): AuthApi {
  return {
    async login(username: string, password: string) {
      return parseAuthApiResponse(
        await fetcher('/api/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        }),
      );
    },

    async getMe() {
      try {
        return await parseAuthApiResponse(
          await fetcher('/api/auth/me', {
            method: 'GET',
            credentials: 'include',
          }),
        );
      } catch {
        return null;
      }
    },

    async logout() {
      await parseLogoutResponse(
        await fetcher('/api/logout', {
          method: 'POST',
          credentials: 'include',
        }),
      );
    },
  };
}

async function parseLogoutResponse(response: Response): Promise<void> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('登录服务返回了非 JSON 响应。');
  }

  if (payload && typeof payload === 'object' && (payload as { success?: unknown }).success === true) {
    return;
  }
  if (payload && typeof payload === 'object' && typeof (payload as { message?: unknown }).message === 'string') {
    throw new Error((payload as { message: string }).message);
  }
  throw new Error('退出登录失败。');
}

export const authApi = createAuthApi();
