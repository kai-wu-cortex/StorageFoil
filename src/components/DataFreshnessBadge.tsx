import { RefreshCw } from 'lucide-react';

interface DataFreshnessBadgeProps {
  latestPublishedAt: string | null;
  syncRunId: string | null;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export default function DataFreshnessBadge({
  latestPublishedAt,
  syncRunId,
  isLoading,
  error,
  onRetry,
}: DataFreshnessBadgeProps) {
  const publishedLabel = latestPublishedAt
    ? new Date(latestPublishedAt).toLocaleString('zh-CN', { hour12: false })
    : '暂无发布数据';
  const runLabel = syncRunId ? syncRunId.slice(0, 8) : '未发布';

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-500">
      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
        发布: {publishedLabel}
      </span>
      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono">
        RUN {runLabel}
      </span>
      {error && (
        <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-rose-700">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        重试读取
      </button>
    </div>
  );
}
