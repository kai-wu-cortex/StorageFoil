import { useCallback, useState } from 'react';
import type { InventoryBatch, WpsSyncConfig } from '../types';
import type { InventoryWorksheet } from '../services/wps';

interface UseWpsInventorySyncOptions {
  batches: InventoryBatch[];
  currentMonth: string;
  isDataLoaded: boolean;
  onSynced: (batches: InventoryBatch[], month: string) => void;
  getBatchesForMonth: (month: string) => InventoryBatch[];
}

export function useWpsInventorySync(_options: UseWpsInventorySyncOptions) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const unavailable = useCallback(async (): Promise<never> => {
    throw new Error('WPS 同步已迁移到管理员后端配置与服务端任务。');
  }, []);

  return {
    isSettingsOpen,
    setIsSettingsOpen,
    isSyncing: false,
    isGettingToken: false,
    isDiscovering: false,
    tokenStatus: 'idle' as const,
    tokenResponse: '',
    syncResponse: '',
    toast: null,
    oauthCode: '',
    sync: unavailable as (config?: WpsSyncConfig, sourceId?: string) => Promise<void>,
    discoverWorksheets: unavailable as (
      config: WpsSyncConfig,
      sourceId: string,
    ) => Promise<InventoryWorksheet[]>,
    exchangeToken: unavailable as (config: WpsSyncConfig, code?: string) => Promise<void>,
  };
}
