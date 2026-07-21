import type {
  StorageFoilInventoryBatchDocument,
  StorageFoilInventoryPublicationDocument,
  StorageFoilSyncSourceDocument,
} from './collections.ts';
import { getStorageFoilCollections } from './collections.ts';
import { getMongoDb } from './mongodb.ts';
import type { InventoryBatch } from '../types.ts';
import type { AuthUser } from '../shared/authTypes.ts';

export interface PublishedInventoryResponse {
  user?: AuthUser | null;
  months?: string[];
  defaultMonth?: string | null;
  month: string | null;
  batches: InventoryBatch[];
  sources: Array<{ id: string; name: string; alias?: string; enabled: boolean }>;
  latestPublishedAt: string | null;
  syncRunId: string | null;
}

interface InventoryReadOptions {
  month?: string;
  sourceId?: string;
  user?: AuthUser | null;
}

interface SortableCursor<T> {
  sort(sort: Record<string, 1 | -1>): { toArray(): Promise<T[]> };
}

interface ArrayCursor<T> {
  toArray(): Promise<T[]>;
}

export interface InventoryCollections {
  inventoryPublications: {
    find(filter?: Record<string, unknown>): SortableCursor<StorageFoilInventoryPublicationDocument>;
    findOne(filter: { _id: string }): Promise<StorageFoilInventoryPublicationDocument | null>;
  };
  inventoryBatches: {
    find(filter: {
      syncRunId: string;
      month: string;
      sourceId?: string;
    }): SortableCursor<StorageFoilInventoryBatchDocument>;
  };
  syncSources: {
    find(filter?: Record<string, unknown>): ArrayCursor<Partial<StorageFoilSyncSourceDocument>>;
  };
}

async function getDefaultCollections(): Promise<InventoryCollections> {
  return getStorageFoilCollections(await getMongoDb()) as InventoryCollections;
}

function isInventoryCollections(value: unknown): value is InventoryCollections {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'inventoryPublications' in value &&
      'inventoryBatches' in value &&
      'syncSources' in value,
  );
}

function serializeDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

function serializeBatch(batch: StorageFoilInventoryBatchDocument): InventoryBatch {
  return {
    id: batch._id,
    sourceId: batch.sourceId,
    sourceName: batch.sourceName,
    productModel: batch.productModel,
    batchCode: batch.batchCode,
    specification: batch.specification,
    shelf: batch.shelf,
    totalStock: batch.totalStock,
    inflowQty: batch.inflowQty,
    outflowQty: batch.outflowQty,
    remarks: batch.remarks,
    dailyActivities: batch.dailyActivities,
    createdAt: serializeDate(batch.createdAt) ?? '',
  };
}

function serializeSource(source: Partial<StorageFoilSyncSourceDocument>) {
  return {
    id: String(source._id ?? source.id),
    name: String(source.name ?? source._id ?? source.id),
    alias: source.alias ? String(source.alias) : '',
    enabled: source.enabled !== false,
  };
}

async function listSources(collections: InventoryCollections) {
  return (await collections.syncSources.find({}).toArray()).map(serializeSource);
}

async function readPublishedBatches(
  collections: InventoryCollections,
  publication: StorageFoilInventoryPublicationDocument,
  sourceId?: string,
): Promise<InventoryBatch[]> {
  const filter: { syncRunId: string; month: string; sourceId?: string } = {
    syncRunId: publication.syncRunId,
    month: publication.month,
  };
  if (sourceId && sourceId !== 'all') {
    filter.sourceId = sourceId;
  }

  const batches = await collections.inventoryBatches
    .find(filter)
    .sort({ sourceName: 1, sourceRow: 1 })
    .toArray();
  return batches.map(serializeBatch);
}

export async function getInventoryBootstrap(
  collectionsOrOptions?: InventoryCollections | InventoryReadOptions,
  maybeOptions: InventoryReadOptions = {},
): Promise<PublishedInventoryResponse & { user: AuthUser | null; months: string[]; defaultMonth: string | null }> {
  const collections = isInventoryCollections(collectionsOrOptions)
    ? collectionsOrOptions
    : await getDefaultCollections();
  const options: InventoryReadOptions = isInventoryCollections(collectionsOrOptions)
    ? maybeOptions
    : (collectionsOrOptions ?? {});

  const publications = await collections.inventoryPublications
    .find({})
    .sort({ month: -1 })
    .toArray();
  const sources = await listSources(collections);
  if (publications.length === 0) {
    return {
      user: options.user ?? null,
      months: [],
      defaultMonth: null,
      month: null,
      batches: [],
      sources,
      latestPublishedAt: null,
      syncRunId: null,
    };
  }

  const requested = options.month
    ? publications.find(publication => publication.month === options.month)
    : null;
  const publication = requested ?? publications[0];
  const batches = await readPublishedBatches(collections, publication, options.sourceId);

  return {
    user: options.user ?? null,
    months: publications.map(publicationItem => publicationItem.month),
    defaultMonth: publication.month,
    month: publication.month,
    batches,
    sources,
    latestPublishedAt: publication.publishedAt.toISOString(),
    syncRunId: publication.syncRunId,
  };
}

export async function getPublishedInventory(
  collectionsOrOptions: InventoryCollections | InventoryReadOptions,
  maybeOptions: InventoryReadOptions = {},
): Promise<PublishedInventoryResponse> {
  const collections = isInventoryCollections(collectionsOrOptions)
    ? collectionsOrOptions
    : await getDefaultCollections();
  const options: InventoryReadOptions = isInventoryCollections(collectionsOrOptions)
    ? maybeOptions
    : collectionsOrOptions;

  if (!options.month) {
    return {
      month: null,
      batches: [],
      sources: await listSources(collections),
      latestPublishedAt: null,
      syncRunId: null,
    };
  }

  const publication = await collections.inventoryPublications.findOne({ _id: options.month });
  if (!publication) {
    return {
      month: options.month,
      batches: [],
      sources: await listSources(collections),
      latestPublishedAt: null,
      syncRunId: null,
    };
  }

  return {
    month: publication.month,
    batches: await readPublishedBatches(collections, publication, options.sourceId),
    sources: await listSources(collections),
    latestPublishedAt: publication.publishedAt.toISOString(),
    syncRunId: publication.syncRunId,
  };
}
