import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AuthUser } from '../shared/authTypes';
import AdminSyncConsole, { shouldRenderAdminSyncConsole } from './AdminSyncConsole';

const admin: AuthUser = { id: 'admin', username: 'admin', displayName: 'Admin', role: 'admin' };
const viewer: AuthUser = { id: 'viewer', username: 'viewer', displayName: 'Viewer', role: 'viewer' };

test('admin sync console does not render for viewers', () => {
  assert.equal(shouldRenderAdminSyncConsole(viewer), false);
  assert.equal(renderToStaticMarkup(<AdminSyncConsole user={viewer} currentMonth="2026-07" onRefreshCurrentMonth={async () => undefined} />), '');
});

test('admin sync console renders sections for administrators without secrets', () => {
  assert.equal(shouldRenderAdminSyncConsole(admin), true);
  const html = renderToStaticMarkup(<AdminSyncConsole user={admin} currentMonth="2026-07" onRefreshCurrentMonth={async () => undefined} />);

  assert.match(html, /管理员同步控制台/);
  assert.match(html, /全局 WPS 凭据/);
  assert.match(html, /数据源配置/);
  assert.match(html, /数据源别名/);
  assert.match(html, /WPS 地址/);
  assert.match(html, /删除来源/);
  assert.match(html, /立即同步/);
  assert.doesNotMatch(html, /App Key 明文|refresh_token|access_token/);
});
