import type { Request, Response } from 'express';
import { logoutApiHandler } from '../src/server/logoutApi.ts';
import { sendApiError } from '../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await logoutApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
