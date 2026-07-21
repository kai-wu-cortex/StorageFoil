export type LogStatus = 'queued' | 'running' | 'success' | 'failed' | 'published' | 'skipped';

const ALLOWED_KEYS = new Set([
  'requestId',
  'syncRunId',
  'sourceId',
  'worksheetId',
  'month',
  'status',
  'durationMs',
  'recordCount',
  'errorCode',
  'sources',
  'worksheets',
  'records',
  'failures',
]);

export type SafeLogEvent = Record<string, string | number | boolean>;

export interface LoggerLike {
  info(value: string): void;
}

export function createSafeLogEvent(input: Record<string, unknown>): SafeLogEvent {
  const event: SafeLogEvent = {};
  for (const [key, value] of Object.entries(input)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      event[key] = value;
    }
  }
  return event;
}

export function logSyncEvent(
  logger: LoggerLike = console,
  input: Record<string, unknown>,
): void {
  logger.info(JSON.stringify({
    event: 'storage_foil_sync',
    ...createSafeLogEvent(input),
  }));
}
