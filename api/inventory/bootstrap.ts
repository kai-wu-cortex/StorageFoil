import type { Request, Response } from 'express';
import { inventoryBootstrapApiHandler } from '../../src/server/inventoryReadApi.ts';
import { sendApiError } from '../../src/server/sessionAuth.ts';

export default async function handler(req: Request, res: Response): Promise<void> {
  try {
    await inventoryBootstrapApiHandler(req, res);
  } catch (error) {
    sendApiError(res, error);
  }
}
