import type { Request, Response } from 'express';
import { createApiFailure, createApiSuccess } from '../shared/apiTypes.ts';
import { getSessionSecret, requireRole, sendJson } from './sessionAuth.ts';
import { resolveEncryptionKey } from './secretCrypto.ts';
import {
  getPublicSyncConfig,
  updateSyncConfig,
  type PublicSyncConfigWithRevision,
  type SyncConfigUpdateInput,
} from './syncConfigRepository.ts';

interface SyncConfigRepositoryForApi {
  get(): Promise<PublicSyncConfigWithRevision>;
  update(input: SyncConfigUpdateInput, updatedBy: string): Promise<PublicSyncConfigWithRevision>;
}

let repositoryForTests: SyncConfigRepositoryForApi | null = null;

export function setSyncConfigRepositoryForTests(repository: SyncConfigRepositoryForApi | null): void {
  repositoryForTests = repository;
}

function repository(): SyncConfigRepositoryForApi {
  if (repositoryForTests) return repositoryForTests;
  return {
    get: () => getPublicSyncConfig(),
    update: (input, updatedBy) =>
      updateSyncConfig(undefined, input, {
        encryptionKey: resolveEncryptionKey(),
        updatedBy,
        expectedRevision: input.revision,
      }),
  };
}

export async function syncConfigApiHandler(
  req: Pick<Request, 'method' | 'headers' | 'body'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  let user;
  try {
    user = requireRole(req, getSessionSecret(), ['admin']);
  } catch {
    sendJson(res, 403, createApiFailure('FORBIDDEN', '当前账号无操作权限。', 'local'));
    return;
  }

  res.setHeader('Cache-Control', 'private, no-store');
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, createApiSuccess(await repository().get()));
      return;
    }
    if (req.method === 'PUT') {
      sendJson(res, 200, createApiSuccess(await repository().update(req.body as SyncConfigUpdateInput, user.username)));
      return;
    }
    sendJson(res, 405, createApiFailure('METHOD_NOT_ALLOWED', '仅支持 GET 或 PUT。', 'local'));
  } catch (error) {
    if (error instanceof Error && error.message === 'CONFIG_CONFLICT') {
      sendJson(res, 409, createApiFailure('CONFIG_CONFLICT', '配置已被更新，请刷新后重试。', 'local'));
      return;
    }
    throw error;
  }
}
