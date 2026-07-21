import {
  type AuthUser,
  type StorageFoilRole,
  isStorageFoilRole,
  parseStorageFoilRole,
} from './authTypes.ts';
import type {
  InventoryBootstrapResponse,
  PublicSyncConfig,
  ServerSyncConfig,
  SyncRunSummary,
  WorksheetRange,
  WpsSyncSourceConfig,
} from './syncTypes.ts';

export { isStorageFoilRole, parseStorageFoilRole };
export type {
  AuthUser,
  InventoryBootstrapResponse,
  PublicSyncConfig,
  ServerSyncConfig,
  StorageFoilRole,
  SyncRunSummary,
  WorksheetRange,
  WpsSyncSourceConfig,
};

export type ApiSuccess<T> = { success: true; data: T };

export type ApiFailure = {
  success: false;
  error: { code: string; requestId: string };
  message: string;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export function createApiSuccess<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function createApiFailure(
  code: string,
  message: string,
  requestId: string,
): ApiFailure {
  return {
    success: false,
    error: { code, requestId },
    message,
  };
}

export function parseInventoryMonth(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid inventory month');
  }

  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Invalid inventory month');
  }

  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error('Invalid inventory month');
  }

  return value;
}

export function normalizeWorksheetRange(start: unknown, end: unknown): WorksheetRange {
  const startId = toWorksheetId(start);
  const endId = toWorksheetId(end);
  const worksheetIdStart = Math.min(startId, endId);
  const worksheetIdEnd = Math.max(startId, endId);

  if (worksheetIdEnd - worksheetIdStart > 120) {
    throw new Error('Invalid worksheet range');
  }

  return { worksheetIdStart, worksheetIdEnd };
}

function toWorksheetId(value: unknown): number {
  const numberValue = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

  if (
    typeof numberValue !== 'number' ||
    !Number.isInteger(numberValue) ||
    numberValue < 1 ||
    numberValue > 120
  ) {
    throw new Error('Invalid worksheet range');
  }

  return numberValue;
}

export function toPublicSyncConfig(config: ServerSyncConfig): PublicSyncConfig {
  const { credentials } = config;

  return {
    credentials: {
      apiBase: credentials.apiBase,
      appId: credentials.appId,
      redirectUri: credentials.redirectUri,
      hasAppKey: Boolean(credentials.appKeyEncrypted),
      hasRefreshToken: Boolean(credentials.refreshTokenEncrypted),
      accessExpiresAt: credentials.accessExpiresAt,
      refreshExpiresAt: credentials.refreshExpiresAt,
      updatedAt: credentials.updatedAt,
      updatedBy: credentials.updatedBy,
    },
    sources: config.sources.map(source => ({ ...source })),
  };
}
