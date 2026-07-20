import { useState, useEffect } from 'react';
import { InventoryBatch } from '../types';
import {
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet
} from 'lucide-react';

interface PreviousMonthBalanceViewProps {
  currentMonth: string;
  monthsList: string[];
  currentBatches: InventoryBatch[];
}

export default function PreviousMonthBalanceView({
  currentMonth,
  monthsList,
  currentBatches,
}: PreviousMonthBalanceViewProps) {
  // 1. Determine comparison month
  const [comparisonMonth, setComparisonMonth] = useState<string>('');

  // Find chronological default previous month (e.g. 2026-07 -> 2026-06)
  const getPrevMonthDefault = (monthStr: string) => {
    if (!monthStr || !monthStr.includes('-')) return '';
    const [y, mm] = monthStr.split('-');
    let prevMonthYear = parseInt(y, 10);
    let prevMonthMonth = parseInt(mm, 10) - 1;
    if (prevMonthMonth < 1) {
      prevMonthMonth = 12;
      prevMonthYear -= 1;
    }
    return `${prevMonthYear}-${String(prevMonthMonth).padStart(2, '0')}`;
  };

  // Set default comparison month on load or when currentMonth changes
  useEffect(() => {
    const calculatedDefault = getPrevMonthDefault(currentMonth);
    const otherMonths = monthsList.filter(m => m !== currentMonth);
    
    if (otherMonths.includes(calculatedDefault)) {
      setComparisonMonth(calculatedDefault);
    } else if (otherMonths.length > 0) {
      // fallback to the first available other month
      setComparisonMonth(otherMonths[0]);
    } else {
      setComparisonMonth('');
    }
  }, [currentMonth, monthsList]);

  // 2. Load comparison month data from localStorage
  const [prevBatches, setPrevBatches] = useState<InventoryBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!comparisonMonth) {
      setPrevBatches([]);
      return;
    }

    setIsLoading(true);
    const savedBatchesStr = localStorage.getItem(`pl_inventory_batches_${comparisonMonth}`);
    if (savedBatchesStr) {
      try {
        const parsed = JSON.parse(savedBatchesStr) as InventoryBatch[];
        setPrevBatches(parsed);
      } catch (e) {
        setPrevBatches([]);
      }
    } else {
      setPrevBatches([]);
    }
    setIsLoading(false);
  }, [comparisonMonth]);

  // 3. Search and filtering states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'carried' | 'discrepancy' | 'uncarried' | 'has_balance'>('all');

  // Helper to check carryover status and current batch
  const getCarryoverStatus = (prevBatch: InventoryBatch) => {
    const currentMatch = currentBatches.find(b => b.batchCode === prevBatch.batchCode);
    if (!currentMatch) {
      return {
        type: 'uncarried' as const,
        currentQty: 0,
        label: '有结余未结转',
        colorClass: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    }

    // Usually day 1 inQty represents the starting stock
    const currentDay1 = currentMatch.dailyActivities.find(a => a.day === 1)?.inQty ?? 0;

    if (currentDay1 === prevBatch.totalStock) {
      return {
        type: 'carried' as const,
        currentQty: currentDay1,
        label: '已结转且对账一致',
        colorClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    } else {
      return {
        type: 'discrepancy' as const,
        currentQty: currentDay1,
        label: '期初结转数不符',
        colorClass: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    }
  };

  // 4. Calculations for top stats card
  const totalPrevEndingStock = prevBatches.reduce((sum, b) => sum + b.totalStock, 0);
  const totalPrevInflow = prevBatches.reduce((sum, b) => sum + b.inflowQty, 0);
  const totalPrevOutflow = prevBatches.reduce((sum, b) => sum + b.outflowQty, 0);

  // Batches with positive ending stock last month
  const activePrevBatches = prevBatches.filter(b => b.totalStock > 0);
  const carriedActiveCount = activePrevBatches.filter(b => {
    const status = getCarryoverStatus(b);
    return status.type === 'carried';
  }).length;

  const rolloverRate = activePrevBatches.length > 0
    ? Math.round((carriedActiveCount / activePrevBatches.length) * 100)
    : 100;

  // Filter previous batches
  const filteredPrevBatches = prevBatches.filter((b) => {
    // Search query match
    const matchesSearch =
      b.batchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.productModel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.specification.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.shelf.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // Status filter match
    const statusInfo = getCarryoverStatus(b);
    if (statusFilter === 'carried') return statusInfo.type === 'carried';
    if (statusFilter === 'discrepancy') return statusInfo.type === 'discrepancy';
    if (statusFilter === 'uncarried') return statusInfo.type === 'uncarried';
    if (statusFilter === 'has_balance') return b.totalStock > 0;

    return true;
  });

  const uncarriedWithBalance = prevBatches.filter(b => b.totalStock > 0 && getCarryoverStatus(b).type === 'uncarried');

  const [yCurr, mCurr] = currentMonth.split('-');
  const [yComp, mComp] = comparisonMonth ? comparisonMonth.split('-') : ['', ''];

  return (
    <div className="space-y-4 font-sans" id="previous-month-balance-view">
      {/* Selector & Description Panel */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800">
              <Layers className="w-4 h-4" />
            </span>
            <h3 className="text-sm font-bold text-slate-800">上月期末结余账目对比 (上期期末 vs 本期期初)</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            对比分析当前月份工作表 (<span className="font-semibold text-emerald-700">{yCurr}年{mCurr}月</span>) 与对照历史月份工作表的期末库存，确保连续记账结转的库存数据完全一致。
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start md:self-center bg-slate-50 p-1.5 rounded-xl border border-slate-100">
          <label className="text-xs font-bold text-slate-500 pl-2 whitespace-nowrap">对比目标工作表:</label>
          <select
            value={comparisonMonth}
            onChange={(e) => setComparisonMonth(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 transition-all font-mono"
          >
            {monthsList.map(m => {
              if (m === currentMonth) return null;
              const [y, mm] = m.split('-');
              return (
                <option key={m} value={m}>
                  {y}年{mm}月 工作表
                </option>
              );
            })}
            {monthsList.filter(m => m !== currentMonth).length === 0 && (
              <option value="">暂无其他工作表</option>
            )}
          </select>
        </div>
      </div>

      {!comparisonMonth ? (
        <div className="bg-amber-50/50 border border-amber-200/50 rounded-2xl p-10 text-center text-slate-500 flex flex-col items-center justify-center gap-3">
          <AlertCircle className="w-8 h-8 text-amber-500/80" />
          <div>
            <h4 className="text-sm font-bold text-slate-800">未检测到可对比的其它月份工作表</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              此模块需要至少两个月份的工作表来进行数据对账与联动呈现。
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Top Statistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="prev-month-stats-grid">
            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                {yComp}年{mComp}月 期末总结余
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  {totalPrevEndingStock}
                </span>
                <span className="text-xs text-slate-400">支</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1 font-mono">
                <span>入库 {totalPrevInflow} 支</span>
                <span className="text-slate-300">|</span>
                <span>出库 {totalPrevOutflow} 支</span>
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                上月活跃在库批次
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-extrabold text-slate-800 tracking-tight font-mono">
                  {activePrevBatches.length}
                </span>
                <span className="text-xs text-slate-400">个批次</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                其中有 {prevBatches.filter(b => b.totalStock === 0).length} 个批次已于上月清零
              </p>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                对账一致率
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className="text-2xl font-extrabold text-emerald-600 tracking-tight font-mono">
                  {carriedActiveCount}
                </span>
                <span className="text-xs text-slate-400 font-sans font-medium">/ {activePrevBatches.length} 批次一致</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                {uncarriedWithBalance.length > 0 ? (
                  <span className="text-rose-600 font-semibold flex items-center gap-0.5 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    仍有 {uncarriedWithBalance.length} 个结余批次未结转至本月
                  </span>
                ) : (
                  <span className="text-emerald-600 font-medium flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    所有结余批次均已在库且对账一致
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                对账一致率百分比
              </span>
              <div className="flex items-baseline gap-1.5 mt-1.5">
                <span className={`text-2xl font-extrabold tracking-tight font-mono ${
                  rolloverRate === 100 ? 'text-emerald-600' : 'text-amber-500'
                }`}>
                  {rolloverRate}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    rolloverRate === 100 ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${rolloverRate}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Table Actions Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Left filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              {/* Search */}
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜索上月批次/型号/规格/货架..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white focus:border-emerald-500 transition-all text-slate-700 font-sans"
                />
              </div>

              {/* Status Select filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200/80">
                {(['all', 'carried', 'discrepancy', 'uncarried', 'has_balance'] as const).map((filter) => {
                  const labelMap = {
                    all: '全部批次',
                    carried: '已结转',
                    discrepancy: '期初不一致',
                    uncarried: '未结转',
                    has_balance: '有结余批次',
                  };
                  const isActive = statusFilter === filter;
                  return (
                    <button
                      key={filter}
                      onClick={() => setStatusFilter(filter)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                        isActive
                          ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/40'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {labelMap[filter]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-xs font-medium text-slate-500 font-mono">
              对账过滤结果: {filteredPrevBatches.length} 项
            </div>
          </div>

          {/* Main Batches Comparison Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">批次号</th>
                    <th className="py-3 px-4">品类型号</th>
                    <th className="py-3 px-4">规格</th>
                    <th className="py-3 px-4">货架层位</th>
                    <th className="py-3 px-4 text-center">上月入/出库</th>
                    <th className="py-3 px-4 text-center bg-slate-50 font-bold text-slate-600">上月期末结余</th>
                    <th className="py-3 px-4 text-center">本月期初结转</th>
                    <th className="py-3 px-4 text-center">对账对齐状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                        正在加载上月结余明细...
                      </td>
                    </tr>
                  ) : filteredPrevBatches.length > 0 ? (
                    filteredPrevBatches.map((b) => {
                      const statusInfo = getCarryoverStatus(b);
                      return (
                        <tr key={b.id} className="hover:bg-slate-50/40 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {b.batchCode}
                          </td>
                          <td className="py-3 px-4 text-slate-700 font-medium">
                            {b.productModel}
                          </td>
                          <td className="py-3 px-4 text-slate-500 font-mono">
                            {b.specification}
                          </td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] border border-slate-200/50">
                              {b.shelf}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-slate-500 font-mono">
                            <div className="flex items-center justify-center gap-1 text-[11px]">
                              <span className="text-emerald-600 flex items-center">+{b.inflowQty}</span>
                              <span className="text-slate-300">/</span>
                              <span className="text-rose-600 flex items-center">-{b.outflowQty}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-bold bg-slate-50/40 text-slate-800">
                            <span className={b.totalStock > 0 ? 'text-slate-900 font-extrabold' : 'text-slate-400'}>
                              {b.totalStock} 支
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-mono font-semibold">
                            {statusInfo.type === 'uncarried' ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <span className={statusInfo.type === 'discrepancy' ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                                {statusInfo.currentQty} 支
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.colorClass}`}>
                              {statusInfo.type === 'carried' && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                              {statusInfo.type === 'discrepancy' && <AlertTriangle className="w-3 h-3 text-amber-600" />}
                              {statusInfo.type === 'uncarried' && <AlertCircle className="w-3 h-3 text-rose-600" />}
                              {statusInfo.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                        <FileSpreadsheet className="w-8 h-8 text-slate-300" />
                        <p className="text-sm font-semibold">未找到满足过滤条件的上月批次</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[11px] text-slate-500">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>上月历史数据对齐批次共计 <span className="font-bold text-slate-700">{filteredPrevBatches.length}</span> / {prevBatches.length} 条</span>
              </div>
              <div className="flex items-center gap-4 font-sans">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> 已结转对齐一致
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> 期初与上期期末不符
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span> 有余额仍未做期初结转
                </span>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
