import { useEffect, useState, type ReactNode } from 'react';
import { Database, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import { DEFAULT_WPS_ROW_TO } from '../data/wpsSyncDefaults';
import { adminSyncApi } from '../lib/adminSyncApi';
import type { WpsSyncSourceConfig } from '../shared/syncTypes';

interface WpsSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface AdminSyncConfig {
  credentials: {
    apiBase?: string;
    appId?: string;
    redirectUri?: string;
    hasAppKey?: boolean;
    hasRefreshToken?: boolean;
  };
  sources: WpsSyncSourceConfig[];
  revision: string;
}

const emptyConfig: AdminSyncConfig = {
  credentials: {
    apiBase: 'https://openapi.wps.cn',
    appId: '',
    redirectUri: '',
  },
  sources: [],
  revision: '',
};

export default function WpsSettingsModal({ open, onClose }: WpsSettingsModalProps) {
  const [config, setConfig] = useState<AdminSyncConfig>(emptyConfig);
  const [appKey, setAppKey] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [newSourceName, setNewSourceName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    adminSyncApi
      .getSyncConfig()
      .then(value => {
        const next = value as AdminSyncConfig;
        setConfig(next);
        setSelectedSourceId(next.sources[0]?.id ?? '');
      })
      .catch(error => setMessage({ type: 'error', text: String(error) }))
      .finally(() => setIsLoading(false));
  }, [open]);

  if (!open) return null;

  const activeSource = config.sources.find(source => source.id === selectedSourceId);
  const updateCredentials = (values: Partial<AdminSyncConfig['credentials']>) => {
    setConfig(current => ({ ...current, credentials: { ...current.credentials, ...values } }));
  };
  const updateSource = (values: Partial<WpsSyncSourceConfig>) => {
    if (!activeSource) return;
    setConfig(current => ({
      ...current,
      sources: current.sources.map(source =>
        source.id === activeSource.id ? { ...source, ...values } : source,
      ),
    }));
  };

  const addSource = () => {
    const name = newSourceName.trim();
    if (!name) return;
    const id = `source-${Date.now().toString(36)}`;
    const source: WpsSyncSourceConfig = {
      id,
      name,
      enabled: true,
      fileId: '',
      worksheetIdStart: 1,
      worksheetIdEnd: 12,
      rowFrom: 1,
      rowTo: DEFAULT_WPS_ROW_TO,
      colFrom: 1,
      colTo: 80,
      fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
      updatedAt: '',
      updatedBy: '',
    };
    setConfig(current => ({ ...current, sources: [...current.sources, source] }));
    setSelectedSourceId(id);
    setNewSourceName('');
  };

  const removeSource = () => {
    if (!activeSource) return;
    const nextSources = config.sources.filter(source => source.id !== activeSource.id);
    setConfig(current => ({ ...current, sources: nextSources }));
    setSelectedSourceId(nextSources[0]?.id ?? '');
  };

  const save = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const saved = (await adminSyncApi.updateSyncConfig({
        revision: config.revision,
        credentials: {
          apiBase: config.credentials.apiBase,
          appId: config.credentials.appId,
          appKey: appKey || undefined,
          redirectUri: config.credentials.redirectUri,
        },
        sources: config.sources,
      })) as AdminSyncConfig;
      setConfig(saved);
      setAppKey('');
      setMessage({ type: 'success', text: '已保存到管理员后端配置。' });
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 p-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-700">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">WPS 数据源后台配置</h2>
              <p className="text-[11px] text-slate-500">App Key 保存后仅加密存储，前端不再显示明文。</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg bg-slate-100 p-2 text-slate-500 hover:bg-slate-200" aria-label="关闭 WPS 设置">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading && <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />正在处理...</div>}
          {message && (
            <div className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
              {message.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="WPS API 地址">
              <input className={inputClass} value={config.credentials.apiBase ?? ''} onChange={event => updateCredentials({ apiBase: event.target.value })} />
            </Field>
            <Field label="App ID">
              <input className={inputClass} value={config.credentials.appId ?? ''} onChange={event => updateCredentials({ appId: event.target.value })} />
            </Field>
            <Field label={config.credentials.hasAppKey ? '替换 App Key（留空则保持）' : 'App Key'}>
              <input className={inputClass} type="password" value={appKey} onChange={event => setAppKey(event.target.value)} autoComplete="off" />
            </Field>
            <Field label="OAuth 授权回调地址">
              <input className={inputClass} value={config.credentials.redirectUri ?? ''} onChange={event => updateCredentials({ redirectUri: event.target.value })} />
            </Field>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800">库存数据源</div>
                <div className="mt-0.5 text-[10px] text-slate-500">来源数量不限；每个来源独立维护 File ID 和工作表范围。</div>
              </div>
              <button onClick={save} disabled={isLoading} className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-900 disabled:opacity-50">
                <Save className="h-3.5 w-3.5" /> 保存
              </button>
            </div>
            <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {config.sources.map(source => (
                <button key={source.id} type="button" onClick={() => setSelectedSourceId(source.id)} className={`rounded-xl border px-3 py-2 text-left transition ${source.id === selectedSourceId ? 'border-emerald-500 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-700'}`}>
                  <span className="block text-xs font-bold">{source.name}</span>
                  <span className="mt-1 block text-[9px]">{source.enabled ? '启用' : '停用'} · {source.fileId || '未填 File ID'}</span>
                </button>
              ))}
            </div>
            {activeSource && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="来源名称"><input className={inputClass} value={activeSource.name} onChange={event => updateSource({ name: event.target.value })} /></Field>
                <Field label="File ID"><input className={inputClass} value={activeSource.fileId} onChange={event => updateSource({ fileId: event.target.value })} /></Field>
                <Field label="工作表起始 ID"><input className={inputClass} type="number" value={activeSource.worksheetIdStart} onChange={event => updateSource({ worksheetIdStart: Number(event.target.value) || 1 })} /></Field>
                <Field label="工作表结束 ID"><input className={inputClass} type="number" value={activeSource.worksheetIdEnd} onChange={event => updateSource({ worksheetIdEnd: Number(event.target.value) || 12 })} /></Field>
                <label className="flex items-center gap-2 text-xs font-bold text-slate-600">
                  <input type="checkbox" checked={activeSource.enabled} onChange={event => updateSource({ enabled: event.target.checked })} className="h-4 w-4 accent-emerald-600" />
                  启用该来源
                </label>
                <button type="button" onClick={removeSource} className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50">
                  <Trash2 className="h-3.5 w-3.5" /> 移除
                </button>
              </div>
            )}
            <div className="mt-3 flex gap-2 border-t border-slate-200 pt-3">
              <input className={inputClass} value={newSourceName} onChange={event => setNewSourceName(event.target.value)} placeholder="新来源名称" />
              <button type="button" onClick={addSource} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100">
                <Plus className="h-3.5 w-3.5" /> 新增来源
              </button>
            </div>
          </div>
        </div>
      </div>
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

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100';
