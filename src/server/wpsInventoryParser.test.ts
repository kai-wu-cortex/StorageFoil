import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig.ts';
import {
  parseInventoryResponse,
  selectInventoryWorksheets,
} from './wpsInventoryParser.ts';

const rows = [
  ['P L 出 入 库 统 计 表', '', '', '', '', '', '', '', '', '', '', ''],
  ['产品型号', '产品批次', '规格', '货架', '库存\n总数', '入库\n数量', '出库\n数量', '备注', '1号', '', '2号', ''],
  ['', '', '', '', '', '', '', '', '入', '出', '入', '出'],
  ['PL-0001\n（亮白）', 'B-001', '0.64*120M', '19-3A', '7', '10', '3', '有白边', '10', '2', '0', '1'],
  ['', 'B-002', '0.64*120M', '19-4B', '2', '3', '1', '', '3', '1', '', ''],
];

const rawData = {
  data: {
    range_data: rows.flatMap((row, rowIndex) =>
      row.map((cell, colIndex) => ({ row_from: rowIndex, col_from: colIndex, cell_text: cell })),
    ),
  },
};

test('server parser converts WPS rows and keeps source row identity', () => {
  const result = parseInventoryResponse(rawData, DEFAULT_WPS_FIELD_CONFIG);

  assert.equal(result.batches.length, 2);
  assert.equal(result.batches[0].batchCode, 'B-001');
  assert.equal(result.batches[1].productModel, 'PL-0001\n（亮白）');
  assert.deepEqual(result.batches[0].dailyActivities.slice(0, 2), [
    { day: 1, inQty: 10, outQty: 2 },
    { day: 2, inQty: 0, outQty: 1 },
  ]);
});

test('server parser does not default missing product models to PL', () => {
  const pcRows = [
    ['P C 出 入 库 统 计 表', '', '', '', '', '', '', ''],
    ['型号缺失', '产品批次', '规格', '货架', '库存\n总数', '入库\n数量', '出库\n数量', '备注'],
    ['', '220611-3', '0.64*120M', '5-2C', '20', '20', '0', '沙眼'],
    ['', '220619-1-1', '0.64*120M', '5-3B', '4', '4', '0', '沙眼'],
  ];
  const result = parseInventoryResponse({
    data: {
      range_data: pcRows.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => ({ row_from: rowIndex, col_from: colIndex, cell_text: cell })),
      ),
    },
  }, DEFAULT_WPS_FIELD_CONFIG);

  assert.deepEqual(result.batches.map(batch => batch.productModel), ['PC', 'PC']);
});

test('server parser preserves WPS product model cell text and inherits blank model rows', () => {
  const pcRows = [
    ['P C 出 入 库 统 计 表', '', '', '', '', '', '', ''],
    ['产品型号', '产品批次', '规格', '货架', '库存\n总数', '入库\n数量', '出库\n数量', '备注'],
    ['PC-207M\n（哑金色）', '220629-3', '0.64*120M', '7-1B', '20', '20', '0', '沙眼'],
    ['', '220920-1', '0.64*120M', '7-1B', '4', '4', '0', '沙眼'],
    ['PC-120（9226L）\n（浅灰）', 'PC120-B-001', '0.64*120M', '5-4A', '8', '8', '0', ''],
  ];
  const result = parseInventoryResponse({
    data: {
      range_data: pcRows.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => ({ row_from: rowIndex, col_from: colIndex, cell_text: cell })),
      ),
    },
  }, DEFAULT_WPS_FIELD_CONFIG);

  assert.deepEqual(result.batches.map(batch => batch.productModel), [
    'PC-207M\n（哑金色）',
    'PC-207M\n（哑金色）',
    'PC-120（9226L）\n（浅灰）',
  ]);
});

test('server parser preserves full product models for every source when field mapping is stale', () => {
  const mixedRows = [
    ['P Y 出 入 库 统 计 表', '', '', '', '', '', '', ''],
    ['产品型号', '产品批次', '规格', '货架', '库存\n总数', '入库\n数量', '出库\n数量', '备注'],
    ['PY-207A\n（金色）', '260701-01', '0.64*120M', '6-1A', '12', '12', '0', ''],
    ['PK-503-2', '260701-02', '0.64*120M', '6-1B', '8', '8', '0', ''],
    ['PW25-207\n（金色）', '260701-03', '0.64*120M', '6-1C', '5', '5', '0', ''],
  ];
  const staleConfig = DEFAULT_WPS_FIELD_CONFIG.map(field =>
    field.fieldId === 'productModel'
      ? { ...field, mappedColumn: '旧产品型号配置' }
      : field,
  );
  const result = parseInventoryResponse({
    data: {
      range_data: mixedRows.flatMap((row, rowIndex) =>
        row.map((cell, colIndex) => ({ row_from: rowIndex, col_from: colIndex, cell_text: cell })),
      ),
    },
  }, staleConfig);

  assert.deepEqual(result.batches.map(batch => batch.productModel), [
    'PY-207A\n（金色）',
    'PK-503-2',
    'PW25-207\n（金色）',
  ]);
});

test('server worksheet selection uses configured range and month names first', () => {
  assert.deepEqual(
    selectInventoryWorksheets(
      [
        { sheet_id: 1, name: '封面' },
        { sheet_id: 2, name: '2月' },
        { sheet_id: 3, name: '7月' },
        { sheet_id: 4, name: '模板', hidden: true },
        { sheet_id: 5, name: '空表格', empty: true },
      ],
      2,
      5,
      2026,
    ),
    [
      { worksheetId: 2, name: '2月', month: '2026-02' },
      { worksheetId: 3, name: '7月', month: '2026-07' },
    ],
  );
});
