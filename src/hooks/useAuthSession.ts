import { useCallback, useEffect, useMemo, useState } from 'react';
import { authApi, type AuthApi } from '../lib/authApi';
import type { AuthUser } from '../shared/authTypes';

export type AuthSessionStatus = 'checking' | 'anonymous' | 'authenticated' | 'error';

export interface AuthSessionState {
  status: AuthSessionStatus;
  user: AuthUser | null;
  error: string | null;
  isSigningIn: boolean;
}

type AuthSessionAction =
  | { type: 'restore_failed' }
  | { type: 'authenticated'; user: AuthUser }
  | { type: 'error'; error: string }
  | { type: 'signing_in' }
  | { type: 'signed_out' };

export interface AuthSessionControllerOptions {
  api: Pick<AuthApi, 'getMe' | 'login' | 'logout'>;
  onAuthenticated?: (user: AuthUser) => Promise<void> | void;
  onStateChange?: (state: AuthSessionState) => void;
}

export function getInitialAuthState(): AuthSessionState {
  return {
    status: 'checking',
    user: null,
    error: null,
    isSigningIn: false,
  };
}

export function authSessionReducer(
  state: AuthSessionState,
  action: AuthSessionAction,
): AuthSessionState {
  switch (action.type) {
    case 'restore_failed':
      return { status: 'anonymous', user: null, error: null, isSigningIn: false };
    case 'authenticated':
      return { status: 'authenticated', user: action.user, error: null, isSigningIn: false };
    case 'error':
      return { status: 'error', user: null, error: action.error, isSigningIn: false };
    case 'signing_in':
      return { ...state, error: null, isSigningIn: true };
    case 'signed_out':
      return { status: 'anonymous', user: null, error: null, isSigningIn: false };
    default:
      return state;
  }
}

export function createAuthSessionController(options: AuthSessionControllerOptions) {
  let state = getInitialAuthState();
  let didBootstrap = false;

  const setState = (action: AuthSessionAction) => {
    state = authSessionReducer(state, action);
    options.onStateChange?.(state);
  };

  const markAuthenticated = async (user: AuthUser) => {
    setState({ type: 'authenticated', user });
    if (!didBootstrap) {
      didBootstrap = true;
      await options.onAuthenticated?.(user);
    }
  };

  return {
    getState: () => state,
    async restore() {
      const user = await options.api.getMe();
      if (user) {
        await markAuthenticated(user);
      } else {
        setState({ type: 'restore_failed' });
      }
    },
    async login(username: string, password: string) {
      setState({ type: 'signing_in' });
      try {
        await markAuthenticated(await options.api.login(username, password));
      } catch (error) {
        setState({ type: 'error', error: error instanceof Error ? error.message : '登录失败。' });
      }
    },
    async logout() {
      await options.api.logout();
      didBootstrap = false;
      setState({ type: 'signed_out' });
    },
  };
}

export function useAuthSession(options: {
  api?: AuthApi;
  onAuthenticated?: (user: AuthUser) => Promise<void> | void;
} = {}) {
  const [state, setState] = useState(getInitialAuthState);
  const api = options.api ?? authApi;

  const onAuthenticated = options.onAuthenticated;
  const controller = useMemo(
    () =>
      createAuthSessionController({
        api,
        onAuthenticated,
        onStateChange: setState,
      }),
    [api, onAuthenticated],
  );

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  const signIn = useCallback(
    (username: string, password: string) => controller.login(username, password),
    [controller],
  );

  const signOut = useCallback(() => controller.logout(), [controller]);

  return { ...state, signIn, signOut };
}
