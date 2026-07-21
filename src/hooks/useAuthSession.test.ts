import assert from 'node:assert/strict';
import test from 'node:test';
import {
  authSessionReducer,
  createAuthSessionController,
  getInitialAuthState,
} from './useAuthSession';

const user = {
  id: 'admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin' as const,
};

test('auth reducer moves through checking anonymous authenticated and error states', () => {
  assert.deepEqual(getInitialAuthState(), {
    status: 'checking',
    user: null,
    error: null,
    isSigningIn: false,
  });

  assert.deepEqual(authSessionReducer(getInitialAuthState(), { type: 'restore_failed' }), {
    status: 'anonymous',
    user: null,
    error: null,
    isSigningIn: false,
  });

  assert.deepEqual(
    authSessionReducer(getInitialAuthState(), { type: 'authenticated', user }),
    {
      status: 'authenticated',
      user,
      error: null,
      isSigningIn: false,
    },
  );

  assert.deepEqual(
    authSessionReducer(getInitialAuthState(), { type: 'error', error: '服务异常' }),
    {
      status: 'error',
      user: null,
      error: '服务异常',
      isSigningIn: false,
    },
  );
});

test('controller restores a session and calls bootstrap once', async () => {
  let restoreCalls = 0;
  let bootstrapCalls = 0;
  const states: string[] = [];
  const controller = createAuthSessionController({
    api: {
      getMe: async () => {
        restoreCalls += 1;
        return user;
      },
      login: async () => user,
      logout: async () => undefined,
    },
    onAuthenticated: async () => {
      bootstrapCalls += 1;
    },
    onStateChange: state => states.push(state.status),
  });

  await controller.restore();
  await controller.restore();

  assert.equal(restoreCalls, 2);
  assert.equal(bootstrapCalls, 1);
  assert.deepEqual(states.filter(status => status === 'authenticated'), ['authenticated', 'authenticated']);
});

test('controller login and logout update state predictably', async () => {
  const states: string[] = [];
  const controller = createAuthSessionController({
    api: {
      getMe: async () => null,
      login: async () => user,
      logout: async () => undefined,
    },
    onAuthenticated: async () => undefined,
    onStateChange: state => states.push(`${state.status}:${state.isSigningIn}`),
  });

  await controller.login('admin', 'secret');
  await controller.logout();

  assert.deepEqual(states, [
    'checking:true',
    'authenticated:false',
    'anonymous:false',
  ]);
});
