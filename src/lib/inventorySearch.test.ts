import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesInventorySearch } from './inventorySearch.ts';
import type { InventoryBatch } from '../types.ts';

const batch: InventoryBatch = {
  id: 'batch-1',
  sourceId: 'pc',
  sourceName: 'PC',
  productModel: '207',
  batchCode: 'B-001',
  specification: '0.64*120M',
  shelf: '19-3A',
  totalStock: 10,
  inflowQty: 10,
  outflowQty: 0,
  remarks: '',
  dailyActivities: [],
  createdAt: '2026-07-21T00:00:00.000Z',
};

test('inventory search matches source-prefixed model codes and ignores separators', () => {
  assert.equal(matchesInventorySearch(batch, 'pc-207'), true);
  assert.equal(matchesInventorySearch({ ...batch, productModel: 'PC207' }, 'pc-207'), true);
  assert.equal(matchesInventorySearch({ ...batch, productModel: 'PC-207' }, 'pc207'), true);
});
