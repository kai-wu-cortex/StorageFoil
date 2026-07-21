import type { Request, Response } from 'express';
import { sendApiError } from '../../src/server/sessionAuth.ts';
import { webhookSyncApiHandler } from '../../src/server/webhookSyncApi.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await webhookSyncApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
