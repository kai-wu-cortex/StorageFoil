import type { InventoryBatch } from '../types';

function normalizeSearchValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[－–—]/g, '-')
    .replace(/\s+/g, '');
}

function searchVariants(value: unknown): string[] {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];
  return [normalized, normalized.replace(/[-_]/g, '')];
}

export function matchesInventorySearch(batch: InventoryBatch, query: string): boolean {
  const queryVariants = searchVariants(query);
  if (queryVariants.length === 0) return true;

  const sourceLabel = batch.sourceName || batch.sourceId || '';
  const searchableValues = [
    batch.productModel,
    sourceLabel && batch.productModel ? `${sourceLabel}-${batch.productModel}` : '',
    batch.batchCode,
    batch.specification,
    batch.shelf,
    batch.remarks,
  ];
  const valueVariants = searchableValues.flatMap(searchVariants);
  return queryVariants.some(queryVariant =>
    valueVariants.some(valueVariant => valueVariant.includes(queryVariant)),
  );
}
