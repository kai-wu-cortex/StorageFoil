import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import type { InventoryBatch } from '../types';
import {
  extractHeadersFromRawResponse,
  mergeSyncedInventory,
  parseInventoryResponse,
} from './wps';
import * as wpsService from './wps';

const rows = [
  ['P L 出 入 库 统 计 表', '', '', '', '', '', '', '', '', '', '', ''],
  ['产品型号', '产品批次', '规格', '货架', '库存\n总数', '入库\n数量', '出库\n数量', '备注', '1号', '', '2号', ''],
  ['', '', '', '', '', '', '', '', '入', '出', '入', '出'],
  ['PL-0001\n（亮白）', 'B-001', '0.64*120M', '19-3A', '7', '10', '3', '有白边', '10', '2', '0', '1'],
  ['', 'B-002', '0.64*120M', '19-4B', '2', '3', '1', '', '3', '1', '', ''],
  ['PL-1001\n（黑色）', '', '', '', '0', '0', '0', '样3支', '', '', '', ''],
  ['', 'B-003', '0.64*120M', '19-5C', '5', '5', '0', '', '5', '', '', ''],
];

const rawData = {
  data: {
    range_data: rows.flatMap((row, rowIndex) =>
      row.map((cell, colIndex) => ({
        row_from: rowIndex,
        col_from: colIndex,
        cell_text: cell,
      })),
    ),
  },
};

test('extracts two-level inventory headers', () => {
  assert.deepEqual(extractHeadersFromRawResponse(rawData).slice(8), [
    '1号入',
    '1号出',
    '2号入',
    '2号出',
  ]);
});

test('converts WPS rows to inventory batches and daily activities', () => {
  const result = parseInventoryResponse(rawData, DEFAULT_WPS_FIELD_CONFIG);
  assert.equal(result.batches.length, 4);
  assert.equal(result.batches[0].batchCode, 'B-001');
  assert.equal(result.batches[0].productModel, 'PL-0001\n（亮白）');
  assert.equal(result.batches[0].totalStock, 7);
  assert.deepEqual(result.batches[0].dailyActivities.slice(0, 2), [
    { day: 1, inQty: 10, outQty: 2 },
    { day: 2, inQty: 0, outQty: 1 },
  ]);
  assert.equal(result.batches[1].productModel, 'PL-0001\n（亮白）');
  assert.equal(result.batches[2].productModel, 'PL-1001\n（黑色）');
  assert.match(result.batches[2].batchCode, /^未标批次-/);
  assert.equal(result.batches[3].productModel, 'PL-1001\n（黑色）');
});

test('keeps rows with the same batch code as distinct inventory records', () => {
  const duplicateBatchRows = [
    rows[0],
    rows[1],
    rows[2],
    ['PC-001', 'DUP-001', '0.64*120M', '5-1A', '2', '2', '0', '', '2', '', '', ''],
    ['PC-002', 'DUP-001', '0.64*120M', '5-2A', '3', '3', '0', '', '3', '', '', ''],
  ];
  const duplicateBatchData = {
    data: {
      range_data: duplicateBatchRows.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => ({
          row_from: rowIndex,
          col_from: colIndex,
          cell_text: cell,
        })),
      ),
    },
  };

  const result = parseInventoryResponse(duplicateBatchData, DEFAULT_WPS_FIELD_CONFIG);

  assert.equal(result.batches.length, 2);
  assert.equal(new Set(result.batches.map(batch => batch.id)).size, 2);
});

test('preserves identity separately for duplicate batch codes during sync', () => {
  const parsed = parseInventoryResponse(rawData, DEFAULT_WPS_FIELD_CONFIG).batches.slice(0, 2);
  const current = parsed.map((batch, index) => ({
    ...batch,
    batchCode: 'DUP-001',
    id: `existing-${index + 1}`,
    createdAt: `2026-0${index + 1}-01T00:00:00.000Z`,
  }));
  const incoming = current.map(batch => ({
    ...batch,
    id: `incoming-${batch.id}`,
    createdAt: '2026-07-20T00:00:00.000Z',
  }));

  const merged = mergeSyncedInventory(current, incoming);

  assert.deepEqual(
    merged.map(batch => [batch.id, batch.createdAt]),
    [
      ['existing-1', '2026-01-01T00:00:00.000Z'],
      ['existing-2', '2026-02-01T00:00:00.000Z'],
    ],
  );
});

test('matches identical records by data source when sync order changes', () => {
  const template = parseInventoryResponse(rawData, DEFAULT_WPS_FIELD_CONFIG).batches[0];
  const current = [
    { ...template, id: 'pl-old', sourceId: 'pl', sourceName: 'PL' },
    { ...template, id: 'pc-old', sourceId: 'pc', sourceName: 'PC' },
  ];
  const incoming = [
    { ...template, id: 'pc-new', sourceId: 'pc', sourceName: 'PC' },
    { ...template, id: 'pl-new', sourceId: 'pl', sourceName: 'PL' },
  ];

  const merged = mergeSyncedInventory(current, incoming);

  assert.deepEqual(merged.map(batch => batch.id), ['pc-old', 'pl-old']);
});

test('replaces one synced source without removing other sources', () => {
  const replaceInventorySource = (
    wpsService as unknown as {
      replaceInventorySource?: (
        current: InventoryBatch[],
        source: { id: string; name: string },
        synced: InventoryBatch[],
      ) => InventoryBatch[];
    }
  ).replaceInventorySource;
  assert.equal(typeof replaceInventorySource, 'function');

  const template = parseInventoryResponse(rawData, DEFAULT_WPS_FIELD_CONFIG).batches[0];
  const current = [
    { ...template, id: 'pl-old', sourceId: 'pl', sourceName: 'PL' },
    { ...template, id: 'pc-old', sourceId: 'pc', sourceName: 'PC' },
  ];
  const result = replaceInventorySource!(
    current,
    { id: 'pl', name: 'PL' },
    [{ ...template, id: 'new-row', totalStock: 99 }],
  );

  assert.deepEqual(
    result.map(batch => [batch.id, batch.sourceId, batch.totalStock]),
    [
      ['pc-old', 'pc', template.totalStock],
      ['pl-old', 'pl', 99],
    ],
  );
});

test('maps discovered worksheet IDs in range to inventory months', () => {
  const selectInventoryWorksheets = (
    wpsService as unknown as {
      selectInventoryWorksheets?: (
        sheets: Array<{
          sheet_id: number;
          name: string;
          empty?: boolean;
          hidden?: boolean;
        }>,
        startId: number,
        endId: number,
        year: number,
      ) => Array<{ worksheetId: number; name: string; month: string }>;
    }
  ).selectInventoryWorksheets;
  assert.equal(typeof selectInventoryWorksheets, 'function');

  assert.deepEqual(
    selectInventoryWorksheets!(
      [
        { sheet_id: 1, name: '1月' },
        { sheet_id: 2, name: '2月' },
        { sheet_id: 7, name: '7月' },
        { sheet_id: 8, name: '空表格', empty: true },
        { sheet_id: 13, name: '归档' },
      ],
      2,
      12,
      2026,
    ),
    [
      { worksheetId: 2, name: '2月', month: '2026-02' },
      { worksheetId: 7, name: '7月', month: '2026-07' },
    ],
  );
});

test('uses one configured redirect URI for authorization and token exchange', () => {
  const resolveWpsRedirectUri = (
    wpsService as unknown as {
      resolveWpsRedirectUri?: (
        configuredUri: string,
        environmentUri: string,
        browserUri: string,
      ) => string;
    }
  ).resolveWpsRedirectUri;
  assert.equal(typeof resolveWpsRedirectUri, 'function');

  assert.equal(
    resolveWpsRedirectUri!(
      'https://inventory.example.com/wps/callback',
      'https://environment.example.com/',
      'http://localhost:3000/',
    ),
    'https://inventory.example.com/wps/callback',
  );
  assert.equal(
    resolveWpsRedirectUri!('', 'https://environment.example.com/', 'http://localhost:3000/'),
    'https://environment.example.com/',
  );
});

test('builds the WPS authorization URL with the registered redirect and comma scopes', () => {
  const url = new URL(
    wpsService.getWpsAuthorizationUrl(
      'AK-test',
      'https://openapi.wps.cn',
      'http://localhost:3000/',
    ),
  );

  assert.equal(url.searchParams.get('redirect_uri'), 'http://localhost:3000/');
  assert.equal(
    url.searchParams.get('scope'),
    'kso.user_base.read,kso.sheets.read',
  );
});
