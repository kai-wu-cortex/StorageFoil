import type { InventoryBatch } from '../types';

export interface WarningFilterTag {
  id: string;
  label: string;
  query: string;
  color: 'rose' | 'amber' | 'blue' | 'emerald' | 'violet';
}

export const DEFAULT_WARNING_FILTER_TAGS: WarningFilterTag[] = [
  { id: 'white-border', label: '白边批次', query: '白边', color: 'rose' },
  { id: 'pitting', label: '麻点批次', query: '麻点', color: 'amber' },
  { id: 'adhesive-cutting', label: '胶底/分切异常', query: '胶底/分切/胶', color: 'blue' },
];

export function normalizeWarningFilterQuery(query: string): string {
  return query.trim().replace(/\s+/g, '');
}

export function getWarningFilterTerms(query: string): string[] {
  return normalizeWarningFilterQuery(query)
    .split(/[|｜/、，,；;]+/)
    .map(term => term.trim())
    .filter(Boolean);
}

export function matchesWarningFilter(batch: InventoryBatch, filter: string | null): boolean {
  if (!filter) return true;
  const terms = getWarningFilterTerms(filter);
  if (terms.length === 0) return true;
  return terms.some(term => batch.remarks.includes(term));
}

export function countWarningFilterMatches(batches: InventoryBatch[], filter: string): number {
  return batches.filter(batch => matchesWarningFilter(batch, filter)).length;
}

