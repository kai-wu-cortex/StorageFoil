import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inventoryApi } from '../lib/inventoryApi';
import type { AuthUser } from '../shared/authTypes';
import type { InventoryBatch } from '../types';

export interface InventoryDataResponse {
  user?: AuthUser | null;
  months?: string[];
  defaultMonth?: string | null;
  month: string | null;
  batches: InventoryBatch[];
  sources: Array<{ id: string; name: string; enabled: boolean }>;
  latestPublishedAt: string | null;
  syncRunId: string | null;
}

export interface InventoryDataApi {
  bootstrap(): Promise<InventoryDataResponse>;
  getInventory(options: { month: string; sourceId?: string }): Promise<InventoryDataResponse>;
}

export interface InventoryDataStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface InventoryDataState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  batches: InventoryBatch[];
  months: string[];
  currentMonth: string | null;
  sources: Array<{ id: string; name: string; enabled: boolean }>;
  latestPublishedAt: string | null;
  syncRunId: string | null;
  pendingUpdate: {
    syncRunId: string;
    latestPublishedAt: string | null;
    defaultMonth: string | null;
    months: string[];
  } | null;
  error: string | null;
}

const CURRENT_MONTH_PREF_KEY = 'storage_foil_pref_v1_current_month';

export function getInitialInventoryDataState(): InventoryDataState {
  return {
    status: 'idle',
    batches: [],
    months: [],
    currentMonth: null,
    sources: [],
    latestPublishedAt: null,
    syncRunId: null,
    pendingUpdate: null,
    error: null,
  };
}

function applyResponse(
  previous: InventoryDataState,
  response: InventoryDataResponse,
): InventoryDataState {
  return {
    status: 'ready',
    batches: response.batches,
    months: response.months ?? previous.months,
    currentMonth: response.month ?? response.defaultMonth ?? previous.currentMonth,
    sources: response.sources,
    latestPublishedAt: response.latestPublishedAt,
    syncRunId: response.syncRunId,
    pendingUpdate: null,
    error: null,
  };
}

export function createInventoryDataController(options: {
  api: InventoryDataApi;
  storage: InventoryDataStorage;
  onStateChange?: (state: InventoryDataState) => void;
}) {
  let state = getInitialInventoryDataState();
  let loginGeneration: string | null = null;
  let requestId = 0;
  const batchesByMonth = new Map<string, InventoryBatch[]>();

  const setState = (next: InventoryDataState) => {
    state = next;
    if (next.currentMonth) {
      batchesByMonth.set(next.currentMonth, next.batches);
    }
    options.onStateChange?.(state);
  };

  return {
    getState: () => state,
    getBatchesByMonth: () => Object.fromEntries(batchesByMonth),

    async bootstrapForUser(_user: AuthUser, generation: string) {
      if (loginGeneration === generation && state.status !== 'idle') return;
      loginGeneration = generation;
      const preferredMonth = options.storage.getItem(CURRENT_MONTH_PREF_KEY);
      setState({ ...state, status: 'loading', error: null });
      try {
        const response = await options.api.bootstrap();
        const next = applyResponse(state, response);
        const validPreferredMonth =
          preferredMonth && next.months.includes(preferredMonth) ? preferredMonth : next.currentMonth;
        setState({ ...next, currentMonth: validPreferredMonth });
      } catch (error) {
        setState({
          ...state,
          status: 'error',
          error: error instanceof Error ? error.message : '库存读取失败。',
        });
      }
    },

    async loadMonth(month: string, sourceId = 'all') {
      const currentRequestId = ++requestId;
      setState({ ...state, status: 'loading', error: null });
      try {
        const response = await options.api.getInventory({ month, sourceId });
        if (currentRequestId !== requestId) return;
        options.storage.setItem(CURRENT_MONTH_PREF_KEY, month);
        setState(applyResponse(state, response));
      } catch (error) {
        if (currentRequestId !== requestId) return;
        setState({
          ...state,
          status: state.batches.length > 0 ? 'ready' : 'error',
          error: error instanceof Error ? error.message : '月份库存读取失败。',
        });
      }
    },

    async checkForUpdates() {
      if (state.status !== 'ready') return;
      try {
        const response = await options.api.bootstrap();
        if (response.syncRunId && response.syncRunId !== state.syncRunId) {
          setState({
            ...state,
            months: response.months ?? state.months,
            pendingUpdate: {
              syncRunId: response.syncRunId,
              latestPublishedAt: response.latestPublishedAt,
              defaultMonth: response.defaultMonth ?? response.month,
              months: response.months ?? state.months,
            },
            error: null,
          });
        }
      } catch {
        // Silent by design: update checks should not disrupt normal reading.
      }
    },

    dismissPendingUpdate() {
      setState({ ...state, pendingUpdate: null });
    },

    clear() {
      loginGeneration = null;
      requestId += 1;
      batchesByMonth.clear();
      setState(getInitialInventoryDataState());
    },
  };
}

export function useInventoryData(user: AuthUser | null, generation: string | null) {
  const [state, setState] = useState(getInitialInventoryDataState);
  const controllerRef = useRef<ReturnType<typeof createInventoryDataController> | null>(null);

  if (!controllerRef.current) {
    controllerRef.current = createInventoryDataController({
      api: inventoryApi as InventoryDataApi,
      storage: window.localStorage,
      onStateChange: setState,
    });
  }

  useEffect(() => {
    if (!user || !generation) {
      controllerRef.current?.clear();
      return;
    }
    void controllerRef.current?.bootstrapForUser(user, generation);
  }, [generation, user]);

  const loadMonth = useCallback(
    (month: string, sourceId = 'all') => controllerRef.current?.loadMonth(month, sourceId),
    [],
  );
  const retry = useCallback(() => {
    if (state.currentMonth) {
      return controllerRef.current?.loadMonth(state.currentMonth);
    }
    if (user && generation) {
      return controllerRef.current?.bootstrapForUser(user, generation);
    }
    return undefined;
  }, [generation, state.currentMonth, user]);
  const clear = useCallback(() => controllerRef.current?.clear(), []);
  const checkForUpdates = useCallback(() => controllerRef.current?.checkForUpdates(), []);
  const dismissPendingUpdate = useCallback(() => controllerRef.current?.dismissPendingUpdate(), []);

  useEffect(() => {
    if (!user || !generation) return undefined;
    const intervalId = window.setInterval(() => {
      void controllerRef.current?.checkForUpdates();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [generation, user]);

  const batchesByMonth = useMemo(
    () => controllerRef.current?.getBatchesByMonth() ?? {},
    [state.batches, state.currentMonth],
  );

  return { ...state, batchesByMonth, loadMonth, retry, clear, checkForUpdates, dismissPendingUpdate };
}
