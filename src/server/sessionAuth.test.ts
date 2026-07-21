import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SESSION_COOKIE_NAME,
  SessionAuthError,
  createExpiredSessionCookie,
  createSessionCookie,
  createSessionToken,
  getSessionSecret,
  requireRole,
  requireSameOrigin,
  verifySessionToken,
} from './sessionAuth.ts';

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('session token verifies before expiration and rejects tampering', () => {
  const now = new Date('2026-07-01T00:00:00.000Z');
  const token = createSessionToken(
    { id: 'viewer-1', username: 'viewer1', displayName: 'Viewer 1', role: 'viewer' },
    'secret',
    now,
  );

  assert.deepEqual(verifySessionToken(token, 'secret', new Date('2026-07-01T01:00:00.000Z')), {
    id: 'viewer-1',
    username: 'viewer1',
    displayName: 'Viewer 1',
    role: 'viewer',
  });
  assert.equal(verifySessionToken(`${token}x`, 'secret', now), null);
  assert.equal(verifySessionToken(token, 'other-secret', now), null);
  assert.equal(verifySessionToken(token, 'secret', new Date('2026-07-02T00:00:00.000Z')), null);
  assert.equal(verifySessionToken('not-json.signature', 'secret', now), null);
});

test('session cookies use the StorageFoil name and secure HttpOnly attributes', () => {
  const cookie = createSessionCookie('token');
  assert.equal(SESSION_COOKIE_NAME, 'storage_foil_session');
  assert.match(cookie, /^storage_foil_session=token/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=28800/);

  assert.doesNotMatch(createSessionCookie('token', { secure: false }), /Secure/);
  assert.match(createExpiredSessionCookie(), /Max-Age=0/);
});

test('requireRole rejects insufficient roles', () => {
  const token = createSessionToken(
    { id: 'viewer-1', username: 'viewer1', displayName: 'Viewer 1', role: 'viewer' },
    'secret',
  );
  const req = { headers: { cookie: `storage_foil_session=${token}` } };

  assert.throws(
    () => requireRole(req, 'secret', ['admin']),
    error => error instanceof SessionAuthError && error.statusCode === 403,
  );
});

test('getSessionSecret reads the independent StorageFoil secret', () => {
  delete process.env.STORAGE_FOIL_SESSION_SECRET;
  assert.throws(
    () => getSessionSecret(),
    error =>
      error instanceof SessionAuthError &&
      error.statusCode === 500 &&
      error.code === 'SESSION_AUTH_ERROR',
  );

  process.env.STORAGE_FOIL_SESSION_SECRET = 'session-secret';
  assert.equal(getSessionSecret(), 'session-secret');
});

test('requireSameOrigin accepts local development and rejects mismatched production origins', () => {
  assert.doesNotThrow(() =>
    requireSameOrigin({ headers: { origin: 'http://localhost:3000' } }, 'https://storage.example.com'),
  );
  assert.doesNotThrow(() =>
    requireSameOrigin({ headers: { origin: 'https://storage.example.com' } }, 'https://storage.example.com'),
  );
  assert.throws(
    () => requireSameOrigin({ headers: { origin: 'https://evil.example.com' } }, 'https://storage.example.com'),
    error => error instanceof SessionAuthError && error.statusCode === 403,
  );
});
