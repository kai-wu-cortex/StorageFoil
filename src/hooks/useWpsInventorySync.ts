import { useCallback, useEffect, useRef, useState } from 'react';
import { isWpsConfigured, loadWpsConfig } from '../components/wpsConfig';
import {
  fetchInventoryFromWps,
  fetchWpsWorksheets,
  getWpsAccessToken,
  hasCachedWpsToken,
  replaceInventorySource,
  selectInventoryWorksheets,
} from '../services/wps';
import { getNextDailySyncDelayMs } from '../syncSchedule';
import type { InventoryBatch, WpsSyncConfig } from '../types';
import type { InventoryWorksheet } from '../services/wps';

interface UseWpsInventorySyncOptions {
  batches: InventoryBatch[];
  currentMonth: string;
  isDataLoaded: boolean;
  onSynced: (batches: InventoryBatch[], month: string) => void;
  getBatchesForMonth: (month: string) => InventoryBatch[];
}

export function useWpsInventorySync({
  batches,
  currentMonth,
  isDataLoaded,
  onSynced,
  getBatchesForMonth,
}: UseWpsInventorySyncOptions) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGettingToken, setIsGettingToken] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [tokenResponse, setTokenResponse] = useState('');
  const [syncResponse, setSyncResponse] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);
  const [oauthCode, setOauthCode] = useState('');

  const latestRef = useRef({
    batches,
    currentMonth,
    onSynced,
    getBatchesForMonth,
  });
  latestRef.current = {
    batches,
    currentMonth,
    onSynced,
    getBatchesForMonth,
  };
  const didStartSyncRef = useRef(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    setOauthCode(code);
    setIsSettingsOpen(true);
    params.delete('code');
    const query = params.toString();
    window.history.replaceState(
      {},
      document.title,
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sync = useCallback(async (
    override?: WpsSyncConfig,
    onlySourceId?: string,
  ): Promise<void> => {
    const { batches: currentBatches, currentMonth: month } = latestRef.current;
    const baseConfig = override || loadWpsConfig();
    const sources = baseConfig.sources.filter(
      source =>
        source.enabled &&
        source.fileId &&
        (!onlySourceId || source.id === onlySourceId),
    );
    if (!sources.length) {
      throw new Error(onlySourceId ? '所选数据源未启用或未填写 File ID' : '没有可同步的数据源');
    }
    setIsSyncing(true);
    setSyncResponse('');
    try {
      const year = Number(month.slice(0, 4)) || new Date().getFullYear();
      const token = await getWpsAccessToken(baseConfig);
      const batchesByMonth = new Map<string, InventoryBatch[]>();
      let successCount = 0;
      const responses: Array<Record<string, unknown>> = [];
      for (const source of sources) {
        try {
          const discovered = await fetchWpsWorksheets(token.access_token, source.fileId);
          const worksheets = selectInventoryWorksheets(
            discovered,
            source.worksheetIdStart,
            source.worksheetIdEnd,
            year,
          );
          if (!worksheets.length) {
            responses.push({
              sourceId: source.id,
              sourceName: source.name,
              status: 'empty',
              error: '范围内没有可读取的月份工作表',
            });
            continue;
          }
          for (const worksheet of worksheets) {
            try {
              const config = {
                ...baseConfig,
                fileId: source.fileId,
                worksheetId: worksheet.worksheetId,
              };
              const result = await fetchInventoryFromWps(
                token.access_token,
                config,
              );
              if (!result.batches.length) {
                responses.push({
                  sourceId: source.id,
                  sourceName: source.name,
                  worksheetId: worksheet.worksheetId,
                  worksheetName: worksheet.name,
                  month: worksheet.month,
                  status: 'empty',
                  rawData: result.rawData,
                });
                continue;
              }
              const existing =
                batchesByMonth.get(worksheet.month) ||
                (worksheet.month === month
                  ? currentBatches
                  : latestRef.current.getBatchesForMonth(worksheet.month));
              batchesByMonth.set(
                worksheet.month,
                replaceInventorySource(existing, source, result.batches),
              );
              successCount += 1;
              responses.push({
                sourceId: source.id,
                sourceName: source.name,
                worksheetId: worksheet.worksheetId,
                worksheetName: worksheet.name,
                month: worksheet.month,
                status: 'success',
                count: result.batches.length,
                rawData: result.rawData,
              });
            } catch (error) {
              responses.push({
                sourceId: source.id,
                sourceName: source.name,
                worksheetId: worksheet.worksheetId,
                worksheetName: worksheet.name,
                month: worksheet.month,
                status: 'error',
                error: String(error),
              });
            }
          }
        } catch (error) {
          responses.push({
            sourceId: source.id,
            sourceName: source.name,
            status: 'error',
            error: String(error),
          });
        }
      }
      setSyncResponse(JSON.stringify({ sources: responses }, null, 2));
      if (!successCount) {
        throw new Error('所有工作表均未同步成功，已保留本地数据');
      }
      batchesByMonth.forEach((monthBatches, targetMonth) => {
        latestRef.current.onSynced(monthBatches, targetMonth);
      });
      const failedCount = responses.filter(response => response.status !== 'success').length;
      const totalBatches = [...batchesByMonth.values()].reduce(
        (sum, monthBatches) => sum + monthBatches.length,
        0,
      );
      setToast({
        type: failedCount ? 'error' : 'success',
        message: failedCount
          ? `${successCount} 个工作表同步成功，${failedCount} 个工作表跳过或保留旧数据`
          : `${successCount} 个工作表同步完成，共 ${totalBatches} 条库存记录`,
      });
    } catch (error) {
      setSyncResponse(JSON.stringify({ error: String(error) }, null, 2));
      setToast({ type: 'error', message: `WPS 同步失败：${String(error)}` });
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const discoverWorksheets = useCallback(async (
    config: WpsSyncConfig,
    sourceId: string,
  ): Promise<InventoryWorksheet[]> => {
    const source = config.sources.find(item => item.id === sourceId);
    if (!source?.fileId) throw new Error('请先填写该数据源的 File ID');
    setIsDiscovering(true);
    try {
      const token = await getWpsAccessToken(config);
      const sheets = await fetchWpsWorksheets(token.access_token, source.fileId);
      const year =
        Number(latestRef.current.currentMonth.slice(0, 4)) ||
        new Date().getFullYear();
      return selectInventoryWorksheets(
        sheets,
        source.worksheetIdStart,
        source.worksheetIdEnd,
        year,
      );
    } finally {
      setIsDiscovering(false);
    }
  }, []);

  const exchangeToken = useCallback(
    async (config: WpsSyncConfig, code?: string): Promise<void> => {
      setIsGettingToken(true);
      setTokenStatus('idle');
      setTokenResponse('');
      try {
        const result = await getWpsAccessToken(config, code);
        setTokenResponse(JSON.stringify(result, null, 2));
        setTokenStatus('success');
      } catch (error) {
        setTokenResponse(JSON.stringify({ error: String(error) }, null, 2));
        setTokenStatus('error');
        throw error;
      } finally {
        setIsGettingToken(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!isDataLoaded || didStartSyncRef.current) return;
    didStartSyncRef.current = true;
    const config = loadWpsConfig();
    if (isWpsConfigured(config) && hasCachedWpsToken()) {
      void sync(config).catch(() => undefined);
    }
  }, [isDataLoaded, sync]);

  useEffect(() => {
    if (!isDataLoaded) return;
    let timer: number;
    const runAndSchedule = async () => {
      const config = loadWpsConfig();
      if (isWpsConfigured(config) && hasCachedWpsToken()) {
        await sync(config).catch(() => undefined);
      }
      timer = window.setTimeout(runAndSchedule, getNextDailySyncDelayMs());
    };
    timer = window.setTimeout(runAndSchedule, getNextDailySyncDelayMs());
    return () => window.clearTimeout(timer);
  }, [isDataLoaded, sync]);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isSyncing,
    isGettingToken,
    isDiscovering,
    tokenStatus,
    tokenResponse,
    syncResponse,
    toast,
    oauthCode,
    sync,
    discoverWorksheets,
    exchangeToken,
  };
}
