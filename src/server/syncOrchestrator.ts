import type { PublicSyncConfigWithRevision } from './syncConfigRepository.ts';
import { getPublicSyncConfig } from './syncConfigRepository.ts';
import type { SyncRunSourceResult, SyncRunStatus, SyncRunTrigger } from '../shared/syncTypes.ts';
import { parseInventoryMonth } from '../shared/apiTypes.ts';
import type { WpsSyncResult, WpsWorksheetInfo } from './wpsInventoryParser.ts';
import { selectInventoryWorksheets } from './wpsInventoryParser.ts';
import { fetchWpsRangeData, fetchWpsWorksheets } from './wpsClient.ts';
import { getValidWpsAccessToken } from './wpsTokenService.ts';
import { publishMonth as defaultPublishMonth, stageInventoryBatches as defaultStageInventoryBatches, type InventoryPublisherCollections, type StageInventoryInput } from './inventoryPublisher.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import type { InventoryBatch } from '../types.ts';
import { logSyncEvent, type LoggerLike } from './observability.ts';

export interface SyncOrchestratorDependencies {
  runId: string;
  trigger: SyncRunTrigger;
  triggeredBy: string;
  configRevision: string;
  getConfig?: () => Promise<PublicSyncConfigWithRevision>;
  getAccessToken?: () => Promise<{ accessToken: string; apiBase: string }>;
  fetchWorksheets?: (input: { apiBase: string; accessToken: string; fileId: string }) => Promise<WpsWorksheetInfo[]>;
  fetchRangeData?: (input: { apiBase: string; accessToken: string; fileId: string; worksheetId: number; rowFrom: number; rowTo: number; colFrom: number; colTo: number; fieldConfig: StageInventoryInput['batches'] extends InventoryBatch[] ? import('../types.ts').WpsFieldConfig[] : never }) => Promise<WpsSyncResult>;
  stageBatches?: (input: StageInventoryInput) => Promise<number>;
  publishMonth?: (input: { month: string; syncRunId: string; sourceIds: string[]; publishedBy: string }) => Promise<void>;
  logger?: LoggerLike;
}

export interface SyncOrchestratorResult {
  status: SyncRunStatus;
  sourceResults: SyncRunSourceResult[];
  errorSummary?: string;
}

function currentYear(): number {
  return Number(process.env.STORAGE_FOIL_SYNC_YEAR) || new Date().getFullYear();
}

async function defaultPublisherCollections(): Promise<InventoryPublisherCollections> {
  return {
    inventoryBatches: await getMongoCollection(COLLECTION_NAMES.inventoryBatches),
    inventoryPublications: await getMongoCollection(COLLECTION_NAMES.inventoryPublications),
  } as unknown as InventoryPublisherCollections;
}

export async function runWpsFullSync(deps: SyncOrchestratorDependencies): Promise<SyncOrchestratorResult> {
  const runStartedAt = Date.now();
  const config = await (deps.getConfig || getPublicSyncConfig)();
  const token = await (deps.getAccessToken || getValidWpsAccessToken)();
  const fetchWorksheetsImpl = deps.fetchWorksheets || ((input) => fetchWpsWorksheets(input, input.fileId));
  const fetchRangeDataImpl = deps.fetchRangeData || ((input) => fetchWpsRangeData(input, input));
  const stageImpl = deps.stageBatches || (async input => defaultStageInventoryBatches(await defaultPublisherCollections(), input));
  const publishImpl = deps.publishMonth || (async input => defaultPublishMonth(await defaultPublisherCollections(), input));

  const enabledSources = config.sources.filter(source => source.enabled);
  const results: SyncRunSourceResult[] = [];
  const successfulMonths = new Map<string, Set<string>>();
  const failedMonths = new Set<string>();

  for (const source of enabledSources) {
    let worksheets: ReturnType<typeof selectInventoryWorksheets>;
    try {
      worksheets = selectInventoryWorksheets(
        await fetchWorksheetsImpl({ apiBase: token.apiBase, accessToken: token.accessToken, fileId: source.fileId }),
        source.worksheetIdStart,
        source.worksheetIdEnd,
        currentYear(),
      );
    } catch {
      failedMonths.add('*');
      results.push({ sourceId: source.id, worksheetId: 0, month: '', status: 'failed', recordCount: 0, errorCode: 'WORKSHEETS_FAILED' });
      continue;
    }

    for (const worksheet of worksheets) {
      const worksheetStartedAt = Date.now();
      try {
        parseInventoryMonth(worksheet.month);
        const parsed = await fetchRangeDataImpl({
          apiBase: token.apiBase,
          accessToken: token.accessToken,
          fileId: source.fileId,
          worksheetId: worksheet.worksheetId,
          rowFrom: source.rowFrom,
          rowTo: source.rowTo,
          colFrom: source.colFrom,
          colTo: source.colTo,
          fieldConfig: source.fieldConfig,
        });
        const count = await stageImpl({
          syncRunId: deps.runId,
          sourceId: source.id,
          sourceName: source.alias || source.name,
          month: worksheet.month,
          worksheetId: worksheet.worksheetId,
          worksheetName: worksheet.name,
          batches: parsed.batches,
        });
        logSyncEvent(deps.logger, {
          syncRunId: deps.runId,
          sourceId: source.id,
          worksheetId: worksheet.worksheetId,
          month: worksheet.month,
          status: 'success',
          durationMs: Date.now() - worksheetStartedAt,
          recordCount: count,
        });
        results.push({ sourceId: source.id, worksheetId: worksheet.worksheetId, month: worksheet.month, status: 'success', recordCount: count });
        const set = successfulMonths.get(worksheet.month) || new Set<string>();
        set.add(source.id);
        successfulMonths.set(worksheet.month, set);
      } catch {
        logSyncEvent(deps.logger, {
          syncRunId: deps.runId,
          sourceId: source.id,
          worksheetId: worksheet.worksheetId,
          month: worksheet.month,
          status: 'failed',
          durationMs: Date.now() - worksheetStartedAt,
          errorCode: 'SOURCE_FAILED',
        });
        failedMonths.add(worksheet.month);
        results.push({ sourceId: source.id, worksheetId: worksheet.worksheetId, month: worksheet.month, status: 'failed', recordCount: 0, errorCode: 'SOURCE_FAILED' });
      }
    }
  }

  for (const [month, sourceIds] of successfulMonths.entries()) {
    if (!failedMonths.has(month) && !failedMonths.has('*')) {
      await publishImpl({ month, syncRunId: deps.runId, sourceIds: [...sourceIds], publishedBy: deps.triggeredBy });
    }
  }
  const hasFailure = results.some(result => result.status === 'failed');
  logSyncEvent(deps.logger, {
    syncRunId: deps.runId,
    status: hasFailure ? 'failed' : 'published',
    durationMs: Date.now() - runStartedAt,
    sources: new Set(results.map(result => result.sourceId)).size,
    worksheets: results.length,
    records: results.reduce((sum, result) => sum + result.recordCount, 0),
    failures: results.filter(result => result.status === 'failed').length,
  });
  return {
    status: hasFailure ? 'failed' : 'published',
    sourceResults: results,
    errorSummary: hasFailure ? 'One or more WPS sources failed.' : undefined,
  };
}
