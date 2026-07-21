interface BatchLike {
  syncRunId: string;
  sourceId: string;
  month: string;
  recordKey: string;
  productModel?: string;
  batchCode?: string;
  inflowQty?: number;
  outflowQty?: number;
  totalStock?: number;
}

interface PublicationLike {
  month: string;
  syncRunId: string;
}

export interface VerificationRow {
  sourceId: string;
  month: string;
  recordCount: number;
  inflowQty: number;
  outflowQty: number;
  totalStock: number;
  missingRequiredFields: number;
  duplicateRecordKeys: number;
  publicationPointerMatch: boolean;
}

export interface VerificationReport {
  ok: boolean;
  rows: VerificationRow[];
}

function keyFor(batch: BatchLike): string {
  return `${batch.sourceId}\u001f${batch.month}`;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function summarizePublishedInventory(batches: BatchLike[]): VerificationRow[] {
  const groups = new Map<string, BatchLike[]>();
  for (const batch of batches) {
    const rows = groups.get(keyFor(batch)) || [];
    rows.push(batch);
    groups.set(keyFor(batch), rows);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => {
      const [sourceId, month] = key.split('\u001f');
      const seen = new Set<string>();
      let duplicateRecordKeys = 0;
      for (const row of rows) {
        if (seen.has(row.recordKey)) duplicateRecordKeys += 1;
        seen.add(row.recordKey);
      }
      return {
        sourceId,
        month,
        recordCount: rows.length,
        inflowQty: rows.reduce((sum, row) => sum + numeric(row.inflowQty), 0),
        outflowQty: rows.reduce((sum, row) => sum + numeric(row.outflowQty), 0),
        totalStock: rows.reduce((sum, row) => sum + numeric(row.totalStock), 0),
        missingRequiredFields: rows.filter(row => !row.productModel || !row.batchCode).length,
        duplicateRecordKeys,
        publicationPointerMatch: false,
      };
    });
}

export function verifyPublicationSnapshot(input: {
  runId: string;
  batches: BatchLike[];
  publications: PublicationLike[];
}): VerificationReport {
  const publicationByMonth = new Map(input.publications.map(publication => [publication.month, publication.syncRunId]));
  const rows = summarizePublishedInventory(input.batches.filter(batch => batch.syncRunId === input.runId)).map(row => ({
    ...row,
    publicationPointerMatch: publicationByMonth.get(row.month) === input.runId,
  }));
  return {
    rows,
    ok: rows.every(row => row.missingRequiredFields === 0 && row.duplicateRecordKeys === 0 && row.publicationPointerMatch),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('verifyPublishedInventory is read-only. Use exported helpers with a MongoDB read adapter.');
  process.exitCode = 2;
}
