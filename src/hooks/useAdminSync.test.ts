import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_WPS_FIELD_CONFIG } from '../data/wpsFieldConfig';
import {
  createAdminSyncController,
  getInitialAdminSyncState,
  type AdminSyncClient,
} from './useAdminSync';

const config = {
  credentials: {
    apiBase: 'https://openapi.wps.cn',
    appId: 'app-id',
    redirectUri: 'https://app.example.com/api/admin/wps/callback',
    hasAppKey: true,
    hasRefreshToken: false,
    updatedAt: '2026-07-21T00:00:00.000Z',
    updatedBy: 'admin',
  },
  revision: 'rev-1',
  sources: [
    {
      id: 'pl',
      name: 'PL',
      alias: 'PL 出入库',
      enabled: true,
      fileId: 'file-pl',
      worksheetIdStart: 1,
      worksheetIdEnd: 12,
      rowFrom: 1,
      rowTo: 300,
      colFrom: 1,
      colTo: 80,
      fieldConfig: DEFAULT_WPS_FIELD_CONFIG,
      updatedAt: '',
      updatedBy: '',
    },
  ],
};

test('admin sync controller loads config edits arbitrary sources and handles save conflicts', async () => {
  const states: ReturnType<typeof getInitialAdminSyncState>[] = [];
  const api: AdminSyncClient = {
    getSyncConfig: async () => config,
    updateSyncConfig: async body => {
      assert.equal(body.sources[1].name, 'PC粉箔');
      assert.equal(body.sources[1].alias, 'PC 粉箔出入库');
      assert.equal(body.sources[1].address, 'https://kdocs.cn/l/cp-pc-file');
      assert.equal(body.sources[1].fileId, 'cp-pc-file');
      throw new Error('配置已被更新，请刷新后重试。');
    },
    getAuthorizationUrl: async () => ({ url: 'https://openapi.wps.cn/oauth2/auth' }),
    triggerSync: async () => ({ id: 'run-1', status: 'queued' }),
    getRun: async () => ({ id: 'run-1', status: 'published' }),
  };
  const controller = createAdminSyncController({
    api,
    onStateChange: state => states.push(state),
    createSourceId: () => 'pc-powder',
  });

  await controller.load();
  controller.addSource({
    name: 'PC粉箔',
    alias: 'PC 粉箔出入库',
    address: 'https://kdocs.cn/l/cp-pc-file',
  });
  controller.updateSource('pc-powder', { worksheetIdStart: 2, worksheetIdEnd: 8 });
  await controller.save();

  assert.equal(controller.getState().config.sources.length, 2);
  assert.match(controller.getState().error || '', /配置已被更新/);
  assert.ok(states.length >= 4);
});

test('admin sync controller saves sources without sending App ID or App Key', async () => {
  let savedBody: Parameters<AdminSyncClient['updateSyncConfig']>[0] | null = null;
  const api: AdminSyncClient = {
    getSyncConfig: async () => config,
    updateSyncConfig: async body => {
      savedBody = body;
      return { ...config, sources: body.sources };
    },
    getAuthorizationUrl: async () => ({ url: 'https://openapi.wps.cn/oauth2/auth' }),
    triggerSync: async () => ({ id: 'run-1', status: 'queued' }),
    getRun: async () => ({ id: 'run-1', status: 'published' }),
  };
  const controller = createAdminSyncController({ api });

  await controller.load();
  controller.updateCredentials({ appId: 'new-app-id' });
  controller.addSource({ name: 'PK', alias: 'PK 入库', address: 'https://kdocs.cn/l/pk-file' });
  await controller.saveSources();

  assert.deepEqual(savedBody?.credentials, {});
  assert.equal(savedBody?.sources.length, 2);
});

test('admin sync controller deletes sources from the saved source list', async () => {
  const api: AdminSyncClient = {
    getSyncConfig: async () => config,
    updateSyncConfig: async body => body as typeof config,
    getAuthorizationUrl: async () => ({ url: 'https://openapi.wps.cn/oauth2/auth' }),
    triggerSync: async () => ({ id: 'run-1', status: 'queued' }),
    getRun: async () => ({ id: 'run-1', status: 'published' }),
  };
  const controller = createAdminSyncController({ api });

  await controller.load();
  controller.removeSource('pl');

  assert.equal(controller.getState().config.sources.length, 0);
});

test('admin sync controller authorizes triggers once polls and refreshes only after published', async () => {
  let triggerCount = 0;
  let refreshCount = 0;
  const seenRunIds: string[] = [];
  const api: AdminSyncClient = {
    getSyncConfig: async () => config,
    updateSyncConfig: async () => config,
    getAuthorizationUrl: async () => ({ url: 'https://openapi.wps.cn/oauth2/auth?redirect_uri=https%3A%2F%2Fapp.example.com' }),
    triggerSync: async () => {
      triggerCount += 1;
      return { id: 'run-1', status: 'queued' };
    },
    getRun: async runId => {
      seenRunIds.push(runId);
      return {
        id: runId,
        status: seenRunIds.length === 1 ? 'running' : 'published',
        totals: { sources: 1, worksheets: 1, records: 2, failures: 0 },
      };
    },
  };
  const controller = createAdminSyncController({
    api,
    onRefreshCurrentMonth: async () => { refreshCount += 1; },
    pollDelayMs: 0,
  });

  await controller.authorizeWps(url => assert.match(url, /oauth2\/auth/));
  await Promise.all([controller.triggerSync(), controller.triggerSync()]);

  assert.equal(triggerCount, 1);
  assert.equal(controller.getState().run?.status, 'published');
  assert.equal(refreshCount, 1);
  assert.deepEqual(seenRunIds, ['run-1', 'run-1']);
});
