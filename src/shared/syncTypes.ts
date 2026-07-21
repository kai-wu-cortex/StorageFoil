import type { InventoryBatch, WpsFieldConfig } from '../types.ts';

export interface EncryptedSecret {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface ServerWpsCredentials {
  apiBase: string;
  appId: string;
  redirectUri: string;
  appKeyEncrypted?: EncryptedSecret;
  refreshTokenEncrypted?: EncryptedSecret;
  accessTokenEncrypted?: EncryptedSecret;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PublicWpsCredentials {
  apiBase: string;
  appId: string;
  redirectUri: string;
  hasAppKey: boolean;
  hasRefreshToken: boolean;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WpsSyncSourceConfig {
  id: string;
  name: string;
  alias?: string;
  address?: string;
  enabled: boolean;
  fileId: string;
  worksheetIdStart: number;
  worksheetIdEnd: number;
  rowFrom: number;
  rowTo: number;
  colFrom: number;
  colTo: number;
  fieldConfig: WpsFieldConfig[];
  updatedAt: string;
  updatedBy: string;
}

export interface ServerSyncConfig {
  credentials: ServerWpsCredentials;
  sources: WpsSyncSourceConfig[];
}

export interface PublicSyncConfig {
  credentials: PublicWpsCredentials;
  sources: WpsSyncSourceConfig[];
}

export interface WorksheetRange {
  worksheetIdStart: number;
  worksheetIdEnd: number;
}

export type SyncRunStatus = 'queued' | 'running' | 'validated' | 'published' | 'failed';
export type SyncRunTrigger = 'admin' | 'webhook';

export interface SyncRunSourceResult {
  sourceId: string;
  worksheetId: number;
  month: string;
  status: 'success' | 'failed' | 'skipped';
  recordCount: number;
  errorCode?: string;
}

export interface SyncRunSummary {
  id: string;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  triggeredBy: string;
  requestedFileId?: string;
  startedAt: string;
  finishedAt?: string;
  totals: {
    sources: number;
    worksheets: number;
    records: number;
    failures: number;
  };
  sourceResults: SyncRunSourceResult[];
  errorSummary?: string;
}

export interface InventoryBootstrapResponse {
  user: import('./authTypes.ts').AuthUser;
  months: string[];
  defaultMonth: string | null;
  month?: string | null;
  batches: InventoryBatch[];
  sources: Array<{
    id: string;
    name: string;
    alias?: string;
    address?: string;
    enabled: boolean;
  }>;
  latestPublishedAt: string | null;
  syncRunId?: string | null;
}
