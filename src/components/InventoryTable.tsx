import { Fragment, useState } from 'react';
import { InventoryBatch } from '../types';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { Search, Tag, HelpCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { matchesInventorySearch } from '../lib/inventorySearch';
import { normalizeShelfCode } from '../lib/shelfMap';
import { matchesWarningFilter } from '../lib/warningFilters';

interface InventoryTableProps {
  batches: InventoryBatch[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedShelf: string | null;
  setSelectedShelf: (shelf: string | null) => void;
  selectedWarningFilter: string | null;
  selectedStockLevelFilter?: 'low' | 'high' | 'in_stock' | null;
  sortBy?: 'inflow' | 'outflow' | null;
}

const ALL_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function getProductType(batch: InventoryBatch): string {
  return batch.sourceName || batch.sourceId?.toUpperCase() || '—';
}

export default function InventoryTable({
  batches,
  searchQuery,
  setSearchQuery,
  selectedShelf,
  setSelectedShelf,
  selectedWarningFilter,
  selectedStockLevelFilter = null,
  sortBy = null,
}: InventoryTableProps) {
  // Extract unique shelves for filter chips
  const allShelves = Array.from(
    new Set(batches.map(batch => normalizeShelfCode(batch.shelf))),
  ).sort();

  // Pagination State for high performance rendering of large datasets
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useLocalStorageState<number | 'all'>(
    'storage_foil_pref_v1_table_page_size',
    30,
  );

  // Track filters to reset page to 1 on filter change
  const filterKey = `${searchQuery}-${selectedShelf}-${selectedWarningFilter}-${selectedStockLevelFilter}-${sortBy}-${batches.length}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setCurrentPage(1);
  }

  // Filter batches based on search query, selected shelf, warning filter, and stock level filter
  let filteredBatches = batches.filter((b) => {
    // Search matching
    const matchesSearch = matchesInventorySearch(b, searchQuery);

    // Shelf filter
    const matchesShelf = selectedShelf
      ? normalizeShelfCode(b.shelf) === normalizeShelfCode(selectedShelf)
      : true;

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

    // Outflow check (only show entries with actual outflows if sorting by outflow)
    let matchesOutflow = true;
    if (sortBy === 'outflow') {
      matchesOutflow = b.outflowQty > 0;
    }

    return matchesSearch && matchesShelf && matchesWarning && matchesStockLevel && matchesOutflow;
  });

  // Apply sorting if specified
  if (sortBy === 'inflow') {
    filteredBatches = [...filteredBatches].sort((a, b) => b.inflowQty - a.inflowQty);
  } else if (sortBy === 'outflow') {
    filteredBatches = [...filteredBatches].sort((a, b) => b.outflowQty - a.outflowQty);
  }

  // Paginate filteredBatches for extreme performance with large datasets
  const totalItems = filteredBatches.length;
  const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItems / (pageSize as number));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages || 1);
  const paginatedBatches = pageSize === 'all'
    ? filteredBatches
    : filteredBatches.slice((validCurrentPage - 1) * (pageSize as number), validCurrentPage * (pageSize as number));

  // Function to highlight search matches
  const highlightText = (text: string, search: string) => {
    if (!search) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-amber-100 text-amber-900 rounded-xs px-0.5 font-medium">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-xs overflow-hidden" id="inventory-table-container">
      {/* Search & Filter Toolbar */}
      <div className="p-3 border-b border-slate-100 bg-slate-50/50 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md self-center">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索产品型号、批次、规格、货架、备注..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-4 py-0 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-sans"
              id="global-search-input"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-[11px] text-slate-400 hover:text-slate-600 font-sans"
                id="clear-search-btn"
              >
                清除
              </button>
            )}
          </div>

          {/* Pagination or Count display with page size select */}
          <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500 font-sans">
            <div className="flex items-center gap-1.5">
              <span>每页显示:</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  setPageSize(val === 'all' ? 'all' : Number(val));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-250 rounded-md px-1.5 py-0.5 text-[11px] text-slate-700 outline-hidden focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans cursor-pointer transition-all"
              >
                <option value={30}>30 条</option>
                <option value={50}>50 条</option>
                <option value={100}>100 条</option>
                <option value={200}>200 条</option>
                <option value="all">显示全部</option>
              </select>
            </div>
            <span className="font-mono bg-slate-100 px-2 py-0.5 rounded-md text-slate-600">
              第 {validCurrentPage}/{totalPages || 1} 页 (共 {totalItems} 项结果)
            </span>
          </div>
        </div>

        {/* Shelf Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100/50">
          <span className="text-[11px] font-semibold text-slate-500 mr-1 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            货架过滤:
          </span>
          <button
            onClick={() => setSelectedShelf(null)}
            className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
              selectedShelf === null
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            id="shelf-all-btn"
          >
            全部货架
          </button>
          {allShelves.map((shelf) => (
            <button
              key={shelf}
              onClick={() => setSelectedShelf(
                selectedShelf && normalizeShelfCode(selectedShelf) === shelf ? null : shelf,
              )}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-all ${
                selectedShelf && normalizeShelfCode(selectedShelf) === shelf
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              id={`shelf-filter-${shelf}`}
            >
              {shelf}
            </button>
          ))}
        </div>
      </div>

      {/* Main Excel-like Table Container with Horizontal Scroll */}
      <div className="overflow-x-auto no-scrollbar relative">
        <table className="w-full text-left border-collapse text-[11px] select-none">
          <thead>
            {/* Row 1: Main Headers & Daily Numbers */}
            <tr className="bg-slate-100/80 text-slate-700 font-sans border-b border-slate-200/60">
              <th className="py-1.5 px-1.5 font-semibold text-center sticky left-0 bg-slate-100 z-10 min-w-12 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                产品类型
              </th>
              <th className="py-1.5 px-2 font-semibold sticky left-12 bg-slate-100 z-10 min-w-32 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                产品型号
              </th>
              <th className="py-1.5 px-2 font-semibold sticky left-44 bg-slate-100 z-10 min-w-24 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                产品批次
              </th>
              <th className="py-1.5 px-2 font-semibold min-w-20">规格</th>
              <th className="py-1.5 px-1.5 font-semibold min-w-14 text-center">货架</th>
              <th className="py-1.5 px-1.5 font-semibold text-center bg-emerald-50/70 text-emerald-800 min-w-14">
                库存总数
              </th>
              <th className="py-1.5 px-1.5 font-semibold text-center min-w-14">入库数量</th>
              <th className="py-1.5 px-1.5 font-semibold text-center min-w-14">出库数量</th>
              <th className="py-1.5 px-2 font-semibold min-w-36">备注</th>
              
              {/* Day 1 to 31 headers spanning 2 columns each */}
              {ALL_DAYS.map((day) => (
                <th
                  key={day}
                  colSpan={2}
                  className="py-1 px-0.5 text-center font-semibold border-l border-slate-200 bg-slate-50 min-w-[52px] text-slate-600 text-[10px]"
                >
                  {day}号
                </th>
              ))}
            </tr>

            {/* Row 2: Inflow/Outflow Subheaders for Daily Columns */}
            <tr className="bg-slate-50/60 text-slate-500 font-mono border-b border-slate-200 text-[10px]">
              {/* Placeholders for first 9 columns */}
              <th className="p-0.5 sticky left-0 bg-slate-50/60 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></th>
              <th className="p-0.5 sticky left-12 bg-slate-50/60 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></th>
              <th className="p-0.5 sticky left-44 bg-slate-50/60 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]"></th>
              <th className="p-0.5"></th>
              <th className="p-0.5"></th>
              <th className="p-0.5 bg-emerald-50/30"></th>
              <th className="p-0.5"></th>
              <th className="p-0.5"></th>
              <th className="p-0.5"></th>
              
              {/* Sub-headers for Day 1 to 31 */}
              {ALL_DAYS.map((day) => (
                <Fragment key={`day-subheaders-${day}`}>
                  <th key={`day-${day}-in`} className="py-0.5 px-0.5 text-center font-normal border-l border-slate-200/60 text-emerald-600">
                    入
                  </th>
                  <th key={`day-${day}-out`} className="py-0.5 px-0.5 text-center font-normal text-rose-500">
                    出
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100 font-sans">
            {paginatedBatches.length > 0 ? (
              paginatedBatches.map((batch) => {
                const hasWarning = batch.remarks.length > 0;
                const isLowStock = batch.totalStock <= 5;

                return (
                  <tr
                    key={batch.id}
                    className={`hover:bg-slate-50/80 transition-colors group ${
                      batch.totalStock === 0 ? 'bg-slate-100/40 text-slate-400' : ''
                    }`}
                    id={`batch-row-${batch.batchCode}`}
                  >
                    {/* 1. 产品类型 */}
                    <td className="py-1 px-1.5 text-center font-mono font-medium text-slate-500 bg-white sticky left-0 z-10 group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {getProductType(batch)}
                    </td>

                    {/* 2. 产品型号 */}
                    <td className="py-1 px-1.5 font-mono font-semibold text-slate-800 bg-white sticky left-12 z-10 group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] whitespace-pre-line leading-tight">
                      {highlightText(batch.productModel, searchQuery)}
                    </td>

                    {/* 3. 产品批次 */}
                    <td className="py-1 px-1.5 font-mono font-semibold text-slate-800 bg-white sticky left-44 z-10 group-hover:bg-slate-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                      {highlightText(batch.batchCode, searchQuery)}
                    </td>

                    {/* 4. 规格 */}
                    <td className="py-1 px-1.5 font-mono text-slate-600">
                      {highlightText(batch.specification, searchQuery)}
                    </td>

                    {/* 5. 货架 */}
                    <td className="py-1 px-1 text-center">
                      <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono font-medium text-[10px] border border-slate-200/50">
                        {highlightText(batch.shelf, searchQuery)}
                      </span>
                    </td>

                    {/* 6. 库存总数 */}
                    <td className="py-1 px-1 text-center font-mono font-bold bg-emerald-50/40 text-emerald-800">
                      <span className={`px-1.5 py-0.2 rounded-full ${
                        batch.totalStock === 0 
                          ? 'bg-rose-100 text-rose-800' 
                          : isLowStock 
                            ? 'bg-amber-100 text-amber-800' 
                            : ''
                      }`}>
                        {batch.totalStock}
                      </span>
                    </td>

                    {/* 7. 入库数量 */}
                    <td className="py-1 px-1 text-center font-mono text-slate-600">
                      {batch.inflowQty}
                    </td>

                    {/* 8. 出库数量 */}
                    <td className="py-1 px-1 text-center font-mono text-slate-500">
                      {batch.outflowQty}
                    </td>

                    {/* 9. 备注 */}
                    <td className="py-1 px-1.5 text-slate-600 max-w-xs truncate text-[10px]">
                      <span
                        className={`truncate ${
                          hasWarning ? 'text-rose-600 font-medium' : 'text-slate-400 italic text-[10px]'
                        }`}
                      >
                        {hasWarning ? highlightText(batch.remarks, searchQuery) : '无备注'}
                      </span>
                    </td>

                    {/* Day 1 to 31 activity cells */}
                    {ALL_DAYS.map((day) => {
                      const activity = batch.dailyActivities.find((a) => a.day === day) || {
                        inQty: 0,
                        outQty: 0,
                      };
                      return (
                        <Fragment key={`day-activity-${batch.id}-${day}`}>
                          {/* Inflow Cell */}
                          <td
                            key={`cell-${batch.id}-${day}-in`}
                            className={`py-0.5 px-0.5 text-center font-mono border-l border-slate-200/50 text-[10px] ${
                              activity.inQty > 0 ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {activity.inQty > 0 ? `+${activity.inQty}` : '·'}
                          </td>
                          {/* Outflow Cell */}
                          <td
                            key={`cell-${batch.id}-${day}-out`}
                            className={`py-0.5 px-0.5 text-center font-mono text-[10px] ${
                              activity.outQty > 0 ? 'bg-rose-50 text-rose-800 font-semibold' : 'text-slate-200'
                            }`}
                          >
                            {activity.outQty > 0 ? `-${activity.outQty}` : '·'}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={70} className="py-8 text-center text-slate-400 bg-slate-50/30">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <HelpCircle className="w-6 h-6 text-slate-300" />
                    <p className="text-xs font-medium">没有找到符合筛选条件的批次</p>
                    <p className="text-[11px] text-slate-400">请尝试清除搜索或选择其他货架</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pageSize !== 'all' && totalPages > 1 && (
        <div className="py-2.5 px-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-slate-50/20 select-none">
          <div className="text-[11px] text-slate-500 text-center sm:text-left">
            显示第 <span className="font-semibold text-slate-700 font-mono">{(validCurrentPage - 1) * (pageSize as number) + 1}</span> 至{" "}
            <span className="font-semibold text-slate-700 font-mono">{Math.min(validCurrentPage * (pageSize as number), totalItems)}</span> 条记录，共{" "}
            <span className="font-semibold text-slate-700 font-mono">{totalItems}</span> 条
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={validCurrentPage === 1}
              className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
              id="table-prev-page-btn"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                // Only show first, last, and neighboring pages to keep it elegant
                return page === 1 || page === totalPages || Math.abs(page - validCurrentPage) <= 1;
              })
              .map((page, index, arr) => {
                const prev = arr[index - 1];
                const showEllipsis = prev && page - prev > 1;

                return (
                  <Fragment key={page}>
                    {showEllipsis && <span className="text-slate-400 px-1 text-[10px] font-mono select-none">...</span>}
                    <button
                      onClick={() => setCurrentPage(page)}
                      className={`min-w-[24px] h-6 px-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                        validCurrentPage === page
                          ? 'bg-emerald-600 text-white shadow-3xs'
                          : 'border border-slate-200 hover:bg-slate-100 text-slate-600 bg-white'
                      }`}
                    >
                      {page}
                    </button>
                  </Fragment>
                );
              })}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={validCurrentPage === totalPages}
              className="p-1 rounded-md border border-slate-200 hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:hover:bg-transparent transition-all cursor-pointer disabled:cursor-not-allowed"
              id="table-next-page-btn"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Legend & Instructions */}
      <div className="py-2 px-3 bg-slate-50 text-[10px] text-slate-500 flex gap-3 border-t border-slate-100">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-rose-100 border border-rose-200" />
          <span>库存为 0 (已出清)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-xs bg-amber-100 border border-amber-200" />
          <span>低库存报警 (≤5)</span>
        </div>
        <div className="ml-auto text-slate-400">
          基于标准《PL出入库统计规范》 | 呈现统计专版 (只读)
        </div>
      </div>
    </div>
  );
}
