import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess, parseInventoryMonth } from '../shared/apiTypes.ts';
import type { AuthUser } from '../shared/authTypes.ts';
import {
  getInventoryBootstrap,
  getPublishedInventory,
  type PublishedInventoryResponse,
} from './inventoryRepository.ts';
import { getSessionSecret, requireSession, sendJson } from './sessionAuth.ts';

interface InventoryRepositoryFacade {
  bootstrap(options: { user: AuthUser; month?: string; sourceId?: string }): Promise<PublishedInventoryResponse>;
  inventory(options: { user: AuthUser; month: string; sourceId?: string }): Promise<PublishedInventoryResponse>;
}

let repositoryResolver: (() => Promise<InventoryRepositoryFacade>) | null = null;

export function setInventoryRepositoryResolverForTests(
  resolver: (() => Promise<InventoryRepositoryFacade>) | null,
): void {
  repositoryResolver = resolver;
}

async function getRepository(): Promise<InventoryRepositoryFacade> {
  if (repositoryResolver) return repositoryResolver();
  return {
    bootstrap: options => getInventoryBootstrap(options),
    inventory: options => getPublishedInventory(options),
  };
}

function getQueryValue(value: unknown): string | undefined {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
}

function sendError(
  res: Pick<Response, 'status' | 'json'>,
  status: number,
  code: string,
  message: string,
): void {
  sendJson(res, status, createApiFailure(code, message, 'local'));
}

async function authenticate(req: Pick<Request, 'headers'>, res: Pick<Response, 'status' | 'json'>) {
  try {
    return requireSession(req, getSessionSecret());
  } catch {
    sendError(res, 401, 'UNAUTHORIZED', '请先登录。');
    return null;
  }
}

export async function inventoryBootstrapApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'query'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  if (req.method !== 'GET') {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', '仅支持 GET。');
    return;
  }
  const user = await authenticate(req, res);
  if (!user) return;

  const month = getQueryValue(req.query?.month);
  if (month) {
    try {
      parseInventoryMonth(month);
    } catch {
      sendError(res, 400, 'BAD_MONTH', '月份格式无效。');
      return;
    }
  }

  res.setHeader('Cache-Control', 'private, no-store');
  const repository = await getRepository();
  sendJson(
    res,
    200,
    createApiSuccess(
      await repository.bootstrap({
        user,
        month,
        sourceId: getQueryValue(req.query?.sourceId),
      }),
    ),
  );
}

export async function inventoryMonthApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'query'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  if (req.method !== 'GET') {
    sendError(res, 405, 'METHOD_NOT_ALLOWED', '仅支持 GET。');
    return;
  }
  const user = await authenticate(req, res);
  if (!user) return;

  const month = getQueryValue(req.query?.month);
  try {
    parseInventoryMonth(month);
  } catch {
    sendError(res, 400, 'BAD_MONTH', '月份格式无效。');
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  const repository = await getRepository();
  sendJson(
    res,
    200,
    createApiSuccess(
      await repository.inventory({
        user,
        month: month as string,
        sourceId: getQueryValue(req.query?.sourceId),
      }),
    ),
  );
}
