export interface WarehouseRackGroup {
  racks: number[];
  obstacleAfter?: 'pallets';
}

export const WAREHOUSE_RACK_GROUPS: WarehouseRackGroup[] = [
  { racks: [22, 21] },
  { racks: [20, 19] },
  { racks: [18, 17] },
  { racks: [16, 15] },
  { racks: [14, 13] },
  { racks: [12, 11] },
  { racks: [10, 9] },
  { racks: [8, 7] },
  { racks: [6, 5] },
  { racks: [4], obstacleAfter: 'pallets' },
];

export const WAREHOUSE_BAYS = [5, 4, 3, 2, 1] as const;
export const WAREHOUSE_LEVELS = ['A', 'B', 'C'] as const;

export function normalizeShelfCode(value: string): string {
  const normalized = value.normalize('NFKC').trim().toUpperCase();
  const compactBoard = normalized.replace(/\s+/g, '');
  if (/^(?:卡)?板(?:上|\d+)?$/.test(compactBoard)) return compactBoard.replace(/^卡/, '');

  const withoutLabels = normalized
    .replace(/(?:号)?货架|架位/g, '')
    .replace(/[·•・—–−_./\\\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const match = withoutLabels.match(/^(\d{1,2})-?0?(\d{1,2})-?([A-C])$/);
  if (!match) return compactBoard;

  const rack = Number(match[1]);
  const bay = Number(match[2]);
  return `${rack}-${bay}${match[3]}`;
}

export function isMappedShelfCode(code: string): boolean {
  if (code === '板上') return true;

  const match = code.match(/^(\d{1,2})-(\d{1,2})([A-C])$/);
  if (!match) return false;

  const rack = Number(match[1]);
  const bay = Number(match[2]);
  return (
    WAREHOUSE_RACK_GROUPS.some(group => group.racks.includes(rack))
    && WAREHOUSE_BAYS.includes(bay as (typeof WAREHOUSE_BAYS)[number])
  );
}

export function indexBatchesByShelf<T extends { shelf: string }>(
  batches: T[],
): { byShelf: Map<string, T[]>; unmapped: T[] } {
  const byShelf = new Map<string, T[]>();
  const unmapped: T[] = [];

  for (const batch of batches) {
    const shelfCode = normalizeShelfCode(batch.shelf);
    const shelfBatches = byShelf.get(shelfCode) ?? [];
    shelfBatches.push(batch);
    byShelf.set(shelfCode, shelfBatches);
    if (!isMappedShelfCode(shelfCode)) unmapped.push(batch);
  }

  return { byShelf, unmapped };
}
