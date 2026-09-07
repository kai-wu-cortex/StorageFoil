import type {
  DailyActivity,
  InventoryBatch,
  WpsFieldConfig,
  WpsSyncConfig,
} from '../types';
import { convertWpsDateValue } from '../wpsDateConvert';

const TOKEN_STORAGE_KEY = 'storage_foil_wps_cached_token';

interface CachedToken {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt?: number;
}

export interface WpsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  refresh_token: string;
  refresh_expires_in?: string | number;
}

export interface WpsSyncResult {
  batches: InventoryBatch[];
  rawData: unknown;
  headers: string[];
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

interface WpsRangeCell {
  row_from: number;
  col_from: number;
  cell_text?: string | number | null;
}

export interface WpsWorksheetInfo {
  sheet_id: number;
  name: string;
  empty?: boolean;
  hidden?: boolean;
}

export interface InventoryWorksheet {
  worksheetId: number;
  name: string;
  month: string;
}

export function selectInventoryWorksheets(
  sheets: WpsWorksheetInfo[],
  startId: number,
  endId: number,
  year: number,
): InventoryWorksheet[] {
  const lower = Math.min(startId, endId);
  const upper = Math.max(startId, endId);
  return sheets
    .filter(
      sheet =>
        !sheet.hidden &&
        !sheet.empty &&
        sheet.sheet_id >= lower &&
        sheet.sheet_id <= upper &&
        !/空表|模板|sheet\d*/i.test(sheet.name),
    )
    .map(sheet => {
      const namedMonth = Number(sheet.name.match(/(\d{1,2})\s*月/u)?.[1]);
      const monthNumber =
        namedMonth >= 1 && namedMonth <= 12 ? namedMonth : sheet.sheet_id;
      if (monthNumber < 1 || monthNumber > 12) return null;
      return {
        worksheetId: sheet.sheet_id,
        name: sheet.name,
        month: `${year}-${String(monthNumber).padStart(2, '0')}`,
      };
    })
    .filter((sheet): sheet is InventoryWorksheet => sheet !== null)
    .sort((a, b) => a.month.localeCompare(b.month));
}

let cachedToken: CachedToken | null = loadCachedToken();

function loadCachedToken(): CachedToken | null {
  try {
    const saved = localStorage.getItem(TOKEN_STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

function persistToken(token: CachedToken | null): void {
  cachedToken = token;
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function proxyRequest(payload: Record<string, unknown>): Promise<Response> {
  return fetch('/api/wps-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getWpsAuthorizationUrl(
  clientId: string,
  apiBase = 'https://openapi.wps.cn',
  redirectUri = window.location.origin + window.location.pathname,
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

export async function getWpsAccessToken(
  config: WpsSyncConfig,
  authorizationCode?: string,
): Promise<WpsTokenResponse> {
  if (cachedToken && Date.now() < cachedToken.accessExpiresAt - 300_000) {
    return {
      access_token: cachedToken.accessToken,
      refresh_token: cachedToken.refreshToken,
      expires_in: Math.max(0, Math.floor((cachedToken.accessExpiresAt - Date.now()) / 1000)),
      token_type: 'bearer',
    };
  }

  if (!config.appId || !config.appKey) {
    throw new Error('请先配置 WPS App ID 和 App Key');
  }

  const formBody: Record<string, string> = cachedToken?.refreshToken
    ? {
        grant_type: 'refresh_token',
        refresh_token: cachedToken.refreshToken,
        client_id: config.appId,
        client_secret: config.appKey,
      }
    : {
        grant_type: 'authorization_code',
        client_id: config.appId,
        client_secret: config.appKey,
        code: authorizationCode || config.code,
        redirect_uri: resolveWpsRedirectUri(
          config.redirectUri,
          import.meta.env.VITE_WPS_REDIRECT_URI || '',
          window.location.origin + window.location.pathname,
        ),
      };

  if (!cachedToken?.refreshToken && !formBody.code) {
    throw new Error('没有可用的授权 Code，请先完成 WPS OAuth 授权');
  }

  const response = await proxyRequest({
    endpoint: '/oauth2/token',
    method: 'POST',
    body: formBody,
  });
  const data = (await response.json()) as WpsTokenResponse & { msg?: string; message?: string };

  if (!response.ok || !data.access_token) {
    const message = data.msg || data.message || response.statusText;
    if (cachedToken?.refreshToken && /invalid_grant|refresh/i.test(message)) {
      persistToken(null);
    }
    throw new Error(`获取 WPS Access Token 失败: ${message}`);
  }

  const refreshExpiresIn = Number(data.refresh_expires_in);
  persistToken({
    accessToken: data.access_token,
    refreshToken: data.refresh_token || cachedToken?.refreshToken || '',
    accessExpiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
    refreshExpiresAt: Number.isFinite(refreshExpiresIn)
      ? Date.now() + refreshExpiresIn * 1000
      : undefined,
  });
  return data;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function numberValue(value: unknown): number {
  const normalized = text(value).replace(/,/g, '').replace(/[^\d.+-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, '').replace(/[（）()]/g, '').toLowerCase();
}

function headerScore(row: string[]): number {
  const aliases = [
    '产品型号',
    '型号',
    '产品批次',
    '批次',
    '规格',
    '货架',
    '库存总数',
    '入库数量',
    '出库数量',
    '备注',
  ];
  const normalized = row.map(normalizeHeader);
  return aliases.reduce(
    (score, alias) => score + (normalized.some(value => value === normalizeHeader(alias)) ? 1 : 0),
    0,
  );
}

function buildMatrix(rangeData: WpsRangeCell[]): {
  rowKeys: number[];
  rows: string[][];
} {
  const rowsByKey = new Map<number, string[]>();
  for (const cell of rangeData) {
    const row = rowsByKey.get(cell.row_from) || [];
    row[cell.col_from] = text(cell.cell_text);
    rowsByKey.set(cell.row_from, row);
  }
  const rowKeys = [...rowsByKey.keys()].sort((a, b) => a - b);
  return { rowKeys, rows: rowKeys.map(key => rowsByKey.get(key) || []) };
}

function extractTable(rangeData: WpsRangeCell[]): {
  headers: string[];
  rows: string[][];
  rowKeys: number[];
} {
  const matrix = buildMatrix(rangeData);
  if (!matrix.rows.length) return { headers: [], rows: [], rowKeys: [] };

  const candidates = matrix.rows.slice(0, Math.min(10, matrix.rows.length));
  let headerIndex = 0;
  let bestScore = -1;
  candidates.forEach((row, index) => {
    const score = headerScore(row);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
    }
  });

  const primary = matrix.rows[headerIndex] || [];
  const secondary = matrix.rows[headerIndex + 1] || [];
  const secondaryMarkerCount = secondary.filter(value => /^(入|出)(库|数量)?$/u.test(text(value))).length;
  const hasSecondaryHeader = secondaryMarkerCount >= 2;
  let carriedParent = '';
  const width = Math.max(primary.length, hasSecondaryHeader ? secondary.length : 0);
  const headers = Array.from({ length: width }, (_, column) => {
    const primaryValue = text(primary[column]);
    const secondaryValue = hasSecondaryHeader ? text(secondary[column]) : '';
    if (primaryValue) carriedParent = primaryValue;
    if (/^(入|出)(库|数量)?$/u.test(secondaryValue) && carriedParent) {
      return `${carriedParent}${secondaryValue}`;
    }
    return primaryValue || secondaryValue;
  });

  const dataStart = headerIndex + (hasSecondaryHeader ? 2 : 1);
  return {
    headers,
    rows: matrix.rows.slice(dataStart),
    rowKeys: matrix.rowKeys.slice(dataStart),
  };
}

export function extractHeadersFromRawResponse(rawData: unknown): string[] {
  const response = rawData as { data?: { range_data?: WpsRangeCell[] } };
  return extractTable(response?.data?.range_data || []).headers;
}

export async function fetchWpsWorksheets(
  accessToken: string,
  fileId: string,
): Promise<WpsWorksheetInfo[]> {
  if (!fileId) throw new Error('请先配置 WPS 在线表格 File ID');
  const response = await proxyRequest({
    endpoint: `/v7/sheets/${encodeURIComponent(fileId)}/worksheets`,
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const rawData = (await response.json()) as {
    data?: { sheets?: WpsWorksheetInfo[] };
    msg?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      `读取 WPS 工作表列表失败: ${rawData.msg || rawData.message || response.statusText}`,
    );
  }
  return Array.isArray(rawData.data?.sheets) ? rawData.data.sheets : [];
}

function findColumn(headers: string[], mappedColumn: string): number {
  const exact = headers.findIndex(header => header === mappedColumn);
  if (exact >= 0) return exact;
  const normalizedTarget = normalizeHeader(mappedColumn);
  return headers.findIndex(header => normalizeHeader(header) === normalizedTarget);
}

function dailyColumn(header: string): { day: number; type: 'in' | 'out' } | null {
  const normalized = normalizeHeader(header)
    .replace(/数量/g, '')
    .replace(/库存/g, '')
    .replace(/库/g, '');
  const dayFirst = normalized.match(/^(\d{1,2})(?:号|日)?(入|出)$/u);
  const typeFirst = normalized.match(/^(入|出)(\d{1,2})(?:号|日)?$/u);
  const day = Number(dayFirst?.[1] || typeFirst?.[2]);
  const direction = dayFirst?.[2] || typeFirst?.[1];
  if (!day || day < 1 || day > 31 || !direction) return null;
  return { day, type: direction === '入' ? 'in' : 'out' };
}

function stableBatchId(
  productModel: string,
  batchCode: string,
  specification: string,
  shelf: string,
  sourceRow: number,
): string {
  const base = [productModel, batchCode, specification, shelf, sourceRow].join('\u001f');
  let hash = 2166136261;
  for (let index = 0; index < base.length; index += 1) {
    hash ^= base.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `wps-${(hash >>> 0).toString(36)}`;
}

function rowToBatch(
  row: string[],
  sourceRow: number,
  headers: string[],
  fieldConfig: WpsFieldConfig[],
  inheritedProductModel = '',
): InventoryBatch | null {
  const mapped = Object.fromEntries(
    fieldConfig.map(field => [field.fieldId, row[findColumn(headers, field.mappedColumn)] || '']),
  ) as Record<WpsFieldConfig['fieldId'], string>;

  const batchCode = text(mapped.batchCode);
  const productModel = text(mapped.productModel) || inheritedProductModel;

  const dailyActivities: DailyActivity[] = Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    inQty: 0,
    outQty: 0,
  }));
  let hasDailyColumns = false;
  headers.forEach((header, column) => {
    const daily = dailyColumn(header);
    if (!daily) return;
    hasDailyColumns = true;
    const activity = dailyActivities[daily.day - 1];
    if (daily.type === 'in') activity.inQty = numberValue(row[column]);
    else activity.outQty = numberValue(row[column]);
  });

  const dailyIn = dailyActivities.reduce((sum, activity) => sum + activity.inQty, 0);
  const dailyOut = dailyActivities.reduce((sum, activity) => sum + activity.outQty, 0);
  const hasDescriptiveData = Boolean(
    text(mapped.specification) || text(mapped.shelf) || text(mapped.remarks),
  );
  const hasNonZeroQuantity = Boolean(
    numberValue(mapped.totalStock) ||
      numberValue(mapped.inflowQty) ||
      numberValue(mapped.outflowQty) ||
      dailyIn ||
      dailyOut,
  );
  if (!batchCode && (!text(mapped.productModel) || (!hasDescriptiveData && !hasNonZeroQuantity))) {
    return null;
  }
  const resolvedBatchCode = batchCode || `未标批次-${sourceRow + 1}`;
  const mappedIn = numberValue(mapped.inflowQty);
  const mappedOut = numberValue(mapped.outflowQty);
  const inflowQty = mapped.inflowQty !== '' ? mappedIn : dailyIn;
  const outflowQty = mapped.outflowQty !== '' ? mappedOut : dailyOut;
  const mappedStock = numberValue(mapped.totalStock);
  const totalStock =
    mapped.totalStock !== ''
      ? mappedStock
      : Math.max(0, (hasDailyColumns ? dailyIn - dailyOut : inflowQty - outflowQty));
  const createdDate = text(mapped.createdAt);
  const parsedDate = convertWpsDateValue(createdDate);

  return {
    id: stableBatchId(
      productModel,
      resolvedBatchCode,
      text(mapped.specification),
      text(mapped.shelf),
      sourceRow,
    ),
    productModel: productModel || 'PL',
    batchCode: resolvedBatchCode,
    specification: text(mapped.specification),
    shelf: text(mapped.shelf),
    totalStock,
    inflowQty,
    outflowQty,
    remarks: text(mapped.remarks),
    dailyActivities,
    createdAt: parsedDate || new Date().toISOString(),
  };
}

export async function fetchInventoryFromWps(
  accessToken: string,
  config: WpsSyncConfig,
): Promise<WpsSyncResult> {
  if (!config.fileId) throw new Error('请先配置 WPS 在线表格 File ID');
  const endpoint =
    `/v7/sheets/${encodeURIComponent(config.fileId)}` +
    `/worksheets/${config.worksheetId}/range_data` +
    `?row_from=${config.rowFrom}&row_to=${config.rowTo}` +
    `&col_from=${config.colFrom}&col_to=${config.colTo}`;
  const response = await proxyRequest({
    endpoint,
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const rawData = await response.json();
  if (!response.ok) {
    const error = rawData as { msg?: string; message?: string };
    throw new Error(`读取 WPS 表格失败: ${error.msg || error.message || response.statusText}`);
  }

  return parseInventoryResponse(rawData, config.fieldConfig);
}

export function parseInventoryResponse(
  rawData: unknown,
  fieldConfig: WpsFieldConfig[],
): WpsSyncResult {
  const apiResponse = rawData as { data?: { range_data?: WpsRangeCell[] } };
  const table = extractTable(apiResponse?.data?.range_data || []);
  const productModelField = fieldConfig.find(field => field.fieldId === 'productModel');
  const productModelColumn = productModelField
    ? findColumn(table.headers, productModelField.mappedColumn)
    : -1;
  let inheritedProductModel = '';
  const batches = table.rows
    .map((row, index) => {
      const rowProductModel =
        productModelColumn >= 0 ? text(row[productModelColumn]) : '';
      if (rowProductModel) inheritedProductModel = rowProductModel;
      return rowToBatch(
        row,
        table.rowKeys[index] ?? index,
        table.headers,
        fieldConfig,
        inheritedProductModel,
      );
    })
    .filter((batch): batch is InventoryBatch => batch !== null);
  return { batches, rawData, headers: table.headers };
}

export async function syncInventoryFromWps(config: WpsSyncConfig): Promise<WpsSyncResult> {
  const token = await getWpsAccessToken(config);
  return fetchInventoryFromWps(token.access_token, config);
}

export function hasCachedWpsToken(): boolean {
  return Boolean(cachedToken?.refreshToken);
}
