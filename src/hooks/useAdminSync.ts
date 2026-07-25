import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import { DEFAULT_WPS_ROW_TO } from '../data/wpsSyncDefaults';
import { adminSyncApi } from '../lib/adminSyncApi';
import type { OperationLogEntry, OperationLogType, PublicWpsCredentials, WpsSourcePreview, WpsSyncSourceConfig } from '../shared/syncTypes';

export interface AdminSyncConfig {
  credentials: PublicWpsCredentials;
  sources: WpsSyncSourceConfig[];
  revision: string;
}

export interface AdminSyncRunState {
  id: string;
  status: 'queued' | 'running' | 'validated' | 'published' | 'failed';
  totals?: {
    sources: number;
    worksheets: number;
    records: number;
    failures: number;
  };
  errorSummary?: string;
}

export interface AdminSyncClient {
  getSyncConfig(): Promise<AdminSyncConfig>;
  updateSyncConfig(body: { revision: string; credentials: Partial<PublicWpsCredentials> & { appKey?: string }; sources: WpsSyncSourceConfig[] }): Promise<AdminSyncConfig>;
  getAuthorizationUrl(): Promise<{ url: string }>;
  triggerSync(body: { idempotencyKey: string }): Promise<AdminSyncRunState>;
  getRun(runId: string): Promise<AdminSyncRunState>;
  getOperationLogs(options?: { limit?: number; type?: OperationLogType; sourceId?: string; month?: string; syncRunId?: string }): Promise<{ logs: OperationLogEntry[] }>;
  previewWpsSource(options: { sourceId: string; worksheetId?: number }): Promise<WpsSourcePreview>;
}

export interface NewSyncSourceDraft {
  name: string;
  alias?: string;
  address?: string;
  fileId?: string;
}

export interface AdminSyncState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  config: AdminSyncConfig;
  run: AdminSyncRunState | null;
  isSaving: boolean;
  savingSourceId: string | null;
  isTriggering: boolean;
  isPolling: boolean;
  isLoadingLogs: boolean;
  isPreviewing: boolean;
  logs: OperationLogEntry[];
  preview: WpsSourcePreview | null;
  logTypeFilter: OperationLogType | 'all';
  error: string | null;
  message: string | null;
}

const emptyConfig: AdminSyncConfig = {
  credentials: {
    apiBase: 'https://openapi.wps.cn',
    appId: '',
    redirectUri: '',
    hasAppKey: false,
    hasRefreshToken: false,
    updatedAt: '',
    updatedBy: '',
  },
  sources: [],
  revision: '',
};

export function getInitialAdminSyncState(): AdminSyncState {
  return {
    status: 'idle',
    config: emptyConfig,
    run: null,
    isSaving: false,
    savingSourceId: null,
    isTriggering: false,
    isPolling: false,
    isLoadingLogs: false,
    isPreviewing: false,
    logs: [],
    preview: null,
    logTypeFilter: 'all',
    error: null,
    message: null,
  };
}

function nextSourceId(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${slug}-${Date.now().toString(36)}` : `source-${Date.now().toString(36)}`;
}

export function deriveFileIdFromAddressOrValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    const pathParts = url.pathname.split('/').filter(Boolean);
    return pathParts[pathParts.length - 1] || trimmed;
  } catch {
    return trimmed;
  }
}

export function createAdminSyncController(options: {
  api: AdminSyncClient;
  onStateChange?: (state: AdminSyncState) => void;
  onRefreshCurrentMonth?: () => Promise<void> | void;
  createSourceId?: (name: string) => string;
  pollDelayMs?: number;
  maxPollAttempts?: number;
}) {
  let state = getInitialAdminSyncState();
  let triggerInFlight: Promise<void> | null = null;
  const refreshedRuns = new Set<string>();
  const pollDelayMs = options.pollDelayMs ?? 1500;
  const maxPollAttempts = options.maxPollAttempts ?? 80;

  const setState = (next: AdminSyncState) => {
    state = next;
    options.onStateChange?.(state);
  };

  const patchConfig = (config: AdminSyncConfig) => setState({ ...state, config });

  return {
    getState: () => state,

    async load() {
      setState({ ...state, status: 'loading', error: null });
      try {
        const config = await options.api.getSyncConfig();
        setState({ ...state, status: 'ready', config, error: null });
        void this.loadOperationLogs();
      } catch (error) {
        setState({ ...state, status: 'error', error: error instanceof Error ? error.message : '同步配置读取失败。' });
      }
    },

    addSource(input: string | NewSyncSourceDraft) {
      const draft = typeof input === 'string' ? { name: input } : input;
      const trimmed = draft.name.trim();
      if (!trimmed) return;
      const id = options.createSourceId?.(trimmed) || nextSourceId(trimmed);
      const address = draft.address?.trim() || '';
      const fileId = draft.fileId?.trim() || deriveFileIdFromAddressOrValue(address);
      patchConfig({
        ...state.config,
        sources: [
          ...state.config.sources,
          {
            id,
            name: trimmed,
            alias: draft.alias?.trim() || '',
            enabled: true,
            address,
            fileId,
            worksheetIdStart: 1,
            worksheetIdEnd: 12,
            rowFrom: 1,
            rowTo: DEFAULT_WPS_ROW_TO,
            colFrom: 0,
            colTo: 80,
            fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
            updatedAt: '',
            updatedBy: '',
          },
        ],
      });
    },

    updateSource(sourceId: string, values: Partial<WpsSyncSourceConfig>) {
      patchConfig({
        ...state.config,
        sources: state.config.sources.map(source =>
          source.id === sourceId ? { ...source, ...values } : source,
        ),
      });
    },

    removeSource(sourceId: string) {
      patchConfig({
        ...state.config,
        sources: state.config.sources.filter(source => source.id !== sourceId),
      });
    },

    updateCredentials(values: Partial<PublicWpsCredentials>) {
      patchConfig({
        ...state.config,
        credentials: { ...state.config.credentials, ...values },
      });
    },

    async save(appKey = '') {
      setState({ ...state, isSaving: true, savingSourceId: null, error: null, message: null });
      try {
        const config = await options.api.updateSyncConfig({
          revision: state.config.revision,
          credentials: { ...state.config.credentials, appKey: appKey || undefined },
          sources: state.config.sources,
        });
        setState({ ...state, config, isSaving: false, savingSourceId: null, message: '同步配置已保存。', error: null });
      } catch (error) {
        setState({ ...state, isSaving: false, savingSourceId: null, error: error instanceof Error ? error.message : '同步配置保存失败。' });
      }
    },

    async saveSources() {
      setState({ ...state, isSaving: true, savingSourceId: null, error: null, message: null });
      try {
        const config = await options.api.updateSyncConfig({
          revision: state.config.revision,
          credentials: {},
          sources: state.config.sources,
        });
        setState({ ...state, config, isSaving: false, savingSourceId: null, message: '数据源已保存。', error: null });
      } catch (error) {
        setState({ ...state, isSaving: false, savingSourceId: null, error: error instanceof Error ? error.message : '数据源保存失败。' });
      }
    },

    async saveSource(sourceId: string) {
      const source = state.config.sources.find(candidate => candidate.id === sourceId);
      if (!source) {
        setState({ ...state, error: '找不到需要保存的数据源。', message: null });
        return;
      }

      setState({ ...state, isSaving: true, savingSourceId: sourceId, error: null, message: null });
      try {
        const config = await options.api.updateSyncConfig({
          revision: state.config.revision,
          credentials: {},
          sources: state.config.sources,
        });
        setState({
          ...state,
          config,
          isSaving: false,
          savingSourceId: null,
          message: `数据源“${source.name}”已保存。`,
          error: null,
        });
      } catch (error) {
        setState({
          ...state,
          isSaving: false,
          savingSourceId: null,
          error: error instanceof Error ? error.message : `数据源“${source.name}”保存失败。`,
        });
      }
    },

    async authorizeWps(openUrl: (url: string) => void = url => window.location.assign(url)) {
      setState({ ...state, error: null });
      try {
        const result = await options.api.getAuthorizationUrl();
        openUrl(result.url);
      } catch (error) {
        setState({ ...state, error: error instanceof Error ? error.message : 'WPS 授权地址获取失败。' });
      }
    },

    async triggerSync() {
      if (triggerInFlight) return triggerInFlight;
      triggerInFlight = (async () => {
        setState({ ...state, isTriggering: true, error: null, message: null });
        try {
          const run = await options.api.triggerSync({ idempotencyKey: `admin-${Date.now()}` });
          setState({ ...state, run, isTriggering: false, message: '同步任务已提交，正在读取运行结果。' });
          await this.pollRunUntilTerminal(run.id);
          await this.loadOperationLogs();
        } catch (error) {
          setState({ ...state, isTriggering: false, error: error instanceof Error ? error.message : '同步触发失败。' });
        } finally {
          triggerInFlight = null;
        }
      })();
      return triggerInFlight;
    },

    async pollRunStatus(runId: string) {
      setState({ ...state, isPolling: true, error: null });
      try {
        const run = await options.api.getRun(runId);
        setState({ ...state, run, isPolling: false });
        void this.loadOperationLogs();
        if (run.status === 'published' && !refreshedRuns.has(run.id)) {
          refreshedRuns.add(run.id);
          await options.onRefreshCurrentMonth?.();
        }
      } catch (error) {
        setState({ ...state, isPolling: false, error: error instanceof Error ? error.message : '同步状态读取失败。' });
      }
    },

    async pollRunUntilTerminal(runId: string) {
      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        await this.pollRunStatus(runId);
        const status = state.run?.status;
        if (status === 'published' || status === 'failed') return;
        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
      }
      setState({
        ...state,
        isPolling: false,
        error: '同步任务仍在运行，请稍后刷新运行状态。',
      });
    },

    setLogTypeFilter(type: OperationLogType | 'all') {
      setState({ ...state, logTypeFilter: type });
      void this.loadOperationLogs(type);
    },

    async loadOperationLogs(type = state.logTypeFilter) {
      setState({ ...state, isLoadingLogs: true, error: null });
      try {
        const result = await options.api.getOperationLogs({
          limit: 120,
          type: type === 'all' ? undefined : type,
        });
        setState({ ...state, logs: result.logs, logTypeFilter: type, isLoadingLogs: false });
      } catch (error) {
        setState({ ...state, isLoadingLogs: false, error: error instanceof Error ? error.message : '操作日志读取失败。' });
      }
    },

    async previewSource(sourceId: string, worksheetId?: number) {
      setState({ ...state, isPreviewing: true, error: null, message: null });
      try {
        const preview = await options.api.previewWpsSource({ sourceId, worksheetId });
        setState({ ...state, preview, isPreviewing: false, message: 'WPS 原始响应已读取。' });
      } catch (error) {
        setState({ ...state, isPreviewing: false, error: error instanceof Error ? error.message : 'WPS 原始响应读取失败。' });
      }
    },
  };
}

export function useAdminSync(options: {
  enabled: boolean;
  onRefreshCurrentMonth?: () => Promise<void> | void;
}) {
  const [state, setState] = useState(getInitialAdminSyncState);
  const controllerRef = useRef<ReturnType<typeof createAdminSyncController> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createAdminSyncController({
      api: adminSyncApi as AdminSyncClient,
      onStateChange: setState,
      onRefreshCurrentMonth: options.onRefreshCurrentMonth,
    });
  }

  useEffect(() => {
    if (options.enabled) {
      void controllerRef.current?.load();
    }
  }, [options.enabled]);

  return {
    ...state,
    load: useCallback(() => controllerRef.current?.load(), []),
    addSource: useCallback((input: string | NewSyncSourceDraft) => controllerRef.current?.addSource(input), []),
    updateSource: useCallback((sourceId: string, values: Partial<WpsSyncSourceConfig>) => controllerRef.current?.updateSource(sourceId, values), []),
    removeSource: useCallback((sourceId: string) => controllerRef.current?.removeSource(sourceId), []),
    updateCredentials: useCallback((values: Partial<PublicWpsCredentials>) => controllerRef.current?.updateCredentials(values), []),
    save: useCallback((appKey?: string) => controllerRef.current?.save(appKey), []),
    saveSources: useCallback(() => controllerRef.current?.saveSources(), []),
    saveSource: useCallback((sourceId: string) => controllerRef.current?.saveSource(sourceId), []),
    authorizeWps: useCallback(() => controllerRef.current?.authorizeWps(), []),
    triggerSync: useCallback(() => controllerRef.current?.triggerSync(), []),
    pollRunStatus: useCallback((runId: string) => controllerRef.current?.pollRunStatus(runId), []),
    setLogTypeFilter: useCallback((type: OperationLogType | 'all') => controllerRef.current?.setLogTypeFilter(type), []),
    loadOperationLogs: useCallback(() => controllerRef.current?.loadOperationLogs(), []),
    previewSource: useCallback((sourceId: string, worksheetId?: number) => controllerRef.current?.previewSource(sourceId, worksheetId), []),
  };
}
