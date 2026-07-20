import assert from 'node:assert/strict';
import test from 'node:test';
import { WPS_CONFIG_STORAGE_KEY, loadWpsConfig } from './wpsConfig';
import * as wpsConfigModule from './wpsConfig';

function useStorage(values: Record<string, string> = {}) {
  const entries = new Map(Object.entries(values));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
}

test('creates the five inventory workbook data sources by default', () => {
  useStorage();

  const config = loadWpsConfig({});
  const sources = (config as unknown as { sources: Array<{ name: string }> }).sources;

  assert.deepEqual(
    sources.map(source => source.name),
    ['PL', 'PC粉箔', 'PY', 'PK', 'PC'],
  );
});

test('loads the shared OAuth redirect URI from the environment', () => {
  useStorage();

  const config = loadWpsConfig({
    VITE_WPS_REDIRECT_URI: 'https://inventory.example.com/wps/callback',
  });

  assert.equal(
    (config as unknown as { redirectUri?: string }).redirectUri,
    'https://inventory.example.com/wps/callback',
  );
});

test('migrates the legacy single workbook into the PL data source', () => {
  useStorage({
    [WPS_CONFIG_STORAGE_KEY]: JSON.stringify({
      fileId: 'legacy-file',
      worksheetId: 7,
      worksheetIdByMonth: { '2026-07': 8 },
    }),
  });

  const config = loadWpsConfig({});
  const sources = (
    config as unknown as {
      sources: Array<{
        id: string;
        fileId: string;
        worksheetId: number;
        worksheetIdByMonth: Record<string, number>;
      }>;
    }
  ).sources;
  const pl = sources.find(source => source.id === 'pl');

  assert.equal(pl?.fileId, 'legacy-file');
  assert.equal(pl?.worksheetId, 7);
  assert.equal(pl?.worksheetIdByMonth['2026-07'], 8);
});

test('creates an additional data source with an independent workbook configuration', () => {
  const createWpsDataSource = (
    wpsConfigModule as unknown as {
      createWpsDataSource?: (name: string, id: string) => {
        id: string;
        name: string;
        enabled: boolean;
        fileId: string;
        worksheetId: number;
        worksheetIdByMonth: Record<string, number>;
        worksheetIdStart: number;
        worksheetIdEnd: number;
      };
    }
  ).createWpsDataSource;
  assert.equal(typeof createWpsDataSource, 'function');

  assert.deepEqual(createWpsDataSource!('  UV光膜  ', 'source-6'), {
    id: 'source-6',
    name: 'UV光膜',
    enabled: true,
    fileId: '',
    worksheetId: 1,
    worksheetIdByMonth: {},
    worksheetIdStart: 1,
    worksheetIdEnd: 12,
  });
});

test('restores any number of saved data sources', () => {
  const sources = Array.from({ length: 8 }, (_, index) => ({
    id: `source-${index + 1}`,
    name: `来源${index + 1}`,
    enabled: true,
    fileId: `file-${index + 1}`,
    worksheetId: index + 1,
    worksheetIdByMonth: {},
    worksheetIdStart: 1,
    worksheetIdEnd: 12,
  }));
  useStorage({
    [WPS_CONFIG_STORAGE_KEY]: JSON.stringify({ sources }),
  });

  const config = loadWpsConfig({});

  assert.deepEqual(config.sources, sources);
});
