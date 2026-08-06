import type { Request, Response } from 'express';
import { sendApiError } from '../../src/server/sessionAuth.ts';
import { httpSyncApiHandler } from '../../src/server/httpSyncApi.ts';
import { scheduledSyncApiHandler } from '../../src/server/scheduledSyncApi.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    if (req.method === 'GET') {
      await scheduledSyncApiHandler(req, res);
    } else {
      await httpSyncApiHandler(req, res);
    }
  } catch (error) {
    sendApiError(res, error);
  }
}
