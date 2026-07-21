import type { Request, Response } from 'express';
import { adminSyncRunStatusApiHandler } from '../../../../src/server/adminSyncApi.ts';
import { sendApiError } from '../../../../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await adminSyncRunStatusApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
