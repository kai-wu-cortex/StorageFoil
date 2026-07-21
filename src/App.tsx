import { useEffect, useMemo } from 'react';
import type React from 'react';
import type { InventoryBatch, TransactionHistory } from './types';
import StatsDashboard from './components/StatsDashboard';
import InventoryTable from './components/InventoryTable';
import ShelfVisualizer from './components/ShelfVisualizer';
import InventoryQueryConsole from './components/InventoryQueryConsole';
import PreviousMonthBalanceView from './components/PreviousMonthBalanceView';
import InventoryCards from './components/InventoryCards';
import TimeScaleView from './components/TimeScaleView';
import AuthLoadingScreen from './components/AuthLoadingScreen';
import StorageFoilLogin from './components/StorageFoilLogin';
import DataFreshnessBadge from './components/DataFreshnessBadge';
import AdminSyncConsole from './components/AdminSyncConsole';
import { useAuthSession } from './hooks/useAuthSession';
import { useInventoryData } from './hooks/useInventoryData';
import { useLocalStorageState } from './hooks/useLocalStorageState';
import type { AuthUser } from './shared/authTypes';
import { motion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Database,
  Download,
  FileSpreadsheet,
  Grid,
  History,
  Layers,
  Loader2,
  LogOut,
  Search,
  UserRound,
} from 'lucide-react';

type ActiveTab = 'query' | 'table' | 'visual' | 'previous_month' | 'timeline' | 'logs' | 'management';

export default function App() {
  const auth = useAuthSession();

  if (auth.status === 'checking') {
    return <AuthLoadingScreen />;
  }

  if (auth.status !== 'authenticated' || !auth.user) {
    return (
      <StorageFoilLogin
        isConfigured
        isSigningIn={auth.isSigningIn}
        error={auth.error}
        onSignIn={auth.signIn}
      />
    );
  }

  return <AuthenticatedStorageFoilApp user={auth.user} onSignOut={auth.signOut} />;
}

function AuthenticatedStorageFoilApp({
  user,
  onSignOut,
}: {
  user: AuthUser;
  onSignOut: () => Promise<void>;
}) {
  const inventory = useInventoryData(user, `${user.id}:${user.role}`);
  const batches = inventory.batches;
  const transactions: TransactionHistory[] = [];
  const monthsList = inventory.months;
  const currentMonth = inventory.currentMonth ?? '';

  const [activeTab, setActiveTab] = useLocalStorageState<ActiveTab>(
    'storage_foil_pref_v1_active_tab',
    'query',
  );
  const [searchQuery, setSearchQuery] = useLocalStorageState(
    'storage_foil_pref_v1_search_query',
    '',
  );
  const [selectedShelf, setSelectedShelf] = useLocalStorageState<string | null>(
    'storage_foil_pref_v1_selected_shelf',
    null,
  );
  const [selectedWarningFilter, setSelectedWarningFilter] = useLocalStorageState<string | null>(
    'storage_foil_pref_v1_warning_filter',
    null,
  );
  const [selectedStockLevelFilter, setSelectedStockLevelFilter] = useLocalStorageState<
    'low' | 'high' | 'in_stock' | null
  >('storage_foil_pref_v1_stock_level_filter', null);
  const [sortBy, setSortBy] = useLocalStorageState<'inflow' | 'outflow' | null>(
    'storage_foil_pref_v1_sort_by',
    null,
  );
  const [selectedSourceId, setSelectedSourceId] = useLocalStorageState(
    'storage_foil_pref_v1_selected_source',
    'all',
  );

  useEffect(() => {
    if (user.role !== 'admin' && activeTab === 'management') {
      setActiveTab('query');
    }
  }, [activeTab, setActiveTab, user.role]);

  useEffect(() => {
    if (
      selectedSourceId !== 'all' &&
      !inventory.sources.some(source => source.id === selectedSourceId) &&
      !batches.some(batch => batch.sourceId === selectedSourceId)
    ) {
      setSelectedSourceId('all');
    }
  }, [batches, inventory.sources, selectedSourceId, setSelectedSourceId]);

  const sourceFilters = useMemo(() => {
    const sources = new Map(
      inventory.sources.map(source => [source.id, { id: source.id, name: source.name }]),
    );
    batches.forEach(batch => {
      if (batch.sourceId && !sources.has(batch.sourceId)) {
        sources.set(batch.sourceId, {
          id: batch.sourceId,
          name: batch.sourceName || '已移除来源',
        });
      }
    });
    return [...sources.values()];
  }, [batches, inventory.sources]);

  const sourceFilteredBatches = useMemo(() => {
    if (selectedSourceId === 'all') return batches;
    return batches.filter(batch =>
      selectedSourceId === 'pl'
        ? !batch.sourceId || batch.sourceId === 'pl'
        : batch.sourceId === selectedSourceId,
    );
  }, [batches, selectedSourceId]);

  const filteredQueryBatches = useMemo(() => {
    return sourceFilteredBatches.filter(batch => {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        batch.batchCode.toLowerCase().includes(searchLower) ||
        batch.shelf.toLowerCase().includes(searchLower) ||
        batch.remarks.toLowerCase().includes(searchLower) ||
        batch.specification.toLowerCase().includes(searchLower) ||
        batch.productModel.toLowerCase().includes(searchLower);

      let matchesWarning = true;
      if (selectedWarningFilter === '白边') {
        matchesWarning = batch.remarks.includes('白边');
      } else if (selectedWarningFilter === '麻点') {
        matchesWarning = batch.remarks.includes('麻点');
      } else if (selectedWarningFilter === '胶') {
        matchesWarning =
          batch.remarks.includes('胶') ||
          batch.remarks.includes('分切') ||
          batch.remarks.includes('胶底');
      }

      let matchesStockLevel = true;
      if (selectedStockLevelFilter === 'low') {
        matchesStockLevel = batch.totalStock > 0 && batch.totalStock <= 5;
      } else if (selectedStockLevelFilter === 'high') {
        matchesStockLevel = batch.totalStock > 50;
      } else if (selectedStockLevelFilter === 'in_stock') {
        matchesStockLevel = batch.totalStock > 0;
      }

      return matchesSearch && matchesWarning && matchesStockLevel;
    });
  }, [sourceFilteredBatches, searchQuery, selectedWarningFilter, selectedStockLevelFilter]);

  const handleSwitchMonth = (targetMonth: string) => {
    if (targetMonth === currentMonth) return;
    void inventory.loadMonth(targetMonth);
  };

  const handleRefreshPublishedData = () => {
    const targetMonth =
      inventory.pendingUpdate?.months.includes(currentMonth)
        ? currentMonth
        : inventory.pendingUpdate?.defaultMonth || currentMonth;
    if (targetMonth) {
      void inventory.loadMonth(targetMonth);
    } else {
      void inventory.retry();
    }
  };

  const handleExportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      currentMonth,
      latestPublishedAt: inventory.latestPublishedAt,
      syncRunId: inventory.syncRunId,
      sources: inventory.sources,
      batches,
    };
    const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data, null, 2))}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `StorageFoil_Readonly_Export_${new Date().toISOString().slice(0, 10)}.json`,
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleSignOut = async () => {
    inventory.clear();
    await onSignOut();
  };

  if (inventory.status === 'idle' || inventory.status === 'loading' && batches.length === 0) {
    return <AuthLoadingScreen />;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-slate-800 font-sans antialiased pb-12" id="app-root-container">
      <header className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs" id="app-header">
        <div className="w-full px-4 sm:px-6 md:px-8">
          <div className="flex justify-between items-center h-13">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-emerald-500/10 flex-shrink-0">
                <Database className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xs sm:text-sm font-bold text-slate-900 font-display tracking-tight flex items-center gap-1.5 flex-wrap">
                  <span className="hidden sm:inline">品特烫金膜出入库管理与库存查询系统</span>
                  <span className="inline sm:hidden">品特烫金膜出入库系统</span>
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 px-1 py-0.2 rounded border border-emerald-100 font-mono">
                    Cloud
                  </span>
                </h1>
                <p className="text-[8px] sm:text-[9px] text-slate-400 truncate max-w-[180px] sm:max-w-none">
                  MongoDB 发布版本只读呈现
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              {inventory.status === 'loading' && (
                <span className="hidden items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-700 sm:flex">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  数据读取中
                </span>
              )}
              <span className="hidden items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 sm:flex">
                <UserRound className="h-3.5 w-3.5" />
                {user.displayName}
              </span>
              <button
                onClick={() => void handleSignOut()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                title="退出登录"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">退出</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200/60 py-2 shadow-2xs" id="month-sheets-selection-bar">
        <div className="w-full px-4 sm:px-6 md:px-8 flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1">
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">月度工作表 (MongoDB):</span>
              <span className="inline sm:hidden">工作表:</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none min-w-0">
              {monthsList.map(month => {
                const isActive = month === currentMonth;
                const [year, monthValue] = month.split('-');
                return (
                  <button
                    key={month}
                    onClick={() => handleSwitchMonth(month)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-800 shadow-3xs'
                        : 'bg-slate-50 hover:bg-slate-100 border border-slate-100 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {year}年{monthValue}月 工作表
                  </button>
                );
              })}
              {monthsList.length === 0 && (
                <span className="text-xs font-semibold text-slate-400">暂无已发布月份</span>
              )}
            </div>
          </div>
          <DataFreshnessBadge
            latestPublishedAt={inventory.latestPublishedAt}
            syncRunId={inventory.syncRunId}
            isLoading={inventory.status === 'loading'}
            error={inventory.error}
            onRetry={() => void inventory.retry()}
          />
        </div>
      </div>

      <div className="border-b border-slate-200/70 bg-[#F8F9FB]">
        <div className="flex w-full items-center gap-2 overflow-x-auto px-4 py-2 sm:px-6 md:px-8">
          <span className="mr-1 flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Layers className="h-3.5 w-3.5" />
            数据来源
          </span>
          <button
            type="button"
            onClick={() => setSelectedSourceId('all')}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${
              selectedSourceId === 'all'
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            全部 · {batches.length}
          </button>
          {sourceFilters.map(source => {
            const count = batches.filter(batch =>
              source.id === 'pl'
                ? !batch.sourceId || batch.sourceId === 'pl'
                : batch.sourceId === source.id,
            ).length;
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => setSelectedSourceId(source.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold transition ${
                  selectedSourceId === source.id
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:text-emerald-700'
                }`}
              >
                {source.name} · {count}
              </button>
            );
          })}
          <span className="ml-auto hidden shrink-0 text-[10px] text-slate-400 sm:block">
            当前显示 {sourceFilteredBatches.length} 条
          </span>
        </div>
      </div>

      <main className="w-full px-4 sm:px-6 md:px-8 mt-4 space-y-4">
        {inventory.pendingUpdate && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-bold">检测到 WPS 已发布新数据，是否立刻刷新？</div>
              <div className="mt-1 text-[11px] text-amber-700">
                新 RUN：{inventory.pendingUpdate.syncRunId.slice(0, 8)}
                {inventory.pendingUpdate.latestPublishedAt
                  ? ` · 发布于 ${new Date(inventory.pendingUpdate.latestPublishedAt).toLocaleString('zh-CN', { hour12: false })}`
                  : ''}
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={handleRefreshPublishedData}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
              >
                立即刷新数据
              </button>
              <button
                type="button"
                onClick={() => inventory.dismissPendingUpdate()}
                className="rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
              >
                稍后
              </button>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-slate-200 pb-px" id="navigation-tabs-bar">
          <div className="flex space-x-1 overflow-x-auto scrollbar-none pb-px w-full">
            <TabButton active={activeTab === 'query'} onClick={() => setActiveTab('query')} icon={<Search className="w-3.5 h-3.5" />} label="库存智能查询" />
            <TabButton active={activeTab === 'table'} onClick={() => setActiveTab('table')} icon={<FileSpreadsheet className="w-3.5 h-3.5" />} label="在库统计表" />
            <TabButton active={activeTab === 'visual'} onClick={() => setActiveTab('visual')} icon={<Grid className="w-3.5 h-3.5" />} label="19号货架看板" />
            <TabButton active={activeTab === 'previous_month'} onClick={() => setActiveTab('previous_month')} icon={<Layers className="w-3.5 h-3.5" />} label="上月结余" />
            <TabButton active={activeTab === 'timeline'} onClick={() => setActiveTab('timeline')} icon={<Clock className="w-3.5 h-3.5" />} label="时间尺度看板" />
            <TabButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<History className="w-3.5 h-3.5" />} label="操作日志" />
            {user.role === 'admin' && (
              <TabButton active={activeTab === 'management'} onClick={() => setActiveTab('management')} icon={<Database className="w-3.5 h-3.5" />} label="同步后台" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          {activeTab === 'query' && (
            <div className="space-y-4 animate-fade-in">
              <InventoryQueryConsole
                batches={sourceFilteredBatches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedWarningFilter={selectedWarningFilter}
                setSelectedWarningFilter={setSelectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                setSelectedStockLevelFilter={setSelectedStockLevelFilter}
              />
              <InventoryCards batches={filteredQueryBatches} searchQuery={searchQuery} />
            </div>
          )}

          {activeTab === 'table' && (
            <div className="space-y-4 animate-fade-in">
              <StatsDashboard
                batches={sourceFilteredBatches}
                selectedWarningFilter={selectedWarningFilter}
                onSelectWarningFilter={setSelectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                setSelectedStockLevelFilter={setSelectedStockLevelFilter}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                sortBy={sortBy}
                setSortBy={setSortBy}
              />
              <InventoryTable
                batches={sourceFilteredBatches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                sortBy={sortBy}
              />
            </div>
          )}

          {activeTab === 'visual' && (
            <div className="space-y-4 animate-fade-in">
              <ShelfVisualizer
                batches={sourceFilteredBatches}
                selectedShelf={selectedShelf}
                onSelectShelf={setSelectedShelf}
                onQuickTransaction={() => undefined}
                searchQuery={searchQuery}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
              />
              <InventoryTable
                batches={sourceFilteredBatches}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                selectedShelf={selectedShelf}
                setSelectedShelf={setSelectedShelf}
                selectedWarningFilter={selectedWarningFilter}
                selectedStockLevelFilter={selectedStockLevelFilter}
                sortBy={sortBy}
              />
            </div>
          )}

          {activeTab === 'previous_month' && (
            <PreviousMonthBalanceView
              currentMonth={currentMonth}
              monthsList={monthsList}
              currentBatches={batches}
              batchesByMonth={inventory.batchesByMonth}
            />
          )}

          {activeTab === 'timeline' && (
            <TimeScaleView batches={sourceFilteredBatches} transactions={transactions} currentMonth={currentMonth} />
          )}

          {activeTab === 'logs' && <ReadOnlyLogs transactions={transactions} />}

          {user.role === 'admin' && activeTab === 'management' && (
            <div className="space-y-4 animate-fade-in" id="admin-sync-management-section">
              <AdminSyncConsole
                user={user}
                currentMonth={currentMonth}
                onRefreshCurrentMonth={() =>
                  currentMonth ? inventory.loadMonth(currentMonth) : inventory.retry()
                }
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="backup-management-section">
              <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800">只读库存导出</h3>
                    <p className="text-xs text-slate-500">导出当前 MongoDB 已发布版本的库存快照</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  当前页面只展示已发布库存版本。导出不会修改 MongoDB，也不会触发 WPS 同步。
                </p>
                <button
                  onClick={handleExportData}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
                  id="export-backup-btn"
                >
                  <Download className="w-4 h-4" />
                  导出当前快照 (.json)
                </button>
              </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-3 py-1.5 rounded-t-lg text-xs font-semibold transition-all border-b-2 ${
        active
          ? 'border-emerald-600 text-emerald-700 bg-white shadow-2xs'
          : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-100/60'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ReadOnlyLogs({ transactions }: { transactions: TransactionHistory[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden"
      id="transactions-logs-section"
    >
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">系统操作流水变动日志</h3>
          <p className="text-xs text-slate-500">当前阶段只展示 MongoDB 已发布库存，历史流水将在同步发布中提供。</p>
        </div>
        <div className="px-2 py-1 rounded-md bg-slate-50 text-[10px] font-mono text-slate-400">
          共计 {transactions.length} 条记录
        </div>
      </div>
      {transactions.length > 0 ? (
        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto no-scrollbar">
          {transactions.map(tx => (
            <div key={tx.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors text-xs">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-xl mt-0.5 ${tx.type === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                  {tx.type === 'in' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-800">批次 {tx.batchCode}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${tx.type === 'in' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                      {tx.type === 'in' ? '入库' : '出库'} +{tx.qty} 支
                    </span>
                  </div>
                  <p className="text-slate-500 mt-1">{tx.notes || '无业务说明'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <History className="w-8 h-8 text-slate-300" />
          <p className="text-sm font-medium">暂无变动日志流水</p>
        </div>
      )}
    </motion.div>
  );
}
