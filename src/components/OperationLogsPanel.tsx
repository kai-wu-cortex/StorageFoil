import { useCallback, useEffect, useState } from 'react';
import { Clock3, History, Loader2, RefreshCw } from 'lucide-react';
import { adminSyncApi } from '../lib/adminSyncApi';
import type { OperationLogEntry, OperationLogType } from '../shared/syncTypes';

const LOG_TYPE_OPTIONS: Array<{ value: OperationLogType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'sync_received', label: '请求' },
  { value: 'sync_started', label: '开始' },
  { value: 'source_synced', label: '工作表' },
  { value: 'inventory_activity', label: '出入库' },
  { value: 'sync_published', label: '发布' },
  { value: 'sync_failed', label: '失败' },
];

export default function OperationLogsPanel() {
  const [logs, setLogs] = useState<OperationLogEntry[]>([]);
  const [filter, setFilter] = useState<OperationLogType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async (type = filter) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await adminSyncApi.getOperationLogs({
        limit: 160,
        type: type === 'all' ? undefined : type,
      }) as { logs: OperationLogEntry[] };
      setLogs(result.logs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '操作日志读取失败。');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleFilter = (type: OperationLogType | 'all') => {
    setFilter(type);
    void loadLogs(type);
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-xs" id="operation-logs-section">
      <div className="border-b border-slate-100 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">系统操作流水变动日志</h3>
            <p className="mt-1 text-xs text-slate-500">
              记录 WPS 同步请求、同步时间、工作表结果以及出入库明细。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadLogs()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新日志
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {LOG_TYPE_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleFilter(option.value)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                filter === option.value
                  ? 'bg-emerald-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>}
      </div>

      <div className="max-h-[620px] space-y-2 overflow-auto p-5">
        {logs.length ? logs.map(log => <OperationLogRow key={log.id} log={log} />) : (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
            <History className="w-8 h-8 text-slate-300" />
            <p className="text-sm font-medium">{isLoading ? '正在读取操作日志...' : '暂无操作日志'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function OperationLogRow({ log }: { log: OperationLogEntry }) {
  const levelClass =
    log.level === 'error'
      ? 'border-rose-200 bg-rose-50'
      : log.level === 'warning'
        ? 'border-amber-200 bg-amber-50'
        : log.level === 'success'
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-slate-200 bg-slate-50';
  return (
    <div className={`rounded-xl border px-3 py-2 ${levelClass}`}>
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-bold leading-relaxed text-slate-900">{log.message}</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-semibold text-slate-500">
            {log.sourceName && <span>来源：{log.sourceName}</span>}
            {log.month && <span>月份：{log.month}</span>}
            {log.worksheetName && <span>工作表：{log.worksheetName}</span>}
            {log.fileId && <span>File ID：{log.fileId}</span>}
            {log.batchCode && <span>批次：{log.batchCode}</span>}
          </div>
          {log.type === 'inventory_activity' && (
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600">
              {log.productModel && <span>型号：{log.productModel}</span>}
              {log.specification && <span>规格：{log.specification}</span>}
              {log.shelf && <span>货架：{log.shelf}</span>}
              <span>入库：{log.inQty ?? 0}</span>
              <span>出库：{log.outQty ?? 0}</span>
              <span>库存：{log.stock ?? 0}</span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-slate-500">
          <Clock3 className="h-3 w-3" />
          {formatLogTime(log.createdAt)}
        </div>
      </div>
    </div>
  );
}

function formatLogTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}
