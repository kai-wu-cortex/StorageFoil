import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import {
  WpsHttpError,
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
