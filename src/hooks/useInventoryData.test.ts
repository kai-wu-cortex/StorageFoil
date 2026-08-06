import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInventoryDataController,
  getInitialInventoryDataState,
} from './useInventoryData';
import type { AuthUser } from '../shared/authTypes';

const viewer: AuthUser = {
  id: 'viewer1',
  username: 'viewer1',
  displayName: 'Viewer 1',
  role: 'viewer',
};

const admin: AuthUser = {
  ...viewer,
  id: 'admin',
  username: 'admin',
  displayName: 'Admin',
  role: 'admin',
};

function bootstrap(month = '2026-07') {
  return {
    user: null,
    months: ['2026-07', '2026-06'],
    defaultMonth: month,
    month,
    batches: [
      {
        id: `${month}-batch`,
        productModel: 'PL-001',
        batchCode: 'B-001',
        specification: '0.64*120M',
        shelf: '19-3A',
        totalStock: 7,
        inflowQty: 10,
        outflowQty: 3,
        remarks: '',
        dailyActivities: [],
        createdAt: `${month}-01T00:00:00.000Z`,
      },
    ],
    sources: [{ id: 'pl', name: 'PL', enabled: true }],
    latestPublishedAt: '2026-07-20T00:00:00.000Z',
    syncRunId: 'run-july',
  };
}

test('starts empty before authenticated bootstrap', () => {
  assert.deepEqual(getInitialInventoryDataState(), {
    status: 'idle',
    batches: [],
    months: [],
    currentMonth: null,
    sources: [],
    latestPublishedAt: null,
    syncRunId: null,
    pendingUpdate: null,
    error: null,
  });
});

test('loads bootstrap once per login generation and does not read business localStorage', async () => {
  let bootstrapCalls = 0;
  const storageReads: string[] = [];
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => {
        bootstrapCalls += 1;
        return bootstrap();
      },
      getInventory: async () => bootstrap('2026-06'),
    },
    storage: {
      getItem: key => {
        storageReads.push(key);
        return key === 'storage_foil_pref_v1_current_month' ? '2026-07' : null;
      },
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  await controller.bootstrapForUser(admin, 'login-1');
  await controller.bootstrapForUser(admin, 'login-2');

  assert.equal(bootstrapCalls, 2);
  assert.deepEqual(storageReads, ['storage_foil_pref_v1_current_month', 'storage_foil_pref_v1_current_month']);
});

test('authenticated bootstrap prefers the published current calendar month over an older saved month', async () => {
  const august = {
    ...bootstrap('2026-08'),
    months: ['2026-08', '2026-07', '2026-06'],
    defaultMonth: '2026-08',
    month: '2026-08',
  };
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => august,
      getInventory: async ({ month }) => bootstrap(month),
    },
    storage: {
      getItem: () => '2026-07',
      setItem: () => undefined,
    },
    now: () => new Date('2026-08-06T12:00:00.000Z'),
  });

  await controller.bootstrapForUser(viewer, 'login-august');

  assert.equal(controller.getState().currentMonth, '2026-08');
  assert.equal(controller.getState().batches[0].id, '2026-08-batch');
});

test('month switch calls inventory API and stale responses cannot overwrite newer selection', async () => {
  const resolvers = new Map<string, (value: ReturnType<typeof bootstrap>) => void>();
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap(),
      getInventory: async ({ month }) =>
        new Promise(resolve => {
          resolvers.set(month, resolve);
        }),
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  const june = controller.loadMonth('2026-06');
  const july = controller.loadMonth('2026-07');
  resolvers.get('2026-07')?.(bootstrap('2026-07'));
  await july;
  resolvers.get('2026-06')?.(bootstrap('2026-06'));
  await june;

  assert.equal(controller.getState().currentMonth, '2026-07');
  assert.equal(controller.getState().batches[0].id, '2026-07-batch');
});

test('month switch renders cached month immediately while refreshing in background', async () => {
  let getInventoryCalls = 0;
  let resolveJuneRefresh: ((value: ReturnType<typeof bootstrap>) => void) | null = null;
  const states: ReturnType<typeof getInitialInventoryDataState>[] = [];
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap('2026-07'),
      getInventory: async ({ month }) => {
        getInventoryCalls += 1;
        if (month === '2026-06' && getInventoryCalls === 3) {
          return new Promise(resolve => {
            resolveJuneRefresh = resolve;
          });
        }
        return bootstrap(month);
      },
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
    onStateChange: state => states.push(state),
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  await controller.loadMonth('2026-06');
  assert.equal(controller.getState().currentMonth, '2026-06');
  assert.equal(controller.getState().batches[0].id, '2026-06-batch');

  await controller.loadMonth('2026-07');
  assert.equal(controller.getState().currentMonth, '2026-07');
  const refreshPromise = controller.loadMonth('2026-06');

  assert.equal(controller.getState().status, 'ready');
  assert.equal(controller.getState().currentMonth, '2026-06');
  assert.equal(controller.getState().batches[0].id, '2026-06-batch');
  assert.notEqual(states.at(-1)?.status, 'loading');

  resolveJuneRefresh?.(bootstrap('2026-06'));
  await refreshPromise;
  assert.equal(getInventoryCalls, 3);
});

test('prefetchMonth caches comparison data without changing the current month', async () => {
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap('2026-07'),
      getInventory: async ({ month }) => bootstrap(month),
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  await controller.prefetchMonth('2026-06');

  assert.equal(controller.getState().currentMonth, '2026-07');
  assert.equal(controller.getState().batches[0].id, '2026-07-batch');
  assert.equal(controller.getBatchesByMonth()['2026-06'][0].id, '2026-06-batch');
});

test('prefetchMonth deduplicates concurrent reads for the same comparison month', async () => {
  let calls = 0;
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap('2026-07'),
      getInventory: async ({ month }) => {
        calls += 1;
        return bootstrap(month);
      },
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  await Promise.all([
    controller.prefetchMonth('2026-06'),
    controller.prefetchMonth('2026-06'),
  ]);

  assert.equal(calls, 1);
});

test('failed month load keeps last successful data visible with an error', async () => {
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap('2026-07'),
      getInventory: async () => {
        throw new Error('月份读取失败');
      },
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  await controller.loadMonth('2026-06');

  assert.equal(controller.getState().currentMonth, '2026-07');
  assert.equal(controller.getState().batches[0].id, '2026-07-batch');
  assert.equal(controller.getState().error, '月份读取失败');
});

test('clear removes inventory after logout and role does not change loaded data', async () => {
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => bootstrap('2026-07'),
      getInventory: async () => bootstrap('2026-06'),
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'viewer-login');
  const viewerState = controller.getState();
  await controller.bootstrapForUser(admin, 'admin-login');

  assert.deepEqual(controller.getState().batches, viewerState.batches);
  controller.clear();
  assert.deepEqual(controller.getState(), getInitialInventoryDataState());
});

test('checkForUpdates records a pending refresh when a newer sync run is published', async () => {
  let current = bootstrap('2026-07');
  const controller = createInventoryDataController({
    api: {
      bootstrap: async () => current,
      getInventory: async ({ month }) => ({ ...current, month, defaultMonth: month }),
    },
    storage: {
      getItem: () => null,
      setItem: () => undefined,
    },
  });

  await controller.bootstrapForUser(viewer, 'login-1');
  current = {
    ...bootstrap('2026-07'),
    syncRunId: 'run-new',
    latestPublishedAt: '2026-07-21T05:08:53.714Z',
  };
  await controller.checkForUpdates();

  assert.equal(controller.getState().syncRunId, 'run-july');
  assert.equal(controller.getState().pendingUpdate?.syncRunId, 'run-new');

  await controller.loadMonth('2026-07');
  assert.equal(controller.getState().syncRunId, 'run-new');
  assert.equal(controller.getState().pendingUpdate, null);
});
