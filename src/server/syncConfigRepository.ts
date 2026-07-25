import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import { normalizeWorksheetRange } from '../shared/apiTypes.ts';
import type {
  EncryptedSecret,
  PublicSyncConfig,
  PublicWpsCredentials,
  WpsSyncSourceConfig,
} from '../shared/syncTypes.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { STORAGE_FOIL_COLLECTION_SCHEMAS } from './schemaDefinitions.ts';
import { encryptSecret } from './secretCrypto.ts';

interface SyncConfigCredentialDocument {
  _id: 'global';
  apiBase: string;
  appId: string;
  redirectUri: string;
  appKeyEncrypted?: EncryptedSecret;
  refreshTokenEncrypted?: EncryptedSecret;
  accessTokenEncrypted?: EncryptedSecret;
  updatedAt: Date;
  updatedBy: string;
}

interface SyncSourceDocument extends Omit<WpsSyncSourceConfig, 'id' | 'updatedAt'> {
  _id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncConfigCollections {
  wpsCredentials: {
    findOne(filter: { _id: 'global' }): Promise<SyncConfigCredentialDocument | null | unknown>;
    updateOne(
      filter: { _id: 'global' },
      update: { $set: Partial<SyncConfigCredentialDocument> },
      options?: { upsert?: boolean },
    ): Promise<{ acknowledged: boolean }>;
  };
  syncSources: {
    find(filter?: Record<string, unknown>): { sort(sort: Record<string, 1 | -1>): { toArray(): Promise<unknown[]> } };
    updateOne(
      filter: { _id: string },
      update: { $set: Partial<SyncSourceDocument>; $setOnInsert?: Partial<SyncSourceDocument> },
      options?: { upsert?: boolean },
    ): Promise<{ acknowledged: boolean }>;
    updateMany(
      filter: { _id: { $nin: string[] } },
      update: { $set: { enabled: boolean; updatedAt: Date; updatedBy: string } },
    ): Promise<{ acknowledged: boolean }>;
    deleteMany(filter: { _id: { $nin: string[] } }): Promise<{ acknowledged: boolean; deletedCount?: number }>;
  };
}

export interface SyncConfigUpdateInput {
  revision?: string;
  credentials: {
    apiBase?: string;
    appId?: string;
    appKey?: string;
    redirectUri?: string;
    clearCredential?: 'appKey' | 'refreshToken' | 'accessToken';
  };
  sources: Array<{
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
    fieldConfig?: WpsSyncSourceConfig['fieldConfig'];
  }>;
}

export interface PublicSyncConfigWithRevision extends PublicSyncConfig {
  revision: string;
}

interface MongoCommandRunner {
  command(command: Record<string, unknown>): Promise<unknown>;
}

export async function ensureSyncSourcesValidator(db: MongoCommandRunner): Promise<void> {
  const schema = STORAGE_FOIL_COLLECTION_SCHEMAS.find(
    candidate => candidate.name === COLLECTION_NAMES.syncSources,
  );
  if (!schema) throw new Error('Sync source schema is not configured.');

  await db.command({
    collMod: schema.name,
    validator: schema.validator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
}

async function getDefaultCollections(): Promise<SyncConfigCollections> {
  return {
    wpsCredentials: await getMongoCollection(COLLECTION_NAMES.wpsCredentials),
    syncSources: await getMongoCollection(COLLECTION_NAMES.syncSources),
  } as unknown as SyncConfigCollections;
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function createRevision(updatedAt?: Date | string): string {
  if (!updatedAt) return '';
  return updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt;
}

function publicCredentials(doc: SyncConfigCredentialDocument | null): PublicWpsCredentials {
  return {
    apiBase: doc?.apiBase || 'https://openapi.wps.cn',
    appId: doc?.appId || '',
    redirectUri: doc?.redirectUri || '',
    hasAppKey: Boolean(doc?.appKeyEncrypted),
    hasRefreshToken: Boolean(doc?.refreshTokenEncrypted),
    updatedAt: createRevision(doc?.updatedAt) || '',
    updatedBy: doc?.updatedBy || '',
  };
}

function publicSource(doc: SyncSourceDocument): WpsSyncSourceConfig {
  return {
    id: doc._id,
    name: doc.name,
    alias: doc.alias || '',
    address: doc.address || '',
    enabled: doc.enabled,
    fileId: doc.fileId,
    worksheetIdStart: doc.worksheetIdStart,
    worksheetIdEnd: doc.worksheetIdEnd,
    rowFrom: doc.rowFrom,
    rowTo: doc.rowTo,
    colFrom: doc.colFrom,
    colTo: doc.colTo,
    fieldConfig: doc.fieldConfig || DEFAULT_WPS_FIELD_CONFIG,
    updatedAt: createRevision(doc.updatedAt),
    updatedBy: doc.updatedBy,
  };
}

export function validateSyncConfigInput(input: SyncConfigUpdateInput): SyncConfigUpdateInput {
  const seen = new Set<string>();
  return {
    revision: input.revision,
    credentials: {
      apiBase: input.credentials.apiBase?.trim() || undefined,
      appId: input.credentials.appId?.trim() || undefined,
      appKey: input.credentials.appKey,
      redirectUri: input.credentials.redirectUri?.trim() || undefined,
      clearCredential: input.credentials.clearCredential,
    },
    sources: input.sources.map(source => {
      const id = normalizeId(source.id);
      if (!id) throw new Error('Source ID is required.');
      if (seen.has(id)) throw new Error(`Duplicate source ID: ${id}.`);
      seen.add(id);
      if (!source.fileId?.trim()) throw new Error(`File ID is required for ${id}.`);
      const range = normalizeWorksheetRange(source.worksheetIdStart, source.worksheetIdEnd);
      return {
        ...source,
        id,
        name: source.name.trim() || id,
        alias: source.alias?.trim() || '',
        address: source.address?.trim() || '',
        fileId: source.fileId.trim(),
        ...range,
        rowFrom: Math.max(1, Number(source.rowFrom) || 1),
        rowTo: Math.max(1, Number(source.rowTo) || 1),
        colFrom: 0,
        colTo: Math.max(1, Number(source.colTo) || 1),
        fieldConfig: source.fieldConfig?.length ? source.fieldConfig : DEFAULT_WPS_FIELD_CONFIG,
      };
    }),
  };
}

export async function getPublicSyncConfig(
  collections?: SyncConfigCollections,
): Promise<PublicSyncConfigWithRevision> {
  collections = collections ?? (await getDefaultCollections());
  const credentials = (await collections.wpsCredentials.findOne({ _id: 'global' })) as SyncConfigCredentialDocument | null;
  const sources = (await collections.syncSources.find({}).sort({ name: 1 }).toArray()) as SyncSourceDocument[];
  return {
    credentials: publicCredentials(credentials),
    sources: sources.map(publicSource),
    revision: createRevision(credentials?.updatedAt),
  };
}

export async function updateSyncConfig(
  collections: SyncConfigCollections | undefined,
  input: SyncConfigUpdateInput,
  options: { encryptionKey: Buffer; updatedBy: string; expectedRevision?: string },
): Promise<PublicSyncConfigWithRevision> {
  // Collection validators are installed by the database migration/bootstrap
  // workflow. Runtime config saves must only require ordinary read/write
  // privileges; Atlas application users intentionally do not have collMod.
  collections = collections ?? (await getDefaultCollections());
  const current = (await collections.wpsCredentials.findOne({ _id: 'global' })) as SyncConfigCredentialDocument | null;
  const currentRevision = createRevision(current?.updatedAt);
  if (options.expectedRevision !== undefined && options.expectedRevision !== currentRevision) {
    throw new Error('CONFIG_CONFLICT');
  }

  const parsed = validateSyncConfigInput(input);
  const now = new Date();
  const credentialSet: Partial<SyncConfigCredentialDocument> = {
    apiBase: parsed.credentials.apiBase || current?.apiBase || 'https://openapi.wps.cn',
    appId: parsed.credentials.appId ?? current?.appId ?? '',
    redirectUri: parsed.credentials.redirectUri ?? current?.redirectUri ?? '',
    updatedAt: now,
    updatedBy: options.updatedBy,
  };
  if (parsed.credentials.appKey) {
    credentialSet.appKeyEncrypted = encryptSecret(parsed.credentials.appKey, options.encryptionKey);
  } else if (current?.appKeyEncrypted) {
    credentialSet.appKeyEncrypted = current.appKeyEncrypted;
  }
  await collections.wpsCredentials.updateOne({ _id: 'global' }, { $set: credentialSet }, { upsert: true });

  for (const source of parsed.sources) {
    await collections.syncSources.updateOne(
      { _id: source.id },
      {
        $set: {
          name: source.name,
          alias: source.alias,
          address: source.address,
          enabled: source.enabled,
          fileId: source.fileId,
          worksheetIdStart: source.worksheetIdStart,
          worksheetIdEnd: source.worksheetIdEnd,
          rowFrom: source.rowFrom,
          rowTo: source.rowTo,
          colFrom: source.colFrom,
          colTo: source.colTo,
          fieldConfig: source.fieldConfig,
          updatedAt: now,
          updatedBy: options.updatedBy,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }
  await collections.syncSources.deleteMany({ _id: { $nin: parsed.sources.map(source => source.id) } });

  return getPublicSyncConfig(collections);
}
