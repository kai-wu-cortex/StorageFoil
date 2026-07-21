import type { Request, Response } from 'express';
import { syncConfigApiHandler } from '../../src/server/syncConfigApi.ts';
import { sendApiError } from '../../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await syncConfigApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
