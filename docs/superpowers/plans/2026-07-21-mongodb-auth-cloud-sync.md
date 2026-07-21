# StorageFoil MongoDB Auth and Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 StorageFoil 从“浏览器 localStorage + 浏览器直连 WPS”迁移为“MongoDB 统一存储 + 账号鉴权 + Vercel 云函数同步 WPS”的架构，提供 10 个只读账号和 1 个管理员账号，并让前端登录后只从 MongoDB 发布版本读取库存数据。

**Architecture:** 复用 Duo Cloud 当前使用的 MongoDB Atlas 连接与数据库，但使用 `storage_foil_*` 独立集合、独立 `storage_foil_session` Cookie 和独立角色边界。只读用户登录后通过受保护的 Vercel API 读取已发布库存版本；管理员通过后台维护数据源和触发同步。AirScript 或管理员请求调用同一个服务端同步编排器，由其读取 WPS、构建带 `syncRunId` 的新版本，校验成功后原子切换发布指针，保证用户不会看到半同步数据。

**Tech Stack:** React 19、TypeScript、Vite、Vercel Node.js Functions / Fluid Compute、MongoDB Node.js Driver、Node.js `crypto`、WPS OpenAPI、Node test runner + `tsx`

## Global Constraints

- 当前实施分支固定为 `develop`；所有步骤都在该分支完成，任务结束前通过 `git status --short --branch` 确认没有误入其他分支。
- 本计划只定义实施步骤，不在编写计划阶段访问或写入生产 MongoDB，也不创建真实账号。
- 复用 Duo Cloud 的 `MONGODB_URI`、`MONGODB_DIRECT_URI` 和数据库名；StorageFoil 新增 `STORAGE_FOIL_DB_NAME` 时默认回退到 Duo Cloud 的 `KNOWLEDGE_DB_NAME`，集合统一使用 `storage_foil_` 前缀。
- 不复用 Duo Cloud 的 `system_users` 或 `duocloud_session`，避免任一项目的账号、角色、退出登录和 Cookie 变更影响另一个项目。
- 仅复用 Duo Cloud 登录页面的布局与视觉语言；文案改为“StorageFoil 库存云平台”，不得继续显示“双云知识平台”。
- 只定义两种权限：`viewer` 和 `admin`。10 个读取账号均为 `viewer`；唯一后台配置账号为 `admin`。
- 普通前端不得直接访问 WPS、MongoDB 或写库存数据；浏览器只调用本站 `/api/*`。
- `MONGODB_URI`、WPS App Key、WPS refresh token、会话密钥、配置加密密钥和 webhook 密钥不得使用 `VITE_` 前缀，不得返回浏览器，不得写入 Git。
- WPS App ID / App Key 是全局共享凭据；每个数据源只保存不同的 `fileId`、工作表 ID 范围、字段映射和启用状态。
- 数据源数量不得设上限；初始导入现有 5 份表对应的 5 个数据源，但集合和 UI 必须支持动态增删。
- 工作表不得固定为单个 ID。同步时先读取工作表列表，再按 `worksheetIdStart` 到 `worksheetIdEnd` 动态发现月份工作表；工作表名称中的月份优先于 ID。
- 同步数据先写入不可见的新 `syncRunId`，所有来源校验完成后才切换发布指针；失败时保留上一次发布版本。
- 同一时间只允许一个全量同步运行；重复 webhook 使用 `idempotencyKey` 去重。
- localStorage 仅保留界面偏好（标签、筛选、排序、当前月份等）；删除 WPS 密钥、令牌、数据源配置和库存业务数据的 localStorage 依赖。
- 当前 UI 中新增批次、手工出入库、创建月份、重置和导入写操作在本阶段移除或隐藏。库存数据只有服务端同步引擎可以发布。
- 所有 MongoDB 集合必须有 JSON Schema validator 和明确索引；禁止无限增长的嵌入数组。
- 每个服务端 handler 保持薄层：校验 HTTP、鉴权、调用领域服务、映射统一响应；MongoDB/WPS 逻辑不得直接堆在 `api/*.ts` 中。
- 实施过程使用 TDD：先写失败测试，确认失败原因正确，再实现最小代码，最后运行全量 `npm test && npm run lint && npm run build`。
- 每次真实数据库建索引、创建账号、写同步配置或首次同步前，必须再次取得用户明确授权，并先对目标数据库名和集合前缀做只读确认。

---

## Public Contracts and Data Model

### Environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `MONGODB_URI` | Server only | 复用 Duo Cloud MongoDB Atlas 连接 |
| `MONGODB_DIRECT_URI` | Server only | 可选的直连回退 URI |
| `STORAGE_FOIL_DB_NAME` | Server only | StorageFoil 数据库名；未设置时回退 `KNOWLEDGE_DB_NAME` |
| `KNOWLEDGE_DB_NAME` | Server only | Duo Cloud 当前数据库名兼容回退 |
| `STORAGE_FOIL_SESSION_SECRET` | Server only | 签名 `storage_foil_session` |
| `STORAGE_FOIL_CONFIG_ENCRYPTION_KEY` | Server only | 32 字节密钥，用 AES-256-GCM 加密 WPS App Key 和 token |
| `STORAGE_FOIL_WEBHOOK_SECRET` | Server only | AirScript webhook HMAC 密钥 |
| `STORAGE_FOIL_WPS_API_BASE` | Server only | 默认 `https://openapi.wps.cn` |
| `STORAGE_FOIL_WPS_REDIRECT_URI` | Server only | WPS 控制台预登记的生产回调地址 |

### MongoDB collections

1. `storage_foil_users`
   - `_id: string`：规范化用户名。
   - `username: string`、`displayName: string`。
   - `role: 'viewer' | 'admin'`。
   - `enabled: boolean`。
   - `password: { algorithm: 'scrypt-v1'; salt: string; hash: string }`。
   - `createdAt: Date`、`updatedAt: Date`、`lastLoginAt?: Date`。
   - 唯一索引 `{ username: 1 }`。

2. `storage_foil_wps_credentials`
   - 固定 `_id: 'global'`。
   - `apiBase: string`、`appId: string`、`redirectUri: string`。
   - `appKeyEncrypted`、`refreshTokenEncrypted`、`accessTokenEncrypted?`：AES-GCM 密文结构 `{ iv, authTag, ciphertext }`。
   - `accessExpiresAt?: Date`、`refreshExpiresAt?: Date`。
   - `updatedAt: Date`、`updatedBy: string`。
   - API 的任何 GET 响应只返回 `hasAppKey`、`hasRefreshToken`，绝不返回密文或明文。

3. `storage_foil_sync_sources`
   - `_id: string`：稳定 source ID。
   - `name: string`、`enabled: boolean`、`fileId: string`。
   - `worksheetIdStart: number`、`worksheetIdEnd: number`。
   - `rowFrom: number`、`rowTo: number`、`colFrom: number`、`colTo: number`。
   - `fieldConfig: WpsFieldConfig[]`：固定数量的字段映射，可安全嵌入。
   - `createdAt: Date`、`updatedAt: Date`、`updatedBy: string`。
   - 索引 `{ enabled: 1, name: 1 }`。

4. `storage_foil_sync_runs`
   - `_id: string`：`syncRunId`。
   - `status: 'queued' | 'running' | 'validated' | 'published' | 'failed'`。
   - `trigger: 'admin' | 'webhook'`、`triggeredBy: string`。
   - `idempotencyKey: string`、`configRevision: string`。
   - `startedAt: Date`、`finishedAt?: Date`。
   - `sourceResults: Array<{ sourceId, worksheetId, month, status, recordCount, errorCode? }>`；单次运行由工作表范围限制，数组有界。
   - `totals: { sources, worksheets, records, failures }`、`errorSummary?: string`。
   - 唯一稀疏索引 `{ idempotencyKey: 1 }`；索引 `{ status: 1, startedAt: -1 }`。

5. `storage_foil_inventory_batches`
   - `_id: string`：`${syncRunId}:${sourceId}:${recordKey}`。
   - `syncRunId: string`、`sourceId: string`、`sourceName: string`、`month: YYYY-MM`。
   - `recordKey: string`：由来源、工作表、业务字段和源行号稳定生成。
   - 保留现有 `InventoryBatch` 展示字段；`dailyActivities` 固定最多 31 项。
   - `worksheetId: number`、`worksheetName: string`、`sourceRow: number`、`syncedAt: Date`。
   - 唯一索引 `{ syncRunId: 1, sourceId: 1, recordKey: 1 }`。
   - 读取索引 `{ syncRunId: 1, month: 1, sourceId: 1 }`。

6. `storage_foil_inventory_publications`
   - `_id: string`：月份 `YYYY-MM`。
   - `month: string`、`syncRunId: string`、`publishedAt: Date`、`publishedBy: string`。
   - `sourceIds: string[]`：一次发布涉及的数据源 ID，数量等于已配置来源数且有界。
   - `_id` 唯一；索引 `{ publishedAt: -1 }`。

7. `storage_foil_sync_locks`
   - 固定 `_id: 'wps-full-sync'`。
   - `ownerRunId: string`、`expiresAt: Date`、`acquiredAt: Date`。
   - `expiresAt` TTL 索引；使用条件更新获取和续租，不依赖进程内锁。

### HTTP API

- `POST /api/login`：用户名密码登录；成功设置 HttpOnly Cookie。
- `POST /api/logout`：清除 Cookie。
- `GET /api/auth/me`：恢复会话。
- `GET /api/inventory/bootstrap`：登录后一次返回用户、月份列表、默认月份库存、来源摘要和最新发布时间。
- `GET /api/inventory?month=YYYY-MM&sourceId=all`：切换月份或来源时读取已发布版本。
- `GET /api/admin/sync-config`：管理员读取脱敏全局 WPS 状态和动态来源列表。
- `PUT /api/admin/sync-config`：管理员更新全局非密钥字段、可选新 App Key 和全部来源配置。
- `GET /api/admin/wps/authorization-url`：管理员取得使用预登记 redirect URI 构造的授权 URL。
- `GET /api/admin/wps/callback?code=...`：服务端交换 token 后重定向回管理页，不把 token 返回 URL。
- `POST /api/admin/sync/run`：管理员触发同步，返回 `202` 和 `syncRunId`。
- `GET /api/admin/sync/runs/:runId`：管理员读取运行状态。
- `POST /api/sync/webhook`：AirScript 触发；校验时间戳、HMAC 和幂等键，返回 `202`。

所有 API 使用统一 envelope：

```ts
type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = {
  success: false;
  error: { code: string; requestId: string };
  message: string;
};
```

---

### Task 1: Add backend dependencies, environment contract, and shared API types

**Files:**
- Modify: `package.json`
- Modify: `vercel.json`
- Modify: `.env.example`
- Create: `src/shared/apiTypes.ts`
- Create: `src/shared/authTypes.ts`
- Create: `src/shared/syncTypes.ts`
- Create: `src/shared/apiTypes.test.ts`

- [x] **Step 1: Write failing contract tests**

Test role rejection, API envelope parsing, `YYYY-MM` validation, worksheet range normalization, and secret-field omission from the public sync config.

- [x] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/shared/apiTypes.test.ts`

Expected: FAIL because the shared modules do not exist.

- [x] **Step 3: Add dependencies and scripts**

Add runtime dependencies `@vercel/functions` and `mongodb`. Add:

```json
"db:indexes": "tsx scripts/ensureStorageFoilIndexes.ts",
"users:seed": "tsx scripts/seedStorageFoilUsers.ts"
```

Keep the current Vite build and test commands.

- [x] **Step 4: Add types and pure validators**

Define `StorageFoilRole = 'viewer' | 'admin'`, `AuthUser`, API envelopes, public WPS config, source config, sync-run summary, inventory bootstrap response, month parser and worksheet-range normalizer. Make secret-bearing server types separate from public types.

- [x] **Step 5: Update Vercel function packaging**

Update `vercel.json` so `api/**/*.ts` includes `src/**/*.ts`, matching the proven Duo Cloud structure. Do not migrate to a different framework.

- [x] **Step 6: Document server-only environment names**

Add all variables in the Environment Variables table to `.env.example` with blank values. Remove any production WPS secret examples and mark `VITE_WPS_*` deprecated.

- [x] **Step 7: Run tests, typecheck, and build**

Run: `npm test -- src/shared/apiTypes.test.ts && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json vercel.json .env.example src/shared
git commit -m "chore: define cloud data contracts"
```

### Task 2: Reuse the Duo Cloud MongoDB connection pattern safely

**Files:**
- Create: `src/server/mongodb.ts`
- Create: `src/server/mongodb.test.ts`
- Create: `src/server/collections.ts`
- Create: `scripts/ensureStorageFoilIndexes.ts`
- Create: `src/server/schemaDefinitions.ts`
- Create: `docs/storage-foil-mongodb-schema.md`

- [x] **Step 1: Write failing Mongo configuration tests**

Cover URI priority, database-name fallback, cached client promise, reset after connection failure, collection prefix constants, and no secret values in thrown errors.

- [x] **Step 2: Run focused test**

Run: `npm test -- src/server/mongodb.test.ts`

Expected: FAIL because `mongodb.ts` does not exist.

- [x] **Step 3: Implement the connection helper**

Port the Duo Cloud pattern: keep `MongoClient` and its promise at module scope, call `attachDatabasePool`, use `serverSelectionTimeoutMS: 8000`, retry `MONGODB_DIRECT_URI` only when distinct, and reset the promise after failure.

Database name resolution:

```ts
process.env.STORAGE_FOIL_DB_NAME
  || process.env.KNOWLEDGE_DB_NAME
  || 'duocloudDB'
```

- [x] **Step 4: Define collection names and document interfaces**

Export typed getters for all seven `storage_foil_*` collections. Keep MongoDB `Date` fields as `Date` on server types and serialize them to ISO strings at the API boundary.

- [x] **Step 5: Add validators and indexes as an idempotent script**

The script must:

- create missing collections with `$jsonSchema`;
- use `collMod` for existing validators;
- create the indexes listed in Public Contracts;
- print database name, collection names, validator version and proposed actions;
- support `--dry-run`;
- require `--apply` for any write.

- [x] **Step 6: Document schema and rollback**

Document field definitions, index purpose, expected query shape, validation version and how to roll back a validator without deleting data.

- [x] **Step 7: Verify without touching a live database**

Run: `npm test -- src/server/mongodb.test.ts && npm run lint`

Expected: PASS. Do not run `npm run db:indexes -- --apply` yet.

- [x] **Step 8: Commit**

```bash
git add src/server/mongodb.ts src/server/mongodb.test.ts src/server/collections.ts src/server/schemaDefinitions.ts scripts/ensureStorageFoilIndexes.ts docs/storage-foil-mongodb-schema.md
git commit -m "feat: add StorageFoil MongoDB foundation"
```

### Task 3: Implement independent account authentication

**Files:**
- Create: `src/server/sessionAuth.ts`
- Create: `src/server/sessionAuth.test.ts`
- Create: `src/server/password.ts`
- Create: `src/server/password.test.ts`
- Create: `src/server/loginApi.ts`
- Create: `src/server/authMeApi.ts`
- Create: `src/server/logoutApi.ts`
- Create: `src/server/authApi.test.ts`
- Create: `api/login.ts`
- Create: `api/logout.ts`
- Create: `api/auth/me.ts`

- [x] **Step 1: Write failing session and password tests**

Cover:

- signed token success, tampering, expiry and malformed JSON;
- cookie name exactly `storage_foil_session`;
- `HttpOnly`, `SameSite=Lax`, `Path=/`, production `Secure`, eight-hour maximum age;
- scrypt password hash and constant-time verification;
- disabled account rejection;
- viewer/admin role parsing;
- login error is identical for unknown user and wrong password;
- method restrictions for all handlers.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/sessionAuth.test.ts src/server/password.test.ts src/server/authApi.test.ts`

Expected: FAIL because auth modules do not exist.

- [x] **Step 3: Implement password storage**

Use Node `crypto.scrypt` with a random 16-byte salt and an explicit `scrypt-v1` algorithm marker. Do not copy Duo Cloud's legacy single SHA-256 password hashing. Provide a pure verifier and never log passwords or hashes.

- [x] **Step 4: Implement signed sessions**

Adapt Duo Cloud’s HMAC token structure, but read `STORAGE_FOIL_SESSION_SECRET` and use the independent Cookie. Add `requireSession` and `requireRole(req, ['admin'])`.

- [x] **Step 5: Implement thin auth handlers and routes**

`POST /api/login` reads `storage_foil_users`, checks `enabled`, verifies password, sets the session, and updates `lastLoginAt` without delaying a successful response if that audit update fails. `GET /api/auth/me` returns the session user. `POST /api/logout` expires the Cookie.

- [x] **Step 6: Add mutation-request origin protection**

Create a shared `requireSameOrigin` helper for Cookie-authenticated `POST`/`PUT` admin routes. Accept the configured deployment origin and local development origin; reject missing/mismatched production `Origin`.

- [x] **Step 7: Run focused and full tests**

Run: `npm test -- src/server/sessionAuth.test.ts src/server/password.test.ts src/server/authApi.test.ts && npm test && npm run lint`

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add src/server/sessionAuth.ts src/server/sessionAuth.test.ts src/server/password.ts src/server/password.test.ts src/server/loginApi.ts src/server/authMeApi.ts src/server/logoutApi.ts src/server/authApi.test.ts api/login.ts api/logout.ts api/auth
git commit -m "feat: add StorageFoil account authentication"
```

### Task 4: Seed exactly 10 viewer accounts and 1 admin account

**Files:**
- Create: `scripts/seedStorageFoilUsers.ts`
- Create: `scripts/seedStorageFoilUsers.test.ts`
- Create: `docs/storage-foil-account-runbook.md`

- [x] **Step 1: Write failing provisioning tests**

The pure manifest parser must reject duplicate usernames, unsupported roles, missing password environment variables, fewer/more than 10 viewers, and fewer/more than 1 admin. It must never include plaintext passwords in output.

- [x] **Step 2: Run focused test**

Run: `npm test -- scripts/seedStorageFoilUsers.test.ts`

Expected: FAIL because the script does not exist.

- [x] **Step 3: Implement idempotent provisioning**

Accept a JSON manifest containing 11 username/display-name/role entries. Read each password from a named environment variable, generate scrypt hashes, and `updateOne(..., { upsert: true })`. Require:

- `--dry-run` by default;
- `--apply` to write;
- `--confirm-db <resolved-db-name>`;
- exactly 10 enabled viewers and 1 enabled admin.

Do not delete unrelated accounts automatically.

- [x] **Step 4: Write the account runbook**

Document initial creation, password rotation, disable/enable, admin replacement, audit checks and emergency session-secret rotation. Use placeholders only for operator-supplied usernames/password environment variable names, not for unresolved engineering decisions.

- [x] **Step 5: Verify without writing**

Run: `npm test -- scripts/seedStorageFoilUsers.test.ts && npm run lint`

Expected: PASS. Do not run `--apply` until the user approves the final account manifest and target database.

- [x] **Step 6: Commit**

```bash
git add scripts/seedStorageFoilUsers.ts scripts/seedStorageFoilUsers.test.ts docs/storage-foil-account-runbook.md
git commit -m "feat: add controlled account provisioning"
```

### Task 5: Add login gate and load MongoDB data after login

**Files:**
- Create: `src/lib/authApi.ts`
- Create: `src/lib/authApi.test.ts`
- Create: `src/hooks/useAuthSession.ts`
- Create: `src/hooks/useAuthSession.test.ts`
- Create: `src/components/StorageFoilLogin.tsx`
- Create: `src/components/AuthLoadingScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

- [x] **Step 1: Write failing client-auth tests**

Cover login payload parsing, non-JSON local Vite error, session restore, logout failure, auth state transitions and one bootstrap request after successful session restoration.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/lib/authApi.test.ts src/hooks/useAuthSession.test.ts`

Expected: FAIL because client auth modules do not exist.

- [x] **Step 3: Port and adapt the Duo Cloud login UI**

Reuse `/Users/kyle/Codex project/Duo Cloud/src/components/DuoCloudLogin.tsx` layout. Rename component and all visible copy for StorageFoil. Preserve keyboard form submission, autocomplete attributes, pending state and accessible error display.

- [x] **Step 4: Add the authentication state machine**

States: `checking`, `anonymous`, `authenticated`, `error`. On mount call `/api/auth/me`; show the login page when anonymous. After login, set the user and allow the data bootstrap hook to run. On logout, clear in-memory inventory and return to login.

- [x] **Step 5: Gate the existing application**

`App.tsx` must not mount the inventory dashboard or call any data API before authentication succeeds. Pass `user.role` into navigation so the admin entry is absent for viewers.

- [x] **Step 6: Verify**

Run: `npm test -- src/lib/authApi.test.ts src/hooks/useAuthSession.test.ts && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/lib/authApi.ts src/lib/authApi.test.ts src/hooks/useAuthSession.ts src/hooks/useAuthSession.test.ts src/components/StorageFoilLogin.tsx src/components/AuthLoadingScreen.tsx src/App.tsx src/index.css
git commit -m "feat: gate StorageFoil behind account login"
```

### Task 6: Build publication-safe inventory read APIs

**Files:**
- Create: `src/server/inventoryRepository.ts`
- Create: `src/server/inventoryRepository.test.ts`
- Create: `src/server/inventoryReadApi.ts`
- Create: `src/server/inventoryReadApi.test.ts`
- Create: `api/inventory/bootstrap.ts`
- Create: `api/inventory/index.ts`
- Create: `src/lib/inventoryApi.ts`
- Create: `src/lib/inventoryApi.test.ts`

- [x] **Step 1: Write failing repository and API tests**

Cover:

- unauthenticated `401`;
- invalid month `400`;
- bootstrap chooses latest published month;
- a publication pointer is read before batch documents;
- only batches matching the pointer’s `syncRunId` are returned;
- source filtering;
- empty database returns an empty, valid bootstrap response;
- disabled/unpublished runs never appear;
- Mongo `Date` values serialize to ISO strings.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/inventoryRepository.test.ts src/server/inventoryReadApi.test.ts src/lib/inventoryApi.test.ts`

Expected: FAIL because repository and API modules do not exist.

- [x] **Step 3: Implement repository queries**

Bootstrap query flow:

1. list publication pointers sorted by month descending;
2. choose requested saved month when published, otherwise latest;
3. query batches by `{ syncRunId, month }`;
4. join public source names from sync-source documents;
5. return only display-safe fields.

- [x] **Step 4: Implement protected endpoints**

Both viewer and admin may read. Add `Cache-Control: private, no-store` because responses are account-scoped and operationally current.

- [x] **Step 5: Implement the browser API client**

Add runtime response validation and friendly errors for unauthenticated, invalid response, and network failure.

- [x] **Step 6: Verify**

Run: `npm test -- src/server/inventoryRepository.test.ts src/server/inventoryReadApi.test.ts src/lib/inventoryApi.test.ts && npm run lint`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/server/inventoryRepository.ts src/server/inventoryRepository.test.ts src/server/inventoryReadApi.ts src/server/inventoryReadApi.test.ts api/inventory src/lib/inventoryApi.ts src/lib/inventoryApi.test.ts
git commit -m "feat: serve published inventory from MongoDB"
```

### Task 7: Replace browser inventory persistence with authenticated reads

**Files:**
- Create: `src/hooks/useInventoryData.ts`
- Create: `src/hooks/useInventoryData.test.ts`
- Create: `src/components/DataFreshnessBadge.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AddBatchModal.tsx`
- Modify: `src/components/TransactionModal.tsx`
- Modify: `src/components/PreviousMonthBalanceView.tsx`
- Modify: `src/components/InventoryTable.tsx`

- [x] **Step 1: Write failing state tests**

Cover:

- one bootstrap fetch per login/session generation;
- month switch fetches `/api/inventory` and does not read business localStorage;
- stale request cannot overwrite a newer month selection;
- logout clears batches, months and source list;
- failed month load leaves the last successful data visible with an error;
- role does not change read results.

- [x] **Step 2: Run focused test**

Run: `npm test -- src/hooks/useInventoryData.test.ts`

Expected: FAIL because the hook does not exist.

- [x] **Step 3: Implement the inventory data hook**

Use an `AbortController` or monotonically increasing request ID to suppress stale responses. Keep current month in UI-preference localStorage only; validate it against server-returned months.

- [x] **Step 4: Remove business localStorage reads/writes**

Delete the `pl_inventory_batches_*`, `pl_inventory_transactions_*`, `pl_inventory_months`, seed migration and reset logic from `App.tsx`. Do not delete users’ old localStorage automatically; simply stop treating it as authoritative.

- [x] **Step 5: Make the production dashboard read-only**

Remove or hide:

- add-batch entry;
- manual inflow/outflow submission;
- create-month flow;
- reset-to-seed;
- JSON import that writes inventory.

Retain export/download as a read-only operation using the currently loaded server data.

- [x] **Step 6: Show freshness and errors**

Display last published time, current `syncRunId` short form, loading state, and a retry button. A retry reads MongoDB only; it never triggers WPS sync.

- [x] **Step 7: Verify no business storage dependency remains**

Run:

```bash
rg -n "pl_inventory_|storage_foil_wps_cached_token|storage_foil_wps_config|storage_foil_wps_field_mapping" src
npm test
npm run lint
npm run build
```

Expected: `rg` has no production-code matches; tests, lint and build pass.

- [x] **Step 8: Commit**

```bash
git add src/hooks/useInventoryData.ts src/hooks/useInventoryData.test.ts src/components/DataFreshnessBadge.tsx src/App.tsx src/components/AddBatchModal.tsx src/components/TransactionModal.tsx src/components/PreviousMonthBalanceView.tsx src/components/InventoryTable.tsx
git commit -m "refactor: read inventory from MongoDB after login"
```

### Task 8: Move dynamic data-source configuration into the admin backend

**Files:**
- Create: `src/server/secretCrypto.ts`
- Create: `src/server/secretCrypto.test.ts`
- Create: `src/server/syncConfigRepository.ts`
- Create: `src/server/syncConfigRepository.test.ts`
- Create: `src/server/syncConfigApi.ts`
- Create: `src/server/syncConfigApi.test.ts`
- Create: `api/admin/sync-config.ts`
- Create: `src/lib/adminSyncApi.ts`
- Create: `src/lib/adminSyncApi.test.ts`
- Modify: `src/components/WpsSettingsModal.tsx`
- Delete: `src/components/wpsConfig.ts`
- Modify: `src/components/wpsConfig.test.ts`

- [x] **Step 1: Write failing encryption and admin API tests**

Cover AES-GCM roundtrip, wrong-key failure, unique IVs, malformed ciphertext, admin-only access, viewer `403`, unlimited dynamic source array, unique source IDs, required file IDs, range normalization and secret redaction.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/secretCrypto.test.ts src/server/syncConfigRepository.test.ts src/server/syncConfigApi.test.ts src/lib/adminSyncApi.test.ts`

Expected: FAIL because the modules do not exist.

- [x] **Step 3: Implement server-side credential storage**

Encrypt App Key and WPS tokens with AES-256-GCM. Validate the decoded encryption key is exactly 32 bytes. Updating non-secret config must preserve existing secrets; an explicit `clearCredential` action is required to delete one.

- [x] **Step 4: Implement source configuration**

Store global App ID/App Key once. Store any number of source documents independently. Use a transaction when supported; otherwise validate all proposed documents first, upsert them, and disable removed sources instead of deleting them.

- [x] **Step 5: Implement admin API and client**

Return:

```ts
{
  credentials: {
    apiBase, appId, redirectUri, hasAppKey, hasRefreshToken
  },
  sources: WpsDataSource[],
  revision: string
}
```

Require the client to send `revision` on update; reject stale updates with `409 CONFIG_CONFLICT`.

- [x] **Step 6: Adapt the settings modal**

Only admins can open it. Preserve add/remove/reorder/enable controls, File ID, dynamic worksheet range and field mapping. Remove localStorage save and any field that displays cached tokens or raw App Key after save.

- [x] **Step 7: Remove obsolete client config**

Delete `wpsConfig.ts`; replace its tests with server/public contract tests. Ensure there are no client imports of WPS secrets.

- [x] **Step 8: Verify**

Run:

```bash
npm test
rg -n "VITE_WPS_APP_KEY|localStorage.*wps|appKey.*localStorage" src
npm run lint
npm run build
```

Expected: no production matches for client-side secret persistence; all checks pass.

- [x] **Step 9: Commit**

```bash
git add src/server/secretCrypto.ts src/server/secretCrypto.test.ts src/server/syncConfigRepository.ts src/server/syncConfigRepository.test.ts src/server/syncConfigApi.ts src/server/syncConfigApi.test.ts api/admin/sync-config.ts src/lib/adminSyncApi.ts src/lib/adminSyncApi.test.ts src/components/WpsSettingsModal.tsx src/components/wpsConfig.test.ts
git rm src/components/wpsConfig.ts
git commit -m "feat: manage WPS sources in admin backend"
```

### Task 9: Port WPS reading and token management to the server

**Files:**
- Create: `src/server/wpsClient.ts`
- Create: `src/server/wpsClient.test.ts`
- Create: `src/server/wpsInventoryParser.ts`
- Create: `src/server/wpsInventoryParser.test.ts`
- Create: `src/server/wpsTokenService.ts`
- Create: `src/server/wpsTokenService.test.ts`
- Create: `src/server/wpsOAuthApi.ts`
- Create: `src/server/wpsOAuthApi.test.ts`
- Create: `api/admin/wps/authorization-url.ts`
- Create: `api/admin/wps/callback.ts`
- Modify: `src/services/wps.ts`
- Modify: `src/services/wps.test.ts`
- Delete: `api/wps-proxy.ts`

- [x] **Step 1: Write failing server WPS tests**

Port all pure parser and worksheet-selection cases from `src/services/wps.test.ts`, then add:

- global credentials shared by every source;
- different File IDs per source;
- dynamic worksheet range and month-name precedence;
- hidden, empty and template sheet exclusion;
- token refresh before expiry;
- encrypted token persistence after refresh;
- invalid refresh token produces a reauthorization-required status;
- WPS error body is sanitized before logging/API response;
- registered redirect URI is used exactly.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/wpsClient.test.ts src/server/wpsInventoryParser.test.ts src/server/wpsTokenService.test.ts src/server/wpsOAuthApi.test.ts`

Expected: FAIL because server WPS modules do not exist.

- [x] **Step 3: Move pure parsing code**

Move `selectInventoryWorksheets`, header detection, date conversion, row parsing, stable record-key generation and source tagging to server-safe modules with no `window`, `localStorage` or `import.meta.env`.

- [x] **Step 4: Implement direct server WPS calls**

The Vercel function calls WPS directly; no open proxy endpoint remains. Restrict methods and construct URLs from known path segments. Use request timeouts and bounded retries only for network failure, `429` and `5xx`; never retry OAuth `4xx`.

- [x] **Step 5: Implement token service and OAuth admin flow**

Serialize refresh for the single global credential document to avoid racing refresh-token rotation. Authorization URL and callback are admin-only. Callback exchanges code server-side, encrypts tokens, and redirects to `/?admin=wps&authorized=1`.

- [x] **Step 6: Delete client token/proxy code**

Remove `api/wps-proxy.ts`, client token cache and browser WPS fetches. Retain only shared display types where needed.

- [x] **Step 7: Verify**

Run:

```bash
npm test
rg -n "storage_foil_wps_cached_token|/api/wps-proxy|client_secret" src api
npm run lint
npm run build
```

Expected: only server-side OAuth request construction may contain `client_secret`; all checks pass.

- [x] **Step 8: Commit**

```bash
git add src/server/wpsClient.ts src/server/wpsClient.test.ts src/server/wpsInventoryParser.ts src/server/wpsInventoryParser.test.ts src/server/wpsTokenService.ts src/server/wpsTokenService.test.ts src/server/wpsOAuthApi.ts src/server/wpsOAuthApi.test.ts api/admin/wps src/services/wps.ts src/services/wps.test.ts
git rm api/wps-proxy.ts
git commit -m "refactor: run WPS integration on the server"
```

### Task 10: Implement atomic synchronization and publication

**Files:**
- Create: `src/server/syncLockRepository.ts`
- Create: `src/server/syncLockRepository.test.ts`
- Create: `src/server/syncRunRepository.ts`
- Create: `src/server/syncRunRepository.test.ts`
- Create: `src/server/inventoryPublisher.ts`
- Create: `src/server/inventoryPublisher.test.ts`
- Create: `src/server/syncOrchestrator.ts`
- Create: `src/server/syncOrchestrator.test.ts`
- Create: `src/server/adminSyncApi.ts`
- Create: `src/server/adminSyncApi.test.ts`
- Create: `api/admin/sync/run.ts`
- Create: `api/admin/sync/runs/[runId].ts`
- Modify: `src/hooks/useWpsInventorySync.ts`

- [x] **Step 1: Write failing synchronization tests**

Cover:

- lock acquisition, conflict, expiry and owner-only release;
- idempotency-key replay returns the existing run;
- enabled sources are loaded dynamically;
- all worksheet IDs in each configured range are considered;
- records are written with a new `syncRunId`;
- no publication update occurs after any fatal validation/write failure;
- partial source failure policy is “do not publish that month”;
- successful months publish by atomic pointer update;
- previous run data remains readable until pointer switch;
- run status and per-source counts are finalized;
- admin endpoint requires admin role and same origin.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/syncLockRepository.test.ts src/server/syncRunRepository.test.ts src/server/inventoryPublisher.test.ts src/server/syncOrchestrator.test.ts src/server/adminSyncApi.test.ts`

Expected: FAIL because synchronization modules do not exist.

- [x] **Step 3: Implement database lock and run ledger**

Acquire the lock with one conditional `findOneAndUpdate`. Use a lease long enough for a normal run and renew after each source. Mark abandoned runs failed when taking over an expired lock.

- [x] **Step 4: Implement staging writes**

For each worksheet:

1. fetch and parse;
2. validate month and required mapped fields;
3. `bulkWrite` batches tagged with `syncRunId`;
4. record counts and bounded error codes;
5. reject publication for a month if any enabled source expected for that month failed.

- [x] **Step 5: Implement publication pointer switch**

After all candidate month data is written and validated, update each month’s publication pointer. Use a MongoDB transaction when deployment supports it; otherwise update independent month pointers only after each complete month passes. Never delete the previous run during this request.

- [x] **Step 6: Implement admin trigger and status handlers**

`POST /api/admin/sync/run` creates or reuses a run and invokes the orchestrator. If execution may exceed the request lifecycle, use Vercel `waitUntil` so the response can return `202` while work completes in the same function lifecycle. `GET` returns progress and sanitized errors.

- [x] **Step 7: Remove browser auto-sync**

Delete the scheduling, OAuth code handling and WPS actions from `useWpsInventorySync.ts`; replace remaining admin interactions with admin API calls, then remove the hook if no references remain.

- [x] **Step 8: Add stale-run cleanup**

Add a tested function that removes unreferenced batch versions older than a conservative retention window while preserving every `syncRunId` referenced by a publication pointer. Do not schedule deletion until production has at least two verified successful versions.

- [x] **Step 9: Verify**

Run: `npm test && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 10: Commit**

```bash
git add src/server/syncLockRepository.ts src/server/syncLockRepository.test.ts src/server/syncRunRepository.ts src/server/syncRunRepository.test.ts src/server/inventoryPublisher.ts src/server/inventoryPublisher.test.ts src/server/syncOrchestrator.ts src/server/syncOrchestrator.test.ts src/server/adminSyncApi.ts src/server/adminSyncApi.test.ts api/admin/sync src/hooks/useWpsInventorySync.ts
git commit -m "feat: add atomic WPS inventory publishing"
```

### Task 11: Add the authenticated AirScript webhook

**Files:**
- Create: `src/server/webhookAuth.ts`
- Create: `src/server/webhookAuth.test.ts`
- Create: `src/server/webhookSyncApi.ts`
- Create: `src/server/webhookSyncApi.test.ts`
- Create: `api/sync/webhook.ts`
- Create: `docs/airscript-webhook-example.js`
- Create: `docs/storage-foil-sync-runbook.md`

- [x] **Step 1: Write failing webhook tests**

Cover missing headers, invalid HMAC, signatures with different body bytes, timestamps older than five minutes, future timestamps, duplicate idempotency keys, valid request, lock conflict, and sanitized response.

Required headers:

```text
X-StorageFoil-Timestamp: Unix milliseconds
X-StorageFoil-Idempotency-Key: caller-generated unique ID
X-StorageFoil-Signature: v1=<hex HMAC-SHA256>
```

Signature input is `${timestamp}.${idempotencyKey}.${rawBody}`.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/server/webhookAuth.test.ts src/server/webhookSyncApi.test.ts`

Expected: FAIL because webhook modules do not exist.

- [x] **Step 3: Implement raw-body HMAC verification**

Read the exact raw request body once, calculate HMAC with `STORAGE_FOIL_WEBHOOK_SECRET`, compare using `timingSafeEqual`, then parse JSON. Do not accept the browser session Cookie as webhook authorization.

- [x] **Step 4: Route to the shared orchestrator**

The webhook may request `{ mode: 'full' }` only in phase 1. It creates/reuses a `syncRunId`, uses trigger `webhook`, and returns `202`. It must not duplicate WPS or MongoDB orchestration logic.

- [x] **Step 5: Add a safe AirScript example**

Provide an example that:

- builds the exact raw JSON string before signing;
- creates timestamp and idempotency key;
- signs with an AirScript-protected secret;
- sends one POST to the production URL;
- logs only status, request ID and run ID, never the shared secret.

- [x] **Step 6: Write operations runbook**

Document manual trigger, AirScript setup, signature rotation, run-status inspection, retry semantics, failed-run diagnosis, and how to confirm the publication pointer stayed on the last good run.

- [x] **Step 7: Verify**

Run: `npm test -- src/server/webhookAuth.test.ts src/server/webhookSyncApi.test.ts && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add src/server/webhookAuth.ts src/server/webhookAuth.test.ts src/server/webhookSyncApi.ts src/server/webhookSyncApi.test.ts api/sync/webhook.ts docs/airscript-webhook-example.js docs/storage-foil-sync-runbook.md
git commit -m "feat: add authenticated AirScript sync webhook"
```

### Task 12: Build the one-admin synchronization console

**Files:**
- Create: `src/components/AdminSyncConsole.tsx`
- Create: `src/components/AdminSyncConsole.test.tsx`
- Create: `src/hooks/useAdminSync.ts`
- Create: `src/hooks/useAdminSync.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/WpsSettingsModal.tsx`

- [x] **Step 1: Write failing admin console tests**

Cover viewer cannot render/open console, admin can load config, add arbitrary sources, edit File ID and worksheet range, save conflict handling, authorize WPS, trigger sync once, prevent double-submit, poll run status, and refresh the current MongoDB view only after publication succeeds.

- [x] **Step 2: Run focused tests**

Run: `npm test -- src/components/AdminSyncConsole.test.tsx src/hooks/useAdminSync.test.ts`

Expected: FAIL because the console and hook do not exist.

- [x] **Step 3: Implement the console**

Sections:

1. global WPS credential status;
2. dynamic source cards;
3. worksheet discovery/range preview;
4. “立即同步” action;
5. current and recent run status;
6. last published time per month.

Do not display secrets, token JSON or raw WPS response dumps.

- [x] **Step 4: Connect successful publication to a read refresh**

After an admin-triggered run reaches `published`, call the inventory read API for the current month. Ordinary viewer sessions do not poll; they receive current published data on their next login or explicit “刷新数据” read action.

- [x] **Step 5: Verify keyboard, loading and error states**

Check disabled buttons, visible labels, focus behavior, retry actions, Chinese error copy and responsive layout.

- [x] **Step 6: Verify**

Run: `npm test && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add src/components/AdminSyncConsole.tsx src/components/AdminSyncConsole.test.tsx src/hooks/useAdminSync.ts src/hooks/useAdminSync.test.ts src/App.tsx src/components/WpsSettingsModal.tsx
git commit -m "feat: add administrator sync console"
```

### Task 13: Migrate the five current XLSX/WPS sources and cut over safely

**Files:**
- Create: `scripts/buildInitialSourceManifest.ts`
- Create: `scripts/buildInitialSourceManifest.test.ts`
- Create: `scripts/verifyPublishedInventory.ts`
- Create: `scripts/verifyPublishedInventory.test.ts`
- Create: `docs/storage-foil-cutover-checklist.md`
- Modify: `README.md`

- [x] **Step 1: Write failing manifest and verification tests**

Cover the five initial logical sources:

- PL：`PL2026年出入库明细-20260707.xlsx`
- PC粉箔：`PC粉箔2026年出入库表.xlsx`
- PY：`PY2026年6月入库表-20260708(1).xlsx`
- PK：`PK2026入库明细-20260701.xlsx`
- PC：`PC2026年出入表-20260703(3)(3).xlsx`

The manifest must not invent File IDs; it must require operator-supplied File IDs. Every source defaults to worksheet range `1..12` and may override mappings based on the already-tested workbook structures.

- [x] **Step 2: Run focused tests**

Run: `npm test -- scripts/buildInitialSourceManifest.test.ts scripts/verifyPublishedInventory.test.ts`

Expected: FAIL because the scripts do not exist.

- [x] **Step 3: Implement source-manifest generation**

Generate a validated JSON document for the admin API. Accept an arbitrary number of later sources. Never include App Key, OAuth code or token.

- [x] **Step 4: Implement read-only publication verification**

Given a run ID, report per source/month:

- parsed record count;
- inflow/outflow/stock totals;
- missing required fields;
- duplicate record keys;
- publication pointer match.

Default mode is read-only and exits nonzero on mismatches.

- [x] **Step 5: Write the cutover checklist**

Required order:

1. user approves target MongoDB database and prefixed collections;
2. apply validators/indexes;
3. user approves 11-account manifest; seed users;
4. configure Vercel Preview environment;
5. admin enters global WPS credentials and five File IDs;
6. run first sync in Preview;
7. compare all five source/month counts and totals with current XLSX baselines;
8. test viewer, admin, logout and forbidden routes;
9. configure Production environment and exact WPS redirect URI;
10. run production sync and verify publication;
11. deploy frontend cutover;
12. retain prior production deployment for immediate rollback.

- [x] **Step 6: Update README**

Document architecture, local development with Vercel API routes, environment setup, authentication, sync triggers, data ownership and standard commands. Explicitly state that plain `npm run dev` serves only Vite frontend unless local API routing is provided.

- [x] **Step 7: Verify**

Run: `npm test && npm run lint && npm run build`

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add scripts/buildInitialSourceManifest.ts scripts/buildInitialSourceManifest.test.ts scripts/verifyPublishedInventory.ts scripts/verifyPublishedInventory.test.ts docs/storage-foil-cutover-checklist.md README.md
git commit -m "docs: add MongoDB cutover workflow"
```

### Task 14: Deployment, security verification, and rollback rehearsal

**Files:**
- Create: `docs/storage-foil-security-checklist.md`
- Create: `docs/storage-foil-vercel-deployment.md`
- Modify: `.github/workflows/ci.yml` if present; otherwise create it

- [x] **Step 1: Add CI**

On pull requests and pushes to `develop`, run:

```bash
npm ci
npm test
npm run lint
npm run build
```

No CI job may connect to production MongoDB or WPS.

- [ ] **Step 2: Configure Vercel Preview variables**

Use Vercel project environment management for server-only variables. Reuse the Duo Cloud MongoDB values without printing them. Generate independent StorageFoil session, encryption and webhook secrets. Set the exact Preview WPS redirect URI registered in the WPS console.

- [ ] **Step 3: Apply database setup only after approval**

First run:

```bash
npm run db:indexes -- --dry-run
```

Show resolved database and actions to the user. After explicit approval:

```bash
npm run db:indexes -- --apply --confirm-db <resolved-db-name>
```

- [ ] **Step 4: Seed accounts only after approval**

Validate the final manifest has 10 viewers and 1 admin, run dry-run, request approval, then run `users:seed -- --apply --confirm-db ...`. Deliver credentials through a channel chosen by the user; never include plaintext passwords in Git, logs or this repository.

- [ ] **Step 5: Execute Preview smoke tests**

Test:

- unauthenticated redirect/login gate;
- all 10 viewers can read and cannot access admin APIs;
- the admin can read/update sync config;
- WPS OAuth callback uses the exact registered URI;
- manual sync and signed webhook both create runs;
- duplicate webhook does not create another run;
- a forced failed source leaves the old publication visible;
- successful run changes the publication pointer and viewer data after re-login;
- browser storage contains no WPS secret or inventory dataset.

- [x] **Step 6: Add observability without sensitive data**

Every request/run log contains `requestId`, `syncRunId`, source ID, worksheet ID, status, duration and counts. Logs must omit usernames where unnecessary, passwords, session tokens, Mongo URI, WPS App Key, OAuth code, access/refresh tokens and cell contents.

- [ ] **Step 7: Rehearse rollback**

Before production cutover:

- identify the last known-good Vercel deployment;
- verify redeploy/rollback permissions;
- confirm old publication data remains in MongoDB;
- simulate reverting the frontend deployment without modifying MongoDB;
- record the rollback command/process in the deployment document.

- [ ] **Step 8: Production rollout**

Deploy `develop` to Preview, complete verification, merge through the repository’s normal PR process, then deploy Production. Do not point WPS/AirScript at Production until the production auth and read path pass smoke tests.

- [x] **Step 9: Final verification**

Run locally:

```bash
git status --short --branch
npm ci
npm test
npm run lint
npm run build
rg -n "MONGODB_URI=.+|APP_KEY=.+|SESSION_SECRET=.+|WEBHOOK_SECRET=.+" . --glob '!node_modules/**' --glob '!.git/**'
```

Expected: clean intended branch, all checks pass, and secret scan has no populated secrets.

- [x] **Step 10: Commit deployment documentation**

```bash
git add .github/workflows/ci.yml docs/storage-foil-security-checklist.md docs/storage-foil-vercel-deployment.md
git commit -m "ci: verify cloud architecture rollout"
```

---

## Acceptance Criteria

- [ ] 未登录用户无法看到任何库存数据。
- [ ] 10 个 `viewer` 账号均只能读取，无法访问配置、同步或其他写 API。
- [ ] 唯一 `admin` 账号可以维护任意数量的数据源并触发同步。
- [ ] App ID / App Key 全局只有一份，所有来源各自拥有 File ID 和动态工作表 ID 范围。
- [ ] 浏览器中不存在 WPS App Key、OAuth token、MongoDB 凭据或库存业务数据 localStorage。
- [ ] 登录成功后前端从 MongoDB 读取已发布库存；切换月份只读取 MongoDB，不触发 WPS。
- [ ] AirScript webhook 和管理员手工同步共用同一个编排器。
- [ ] 重复 webhook 幂等；并发同步被数据库锁拒绝或复用。
- [ ] 任一月份同步不完整时，该月份继续显示上一次完整发布版本。
- [ ] 五个现有来源的记录数、月份、库存、入库和出库合计与基线表一致。
- [ ] WPS OAuth redirect URI 与 WPS 控制台预登记值逐字符一致。
- [ ] Preview 和 Production 环境使用独立 session/webhook/encryption secret。
- [ ] 全量测试、类型检查、生产构建、权限矩阵、安全检查和回滚演练全部通过。

## Plan Self-Review

- Coverage: 包含鉴权、11 个账号、MongoDB schema、只读前端、动态来源、服务端 WPS OAuth、AirScript webhook、Vercel Functions、原子发布、迁移、部署和回滚。
- Placeholders: 未虚构 MongoDB URI、账号密码、File ID、WPS 密钥或回调地址；这些必须由操作者在实施阶段提供或从现有受保护环境复用。
- Type consistency: `viewer | admin` 在会话、数据库和前端保持一致；MongoDB 日期只在 API 边界转换为 ISO 字符串；所有库存读取都以 `syncRunId` 发布指针为准。
- Data safety: 没有无界嵌入数组；同步版本不可见写入后再发布；数据库变更和账号创建均有 dry-run、数据库名确认和用户审批门。
- Scope: 本阶段不提供浏览器手工修改库存，不引入实时轮询或消息队列，不改造 Duo Cloud 自身数据库结构。
