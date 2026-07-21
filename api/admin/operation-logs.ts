import type { Request, Response } from 'express';
import { operationLogApiHandler } from '../../src/server/operationLogApi.ts';
import { sendApiError } from '../../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await operationLogApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
