import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { COLLECTION_NAMES, type StorageFoilWpsCredentialsDocument } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { getSessionSecret, requireRole, sendJson } from './sessionAuth.ts';
import { exchangeWpsAuthorizationCode } from './wpsTokenService.ts';

interface WpsOAuthService {
  buildAuthorizationUrl(user: string): Promise<string>;
  exchangeCode(code: string, user: string): Promise<void>;
}

let serviceForTests: WpsOAuthService | null = null;

export function setWpsOAuthServiceForTests(service: WpsOAuthService | null): void {
  serviceForTests = service;
}

async function buildAuthorizationUrl(): Promise<string> {
  const collection = await getMongoCollection<StorageFoilWpsCredentialsDocument>(COLLECTION_NAMES.wpsCredentials);
  const credential = await collection.findOne({ _id: 'global' });
  if (!credential?.appId || !credential.redirectUri) {
    throw new Error('WPS credentials are not configured.');
  }
  const params = new URLSearchParams({
    client_id: credential.appId,
    response_type: 'code',
    redirect_uri: credential.redirectUri,
    scope: 'kso.user_base.read,kso.sheets.read',
  });
  return `${credential.apiBase.replace(/\/$/, '')}/oauth2/auth?${params.toString()}`;
}

function service(): WpsOAuthService {
  if (serviceForTests) return serviceForTests;
  return {
    buildAuthorizationUrl,
    exchangeCode: (code, user) => exchangeWpsAuthorizationCode(code, { updatedBy: user }),
  };
}

export async function wpsAuthorizationUrlApiHandler(
  req: Pick<Request, 'method' | 'headers'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  let user;
  try {
    user = requireRole(req, getSessionSecret(), ['admin']);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET。', 'local'));
    return;
  }
  sendJson(res, 200, createApiSuccess({ url: await service().buildAuthorizationUrl(user.username) }));
}

export async function wpsCallbackApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'query'>,
  res: Pick<Response, 'status' | 'json' | 'redirect'>,
): Promise<void> {
  let user;
  try {
    user = requireRole(req, getSessionSecret(), ['admin']);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }
  if (req.method !== 'GET') {
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET。', 'local'));
    return;
  }
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  if (!code) {
    sendJson(res, 400, createApiFailure('INVALID_CODE', '缺少 WPS 授权 Code。', 'local'));
    return;
  }
  await service().exchangeCode(code, user.username);
  res.redirect(302, '/?admin=wps&authorized=1');
}
