import { Search, Filter, AlertTriangle, TrendingDown, Boxes, RefreshCw, Layers } from 'lucide-react';
import { InventoryBatch } from '../types';
import { matchesInventorySearch } from '../lib/inventorySearch';
import { countWarningFilterMatches, matchesWarningFilter } from '../lib/warningFilters';

interface InventoryQueryConsoleProps {
  batches: InventoryBatch[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedWarningFilter: string | null;
  setSelectedWarningFilter: (filter: string | null) => void;
  selectedStockLevelFilter: 'low' | 'high' | 'in_stock' | null;
  setSelectedStockLevelFilter: (filter: 'low' | 'high' | 'in_stock' | null) => void;
}

export default function InventoryQueryConsole({
  batches,
  searchQuery,
  setSearchQuery,
  selectedWarningFilter,
  setSelectedWarningFilter,
  selectedStockLevelFilter,
  setSelectedStockLevelFilter,
}: InventoryQueryConsoleProps) {
  
  // Calculate matching counts
  const getFilteredStats = () => {
    let matchCount = 0;
    let totalQty = 0;

    batches.forEach((b) => {
      // Search matching
      const matchesSearch = matchesInventorySearch(b, searchQuery);

      // Warning filter
      const matchesWarning = matchesWarningFilter(b, selectedWarningFilter);

      // Stock level filter
      let matchesStockLevel = true;
      if (selectedStockLevelFilter === 'low') {
        matchesStockLevel = b.totalStock > 0 && b.totalStock <= 5;
      } else if (selectedStockLevelFilter === 'high') {
        matchesStockLevel = b.totalStock > 50;
      } else if (selectedStockLevelFilter === 'in_stock') {
        matchesStockLevel = b.totalStock > 0;
      }

      if (matchesSearch && matchesWarning && matchesStockLevel) {
        matchCount++;
        totalQty += b.totalStock;
      }
    });

    return { matchCount, totalQty };
  };

  const { matchCount, totalQty } = getFilteredStats();
  const isAnyFilterActive = searchQuery !== '' || selectedWarningFilter !== null || selectedStockLevelFilter !== null;

  const handleResetAll = () => {
    setSearchQuery('');
    setSelectedWarningFilter(null);
    setSelectedStockLevelFilter(null);
  };

  // Defect counts for subtext tags
  const whiteBorderCount = countWarningFilterMatches(batches, '白边');
  const pittingCount = countWarningFilterMatches(batches, '麻点');
  const adhesiveCount = countWarningFilterMatches(batches, '胶底/分切/胶');
  const lowStockCount = batches.filter((b) => b.totalStock > 0 && b.totalStock <= 5).length;
  const highStockCount = batches.filter((b) => b.totalStock > 50).length;

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-xs p-4 space-y-3" id="inventory-query-console">
      {/* Search Header and Input */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
            <Search className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800">库存快速智能查询</h3>
            <p className="text-[10px] text-slate-400">支持按批号、规格、货架或异常备注实时检索</p>
          </div>
        </div>

        {/* Counter badge for filtered result */}
        <div className="flex items-center gap-2 self-start md:self-auto">
          {isAnyFilterActive && (
            <button
              onClick={handleResetAll}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100/60 rounded-md transition-colors font-sans"
              id="query-reset-all-btn"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              清空筛选条件
            </button>
          )}
          <div className="px-2.5 py-1 rounded-md bg-slate-50 border border-slate-150 text-[10px] font-medium text-slate-600 font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            检索到: <span className="font-bold text-slate-800">{matchCount}</span> 批 / 共 <span className="font-bold text-emerald-700">{totalQty}</span> 支
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Search Input Bar */}
        <div className="relative lg:col-span-5 self-center">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="输入产品型号、批号(如 20211115)、规格、货架或备注..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-10 py-0 bg-[#F8F9FB] border border-slate-200 hover:border-slate-300 focus:bg-white rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-all font-sans"
            id="console-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-[10px] font-medium text-slate-400 hover:text-slate-600 font-sans"
              id="console-clear-search"
            >
              清空
            </button>
          )}
        </div>

        {/* Filters Group */}
        <div className="lg:col-span-7 flex flex-wrap items-center gap-1.5">
          <div className="text-[10px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            快捷过滤:
          </div>

          {/* Warning / Remark filters */}
          <button
            onClick={() => setSelectedWarningFilter(selectedWarningFilter === '白边' ? null : '白边')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedWarningFilter === '白边'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100/70'
            }`}
            id="btn-filter-white-border"
          >
            <AlertTriangle className="w-3 h-3" />
            白边异常 ({whiteBorderCount})
          </button>

          <button
            onClick={() => setSelectedWarningFilter(selectedWarningFilter === '麻点' ? null : '麻点')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedWarningFilter === '麻点'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100/70'
            }`}
            id="btn-filter-pitting"
          >
            <AlertTriangle className="w-3 h-3" />
            麻点异常 ({pittingCount})
          </button>

          <button
            onClick={() => setSelectedWarningFilter(selectedWarningFilter === '胶底/分切/胶' ? null : '胶底/分切/胶')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedWarningFilter === '胶底/分切/胶'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100/70'
            }`}
            id="btn-filter-adhesive"
          >
            <AlertTriangle className="w-3 h-3" />
            胶底/分切 ({adhesiveCount})
          </button>

          {/* Stock Level filters */}
          <button
            onClick={() => setSelectedStockLevelFilter(selectedStockLevelFilter === 'low' ? null : 'low')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedStockLevelFilter === 'low'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 border border-slate-200/60 hover:bg-slate-200'
            }`}
            id="btn-filter-low-stock"
          >
            <TrendingDown className="w-3 h-3 text-red-500" />
            低库存 ≤5卷 ({lowStockCount})
          </button>

          <button
            onClick={() => setSelectedStockLevelFilter(selectedStockLevelFilter === 'high' ? null : 'high')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedStockLevelFilter === 'high'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 border border-slate-200/60 hover:bg-slate-200'
            }`}
            id="btn-filter-high-stock"
          >
            <Boxes className="w-3 h-3 text-emerald-500" />
            高负荷 &gt;50卷 ({highStockCount})
          </button>

          <button
            onClick={() => setSelectedStockLevelFilter(selectedStockLevelFilter === 'in_stock' ? null : 'in_stock')}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
              selectedStockLevelFilter === 'in_stock'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 border border-slate-200/60 hover:bg-slate-200'
            }`}
            id="btn-filter-in-stock"
          >
            <Layers className="w-3 h-3 text-indigo-500" />
            在库 (有货)
          </button>
        </div>
      </div>
    </div>
  );
}
