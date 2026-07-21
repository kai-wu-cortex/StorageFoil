import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import { validateSyncConfigInput } from '../server/syncConfigRepository';

test('server sync config accepts dynamic source counts without client localStorage', () => {
  const parsed = validateSyncConfigInput({
    credentials: {
      apiBase: 'https://openapi.wps.cn',
      appId: 'app-id',
      redirectUri: 'https://storage.example.com/callback',
    },
    sources: Array.from({ length: 8 }, (_, index) => ({
      id: `source-${index + 1}`,
      name: `来源${index + 1}`,
      enabled: true,
      fileId: `file-${index + 1}`,
      worksheetIdStart: 12,
      worksheetIdEnd: 1,
      rowFrom: 1,
      rowTo: 300,
      colFrom: 1,
      colTo: 80,
      fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
    })),
  });

  assert.equal(parsed.sources.length, 8);
  assert.equal(parsed.sources[0].worksheetIdStart, 1);
  assert.equal(parsed.sources[0].worksheetIdEnd, 12);
});
