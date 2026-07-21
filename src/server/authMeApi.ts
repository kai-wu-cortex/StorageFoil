import type { Request, Response } from 'express';
import { SessionAuthError, getSessionSecret, requireSession, sendJson } from './sessionAuth.ts';

export async function authMeApiHandler(
  req: Pick<Request, 'method' | 'headers'>,
  res: Pick<Response, 'status' | 'json'>,
): Promise<void> {
  if (req.method !== 'GET') {
    throw new SessionAuthError(405, 'METHOD_NOT_ALLOWED', '仅支持 GET。');
  }

  const user = requireSession(req, getSessionSecret());
  sendJson(res, 200, { success: true, data: user });
}
