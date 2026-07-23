import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Box, Layers, LayoutGrid, MapPin } from 'lucide-react';
import type { InventoryBatch } from '../types';
import { matchesInventorySearch } from '../lib/inventorySearch';
import {
  indexBatchesByShelf,
  normalizeShelfCode,
  WAREHOUSE_BAYS,
  WAREHOUSE_LEVELS,
  WAREHOUSE_RACK_GROUPS,
} from '../lib/shelfMap';
import { matchesWarningFilter } from '../lib/warningFilters';
import BatchIdentity from './BatchIdentity';

interface ShelfVisualizerProps {
  batches: InventoryBatch[];
  selectedShelf: string | null;
  onSelectShelf: (shelf: string | null) => void;
  onQuickTransaction: (batch: InventoryBatch, type: 'in' | 'out') => void;
  searchQuery?: string;
  selectedWarningFilter?: string | null;
  selectedStockLevelFilter?: 'low' | 'high' | 'in_stock' | null;
}

const RACK_NAMES: Record<number, string> = {
  4: '第四排',
  5: '第五排',
  6: '第六排',
  7: '第七排',
  8: '第八排',
  9: '第九排',
  10: '第十排',
  11: '第十一排',
  12: '第十二排',
  13: '第十三排',
  14: '第十四排',
  15: '第十五排',
  16: '第十六排',
  17: '第十七排',
  18: '第十八排',
  19: '第十九排',
  20: '第二十排',
  21: '第二十一排',
  22: '第二十二排',
};

const RACK_SERIES: Partial<Record<number, string>> = {
  4: 'PC系列（杂色）',
  5: 'PC系列（银色）',
  6: 'PC系列（金色）',
  7: 'PC系列（金色）',
  8: 'PK系列（银色）',
  9: 'PK系列（杂色）',
  10: 'PK系列（黑色金色）',
  11: 'PK系列（金色）',
  12: 'PK系列（哑金）',
  13: '粉箔系列（亮白）',
  14: '粉箔系列（哑白）',
  15: '粉箔系列（杂色）',
  16: '粉箔系列（杂色）',
};

function matchesStockFilter(
  batch: InventoryBatch,
  selectedStockLevelFilter: ShelfVisualizerProps['selectedStockLevelFilter'],
): boolean {
  if (selectedStockLevelFilter === 'low') {
    return batch.totalStock > 0 && batch.totalStock <= 5;
  }
  if (selectedStockLevelFilter === 'high') return batch.totalStock > 50;
  if (selectedStockLevelFilter === 'in_stock') return batch.totalStock > 0;
  return true;
}

export default function ShelfVisualizer({
  batches,
  selectedShelf,
  onSelectShelf,
  searchQuery = '',
  selectedWarningFilter = null,
  selectedStockLevelFilter = null,
}: ShelfVisualizerProps) {
  const indexed = useMemo(() => indexBatchesByShelf(batches), [batches]);
  const selectedCode = selectedShelf ? normalizeShelfCode(selectedShelf) : null;
  const activeBatches = selectedCode ? indexed.byShelf.get(selectedCode) ?? [] : [];

  const hasActiveFilter = Boolean(
    searchQuery || selectedWarningFilter || selectedStockLevelFilter,
  );

  const batchMatchesFilters = (batch: InventoryBatch): boolean => (
    matchesInventorySearch(batch, searchQuery)
    && matchesWarningFilter(batch, selectedWarningFilter)
    && matchesStockFilter(batch, selectedStockLevelFilter)
  );

  const getCellState = (shelfCode: string) => {
    const cellBatches = indexed.byShelf.get(shelfCode) ?? [];
    return {
      batches: cellBatches,
      totalStock: cellBatches.reduce((sum, batch) => sum + batch.totalStock, 0),
      matchesFilter: !hasActiveFilter || cellBatches.some(batchMatchesFilters),
    };
  };

  const handleShelfClick = (shelfCode: string) => {
    onSelectShelf(selectedCode === shelfCode ? null : shelfCode);
  };

  const unmappedByShelf = useMemo(() => {
    const codes = new Map<string, InventoryBatch[]>();
    for (const batch of indexed.unmapped) {
      const code = normalizeShelfCode(batch.shelf);
      const current = codes.get(code) ?? [];
      current.push(batch);
      codes.set(code, current);
    }
    return [...codes.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'));
  }, [indexed.unmapped]);

  return (
    <div className="space-y-4" id="shelf-visualizer-section">
      <section className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-emerald-600" />
            <div>
              <h3 className="text-xs font-semibold text-slate-800">仓库货架平面地图</h3>
              <p className="text-[10px] text-slate-500">
                按仓库实际排位展示；点击任意货位查看对应产品明细
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 border border-slate-300 bg-[#dce5f4]" /> 空置
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 border border-emerald-300 bg-emerald-50" /> 有库存
            </span>
            <span className="flex items-center gap-1">
              <i className="h-2.5 w-2.5 border border-emerald-800 bg-emerald-700" /> 已选中
            </span>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-50/60 pb-2" data-testid="warehouse-map-scroll">
          <div className="min-w-max p-4">
            <div className="flex items-stretch gap-4">
              {WAREHOUSE_RACK_GROUPS.map((group, groupIndex) => (
                <div className="flex items-stretch gap-3" key={group.racks.join('-')}>
                  <div className="flex items-stretch gap-px">
                    {group.racks.map(rack => (
                      <div className="w-[84px]" key={rack} data-rack={rack}>
                        <div className="grid grid-cols-3 gap-px border border-slate-500 bg-slate-500">
                          {WAREHOUSE_BAYS.flatMap(bay => (
                            WAREHOUSE_LEVELS.map(level => {
                              const shelfCode = `${rack}-${bay}${level}`;
                              const state = getCellState(shelfCode);
                              const isSelected = selectedCode === shelfCode;
                              const isMuted = hasActiveFilter && !state.matchesFilter;
                              const occupied = state.totalStock > 0;
                              const cellClass = isSelected
                                ? 'bg-emerald-700 text-white'
                                : occupied
                                  ? 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                  : 'bg-[#dce5f4] text-slate-600 hover:bg-[#cfdaec]';

                              return (
                                <button
                                  type="button"
                                  key={shelfCode}
                                  id={`warehouse-cell-${shelfCode}`}
                                  aria-label={`${shelfCode}，${occupied ? `${state.totalStock}支，${state.batches.length}批` : '空置'}`}
                                  onClick={() => handleShelfClick(shelfCode)}
                                  title={`${shelfCode} · ${occupied ? `${state.totalStock}支 / ${state.batches.length}批` : '空置'}`}
                                  className={`flex h-12 min-w-0 items-center justify-center px-0.5 font-mono transition-colors ${cellClass} ${
                                    isMuted ? 'opacity-20' : ''
                                  }`}
                                >
                                  <span className="text-[8px] font-bold leading-none">{shelfCode}</span>
                                </button>
                              );
                            })
                          ))}
                        </div>
                        <div className="flex h-12 flex-col items-center justify-center border-x border-b border-slate-500 bg-[#dce5f4] px-1 text-center">
                          <span className="text-[10px] font-semibold text-slate-800">
                            {RACK_NAMES[rack]}
                          </span>
                          {RACK_SERIES[rack] && (
                            <span className="mt-0.5 text-[8px] text-slate-600">
                              {RACK_SERIES[rack]}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {group.obstacleAfter === 'pallets' && (
                    <div className="flex gap-2" aria-label="卡板区">
                      {['卡板2', '卡板1'].map(label => (
                        <div
                          key={`${groupIndex}-${label}`}
                          className="flex w-12 items-center justify-center border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-600 [writing-mode:vertical-rl]"
                        >
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-9 items-center justify-center bg-slate-300 text-sm font-semibold tracking-[0.45em] text-slate-700">
              过道
            </div>
          </div>
        </div>

        {unmappedByShelf.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <MapPin className="h-3 w-3 text-amber-500" />
              图外货位（地图未定义，但数据完整保留）
            </div>
            <div className="flex flex-wrap gap-1.5">
              {unmappedByShelf.map(([shelfCode, shelfBatches]) => {
                const total = shelfBatches.reduce((sum, batch) => sum + batch.totalStock, 0);
                const isSelected = selectedCode === shelfCode;
                return (
                  <button
                    type="button"
                    key={shelfCode}
                    onClick={() => handleShelfClick(shelfCode)}
                    className={`rounded-md border px-2 py-1 font-mono text-[9px] transition-colors ${
                      isSelected
                        ? 'border-amber-700 bg-amber-600 text-white'
                        : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                    }`}
                  >
                    {shelfCode} · {total}支
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section className="min-h-[260px] rounded-xl border border-slate-100 bg-white p-4 shadow-xs" id="shelf-detail-panel">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-600" />
          <h3 className="text-xs font-semibold text-slate-800">
            {selectedCode ? `架位 ${selectedCode} 明细` : '架位产品透视'}
          </h3>
        </div>

        <AnimatePresence mode="wait">
          {selectedCode ? (
            <motion.div
              key={selectedCode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
            >
              {activeBatches.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {activeBatches.map(batch => (
                    <div
                      key={batch.id}
                      className="flex flex-col justify-between gap-2 rounded-lg border border-slate-150 bg-slate-50 p-2.5 transition-all hover:border-indigo-200 hover:shadow-2xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <BatchIdentity
                          productModel={batch.productModel}
                          batchCode={batch.batchCode}
                          className="min-w-0 flex-1"
                          itemClassName="min-w-0"
                          labelClassName="block text-[8px] font-semibold text-slate-400"
                          valueClassName="mt-0.5 break-words font-mono text-[10px] font-bold leading-tight text-slate-800"
                        />
                        <span className="rounded border border-emerald-100 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                          {batch.totalStock} 支
                        </span>
                      </div>

                      <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                        <span>规格: {batch.specification}</span>
                        <span className="text-[9px] text-slate-400">
                          入 {batch.inflowQty} | 出 {batch.outflowQty}
                        </span>
                      </div>

                      {batch.remarks && (
                        <div
                          className="truncate rounded border border-rose-100/50 bg-rose-50/50 p-1 text-[10px] font-medium text-rose-600"
                          title={batch.remarks}
                        >
                          异常: {batch.remarks}
                        </div>
                      )}

                      <div className="flex items-center justify-between border-t border-slate-200/50 pt-1 text-[10px] text-slate-400">
                        <span>
                          原始位置:
                          <span className="ml-1 font-semibold text-slate-600">{batch.shelf}</span>
                        </span>
                        <span className="font-mono text-[9px]">映射至 {selectedCode}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/30 text-center text-slate-400">
                  <Box className="h-6 w-6 text-slate-300" />
                  <p className="text-[11px] font-medium">该架位当前为空置状态</p>
                </div>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                <span>当前筛选: {selectedCode}</span>
                <button
                  type="button"
                  onClick={() => onSelectShelf(null)}
                  className="flex items-center gap-0.5 font-semibold text-indigo-600 hover:text-indigo-800"
                  id="clear-shelf-detail-btn"
                >
                  清除选择 <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="empty-state"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/30 text-center text-slate-400"
            >
              <div className="rounded-full bg-slate-100 p-2 text-slate-400">
                <Box className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-700">未选择具体架位</p>
                <p className="mt-1 text-[10px] text-slate-400">
                  请在仓库地图点击任一货位查看产品详情
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
