import { InventoryBatch } from '../types';
import { motion } from 'motion/react';
import { Boxes, TrendingUp, TrendingDown, ClipboardList, Layers } from 'lucide-react';

interface StatsDashboardProps {
  batches: InventoryBatch[];
  onSelectWarningFilter: (term: string | null) => void;
  selectedWarningFilter: string | null;
  // Clickable stats card support props
  selectedStockLevelFilter?: 'low' | 'high' | 'in_stock' | null;
  setSelectedStockLevelFilter?: (filter: 'low' | 'high' | 'in_stock' | null) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  selectedShelf?: string | null;
  setSelectedShelf?: (shelf: string | null) => void;
  sortBy?: 'inflow' | 'outflow' | null;
  setSortBy?: (sort: 'inflow' | 'outflow' | null) => void;
}

export default function StatsDashboard({
  batches,
  onSelectWarningFilter,
  selectedWarningFilter,
  selectedStockLevelFilter = null,
  setSelectedStockLevelFilter,
  searchQuery = '',
  setSearchQuery,
  selectedShelf = null,
  setSelectedShelf,
  sortBy = null,
  setSortBy,
}: StatsDashboardProps) {
  // Calculations
  const totalBatches = batches.length;
  const totalStock = batches.reduce((sum, b) => sum + b.totalStock, 0);
  const totalInflow = batches.reduce((sum, b) => sum + b.inflowQty, 0);
  const totalOutflow = batches.reduce((sum, b) => sum + b.outflowQty, 0);

  // Defect classifications
  const defectStats = {
    whiteBorder: batches.filter((b) => b.remarks.includes('白边')).length,
    pitting: batches.filter((b) => b.remarks.includes('麻点')).length,
    adhesiveIssues: batches.filter((b) => b.remarks.includes('胶') || b.remarks.includes('分切') || b.remarks.includes('胶底')).length,
  };

  // Determine active states for the cards
  const isStockActive = selectedStockLevelFilter === 'in_stock';
  const isAllBatchesActive = !selectedStockLevelFilter && !selectedWarningFilter && !searchQuery && !selectedShelf && !sortBy;
  const isInflowActive = sortBy === 'inflow';
  const isOutflowActive = sortBy === 'outflow';

  const handleCardClick = (cardId: string) => {
    if (cardId === 'total-stock' && setSelectedStockLevelFilter) {
      setSelectedStockLevelFilter(isStockActive ? null : 'in_stock');
      // If we sort or do other things, keep it clean
      if (setSortBy && sortBy === 'outflow') setSortBy(null);
    } else if (cardId === 'total-batches') {
      // Reset all filters to show all registered batches
      if (setSelectedStockLevelFilter) setSelectedStockLevelFilter(null);
      if (onSelectWarningFilter) onSelectWarningFilter(null);
      if (setSearchQuery) setSearchQuery('');
      if (setSelectedShelf) setSelectedShelf(null);
      if (setSortBy) setSortBy(null);
    } else if (cardId === 'total-inflow' && setSortBy) {
      setSortBy(isInflowActive ? null : 'inflow');
    } else if (cardId === 'total-outflow' && setSortBy) {
      setSortBy(isOutflowActive ? null : 'outflow');
    }
  };

  const statCards = [
    {
      id: 'total-stock',
      title: '当前库存总数',
      value: totalStock,
      unit: '支',
      subtext: `当前在库的烫金膜产品总卷数`,
      icon: Boxes,
      isActive: isStockActive,
      activeStyle: 'border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 text-emerald-800',
      normalStyle: 'border-slate-200/80 bg-white hover:border-emerald-400 hover:bg-emerald-50/10 text-slate-700',
      iconBg: isStockActive ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 border border-emerald-100',
      actionHint: isStockActive ? '已筛有货 (点击取消)' : '点击快速筛选有货',
    },
    {
      id: 'total-batches',
      title: '在库批次数',
      value: totalBatches,
      unit: '个批次',
      subtext: `当前库房存放的独立产品批次`,
      icon: Layers,
      isActive: isAllBatchesActive,
      activeStyle: 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20 text-indigo-800',
      normalStyle: 'border-slate-200/80 bg-white hover:border-indigo-400 hover:bg-indigo-50/10 text-slate-700',
      iconBg: isAllBatchesActive ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-700 border border-indigo-100',
      actionHint: isAllBatchesActive ? '已显示全部' : '点击重置全部筛选',
    },
    {
      id: 'total-inflow',
      title: '累计入库',
      value: totalInflow,
      unit: '支',
      subtext: `系统统计内登记的入库总量`,
      icon: TrendingUp,
      isActive: isInflowActive,
      activeStyle: 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20 text-blue-800',
      normalStyle: 'border-slate-200/80 bg-white hover:border-blue-400 hover:bg-blue-50/10 text-slate-700',
      iconBg: isInflowActive ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 border border-blue-100',
      actionHint: isInflowActive ? '已按入库排序 (点击取消)' : '点击按入库量排序',
    },
    {
      id: 'total-outflow',
      title: '累计出库',
      value: totalOutflow,
      unit: '支',
      subtext: `系统统计内登记的出库总量`,
      icon: TrendingDown,
      isActive: isOutflowActive,
      activeStyle: 'border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20 text-amber-800',
      normalStyle: 'border-slate-200/80 bg-white hover:border-amber-400 hover:bg-amber-50/10 text-slate-700',
      iconBg: isOutflowActive ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 border border-amber-100',
      actionHint: isOutflowActive ? '已按出库排序 (点击取消)' : '点击按出库量排序',
    },
  ];

  return (
    <div className="space-y-3">
      {/* Primary Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((card, i) => {
          const IconComponent = card.icon;
          return (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.2 }}
              onClick={() => handleCardClick(card.id)}
              className={`p-3 rounded-xl border shadow-xs flex flex-col justify-between transition-all cursor-pointer ${
                card.isActive ? card.activeStyle : card.normalStyle
              }`}
              id={`stat-card-${card.id}`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 font-sans uppercase tracking-wider block mb-0.5">
                    {card.title}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-2xl font-bold font-display tracking-tight ${
                      card.isActive ? 'text-slate-900' : 'text-slate-800'
                    }`}>
                      {card.value.toLocaleString()}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">{card.unit}</span>
                  </div>
                </div>
                <div className={`p-1.5 rounded-lg transition-colors ${card.iconBg}`}>
                  <IconComponent className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-100/50 flex items-center justify-between text-[10px] font-sans">
                <span className="text-slate-400 line-clamp-1">{card.subtext}</span>
                <span className={`font-medium ml-1 shrink-0 ${
                  card.isActive ? 'text-emerald-600 font-bold' : 'text-slate-400 group-hover:text-slate-600'
                }`}>
                  {card.actionHint}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Warning Filter Panel (Remarks categories) */}
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.2 }}
        className="bg-white py-2 px-3.5 rounded-xl border border-slate-100 shadow-xs"
        id="defect-filter-panel"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-rose-500" />
            <div>
              <h3 className="text-xs font-semibold text-slate-800 font-sans">异常备注快速检索</h3>
              <p className="text-[10px] text-slate-500">点击标签快速筛选含有特定异常或特殊工艺备注的批次</p>
            </div>
          </div>
          {selectedWarningFilter && (
            <button
              onClick={() => onSelectWarningFilter(null)}
              className="text-[11px] font-medium text-slate-500 hover:text-slate-800 underline self-start sm:self-auto"
              id="clear-warning-filter-btn"
            >
              重置筛选
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            onClick={() => onSelectWarningFilter(selectedWarningFilter === '白边' ? null : '白边')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedWarningFilter === '白边'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100/70 border border-rose-100'
            }`}
            id="filter-white-border-btn"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            白边批次 ({defectStats.whiteBorder})
          </button>

          <button
            onClick={() => onSelectWarningFilter(selectedWarningFilter === '麻点' ? null : '麻点')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedWarningFilter === '麻点'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100/70 border border-amber-100'
            }`}
            id="filter-pitting-btn"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            麻点批次 ({defectStats.pitting})
          </button>

          <button
            onClick={() => onSelectWarningFilter(selectedWarningFilter === '胶' ? null : '胶')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
              selectedWarningFilter === '胶'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 hover:bg-blue-100/70 border border-blue-100'
            }`}
            id="filter-adhesive-btn"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            胶底/分切异常 ({defectStats.adhesiveIssues})
          </button>

          <div className="ml-auto text-[10px] text-slate-400 self-center hidden md:block">
            双击表格中“备注”列亦可直接在线编辑修改异常备注。
          </div>
        </div>
      </motion.div>
    </div>
  );
}
