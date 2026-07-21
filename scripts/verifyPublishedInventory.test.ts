import assert from 'node:assert/strict';
import test from 'node:test';
import {
  summarizePublishedInventory,
  verifyPublicationSnapshot,
} from './verifyPublishedInventory';

const batches = [
  {
    _id: 'run-1:pl:row-1',
    syncRunId: 'run-1',
    sourceId: 'pl',
    sourceName: 'PL',
    month: '2026-07',
    recordKey: 'row-1',
    productModel: 'PL',
    batchCode: 'B-1',
    totalStock: 5,
    inflowQty: 7,
    outflowQty: 2,
  },
  {
    _id: 'run-1:pl:row-2',
    syncRunId: 'run-1',
    sourceId: 'pl',
    sourceName: 'PL',
    month: '2026-07',
    recordKey: 'row-2',
    productModel: 'PL',
    batchCode: 'B-2',
    totalStock: 3,
    inflowQty: 3,
    outflowQty: 0,
  },
];

test('publication verifier reports per source month counts totals and pointer match', () => {
  const report = verifyPublicationSnapshot({
    runId: 'run-1',
    batches,
    publications: [{ month: '2026-07', syncRunId: 'run-1' }],
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.rows, [
    {
      sourceId: 'pl',
      month: '2026-07',
      recordCount: 2,
      inflowQty: 10,
      outflowQty: 2,
      totalStock: 8,
      missingRequiredFields: 0,
      duplicateRecordKeys: 0,
      publicationPointerMatch: true,
    },
  ]);
});

test('publication verifier exits unhealthy on duplicate keys missing fields and pointer mismatch', () => {
  const report = verifyPublicationSnapshot({
    runId: 'run-1',
    batches: [
      ...batches,
      { ...batches[0], _id: 'run-1:pl:row-duplicate', batchCode: '', recordKey: 'row-1' },
    ],
    publications: [{ month: '2026-07', syncRunId: 'old-run' }],
  });

  assert.equal(report.ok, false);
  assert.equal(report.rows[0].missingRequiredFields, 1);
  assert.equal(report.rows[0].duplicateRecordKeys, 1);
  assert.equal(report.rows[0].publicationPointerMatch, false);
});

test('inventory summarizer is read only and deterministic', () => {
  const summary = summarizePublishedInventory(batches);
  assert.deepEqual(summary.map(row => `${row.sourceId}:${row.month}:${row.recordCount}`), ['pl:2026-07:2']);
});
