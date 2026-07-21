import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import { runWpsFullSync } from './syncOrchestrator.ts';

const silentLogger = { info: () => undefined };

test('orchestrator loads dynamic sources ranges stages successful months and publishes after validation', async () => {
  const published: string[] = [];
  const staged: string[] = [];
  const result = await runWpsFullSync({
    runId: 'run-1',
    logger: silentLogger,
    trigger: 'admin',
    triggeredBy: 'admin',
    configRevision: 'rev-1',
    getAccessToken: async () => ({ accessToken: 'token', apiBase: 'https://openapi.wps.cn' }),
    getConfig: async () => ({
      credentials: { apiBase: 'https://openapi.wps.cn', appId: 'app', redirectUri: '', hasAppKey: true, hasRefreshToken: true, updatedAt: '', updatedBy: '' },
      revision: 'rev-1',
      sources: [{
        id: 'pl',
        name: 'PL',
        enabled: true,
        fileId: 'file-pl',
        worksheetIdStart: 7,
        worksheetIdEnd: 8,
        rowFrom: 1,
        rowTo: 20,
        colFrom: 1,
        colTo: 20,
        fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
        updatedAt: '',
        updatedBy: '',
      }],
    }),
    fetchWorksheets: async () => [{ sheet_id: 7, name: '7月' }, { sheet_id: 8, name: '空表格', empty: true }],
    fetchRangeData: async () => ({
      batches: [{
        id: 'row-1',
        productModel: 'PL',
        batchCode: 'B-1',
        specification: '',
        shelf: '',
        totalStock: 1,
        inflowQty: 1,
        outflowQty: 0,
        remarks: '',
        dailyActivities: [],
        createdAt: '2026-07-21T00:00:00.000Z',
      }],
      rawData: {},
      headers: [],
    }),
    stageBatches: async input => {
      staged.push(`${input.sourceId}:${input.month}`);
      return input.batches.length;
    },
    publishMonth: async input => {
      published.push(`${input.month}:${input.syncRunId}`);
    },
  });

  assert.deepEqual(staged, ['pl:2026-07']);
  assert.deepEqual(published, ['2026-07:run-1']);
  assert.equal(result.status, 'published');
});

test('orchestrator does not publish a month when a source fails', async () => {
  const published: string[] = [];
  const result = await runWpsFullSync({
    runId: 'run-1',
    logger: silentLogger,
    trigger: 'admin',
    triggeredBy: 'admin',
    configRevision: 'rev-1',
    getAccessToken: async () => ({ accessToken: 'token', apiBase: 'https://openapi.wps.cn' }),
    getConfig: async () => ({
      credentials: { apiBase: 'https://openapi.wps.cn', appId: 'app', redirectUri: '', hasAppKey: true, hasRefreshToken: true, updatedAt: '', updatedBy: '' },
      revision: 'rev-1',
      sources: [{ id: 'pl', name: 'PL', enabled: true, fileId: 'file-pl', worksheetIdStart: 7, worksheetIdEnd: 7, rowFrom: 1, rowTo: 20, colFrom: 1, colTo: 20, fieldConfig: DEFAULT_WPS_FIELD_CONFIG, updatedAt: '', updatedBy: '' }],
    }),
    fetchWorksheets: async () => [{ sheet_id: 7, name: '7月' }],
    fetchRangeData: async () => { throw new Error('WPS failed'); },
    stageBatches: async () => 0,
    publishMonth: async input => { published.push(input.month); },
  });

  assert.equal(result.status, 'failed');
  assert.deepEqual(published, []);
  assert.ok((result.errorSummary || '').includes('pl/7: SOURCE_FAILED: WPS failed'));
});

test('orchestrator reports token refresh failures before reading sources', async () => {
  const result = await runWpsFullSync({
    runId: 'run-token-failed',
    logger: silentLogger,
    trigger: 'webhook',
    triggeredBy: 'http:file-1',
    configRevision: 'rev-1',
    getAccessToken: async () => {
      throw new Error('fetch failed');
    },
    getConfig: async () => ({
      credentials: { apiBase: 'https://openapi.wps.cn', appId: 'app', redirectUri: '', hasAppKey: true, hasRefreshToken: true, updatedAt: '', updatedBy: '' },
      revision: 'rev-1',
      sources: [],
    }),
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.sourceResults.length, 0);
  assert.match(result.errorSummary || '', /WPS_TOKEN_FAILED: fetch failed/);
});
