import type { Request, Response } from 'express';
import { sendApiError } from '../../../src/server/sessionAuth.ts';
import { wpsCallbackApiHandler } from '../../../src/server/wpsOAuthApi.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await wpsCallbackApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
