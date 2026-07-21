import type { Collection, Document } from 'mongodb';
import type { StorageFoilRole } from '../shared/authTypes.ts';
import type { EncryptedSecret, SyncRunStatus, SyncRunTrigger, WpsSyncSourceConfig } from '../shared/syncTypes.ts';
import type { InventoryBatch } from '../types.ts';

export const STORAGE_FOIL_COLLECTION_PREFIX = 'storage_foil_';

export const COLLECTION_NAMES = {
  users: 'storage_foil_users',
  wpsCredentials: 'storage_foil_wps_credentials',
  syncSources: 'storage_foil_sync_sources',
  syncRuns: 'storage_foil_sync_runs',
  inventoryBatches: 'storage_foil_inventory_batches',
  inventoryPublications: 'storage_foil_inventory_publications',
  syncLocks: 'storage_foil_sync_locks',
} as const;

export interface StorageFoilUserDocument extends Document {
  _id: string;
  username: string;
  displayName: string;
  role: StorageFoilRole;
  enabled: boolean;
  password: {
    algorithm: 'scrypt-v1';
    salt: string;
    hash: string;
  };
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
}

export interface StorageFoilWpsCredentialsDocument extends Document {
  _id: 'global';
  apiBase: string;
  appId: string;
  redirectUri: string;
  appKeyEncrypted?: EncryptedSecret;
  refreshTokenEncrypted?: EncryptedSecret;
  accessTokenEncrypted?: EncryptedSecret;
  accessExpiresAt?: Date;
  refreshExpiresAt?: Date;
  updatedAt: Date;
  updatedBy: string;
}

export interface StorageFoilSyncSourceDocument
  extends Omit<WpsSyncSourceConfig, 'updatedAt'>,
    Document {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageFoilSyncRunDocument extends Document {
  _id: string;
  status: SyncRunStatus;
  trigger: SyncRunTrigger;
  triggeredBy: string;
  idempotencyKey: string;
  configRevision: string;
  startedAt: Date;
  finishedAt?: Date;
  sourceResults: Array<{
    sourceId: string;
    worksheetId: number;
    month: string;
    status: 'success' | 'failed' | 'skipped';
    recordCount: number;
    errorCode?: string;
  }>;
  totals: {
    sources: number;
    worksheets: number;
    records: number;
    failures: number;
  };
  errorSummary?: string;
}

export interface StorageFoilInventoryBatchDocument
  extends Omit<InventoryBatch, 'id' | 'createdAt'>,
    Document {
  _id: string;
  syncRunId: string;
  sourceId: string;
  sourceName: string;
  month: string;
  recordKey: string;
  worksheetId: number;
  worksheetName: string;
  sourceRow: number;
  syncedAt: Date;
  createdAt: Date;
}

export interface StorageFoilInventoryPublicationDocument extends Document {
  _id: string;
  month: string;
  syncRunId: string;
  publishedAt: Date;
  publishedBy: string;
  sourceIds: string[];
}

export interface StorageFoilSyncLockDocument extends Document {
  _id: 'wps-full-sync';
  ownerRunId: string;
  expiresAt: Date;
  acquiredAt: Date;
}

export interface StorageFoilCollections {
  users: Collection<StorageFoilUserDocument>;
  wpsCredentials: Collection<StorageFoilWpsCredentialsDocument>;
  syncSources: Collection<StorageFoilSyncSourceDocument>;
  syncRuns: Collection<StorageFoilSyncRunDocument>;
  inventoryBatches: Collection<StorageFoilInventoryBatchDocument>;
  inventoryPublications: Collection<StorageFoilInventoryPublicationDocument>;
  syncLocks: Collection<StorageFoilSyncLockDocument>;
}

interface CollectionResolver {
  collection<T extends Document = Document>(name: string): unknown;
}

export function getStorageFoilCollections(db: CollectionResolver): StorageFoilCollections {
  return {
    users: db.collection<StorageFoilUserDocument>(COLLECTION_NAMES.users) as Collection<StorageFoilUserDocument>,
    wpsCredentials: db.collection<StorageFoilWpsCredentialsDocument>(
      COLLECTION_NAMES.wpsCredentials,
    ) as Collection<StorageFoilWpsCredentialsDocument>,
    syncSources: db.collection<StorageFoilSyncSourceDocument>(
      COLLECTION_NAMES.syncSources,
    ) as Collection<StorageFoilSyncSourceDocument>,
    syncRuns: db.collection<StorageFoilSyncRunDocument>(
      COLLECTION_NAMES.syncRuns,
    ) as Collection<StorageFoilSyncRunDocument>,
    inventoryBatches: db.collection<StorageFoilInventoryBatchDocument>(
      COLLECTION_NAMES.inventoryBatches,
    ) as Collection<StorageFoilInventoryBatchDocument>,
    inventoryPublications: db.collection<StorageFoilInventoryPublicationDocument>(
      COLLECTION_NAMES.inventoryPublications,
    ) as Collection<StorageFoilInventoryPublicationDocument>,
    syncLocks: db.collection<StorageFoilSyncLockDocument>(
      COLLECTION_NAMES.syncLocks,
    ) as Collection<StorageFoilSyncLockDocument>,
  };
}
