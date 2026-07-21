import { createHmac } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AuthUser, StorageFoilRole } from '../shared/authTypes.ts';

export type SessionUser = AuthUser;

type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'METHOD_NOT_ALLOWED'
  | 'MONGODB_API_ERROR'
  | 'SESSION_AUTH_ERROR';

interface SessionPayload extends SessionUser {
  exp: number;
}

export const SESSION_COOKIE_NAME = 'storage_foil_session';
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

export class SessionAuthError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'SessionAuthError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function base64urlEncode(data: string): string {
  return Buffer.from(data).toString('base64url');
}

function base64urlDecode(data: string): string {
  return Buffer.from(data, 'base64url').toString();
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function constantTimeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const [key, ...rest] = part.split('=');
    if (key) {
      cookies[key.trim()] = rest.join('=').trim();
    }
  }
  return cookies;
}

export function getSessionSecret(): string {
  const secret = process.env.STORAGE_FOIL_SESSION_SECRET;
  if (!secret) {
    throw new SessionAuthError(500, 'SESSION_AUTH_ERROR', '服务暂时不可用。');
  }
  return secret;
}

export function createSessionToken(
  user: SessionUser,
  secret: string,
  now: Date = new Date(),
): string {
  const payload: SessionPayload = { ...user, exp: now.getTime() + SESSION_MAX_AGE_MS };
  const encoded = base64urlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySessionToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): SessionUser | null {
  const dotIndex = token.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const encoded = token.slice(0, dotIndex);
  const receivedSignature = token.slice(dotIndex + 1);
  const expectedSignature = sign(encoded, secret);
  if (!constantTimeEqualString(receivedSignature, expectedSignature)) return null;

  try {
    const payload = JSON.parse(base64urlDecode(encoded)) as SessionPayload;
    if (payload.exp <= now.getTime()) return null;
    if (payload.role !== 'viewer' && payload.role !== 'admin') return null;
    return {
      id: payload.id,
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export function readSessionFromRequest(
  req: Pick<Request, 'headers'>,
  secret: string,
): SessionUser | null {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
  return token ? verifySessionToken(token, secret) : null;
}

export function requireSession(req: Pick<Request, 'headers'>, secret: string): SessionUser {
  const user = readSessionFromRequest(req, secret);
  if (!user) {
    throw new SessionAuthError(401, 'UNAUTHORIZED', '请先登录。');
  }
  return user;
}

export function requireRole(
  req: Pick<Request, 'headers'>,
  secret: string,
  roles: StorageFoilRole[],
): SessionUser {
  const user = requireSession(req, secret);
  if (!roles.includes(user.role)) {
    throw new SessionAuthError(403, 'FORBIDDEN', '当前账号无操作权限。');
  }
  return user;
}

export function requireSameOrigin(
  req: Pick<Request, 'headers'>,
  deploymentOrigin = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL,
): void {
  const origin = req.headers.origin;
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      throw new SessionAuthError(403, 'FORBIDDEN', '请求来源不合法。');
    }
    return;
  }

  const allowedOrigins = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);
  if (deploymentOrigin) {
    allowedOrigins.add(deploymentOrigin.startsWith('http') ? deploymentOrigin : `https://${deploymentOrigin}`);
  }
  if (!allowedOrigins.has(origin)) {
    throw new SessionAuthError(403, 'FORBIDDEN', '请求来源不合法。');
  }
}

function secureCookieAttribute(secure = true): string {
  return secure ? '; Secure' : '';
}

export function createSessionCookie(token: string, options: { secure?: boolean } = {}): string {
  const secure = options.secure ?? true;
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly${secureCookieAttribute(secure)}; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_MS / 1000}`;
}

export function createExpiredSessionCookie(options: { secure?: boolean } = {}): string {
  const secure = options.secure ?? true;
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly${secureCookieAttribute(secure)}; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function setSessionCookie(res: Pick<Response, 'setHeader'>, token: string): void {
  res.setHeader('Set-Cookie', createSessionCookie(token, { secure: process.env.NODE_ENV !== 'development' }));
}

export function clearSessionCookie(res: Pick<Response, 'setHeader'>): void {
  res.setHeader('Set-Cookie', createExpiredSessionCookie({ secure: process.env.NODE_ENV !== 'development' }));
}

export function sendJson(
  res: Pick<Response, 'status' | 'json'>,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  res.status(statusCode).json(payload);
}

export function sendApiError(res: Pick<Response, 'status' | 'json'>, error: unknown): void {
  if (error instanceof SessionAuthError) {
    sendJson(res, error.statusCode, {
      success: false,
      error: { code: error.code, requestId: 'local' },
      message: error.message,
    });
    return;
  }

  console.error(error);
  sendJson(res, 500, {
    success: false,
    error: { code: 'MONGODB_API_ERROR', requestId: 'local' },
    message: '服务暂时不可用。',
  });
}
