import assert from 'node:assert/strict';
import test from 'node:test';
import {
  WAREHOUSE_RACK_GROUPS,
  indexBatchesByShelf,
  normalizeShelfCode,
} from './shelfMap.ts';

test('normalizes common shelf code separators casing and labels', () => {
  assert.equal(normalizeShelfCode('19-3A'), '19-3A');
  assert.equal(normalizeShelfCode(' 19·03a '), '19-3A');
  assert.equal(normalizeShelfCode('19号货架 3-A'), '19-3A');
  assert.equal(normalizeShelfCode('１９—３ｂ'), '19-3B');
  assert.equal(normalizeShelfCode('板 上'), '板上');
});

test('indexes equivalent shelf codes under one canonical map position', () => {
  const indexed = indexBatchesByShelf([
    { shelf: '19-3a', id: 'a' },
    { shelf: '19·03A', id: 'b' },
    { shelf: '板 上', id: 'c' },
  ]);

  assert.deepEqual(indexed.byShelf.get('19-3A')?.map(batch => batch.id), ['a', 'b']);
  assert.deepEqual(indexed.byShelf.get('板上')?.map(batch => batch.id), ['c']);
  assert.deepEqual(indexed.unmapped.map(batch => batch.id), ['c']);
});

test('warehouse rack groups follow the supplied floor map order', () => {
  assert.deepEqual(
    WAREHOUSE_RACK_GROUPS.map(group => group.racks),
    [
      [22, 21],
      [20, 19],
      [18, 17],
      [16, 15],
      [14, 13],
      [12, 11],
      [10, 9],
      [8, 7],
      [6, 5],
      [4],
    ],
  );
});

test('does not render a pallet area between rack 21 and rack 20', () => {
  const rack21Group = WAREHOUSE_RACK_GROUPS.find(group => group.racks.includes(21));

  assert.ok(rack21Group);
  assert.equal(rack21Group.obstacleAfter, undefined);
});
