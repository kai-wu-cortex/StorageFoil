import { useState, useMemo } from 'react';
import { InventoryBatch } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutGrid, Layers, Info, MapPin, Box, ArrowRight, Settings, Plus, Minus, RefreshCw } from 'lucide-react';
import { matchesInventorySearch } from '../lib/inventorySearch';
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

export default function ShelfVisualizer({
  batches,
  selectedShelf,
  onSelectShelf,
  onQuickTransaction,
  searchQuery = '',
  selectedWarningFilter = null,
  selectedStockLevelFilter = null,
}: ShelfVisualizerProps) {
  const [selectedCell, setSelectedCell] = useState<{ section: string; level: string } | null>(null);
  
  // Custom Map Editing states
  const [isEditingMap, setIsEditingMap] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const [rackId, setRackId] = useState(() => localStorage.getItem('pl_custom_rack_id') || '19');
  const [rackIdInput, setRackIdInput] = useState(rackId);

  const [sections, setSections] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem('pl_custom_sections');
      return val ? JSON.parse(val) : ['1', '2', '3', '4', '5'];
    } catch (e) {
      return ['1', '2', '3', '4', '5'];
    }
  });

  const [levels, setLevels] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem('pl_custom_levels');
      return val ? JSON.parse(val) : ['C', 'B', 'A'];
    } catch (e) {
      return ['C', 'B', 'A'];
    }
  });

  const [disabledCells, setDisabledCells] = useState<string[]>(() => {
    try {
      const val = localStorage.getItem('pl_custom_disabled_cells');
      return val ? JSON.parse(val) : [];
    } catch (e) {
      return [];
    }
  });

  // Pre-index batches by shelf code for O(1) cell lookup, eliminating redundant O(N) array traversals
  const batchesByShelf = useMemo(() => {
    const map: Record<string, InventoryBatch[]> = {};
    for (let i = 0; i < batches.length; i++) {
      const b = batches[i];
      if (!map[b.shelf]) {
        map[b.shelf] = [];
      }
      map[b.shelf].push(b);
    }
    return map;
  }, [batches]);

  // Calculate items at a specific cell
  const getCellBatches = (section: string, level: string) => {
    const shelfCode = `${rackId}-${section}${level}`;
    return batchesByShelf[shelfCode] || [];
  };

  const getCellTotalStock = (section: string, level: string) => {
    const cellBatches = getCellBatches(section, level);
    return cellBatches.reduce((sum, b) => sum + b.totalStock, 0);
  };

  const isCellMatchingFilters = (section: string, level: string) => {
    const cellBatches = getCellBatches(section, level);
    if (cellBatches.length === 0) return false;

    // If no filters are active, it matches by default (if it's not empty)
    if (!searchQuery && !selectedWarningFilter && !selectedStockLevelFilter) {
      return true;
    }

    return cellBatches.some((b) => {
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

      return matchesSearch && matchesWarning && matchesStockLevel;
    });
  };

  const activeCellCode = selectedCell ? `${rackId}-${selectedCell.section}${selectedCell.level}` : null;
  const activeBatches = selectedCell ? getCellBatches(selectedCell.section, selectedCell.level) : [];

  const handleCellClick = (section: string, level: string) => {
    const shelfCode = `${rackId}-${section}${level}`;

    if (isEditingMap) {
      toggleCellDisabled(shelfCode);
      return;
    }

    if (selectedCell && selectedCell.section === section && selectedCell.level === level) {
      // Toggle off
      setSelectedCell(null);
      onSelectShelf(null);
    } else {
      setSelectedCell({ section, level });
      onSelectShelf(shelfCode);
    }
  };

  const toggleCellDisabled = (shelfCode: string) => {
    let updated: string[];
    if (disabledCells.includes(shelfCode)) {
      updated = disabledCells.filter((c) => c !== shelfCode);
    } else {
      updated = [...disabledCells, shelfCode];
      // If the currently selected shelf is disabled, clear the selection
      if (selectedShelf === shelfCode) {
        setSelectedCell(null);
        onSelectShelf(null);
      }
    }
    setDisabledCells(updated);
    localStorage.setItem('pl_custom_disabled_cells', JSON.stringify(updated));
  };

  const handleSaveRackId = () => {
    const clean = rackIdInput.trim();
    if (clean) {
      setRackId(clean);
      localStorage.setItem('pl_custom_rack_id', clean);
    } else {
      setRackIdInput(rackId);
    }
  };

  const handleAddSection = () => {
    const currentLast = sections[sections.length - 1];
    let nextSection = '1';
    if (currentLast) {
      const num = parseInt(currentLast, 10);
      if (!isNaN(num)) {
        nextSection = (num + 1).toString();
      } else {
        const charCode = currentLast.charCodeAt(0);
        nextSection = String.fromCharCode(charCode + 1);
      }
    }
    const updated = [...sections, nextSection];
    setSections(updated);
    localStorage.setItem('pl_custom_sections', JSON.stringify(updated));
  };

  const handleRemoveSection = () => {
    if (sections.length <= 1) return;
    const updated = sections.slice(0, -1);
    setSections(updated);
    localStorage.setItem('pl_custom_sections', JSON.stringify(updated));
  };

  const handleAddLevel = () => {
    const currentTop = levels[0];
    let nextLevel = 'A';
    if (currentTop) {
      const charCode = currentTop.charCodeAt(0);
      nextLevel = String.fromCharCode(charCode + 1);
    }
    const updated = [nextLevel, ...levels];
    setLevels(updated);
    localStorage.setItem('pl_custom_levels', JSON.stringify(updated));
  };

  const handleRemoveLevel = () => {
    if (levels.length <= 1) return;
    const updated = levels.slice(1);
    setLevels(updated);
    localStorage.setItem('pl_custom_levels', JSON.stringify(updated));
  };

  const handleResetConfig = () => {
    setRackId('19');
    setRackIdInput('19');
    setSections(['1', '2', '3', '4', '5']);
    setLevels(['C', 'B', 'A']);
    setDisabledCells([]);
    setSelectedCell(null);
    onSelectShelf(null);
    localStorage.removeItem('pl_custom_rack_id');
    localStorage.removeItem('pl_custom_sections');
    localStorage.removeItem('pl_custom_levels');
    localStorage.removeItem('pl_custom_disabled_cells');
    setShowResetConfirm(false);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" id="shelf-visualizer-section">
      {/* Visual Layout Map */}
      <div className="lg:col-span-2 bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutGrid className="w-4 h-4 text-emerald-600" />
            <div>
              <h3 className="text-xs font-semibold text-slate-800 font-sans">{rackId}号货架平面看板</h3>
              <p className="text-[10px] text-slate-500">点击特定货架格点（如 {rackId}-3A），即刻在右侧透视在库产品明细</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-150 rounded text-[10px] font-medium text-slate-600 font-mono">
              <MapPin className="w-3 h-3 text-slate-500" />
              {rackId}号货架
            </div>
            
            <button
              onClick={() => setIsEditingMap(!isEditingMap)}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                isEditingMap
                  ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
              id="toggle-map-editing-btn"
            >
              <Settings className="w-3 h-3" />
              {isEditingMap ? '完成编辑' : '自定义地图'}
            </button>
          </div>
        </div>

        {/* Custom Map Editing Panel */}
        {isEditingMap && (
          <div className="p-3 bg-indigo-550/5 border border-indigo-150 rounded-lg space-y-2.5 text-xs animate-fade-in" id="map-custom-panel">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-indigo-900 flex items-center gap-1">
                <Settings className="w-3.5 h-3.5 text-indigo-600" />
                货架地图自定义面板
              </span>
              
              {showResetConfirm ? (
                <div className="flex items-center gap-1.5 bg-white px-2 py-0.5 rounded border border-rose-150 shadow-2xs">
                  <span className="text-[10px] text-rose-600 font-medium">确认重置?</span>
                  <button
                    onClick={handleResetConfig}
                    className="px-1.5 py-0.2 bg-rose-600 hover:bg-rose-700 text-white rounded text-[9px] font-semibold"
                  >
                    确定
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-1.5 py-0.2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-semibold"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-white hover:bg-slate-50 border border-slate-200 rounded text-[10px] font-medium text-slate-500 transition-colors"
                  title="恢复初始19号货架布局"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  重置默认布局
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 1. Rack Name/ID */}
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">货架主代号 (当前: {rackId})</label>
                <input
                  type="text"
                  value={rackIdInput}
                  onChange={(e) => setRackIdInput(e.target.value)}
                  onBlur={handleSaveRackId}
                  placeholder="如: 19"
                  className="w-full px-2 py-1 bg-white border border-slate-250 rounded font-mono text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* 2. Columns / Sections */}
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  纵排 (列数) (当前: {sections.length}列)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRemoveSection}
                    disabled={sections.length <= 1}
                    className="px-2 py-1 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-250 rounded text-xs font-bold disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-mono font-semibold bg-white py-1 border border-slate-200 rounded text-slate-700 text-[11px] truncate">
                    {sections.join(', ')}
                  </span>
                  <button
                    onClick={handleAddSection}
                    className="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-600 border border-slate-250 rounded text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* 3. Rows / Levels */}
              <div className="space-y-1">
                <label className="block text-[10px] font-medium text-slate-500">
                  高度 (层数) (当前: {levels.length}层)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleRemoveLevel}
                    disabled={levels.length <= 1}
                    className="px-2 py-1 bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-250 rounded text-xs font-bold disabled:opacity-50"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-mono font-semibold bg-white py-1 border border-slate-200 rounded text-slate-700 text-[11px] truncate">
                    {levels.join(', ')}
                  </span>
                  <button
                    onClick={handleAddLevel}
                    className="px-2 py-1 bg-white hover:bg-emerald-50 hover:text-emerald-600 border border-slate-250 rounded text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 bg-slate-50/50 p-1.5 rounded border border-slate-150">
              💡 <span className="font-semibold text-slate-700">阻断/屏蔽特定格子</span>: 
              在下方图表中，直接点击任意单元格，可使其变成 <span className="text-rose-600 font-semibold">"隐藏空白"</span> 状态或恢复使用（适合仓库内因物理支柱等原因空出的异型空间）。
            </div>
          </div>
        )}

        {/* 2D Shelf Grid Map */}
        <div className="pt-1">
          {/* Vertical Grid representing level stack */}
          <div className="space-y-2.5">
            {levels.map((level) => (
              <div key={level} className="flex items-center gap-2.5">
                {/* Y-Axis Level Label */}
                <div className="w-6 flex items-center justify-center font-mono font-bold text-slate-500 text-[11px] bg-slate-100/80 rounded py-2 border border-slate-150">
                  {level}
                </div>

                {/* Section Columns - Dynamic Grid based on section count */}
                <div 
                  className="grid gap-2.5 flex-1"
                  style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
                >
                  {sections.map((section) => {
                    const shelfCode = `${rackId}-${section}${level}`;
                    const isCellDisabled = disabledCells.includes(shelfCode);
                    const cellTotal = getCellTotalStock(section, level);
                    const cellBatches = getCellBatches(section, level);
                    const cellCount = cellBatches.length;
                    const isSelected = selectedShelf === shelfCode;
                    
                    // Render completely blank space in standard mode if cell is blocked
                    if (isCellDisabled && !isEditingMap) {
                      return (
                        <div
                          key={section}
                          className="rounded-lg border border-transparent bg-transparent min-h-[64px]"
                          title={`${shelfCode} (已阻断)`}
                        />
                      );
                    }

                    // Render blocked/disabled indicator in editing mode
                    if (isCellDisabled && isEditingMap) {
                      return (
                        <button
                          key={section}
                          onClick={() => handleCellClick(section, level)}
                          className="p-2 rounded-lg border border-dashed border-rose-300 bg-rose-50/20 text-rose-400 hover:bg-rose-50 hover:border-rose-400 text-center transition-all cursor-pointer flex flex-col justify-center items-center min-h-[64px]"
                          title="点击启用该架位"
                          id={`grid-cell-${shelfCode}`}
                        >
                          <span className="font-mono text-[9px] font-bold block opacity-75">
                            {shelfCode}
                          </span>
                          <span className="text-[9px] mt-0.5 font-medium text-rose-500 bg-rose-100/50 px-1 rounded">已屏蔽</span>
                        </button>
                      );
                    }

                    const hasActiveFilter = !!(searchQuery || selectedWarningFilter || selectedStockLevelFilter);
                    const isMatching = isCellMatchingFilters(section, level);

                    // Colors based on occupation
                    let cellBg = 'bg-slate-50/60 hover:bg-slate-100 text-slate-400 border-slate-200/50';
                    let badgeBg = 'bg-slate-200/60 text-slate-600';

                    if (cellTotal > 0) {
                      if (hasActiveFilter && !isMatching) {
                        cellBg = 'bg-slate-100/40 text-slate-300 border-slate-200/40 opacity-30';
                      } else {
                        const isMatchHighlight = hasActiveFilter && isMatching;
                        if (cellTotal > 50) {
                          cellBg = isSelected
                            ? 'bg-emerald-700 text-white border-emerald-800 ring-2 ring-emerald-500/20'
                            : isMatchHighlight
                            ? 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border-emerald-400 ring-2 ring-emerald-500/50 animate-pulse'
                            : 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border-emerald-200/60';
                          badgeBg = isSelected ? 'bg-emerald-400 text-white' : 'bg-emerald-200/70 text-emerald-800';
                        } else {
                          cellBg = isSelected
                            ? 'bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-500/20'
                            : isMatchHighlight
                            ? 'bg-emerald-50/70 hover:bg-emerald-100/60 text-emerald-700 border-emerald-400 ring-2 ring-emerald-500/50 animate-pulse'
                            : 'bg-emerald-50/70 hover:bg-emerald-100/60 text-emerald-700 border-emerald-200/40';
                          badgeBg = isSelected ? 'bg-emerald-400 text-white' : 'bg-emerald-100 text-emerald-700';
                        }
                      }
                    } else {
                      if (isSelected) {
                        cellBg = 'bg-slate-800 text-white border-slate-900 ring-2 ring-slate-800/10';
                        badgeBg = 'bg-slate-700 text-white';
                      } else if (hasActiveFilter) {
                        cellBg = 'bg-slate-100/30 text-slate-300 border-slate-150/30 opacity-20';
                      }
                    }

                    return (
                      <button
                        key={section}
                        onClick={() => handleCellClick(section, level)}
                        className={`p-2 rounded-lg border text-center transition-all cursor-pointer flex flex-col justify-between items-center min-h-[64px] ${cellBg}`}
                        id={`grid-cell-${shelfCode}`}
                      >
                        <span className="font-mono text-[10px] font-bold block opacity-90">
                          {shelfCode}
                        </span>
                        
                        <div className="my-1">
                          {cellTotal > 0 ? (
                            <div className="flex flex-col items-center">
                              <span className="text-sm font-bold font-display tracking-tight leading-none">
                                {cellTotal}
                              </span>
                              <span className="text-[9px] opacity-75 mt-0.5">{cellCount}批</span>
                            </div>
                          ) : (
                            <span className="text-[9px] italic opacity-60">空置</span>
                          )}
                        </div>

                        {/* Visual block dots */}
                        {cellTotal > 0 && (
                          <div className="flex gap-0.5 items-center justify-center h-1">
                            {Array.from({ length: Math.min(cellCount, 4) }).map((_, idx) => (
                              <span
                                key={idx}
                                className={`w-1 h-1 rounded-full ${
                                  isSelected ? 'bg-white' : 'bg-emerald-500'
                                }`}
                              />
                            ))}
                            {cellCount > 4 && <span className="text-[8px] leading-none">+</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* X-Axis Section Labels - Dynamic grid */}
            <div className="flex items-center gap-2.5">
              <div className="w-6" /> {/* offset */}
              <div 
                className="grid gap-2.5 flex-1 text-center font-mono font-bold text-[10px] text-slate-500"
                style={{ gridTemplateColumns: `repeat(${sections.length}, minmax(0, 1fr))` }}
              >
                {sections.map((section) => (
                  <div key={section} className="py-0.5 bg-slate-50 border border-slate-200/50 rounded">
                    {section}号
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-slate-50 border border-slate-200" />
            <span>空置</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-50 border border-emerald-200" />
            <span>有库存 (≤50卷)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-100 border border-emerald-300" />
            <span>高负荷 (&gt;50卷)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 border border-emerald-700" />
            <span>选中</span>
          </div>
          {disabledCells.length > 0 && (
            <div className="flex items-center gap-1 ml-auto">
              <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-rose-300 bg-rose-50/20" />
              <span>有 {disabledCells.length} 个架位已屏蔽</span>
            </div>
          )}
        </div>
      </div>

      {/* Side Detail Panel */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-xs flex flex-col h-[480px] lg:h-full justify-between min-h-[380px] overflow-hidden" id="shelf-detail-panel">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-semibold text-slate-800 font-sans">
              {activeCellCode ? `架位 ${activeCellCode} 明细` : '架位产品透视'}
            </h3>
          </div>

          <AnimatePresence mode="wait">
            {activeCellCode ? (
              <motion.div
                key={activeCellCode}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col flex-1 min-h-0 space-y-3"
              >
                {activeBatches.length > 0 ? (
                  <div className="space-y-2.5 overflow-y-auto pr-1 pb-4 no-scrollbar flex-1 min-h-0">
                    {activeBatches.map((batch) => (
                      <div
                        key={batch.id}
                        className="p-2.5 bg-slate-50 rounded-lg border border-slate-150 flex flex-col justify-between gap-2 hover:border-indigo-200 hover:shadow-2xs transition-all"
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
                          <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 border border-emerald-100 rounded">
                            {batch.totalStock} 支
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                          <span>规格: {batch.specification}</span>
                          <span className="text-[9px] text-slate-400">入 {batch.inflowQty} | 出 {batch.outflowQty}</span>
                        </div>

                        {batch.remarks && (
                          <div className="text-[10px] text-rose-600 font-medium bg-rose-50/50 p-1 rounded border border-rose-100/50 truncate" title={batch.remarks}>
                            异常: {batch.remarks}
                          </div>
                        )}

                        {/* Read-only layout indicator */}
                        <div className="pt-1 border-t border-slate-150/30 flex items-center justify-between text-[10px] text-slate-400">
                          <span>存放位置: <span className="font-semibold text-slate-600">{batch.shelf}</span></span>
                          <span className="font-mono text-[9px]">已登记状态</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center gap-1.5">
                    <Box className="w-6 h-6 text-slate-300" />
                    <p className="text-[11px] font-medium">该架位当前为空置状态</p>
                    <p className="text-[10px] text-slate-400">当前没有分配在此层位的纸箱或批次</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="empty-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/30 flex flex-col items-center justify-center gap-2"
              >
                <div className="p-2 bg-slate-100 rounded-full text-slate-400">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-slate-700">未选择具体架位</p>
                  <p className="text-[10px] text-slate-400 mt-1 max-w-[180px] mx-auto">
                    请在左边大图点击任一彩色货架，在此查看实时存储的产品详情
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeCellCode && (
          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>当前筛选: {activeCellCode}</span>
            <button
              onClick={() => {
                setSelectedCell(null);
                onSelectShelf(null);
              }}
              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5"
              id="clear-shelf-detail-btn"
            >
              清除选择 <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
