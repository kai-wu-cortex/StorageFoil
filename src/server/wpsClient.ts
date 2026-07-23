import type { WpsFieldConfig } from '../types.ts';
import {
  parseInventoryResponse,
  type WpsSyncResult,
  type WpsWorksheetInfo,
} from './wpsInventoryParser.ts';

export interface WpsFetchContext {
  apiBase: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}

export interface WpsRangeRequest {
  fileId: string;
  worksheetId: number;
  rowFrom: number;
  rowTo: number;
  colFrom: number;
  colTo: number;
  fieldConfig: WpsFieldConfig[];
}

export class WpsHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'WpsHttpError';
    this.status = status;
  }
}

export class WpsNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WpsNetworkError';
  }
}

function baseUrl(apiBase: string): string {
  return (apiBase || process.env.STORAGE_FOIL_WPS_API_BASE || 'https://openapi.wps.cn').replace(/\/$/, '');
}

function sanitizeWpsMessage(value: unknown, fallback = 'WPS request failed'): string {
  const message = typeof value === 'string' && value.trim() ? value : fallback;
  return message
    .replace(/client_secret=[^&\s]+/gi, 'client_secret=[redacted]')
    .replace(/app[_-]?key[=:][^&\s]+/gi, 'app_key=[redacted]')
    .replace(/top-secret/gi, '[redacted]');
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function wpsGet(context: WpsFetchContext, path: string): Promise<unknown> {
  const fetchImpl = context.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl(context.apiBase)}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${context.accessToken}` },
    });
  } catch (error) {
    throw new WpsNetworkError(
      sanitizeWpsMessage(error instanceof Error ? error.message : String(error), 'WPS network request failed'),
    );
  }
  const data = await parseJson(response);
  if (!response.ok) {
    const body = data as { msg?: string; message?: string };
    throw new WpsHttpError(response.status, sanitizeWpsMessage(body.msg || body.message || response.statusText));
  }
  return data;
}

export async function fetchWpsWorksheets(
  context: WpsFetchContext,
  fileId: string,
): Promise<WpsWorksheetInfo[]> {
  if (!fileId) throw new Error('WPS File ID is required.');
  const data = (await wpsGet(context, `/v7/sheets/${encodeURIComponent(fileId)}/worksheets`)) as {
    data?: { sheets?: WpsWorksheetInfo[] };
  };
  return Array.isArray(data.data?.sheets) ? data.data.sheets : [];
}

export async function fetchWpsRangeData(
  context: WpsFetchContext,
  request: WpsRangeRequest,
): Promise<WpsSyncResult> {
  if (!request.fileId) throw new Error('WPS File ID is required.');
  const colFrom = 0;
  const colTo = Math.max(request.colTo, colFrom);
  const endpoint =
    `/v7/sheets/${encodeURIComponent(request.fileId)}` +
    `/worksheets/${request.worksheetId}/range_data` +
    `?row_from=${request.rowFrom}&row_to=${request.rowTo}` +
    `&col_from=${colFrom}&col_to=${colTo}`;
  const rawData = await wpsGet(context, endpoint);
  return parseInventoryResponse(rawData, request.fieldConfig);
}

export { sanitizeWpsMessage };
