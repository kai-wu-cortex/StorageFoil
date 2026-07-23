import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import {
  WpsHttpError,
  WpsNetworkError,
  fetchWpsRangeData,
  fetchWpsWorksheets,
} from './wpsClient.ts';

test('WPS client calls known sheet endpoints directly and parses data', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${url.toString()}`);
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer access-token');
    return new Response(JSON.stringify({ data: { sheets: [{ sheet_id: 1, name: '1月' }] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const sheets = await fetchWpsWorksheets(
    { apiBase: 'https://openapi.wps.cn', accessToken: 'access-token', fetchImpl },
    'file-1',
  );

  assert.deepEqual(sheets, [{ sheet_id: 1, name: '1月' }]);
  assert.equal(calls[0], 'GET https://openapi.wps.cn/v7/sheets/file-1/worksheets');
});

test('WPS range reads always include the first product model column', async () => {
  const calls: string[] = [];
  const fetchImpl = async (url: string | URL) => {
    calls.push(url.toString());
    return new Response(JSON.stringify({
      data: {
        range_data: [
          { row_from: 1, col_from: 1, cell_text: '产品型号' },
          { row_from: 1, col_from: 2, cell_text: '产品批次' },
          { row_from: 2, col_from: 1, cell_text: 'PC-212D（103D）\n（金色）' },
          { row_from: 2, col_from: 2, cell_text: '240223-03（111）' },
        ],
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await fetchWpsRangeData(
    { apiBase: 'https://openapi.wps.cn', accessToken: 'access-token', fetchImpl },
    {
      fileId: 'file-1',
      worksheetId: 7,
      rowFrom: 1,
      rowTo: 300,
      colFrom: 2,
      colTo: 80,
      fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
    },
  );

  assert.match(calls[0], /col_from=1/);
  assert.equal(result.batches[0].productModel, 'PC-212D（103D）\n（金色）');
});

test('WPS client wraps network failures with a typed sanitized error', async () => {
  const fetchImpl = async () => {
    throw new Error('fetch failed client_secret=top-secret');
  };

  await assert.rejects(
    () => fetchWpsWorksheets({ apiBase: 'https://openapi.wps.cn', accessToken: 'access-token', fetchImpl }, 'file-1'),
    (error: unknown) =>
      error instanceof WpsNetworkError &&
      error.message.includes('fetch failed') &&
      !error.message.includes('top-secret'),
  );
});

test('WPS client sanitizes upstream errors and never exposes client_secret', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ msg: 'client_secret=top-secret invalid_grant' }), { status: 401 });

  await assert.rejects(
    () =>
      fetchWpsRangeData(
        { apiBase: 'https://openapi.wps.cn', accessToken: 'access-token', fetchImpl },
        {
          fileId: 'file-1',
          worksheetId: 1,
          rowFrom: 1,
          rowTo: 2,
          colFrom: 1,
          colTo: 2,
          fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
        },
      ),
    (error: unknown) =>
      error instanceof WpsHttpError &&
      error.status === 401 &&
      !error.message.includes('top-secret'),
  );
});
