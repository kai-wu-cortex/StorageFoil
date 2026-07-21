import { useState, type ReactNode } from 'react';
import { Database, KeyRound, Loader2, Play, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import type { AuthUser } from '../shared/authTypes';
import type { WpsSyncSourceConfig } from '../shared/syncTypes';
import { useAdminSync } from '../hooks/useAdminSync';

export function shouldRenderAdminSyncConsole(user: AuthUser | null): boolean {
  return user?.role === 'admin';
}

export default function AdminSyncConsole({
  user,
  currentMonth,
  onRefreshCurrentMonth,
}: {
  user: AuthUser | null;
  currentMonth: string;
  onRefreshCurrentMonth: () => Promise<void> | void;
}) {
  const [newSourceName, setNewSourceName] = useState('');
  const [appKey, setAppKey] = useState('');
  const sync = useAdminSync({
    enabled: shouldRenderAdminSyncConsole(user),
    onRefreshCurrentMonth,
  });

  if (!shouldRenderAdminSyncConsole(user)) return null;

  const { config } = sync;

  const addSource = () => {
    sync.addSource(newSourceName);
    setNewSourceName('');
  };

  return (
    <section className="space-y-4" aria-label="管理员同步控制台">
      <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">管理员同步控制台</h3>
              <p className="text-xs text-slate-500">配置 WPS 来源、授权并触发 MongoDB 发布同步。</p>
            </div>
          </div>
          <button
            type="button"
            disabled={sync.isTriggering}
            onClick={() => void sync.triggerSync()}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {sync.isTriggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            立即同步
          </button>
        </div>
        {sync.error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{sync.error}</div>}
        {sync.message && <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{sync.message}</div>}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="全局 WPS 凭据" subtitle="App ID / App Key 全局共用；App Key 保存后只保留加密状态。">
          <div className="grid gap-3">
            <Field label="WPS API 地址">
              <input className={inputClass} value={config.credentials.apiBase} onChange={event => sync.updateCredentials({ apiBase: event.target.value })} />
            </Field>
            <Field label="App ID">
              <input className={inputClass} value={config.credentials.appId} onChange={event => sync.updateCredentials({ appId: event.target.value })} />
            </Field>
            <Field label={config.credentials.hasAppKey ? '替换 App Key（留空保持）' : 'App Key'}>
              <input className={inputClass} type="password" value={appKey} onChange={event => setAppKey(event.target.value)} autoComplete="off" />
            </Field>
            <Field label="WPS OAuth 回调地址">
              <input className={inputClass} value={config.credentials.redirectUri} onChange={event => sync.updateCredentials({ redirectUri: event.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-600">
              <StatusBadge ok={config.credentials.hasAppKey} label="App Key" />
              <StatusBadge ok={config.credentials.hasRefreshToken} label="WPS 授权" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void sync.save(appKey)} disabled={sync.isSaving} className={primaryButtonClass}>
                {sync.isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} 保存配置
              </button>
              <button type="button" onClick={() => void sync.authorizeWps()} className={secondaryButtonClass}>
                <KeyRound className="h-3.5 w-3.5" /> 授权 WPS
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="当前同步状态" subtitle={`当前月份：${currentMonth || '暂无已发布月份'}`}>
          {sync.run ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-xl bg-slate-50 p-3 font-mono text-slate-700">Run ID：{sync.run.id}</div>
              <div className="grid grid-cols-2 gap-2">
                <StatusBadge ok={sync.run.status === 'published'} label={`状态：${sync.run.status}`} />
                <StatusBadge ok={!sync.run.totals?.failures} label={`失败：${sync.run.totals?.failures ?? 0}`} />
              </div>
              {sync.run.totals && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="来源" value={sync.run.totals.sources} />
                  <Metric label="工作表" value={sync.run.totals.worksheets} />
                  <Metric label="记录" value={sync.run.totals.records} />
                </div>
              )}
              <button type="button" onClick={() => void sync.pollRunStatus(sync.run!.id)} className={secondaryButtonClass}>
                <RefreshCw className="h-3.5 w-3.5" /> 刷新运行状态
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center text-xs font-semibold text-slate-500">
              暂无本次页面触发的同步任务。
            </div>
          )}
        </Panel>
      </div>

      <Panel title="数据源配置" subtitle="显示所有已保存来源；可维护数据源别名、File ID、工作表范围，并可停用来源。">
        <div className="grid gap-3">
          {config.sources.map(source => (
            <SourceCard
              key={source.id}
              source={source}
              onChange={values => sync.updateSource(source.id, values)}
              onRemove={() => sync.removeSource(source.id)}
            />
          ))}
          <div className="flex gap-2 border-t border-slate-100 pt-3">
            <input className={inputClass} value={newSourceName} onChange={event => setNewSourceName(event.target.value)} placeholder="新数据源名称，例如 PK" />
            <button type="button" onClick={addSource} className={secondaryButtonClass}>
              <Plus className="h-3.5 w-3.5" /> 新增
            </button>
          </div>
          <button type="button" onClick={() => void sync.save(appKey)} disabled={sync.isSaving} className={primaryButtonClass}>
            <Save className="h-3.5 w-3.5" /> 保存所有数据源
          </button>
        </div>
      </Panel>
    </section>
  );
}

function SourceCard({
  source,
  onChange,
  onRemove,
}: {
  source: WpsSyncSourceConfig;
  onChange: (values: Partial<WpsSyncSourceConfig>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <input className={`${inputClass} font-bold`} value={source.name} onChange={event => onChange({ name: event.target.value })} aria-label={`${source.name} 名称`} />
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-white px-2 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50" aria-label={`停用 ${source.name}`}>
          <Trash2 className="h-4 w-4" />
          停用来源
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="数据源别名"><input className={inputClass} value={source.alias || ''} onChange={event => onChange({ alias: event.target.value })} placeholder="例如：PL 出入库主表" /></Field>
        <Field label="File ID"><input className={inputClass} value={source.fileId} onChange={event => onChange({ fileId: event.target.value })} /></Field>
        <label className="flex items-center gap-2 pt-5 text-xs font-bold text-slate-600">
          <input type="checkbox" checked={source.enabled} onChange={event => onChange({ enabled: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
          启用来源
        </label>
        <Field label="工作表起始 ID"><input className={inputClass} type="number" value={source.worksheetIdStart} onChange={event => onChange({ worksheetIdStart: Number(event.target.value) || 1 })} /></Field>
        <Field label="工作表结束 ID"><input className={inputClass} type="number" value={source.worksheetIdEnd} onChange={event => onChange({ worksheetIdEnd: Number(event.target.value) || 12 })} /></Field>
      </div>
      <div className="mt-2 text-[10px] font-semibold text-slate-400">工作表范围预览：{source.worksheetIdStart} → {source.worksheetIdEnd}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-xs">
      <div className="mb-4">
        <h4 className="text-sm font-bold text-slate-900">{title}</h4>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function StatusBadge({ ok, label }: { ok?: boolean; label: string }) {
  return <div className={`rounded-xl px-3 py-2 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{label}：{ok ? '已就绪' : '待处理'}</div>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-base font-black text-slate-900">{value}</div>
      <div className="text-[10px] font-bold text-slate-400">{label}</div>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
const primaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50';
const secondaryButtonClass = 'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50';
