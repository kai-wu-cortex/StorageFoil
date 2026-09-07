import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import {
  extractHeadersFromRawResponse,
  getWpsAuthorizationUrl,
} from '../services/wps';
import type { InventoryWorksheet } from '../services/wps';
import type { WpsSyncConfig } from '../types';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import {
  createWpsDataSource,
  loadWpsConfig,
  saveWpsConfig,
} from './wpsConfig';

interface WpsSettingsModalProps {
  open: boolean;
  onClose: () => void;
  currentMonth: string;
  initialCode?: string;
  isSyncing: boolean;
  isGettingToken: boolean;
  isDiscovering: boolean;
  tokenStatus: 'idle' | 'success' | 'error';
  tokenResponse: string;
  syncResponse: string;
  onGetToken: (config: WpsSyncConfig, code?: string) => Promise<void>;
  onDiscover: (
    config: WpsSyncConfig,
    sourceId: string,
  ) => Promise<InventoryWorksheet[]>;
  onSync: (config: WpsSyncConfig, sourceId?: string) => Promise<void>;
}

export default function WpsSettingsModal({
  open,
  onClose,
  currentMonth,
  initialCode,
  isSyncing,
  isGettingToken,
  isDiscovering,
  tokenStatus,
  tokenResponse,
  syncResponse,
  onGetToken,
  onDiscover,
  onSync,
}: WpsSettingsModalProps) {
  const [activeTab, setActiveTab] = useLocalStorageState<'connection' | 'mapping'>(
    'storage_foil_pref_v1_wps_settings_tab',
    'connection',
  );
  const [config, setConfig] = useState<WpsSyncConfig>(() => loadWpsConfig());
  const [selectedSourceId, setSelectedSourceId] = useLocalStorageState(
    'storage_foil_pref_v1_wps_selected_source',
    'pl',
  );
  const [newSourceName, setNewSourceName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [discoveredWorksheets, setDiscoveredWorksheets] = useState<
    InventoryWorksheet[]
  >([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (initialCode) {
      setConfig(current => ({ ...current, code: initialCode }));
    }
  }, [initialCode]);

  useEffect(() => {
    saveWpsConfig(config);
  }, [config]);

  useEffect(() => {
    if (
      config.sources.length > 0 &&
      !config.sources.some(source => source.id === selectedSourceId)
    ) {
      setSelectedSourceId(config.sources[0].id);
    }
  }, [config.sources, selectedSourceId, setSelectedSourceId]);

  useEffect(() => {
    if (!syncResponse) return;
    try {
      const parsed = JSON.parse(syncResponse);
      const successfulSource = Array.isArray(parsed.sources)
        ? parsed.sources.find((source: { status?: string }) => source.status === 'success')
        : null;
      setHeaders(
        extractHeadersFromRawResponse(successfulSource?.rawData || parsed).filter(Boolean),
      );
    } catch {
      setHeaders([]);
    }
  }, [syncResponse]);

  if (!open) return null;

  const update = <Key extends keyof WpsSyncConfig>(key: Key, value: WpsSyncConfig[Key]) => {
    setConfig(current => ({ ...current, [key]: value }));
  };

  const activeSource =
    config.sources.find(source => source.id === selectedSourceId) || config.sources[0];

  const updateActiveSource = (
    values: Partial<(typeof config.sources)[number]>,
  ) => {
    if (!activeSource) return;
    setConfig(current => ({
      ...current,
      sources: current.sources.map(source =>
        source.id === activeSource.id ? { ...source, ...values } : source,
      ),
    }));
  };

  const handleAddSource = () => {
    const name = newSourceName.trim();
    if (!name) {
      setMessage({ type: 'error', text: '请输入新数据源名称' });
      return;
    }
    if (config.sources.some(source => source.name.toLowerCase() === name.toLowerCase())) {
      setMessage({ type: 'error', text: `数据源“${name}”已经存在` });
      return;
    }
    const source = createWpsDataSource(
      name,
      `source-${Date.now().toString(36)}`,
    );
    setConfig(current => ({ ...current, sources: [...current.sources, source] }));
    setSelectedSourceId(source.id);
    setDiscoveredWorksheets([]);
    setNewSourceName('');
    setMessage({ type: 'success', text: `已新增数据源“${name}”，请继续填写 File ID` });
  };

  const handleRemoveSource = () => {
    if (!activeSource) return;
    if (config.sources.length === 1) {
      setMessage({ type: 'error', text: '至少保留一个数据源' });
      return;
    }
    if (!window.confirm(`确定删除数据源“${activeSource.name}”的配置吗？库存数据不会被删除。`)) {
      return;
    }
    const remaining = config.sources.filter(source => source.id !== activeSource.id);
    setConfig(current => ({ ...current, sources: remaining }));
    setSelectedSourceId(remaining[0].id);
    setDiscoveredWorksheets([]);
    setMessage({ type: 'success', text: `已移除数据源“${activeSource.name}”` });
  };

  const handleSaveSources = () => {
    saveWpsConfig(config);
    setMessage({ type: 'success', text: `已保存 ${config.sources.length} 个数据源配置` });
  };

  const validate = (requireFileId = true): boolean => {
    if (!config.appId || !config.appKey) {
      setMessage({ type: 'error', text: '请填写 App ID 和 App Key' });
      return false;
    }
    if (requireFileId && !activeSource?.fileId) {
      setMessage({ type: 'error', text: `请填写 ${activeSource?.name || '当前来源'} 的 File ID` });
      return false;
    }
    if (!config.fieldConfig.some(field => field.fieldId === 'batchCode' && field.mappedColumn)) {
      setMessage({ type: 'error', text: '产品批次字段必须映射到一个 WPS 列' });
      return false;
    }
    return true;
  };

  const handleToken = async () => {
    if (!validate(false)) return;
    saveWpsConfig(config);
    setMessage(null);
    try {
      await onGetToken(config, config.code);
      setMessage({ type: 'success', text: 'Access Token 获取成功，已安全缓存到当前浏览器' });
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    }
  };

  const handleSync = async (sourceId?: string) => {
    if (!validate(Boolean(sourceId))) return;
    saveWpsConfig(config);
    setMessage(null);
    try {
      await onSync(config, sourceId);
      setMessage({
        type: 'success',
        text: sourceId
          ? `${activeSource.name} 范围内的月份工作表已同步`
          : '所有已启用数据源的月份工作表已同步',
      });
    } catch (error) {
      setMessage({ type: 'error', text: String(error) });
    }
  };

  const handleDiscover = async () => {
    if (!activeSource || !validate()) return;
    saveWpsConfig(config);
    setMessage(null);
    try {
      const worksheets = await onDiscover(config, activeSource.id);
      setDiscoveredWorksheets(worksheets);
      setMessage({
        type: worksheets.length ? 'success' : 'error',
        text: worksheets.length
          ? `已发现 ${worksheets.length} 个可读取的月份工作表`
          : '当前 ID 范围内没有可读取的月份工作表',
      });
    } catch (error) {
      setDiscoveredWorksheets([]);
      setMessage({ type: 'error', text: String(error) });
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
              <h2 className="text-sm font-bold text-slate-900">WPS 在线表格数据源</h2>
              <p className="text-[11px] text-slate-500">
                配置授权、读取范围与库存字段映射
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
            aria-label="关闭 WPS 设置"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 px-5">
          <button
            onClick={() => setActiveTab('connection')}
            className={`border-b-2 px-4 py-3 text-xs font-semibold ${
              activeTab === 'connection'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500'
            }`}
          >
            连接与授权
          </button>
          <button
            onClick={() => setActiveTab('mapping')}
            className={`border-b-2 px-4 py-3 text-xs font-semibold ${
              activeTab === 'mapping'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500'
            }`}
          >
            字段映射
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeTab === 'connection' ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">库存数据源</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      所有来源共用 App ID、App Key 与字段映射，分别维护 File ID 和工作表范围
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                    {config.sources.filter(source => source.enabled && source.fileId).length}/
                    {config.sources.length} 已配置
                  </span>
                </div>
                <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                  {config.sources.map(source => {
                    const selected = source.id === activeSource?.id;
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => {
                          setSelectedSourceId(source.id);
                          setDiscoveredWorksheets([]);
                        }}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selected
                            ? 'border-emerald-500 bg-emerald-600 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200'
                        }`}
                      >
                        <span className="block text-xs font-bold">{source.name}</span>
                        <span
                          className={`mt-1 block text-[9px] ${
                            selected ? 'text-emerald-100' : 'text-slate-400'
                          }`}
                        >
                          {!source.enabled
                            ? '已停用'
                            : source.fileId
                              ? '已填写 File ID'
                              : '等待配置'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {activeSource && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                          来源名称
                        </span>
                        <input
                          value={activeSource.name}
                          onChange={event => updateActiveSource({ name: event.target.value })}
                          className="mt-0.5 w-full bg-transparent text-[11px] font-bold text-slate-700 outline-none"
                          aria-label="数据源名称"
                        />
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-[10px] font-semibold text-slate-500">
                        启用
                        <input
                          type="checkbox"
                          checked={activeSource.enabled}
                          onChange={event => updateActiveSource({ enabled: event.target.checked })}
                          className="h-4 w-4 accent-emerald-600"
                          aria-label={`启用 ${activeSource.name}`}
                        />
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveSource}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      删除
                    </button>
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row">
                  <input
                    value={newSourceName}
                    onChange={event => setNewSourceName(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddSource();
                      }
                    }}
                    className={inputClass}
                    placeholder="输入新来源名称，例如 UV光膜"
                    aria-label="新数据源名称"
                  />
                  <button
                    type="button"
                    onClick={handleAddSource}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    新增来源
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSources}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 py-2 text-[10px] font-bold text-white hover:bg-slate-900"
                  >
                    <Save className="h-3.5 w-3.5" />
                    保存配置
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="WPS API 地址">
                  <input
                    value={config.apiUrl}
                    onChange={event => update('apiUrl', event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={`${activeSource?.name || ''} 在线表格 File ID`}>
                  <input
                    value={activeSource?.fileId || ''}
                    onChange={event => updateActiveSource({ fileId: event.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="App ID">
                  <input
                    value={config.appId}
                    onChange={event => update('appId', event.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="App Key">
                  <input
                    type="password"
                    value={config.appKey}
                    onChange={event => update('appKey', event.target.value)}
                    className={inputClass}
                    autoComplete="off"
                  />
                </Field>
                <Field label="OAuth 授权回调地址">
                  <input
                    type="url"
                    value={config.redirectUri}
                    onChange={event => update('redirectUri', event.target.value)}
                    className={inputClass}
                    placeholder="http://localhost:3000/"
                  />
                </Field>
                <Field label="授权 Code">
                  <input
                    value={config.code}
                    onChange={event => update('code', event.target.value)}
                    className={inputClass}
                    placeholder="WPS 授权回调会自动填入"
                  />
                </Field>
              </div>

              <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex flex-col gap-3 border-b border-emerald-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      工作表 ID 动态加载
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-slate-500">
                      默认 ID 1–12 对应 1–12 月；系统会先读取真实工作表列表，再同步范围内全部月份。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleDiscover}
                    disabled={isDiscovering || !activeSource?.fileId}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isDiscovering ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    动态加载工作表
                  </button>
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <Field label={`${activeSource?.name || ''} 工作表起始 ID`}>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={activeSource?.worksheetIdStart ?? 1}
                      onChange={event => {
                        updateActiveSource({
                          worksheetIdStart: Math.max(1, Number(event.target.value) || 1),
                        });
                        setDiscoveredWorksheets([]);
                      }}
                      className={inputClass}
                    />
                  </Field>
                  <Field label={`${activeSource?.name || ''} 工作表结束 ID`}>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={activeSource?.worksheetIdEnd ?? 12}
                      onChange={event => {
                        updateActiveSource({
                          worksheetIdEnd: Math.max(1, Number(event.target.value) || 12),
                        });
                        setDiscoveredWorksheets([]);
                      }}
                      className={inputClass}
                    />
                  </Field>
                </div>
                {discoveredWorksheets.length > 0 && (
                  <div className="border-t border-emerald-100 bg-white/70 px-4 py-3">
                    <div className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      已识别月份
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {discoveredWorksheets.map(worksheet => (
                        <span
                          key={worksheet.worksheetId}
                          className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-emerald-800 shadow-sm"
                        >
                          ID {worksheet.worksheetId} · {worksheet.name} → {worksheet.month}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-slate-700">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  读取范围（WPS v7 零基索引）
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                  {(
                    [
                      ['rowFrom', '起始行'],
                      ['rowTo', '结束行'],
                      ['colFrom', '起始列'],
                      ['colTo', '结束列'],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        type="number"
                        value={config[key]}
                        onChange={event => update(key, Number(event.target.value) || 0)}
                        className={inputClass}
                      />
                    </Field>
                  ))}
                  <a
                    href={getWpsAuthorizationUrl(
                      config.appId,
                      config.apiUrl,
                      config.redirectUri,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-3 text-xs font-semibold text-white hover:bg-slate-900"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    WPS 授权
                  </a>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={handleToken}
                  disabled={isGettingToken}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {isGettingToken ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  获取 / 刷新 Access Token
                </button>
                <button
                  onClick={() => handleSync(activeSource?.id)}
                  disabled={isSyncing || !activeSource?.enabled}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  同步 {activeSource?.name} 全部工作表
                </button>
                <button
                  onClick={() => handleSync()}
                  disabled={isSyncing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  同步全部来源与工作表
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  先完成一次同步即可读取真实表头。1–31 号的“入/出”明细列会自动识别，无需逐列配置。
                </p>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">系统字段</th>
                      <th className="px-4 py-3 font-semibold">WPS 表格列</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {config.fieldConfig.map((field, index) => (
                      <tr key={field.fieldId}>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          {field.displayName}
                          {field.required && <span className="ml-1 text-rose-500">*</span>}
                        </td>
                        <td className="px-4 py-3">
                          {headers.length ? (
                            <select
                              value={field.mappedColumn}
                              onChange={event => {
                                const next = [...config.fieldConfig];
                                next[index] = { ...field, mappedColumn: event.target.value };
                                update('fieldConfig', next);
                              }}
                              className={inputClass}
                            >
                              <option value="">不映射</option>
                              {headers.map((header, headerIndex) => (
                                <option key={`${header}-${headerIndex}`} value={header}>
                                  {header || `未命名列 ${headerIndex + 1}`}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={field.mappedColumn}
                              onChange={event => {
                                const next = [...config.fieldConfig];
                                next[index] = { ...field, mappedColumn: event.target.value };
                                update('fieldConfig', next);
                              }}
                              className={inputClass}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => update('fieldConfig', DEFAULT_WPS_FIELD_CONFIG)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  恢复默认映射
                </button>
                <button
                  onClick={() => {
                    saveWpsConfig(config);
                    setMessage({ type: 'success', text: '字段映射已保存' });
                  }}
                  className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900"
                >
                  <Save className="h-3.5 w-3.5" />
                  保存字段映射
                </button>
              </div>
            </div>
          )}

          {(message || tokenStatus !== 'idle') && (
            <div
              className={`mt-5 flex items-start gap-2 rounded-xl border p-3 text-xs ${
                (message?.type || tokenStatus) === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              {(message?.type || tokenStatus) === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{message?.text || `Token ${tokenStatus === 'success' ? '获取成功' : '获取失败'}`}</span>
            </div>
          )}

          {(tokenResponse || syncResponse) && (
            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-950 p-3 text-[10px] text-slate-300">
              <summary className="cursor-pointer font-semibold text-slate-100">查看最近一次 API 响应</summary>
              <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap">
                {syncResponse || tokenResponse}
              </pre>
            </details>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 p-4">
          <button
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-3.5 w-3.5" />
            完成
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}
