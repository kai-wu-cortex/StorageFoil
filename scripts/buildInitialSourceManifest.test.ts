import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildInitialSourceManifest,
  INITIAL_STORAGE_FOIL_SOURCES,
} from './buildInitialSourceManifest';

test('initial source manifest covers the five current XLSX logical sources without inventing File IDs', () => {
  assert.deepEqual(INITIAL_STORAGE_FOIL_SOURCES.map(source => source.name), [
    'PL',
    'PC粉箔',
    'PY',
    'PK',
    'PC',
  ]);
  assert.deepEqual(INITIAL_STORAGE_FOIL_SOURCES.map(source => source.workbookName), [
    'PL2026年出入库明细-20260707.xlsx',
    'PC粉箔2026年出入库表.xlsx',
    'PY2026年6月入库表-20260708(1).xlsx',
    'PK2026入库明细-20260701.xlsx',
    'PC2026年出入表-20260703(3)(3).xlsx',
  ]);

  const manifest = buildInitialSourceManifest({
    appId: 'app-id',
    apiBase: 'https://openapi.wps.cn',
    redirectUri: 'https://preview.example.com/api/admin/wps/callback',
    fileIds: {
      pl: 'file-pl',
      pc_powder: 'file-pc-powder',
      py: 'file-py',
      pk: 'file-pk',
      pc: 'file-pc',
    },
  });

  assert.equal(manifest.credentials.appId, 'app-id');
  assert.equal(manifest.sources.length, 5);
  assert.deepEqual(
    manifest.sources.map(source => [source.id, source.fileId, source.worksheetIdStart, source.worksheetIdEnd]),
    [
      ['pl', 'file-pl', 1, 12],
      ['pc_powder', 'file-pc-powder', 1, 12],
      ['py', 'file-py', 1, 12],
      ['pk', 'file-pk', 1, 12],
      ['pc', 'file-pc', 1, 12],
    ],
  );
  assert.equal(JSON.stringify(manifest).includes('appKey'), false);
  assert.equal(JSON.stringify(manifest).includes('refresh_token'), false);
});

test('initial source manifest requires operator supplied File IDs and accepts later arbitrary sources', () => {
  assert.throws(
    () => buildInitialSourceManifest({ appId: 'app-id', fileIds: { pl: 'file-pl' } }),
    /Missing File ID/,
  );

  const manifest = buildInitialSourceManifest({
    appId: 'app-id',
    fileIds: {
      pl: 'file-pl',
      pc_powder: 'file-pc-powder',
      py: 'file-py',
      pk: 'file-pk',
      pc: 'file-pc',
      extra: 'file-extra',
    },
    extraSources: [{ id: 'extra', name: 'Extra', workbookName: 'later.xlsx' }],
  });

  assert.equal(manifest.sources.at(-1)?.id, 'extra');
  assert.equal(manifest.sources.at(-1)?.worksheetIdEnd, 12);
});
