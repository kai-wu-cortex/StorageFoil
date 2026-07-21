# StorageFoil 库存云平台

StorageFoil 是品特烫金膜库存查询系统。当前架构已经切换为：

- 前端登录后只读取本站 `/api/*`。
- 用户、会话、WPS 配置、同步运行记录、库存批次和发布指针存储在 MongoDB。
- WPS App Key、OAuth token、MongoDB URI、session secret、webhook secret 都是服务端变量，不使用 `VITE_` 前缀。
- 浏览器 localStorage 只保存界面偏好，不保存 WPS 密钥、token、数据源配置或库存业务数据。

## Local development

```bash
npm install
npm run dev
```

`npm run dev` 只启动 Vite 前端。需要本地 API 路由时，请使用 Vercel 本地开发环境或等价的 API 代理方式运行 `/api/*`。

## Commands

```bash
npm test
npm run lint
npm run build
npm run db:indexes -- --dry-run
npm run users:seed -- --dry-run
```

数据库建索引、创建账号、写同步配置或首次同步前，必须先确认目标数据库名和集合前缀，并取得明确授权。

## Environment

服务端变量见 `.env.example`，核心包括：

- `MONGODB_URI` / `MONGODB_DIRECT_URI`
- `STORAGE_FOIL_DB_NAME`
- `STORAGE_FOIL_SESSION_SECRET`
- `STORAGE_FOIL_CONFIG_ENCRYPTION_KEY`
- `STORAGE_FOIL_WEBHOOK_SECRET`
- `STORAGE_FOIL_WPS_API_BASE`
- `STORAGE_FOIL_WPS_REDIRECT_URI`

## Authentication

系统使用独立的 `storage_foil_session` HttpOnly Cookie。角色只有：

- `viewer`：读取已发布库存。
- `admin`：维护同步配置、授权 WPS、触发同步、查看 run 状态。

## Synchronization

管理员后台维护全局 WPS App ID/App Key 和任意数量的数据源。每个数据源独立保存 File ID、工作表 ID 范围和字段映射。

同步流程：

1. 创建或复用带 idempotency key 的 sync run。
2. 获取数据库锁，避免并发全量同步。
3. 服务端刷新/读取 WPS token。
4. 按来源动态发现工作表，优先使用工作表名称中的月份。
5. 写入新的 `syncRunId` 批次版本。
6. 校验成功后更新月份发布指针。
7. 失败时保留上一次发布版本。

AirScript 使用 `POST /api/sync/webhook`，通过 HMAC 头鉴权。示例见 `docs/airscript-webhook-example.js`。

## Initial source manifest

`scripts/buildInitialSourceManifest.ts` 生成五个初始来源的管理员配置 payload，但不会发明 File ID，也不会包含 App Key、OAuth code 或 token。File ID 必须由操作者提供。

## Cutover

上线步骤见 `docs/storage-foil-cutover-checklist.md`。发布校验辅助逻辑在 `scripts/verifyPublishedInventory.ts`，默认只读。
