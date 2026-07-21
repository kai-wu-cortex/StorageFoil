import type { InventoryBatch, WpsSyncConfig } from '../types';
export {
  extractHeadersFromRawResponse,
  parseInventoryResponse,
  selectInventoryWorksheets,
  stableWpsRecordKey,
  type InventoryWorksheet,
  type WpsSyncResult,
  type WpsWorksheetInfo,
} from '../server/wpsInventoryParser';

export interface WpsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token: string;
  refresh_expires_in?: string | number;
}

export function mergeSyncedInventory(
  currentBatches: InventoryBatch[],
  syncedBatches: InventoryBatch[],
): InventoryBatch[] {
  const existingByBusinessKey = new Map<string, InventoryBatch[]>();
  currentBatches.forEach(batch => {
    const key = [
      batch.sourceId || 'manual',
      batch.productModel,
      batch.batchCode,
      batch.specification,
      batch.shelf,
    ].join('\u001f');
    const matches = existingByBusinessKey.get(key) || [];
    matches.push(batch);
    existingByBusinessKey.set(key, matches);
  });
  return syncedBatches.map(batch => {
    const key = [
      batch.sourceId || 'manual',
      batch.productModel,
      batch.batchCode,
      batch.specification,
      batch.shelf,
    ].join('\u001f');
    const existing = existingByBusinessKey.get(key)?.shift();
    return existing
      ? { ...batch, id: existing.id, createdAt: existing.createdAt }
      : batch;
  });
}

export function replaceInventorySource(
  currentBatches: InventoryBatch[],
  source: { id: string; name: string },
  syncedBatches: InventoryBatch[],
): InventoryBatch[] {
  const currentSourceBatches = currentBatches.filter(batch => batch.sourceId === source.id);
  const otherBatches = currentBatches.filter(batch => batch.sourceId !== source.id);
  const taggedBatches = syncedBatches.map(batch => ({
    ...batch,
    id: `${source.id}:${batch.id}`,
    sourceId: source.id,
    sourceName: source.name,
  }));
  return [
    ...otherBatches,
    ...mergeSyncedInventory(currentSourceBatches, taggedBatches),
  ];
}

export function getWpsAuthorizationUrl(
  clientId: string,
  apiBase = 'https://openapi.wps.cn',
  redirectUri = '/',
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'kso.user_base.read,kso.sheets.read',
  });
  return `${apiBase.replace(/\/$/, '')}/oauth2/auth?${params.toString()}`;
}

export function resolveWpsRedirectUri(
  configuredUri: string,
  environmentUri: string,
  browserUri: string,
): string {
  return configuredUri.trim() || environmentUri.trim() || browserUri;
}

export async function getWpsAccessToken(): Promise<WpsTokenResponse> {
  throw new Error('WPS token management has moved to the StorageFoil server.');
}

export async function fetchWpsWorksheets(): Promise<never> {
  throw new Error('WPS worksheet discovery has moved to the StorageFoil server.');
}

export async function fetchInventoryFromWps(): Promise<never> {
  throw new Error('WPS inventory reads have moved to the StorageFoil server.');
}

export async function syncInventoryFromWps(_config: WpsSyncConfig): Promise<never> {
  throw new Error('WPS sync has moved to the StorageFoil server.');
}

export function hasCachedWpsToken(): boolean {
  return false;
}
