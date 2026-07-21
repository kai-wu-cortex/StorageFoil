import type { Request, Response } from 'express';
import { authMeApiHandler } from '../../src/server/authMeApi.ts';
import { sendApiError } from '../../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await authMeApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
