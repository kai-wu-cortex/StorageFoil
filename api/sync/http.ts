import type { Request, Response } from 'express';
import { sendApiError } from '../../src/server/sessionAuth.ts';
import { httpSyncApiHandler } from '../../src/server/httpSyncApi.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await httpSyncApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
