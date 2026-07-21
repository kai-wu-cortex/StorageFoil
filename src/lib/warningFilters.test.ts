import assert from 'node:assert/strict';
import test from 'node:test';
import { getWarningFilterTerms, matchesWarningFilter } from './warningFilters';
import type { InventoryBatch } from '../types';

const baseBatch: InventoryBatch = {
  id: 'batch-1',
  productModel: 'PL',
  batchCode: 'B001',
  specification: '0.64*120M',
  shelf: '19-1A',
  totalStock: 1,
  inflowQty: 1,
  outflowQty: 0,
  remarks: '咖啡底，局部麻点',
  dailyActivities: [],
  createdAt: '2026-07-01T00:00:00.000Z',
};

test('warning filters split multiple keyword separators', () => {
  assert.deepEqual(getWarningFilterTerms('咖啡底/深底|麻点、白边，胶底'), [
    '咖啡底',
    '深底',
    '麻点',
    '白边',
    '胶底',
  ]);
});

test('warning filters match custom remark tags by any configured keyword', () => {
  assert.equal(matchesWarningFilter(baseBatch, '白边/麻点'), true);
  assert.equal(matchesWarningFilter(baseBatch, '胶底/分切'), false);
  assert.equal(matchesWarningFilter(baseBatch, null), true);
});

