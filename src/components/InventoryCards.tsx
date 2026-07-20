import { Fragment, useState } from 'react';
import { InventoryBatch } from '../types';
import { 
  MapPin, 
  Ruler, 
  AlertTriangle, 
  ArrowUpRight, 
  ArrowDownRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  Inbox,
  LayoutGrid,
  Scaling,
  Columns,
  Maximize2,
  Minimize2,
  List
} from 'lucide-react';

interface InventoryCardsProps {
  batches: InventoryBatch[];
  searchQuery: string;
}

export default function InventoryCards({ batches, searchQuery }: InventoryCardsProps) {
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [cols, setCols] = useState<'auto' | '2' | '3' | '4' | '5'>('auto');
  const [density, setDensity] = useState<'compact' | 'standard' | 'spacious'>('standard');
  const [visibleLimit, setVisibleLimit] = useState<number>(24);

  // Reset pagination when batches change (e.g., filtering or changing sheets)
  const prevBatchesLengthRef = useState(batches.length);
  if (prevBatchesLengthRef[0] !== batches.length) {
    prevBatchesLengthRef[1](batches.length);
    setVisibleLimit(24);
  }

  // Function to highlight search matches
  const highlightText = (text: string, search: string) => {
    if (!search) return <span>{text}</span>;
    const parts = text.split(new RegExp(`(${search})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <mark key={i} className="bg-amber-100 text-amber-900 rounded-xs px-0.5 font-semibold">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const toggleExpand = (batchId: string) => {
    setExpandedBatchId(expandedBatchId === batchId ? null : batchId);
  };

  // Get grid columns class
  const getGridColsClass = () => {
    switch (cols) {
      case '2':
        return 'grid-cols-1 sm:grid-cols-2';
      case '3':
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case '4':
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
      case '5':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5';
      case 'auto':
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
    }
  };

  // Get density based styling classes
  const getDensityClasses = () => {
    switch (density) {
      case 'compact':
        return {
          cardPad: 'p-3.5 space-y-2.5',
          modelBadge: 'text-[9px] px-1.5 py-0.5 rounded-sm',
          statusBadge: 'text-[9px] px-1.5 py-0.5',
          titleLabel: 'text-[8px]',
          titleVal: 'text-sm font-bold',
          gridBox: 'gap-2 py-1.5 px-2 rounded-lg',
          gridLabel: 'text-[8px]',
          gridVal: 'text-[10px]',
          gridIcon: 'w-3 h-3',
          stockLabel: 'text-[8px]',
          stockVal: 'text-xl',
          stockUnit: 'text-[10px]',
          stockLog: 'text-[8px]',
          remarksBox: 'p-2 rounded-lg gap-1',
          remarksTitle: 'text-[8px]',
          remarksText: 'text-[10px]',
          footerPad: 'p-2',
          footerBtn: 'text-[9px] py-1 px-1.5',
          footerIcon: 'w-2.5 h-2.5',
          timelineBox: 'mt-1.5 pt-1.5 space-y-1',
          timelineItem: 'p-1 rounded-md text-[9px]'
        };
      case 'spacious':
        return {
          cardPad: 'p-6 space-y-5',
          modelBadge: 'text-[11px] px-2.5 py-1 rounded-md',
          statusBadge: 'text-[11px] px-3 py-1',
          titleLabel: 'text-[11px]',
          titleVal: 'text-lg font-black',
          gridBox: 'gap-4 py-3 px-4 rounded-2xl',
          gridLabel: 'text-[10px]',
          gridVal: 'text-xs',
          gridIcon: 'w-4 h-4',
          stockLabel: 'text-[11px]',
          stockVal: 'text-3xl',
          stockUnit: 'text-sm',
          stockLog: 'text-[10px]',
          remarksBox: 'p-3 rounded-2xl gap-2',
          remarksTitle: 'text-[10px]',
          remarksText: 'text-xs',
          footerPad: 'p-3.5',
          footerBtn: 'text-[11px] py-1.5 px-3',
          footerIcon: 'w-3.5 h-3.5',
          timelineBox: 'mt-3.5 pt-3.5 border-t border-slate-100 space-y-2',
          timelineItem: 'p-2.5 rounded-xl text-xs'
        };
      case 'standard':
      default:
        return {
          cardPad: 'p-4.5 space-y-3.5',
          modelBadge: 'text-[10px] px-2 py-0.5 rounded-md border border-slate-200/50',
          statusBadge: 'text-[10px] px-2.5 py-0.5',
          titleLabel: 'text-[10px]',
          titleVal: 'text-base font-extrabold',
          gridBox: 'grid grid-cols-2 gap-3 py-2 px-3 bg-slate-50 rounded-xl border border-slate-100/50',
          gridLabel: 'text-[9px]',
          gridVal: 'text-[11px]',
          gridIcon: 'w-3.5 h-3.5',
          stockLabel: 'text-[10px]',
          stockVal: 'text-2xl',
          stockUnit: 'text-xs',
          stockLog: 'text-[9px]',
          remarksBox: 'p-2.5 rounded-xl bg-rose-50/50 border border-rose-100/50 flex gap-1.5 items-start',
          remarksTitle: 'text-[9px]',
          remarksText: 'text-[11px]',
          footerPad: 'border-t border-slate-100 bg-slate-50/40 p-2.5',
          footerBtn: 'w-full py-1 px-2 rounded-lg hover:bg-slate-100/60 transition-colors flex items-center justify-between text-[10px] font-semibold text-slate-500',
          footerIcon: 'w-3 h-3',
          timelineBox: 'mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5 px-1',
          timelineItem: 'flex items-center justify-between p-1.5 rounded-lg bg-white border border-slate-100 shadow-3xs text-[10px] font-mono'
        };
    }
  };

  const style = getDensityClasses();

  return (
    <div className="space-y-4 font-sans" id="inventory-cards-container">
      {/* Visual Density and Grid Customizer Controls */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-3xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Row count control */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
            <LayoutGrid className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>每行卡片数量</span>
          </div>
          <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-150 overflow-x-auto scrollbar-none w-full sm:w-auto">
            {([
              { value: 'auto', label: '自适应' },
              { value: '2', label: '2列' },
              { value: '3', label: '3列' },
              { value: '4', label: '4列' },
              { value: '5', label: '5列' }
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCols(opt.value)}
                className={`flex-1 sm:flex-none px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap flex-shrink-0 text-center ${
                  cols === opt.value
                    ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/40'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Card Size Density Control */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-slate-100/80">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
            <Scaling className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>卡片显示尺寸</span>
          </div>
          <div className="flex items-center bg-slate-50 p-1 rounded-xl border border-slate-150 overflow-x-auto scrollbar-none w-full sm:w-auto">
            {([
              { value: 'compact', label: '紧凑', icon: Minimize2 },
              { value: 'standard', label: '常规', icon: List },
              { value: 'spacious', label: '宽敞', icon: Maximize2 }
            ] as const).map((opt) => {
              const IconComp = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setDensity(opt.value)}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-1 px-3 py-1 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap flex-shrink-0 text-center ${
                    density === opt.value
                      ? 'bg-white text-slate-800 shadow-3xs border border-slate-200/40'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <IconComp className="w-3 h-3" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      {batches.length > 0 ? (
        <div className="space-y-6">
          <div className={`grid ${getGridColsClass()} gap-4`}>
            {batches.slice(0, visibleLimit).map((batch) => {
              const hasRemarks = batch.remarks.length > 0;
              const isLowStock = batch.totalStock > 0 && batch.totalStock <= 5;
              const isZeroStock = batch.totalStock === 0;
              const isExpanded = expandedBatchId === batch.id;

              // Extract days with actual activities to show as a timeline
              const activeDays = batch.dailyActivities.filter(
                (a) => a.inQty > 0 || a.outQty > 0
              );

              return (
                <div
                  key={batch.id}
                  className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden flex flex-col justify-between ${
                    isZeroStock
                      ? 'border-slate-200 bg-slate-50/40 text-slate-500 shadow-3xs'
                      : isLowStock
                        ? 'border-amber-200/80 shadow-xs hover:shadow-md hover:border-amber-300'
                        : 'border-slate-100 shadow-xs hover:shadow-md hover:border-emerald-200'
                  }`}
                  id={`inventory-card-${batch.batchCode}`}
                >
                  {/* Card Upper Segment */}
                  <div className={style.cardPad}>
                    {/* Badge & Model */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 font-mono font-bold text-slate-500 bg-slate-100 border border-slate-200/50 ${style.modelBadge}`}>
                        型号: {batch.productModel}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-bold rounded-full ${style.statusBadge} ${
                          isZeroStock
                            ? 'bg-slate-200 text-slate-600'
                            : isLowStock
                              ? 'bg-amber-100 text-amber-800 border border-amber-200/40 animate-pulse'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-100/60'
                        }`}
                      >
                        {isZeroStock ? '已售空' : isLowStock ? '低库存预警' : '常备在库'}
                      </span>
                    </div>

                    {/* Batch Code */}
                    <div className="space-y-1">
                      <span className={`font-bold text-slate-400 uppercase tracking-wider block font-mono ${style.titleLabel}`}>
                        产品批次
                      </span>
                      <h4 className={`${style.titleVal} text-slate-800 font-mono tracking-tight leading-none`}>
                        {highlightText(batch.batchCode, searchQuery)}
                      </h4>
                    </div>

                    {/* Specification & Shelf details */}
                    <div className={density === 'standard' ? style.gridBox : `grid grid-cols-2 ${style.gridBox} bg-slate-50 border border-slate-100/50`}>
                      <div className="space-y-0.5">
                        <span className={`font-bold text-slate-400 uppercase tracking-wider block ${style.gridLabel}`}>
                          卷膜规格
                        </span>
                        <div className={`flex items-center gap-1 text-slate-700 font-mono font-semibold ${style.gridVal}`}>
                          <Ruler className={`${style.gridIcon} text-slate-400 flex-shrink-0`} />
                          <span>{highlightText(batch.specification, searchQuery)}</span>
                        </div>
                      </div>

                      <div className={`space-y-0.5 border-l border-slate-200/60 pl-3`}>
                        <span className={`font-bold text-slate-400 uppercase tracking-wider block ${style.gridLabel}`}>
                          定置货架
                        </span>
                        <div className={`flex items-center gap-1 text-slate-800 font-mono font-bold ${style.gridVal}`}>
                          <MapPin className={`${style.gridIcon} text-emerald-500 flex-shrink-0`} />
                          <span>{highlightText(batch.shelf, searchQuery)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Stock Quantity Stats */}
                    <div className="flex items-center justify-between pt-1">
                      <div>
                        <span className={`font-bold text-slate-400 block font-mono ${style.stockLabel}`}>
                          当前在库数量
                        </span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span
                            className={`font-black font-mono tracking-tight ${style.stockVal} ${
                              isZeroStock
                                ? 'text-slate-400'
                                : isLowStock
                                  ? 'text-amber-600'
                                  : 'text-emerald-600'
                            }`}
                          >
                            {batch.totalStock}
                          </span>
                          <span className={`font-semibold text-slate-500 ${style.stockUnit}`}>支</span>
                        </div>
                      </div>

                      <div className="text-right space-y-0.5">
                        <div className={`font-mono text-slate-400 flex items-center gap-1 justify-end ${style.stockLog}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          <span>月入库: {batch.inflowQty} 支</span>
                        </div>
                        <div className={`font-mono text-slate-400 flex items-center gap-1 justify-end ${style.stockLog}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          <span>月出库: {batch.outflowQty} 支</span>
                        </div>
                      </div>
                    </div>

                    {/* Remarks alert block */}
                    {hasRemarks && (
                      <div className={density === 'standard' ? style.remarksBox : `${style.remarksBox} bg-rose-50/50 border border-rose-100/50 flex gap-1.5 items-start`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                          <span className={`font-bold text-rose-600 block uppercase ${style.remarksTitle}`}>
                            批次异常变动/特殊工艺备注
                          </span>
                          <p className={`font-medium text-slate-600 leading-normal ${style.remarksText}`}>
                            {highlightText(batch.remarks, searchQuery)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer Segment with Toggleable Daily Log */}
                  <div className={density === 'standard' ? style.footerPad : `border-t border-slate-100 bg-slate-50/40 ${style.footerPad}`}>
                    <button
                      onClick={() => toggleExpand(batch.id)}
                      className={density === 'standard' ? style.footerBtn : `w-full rounded-lg hover:bg-slate-100/60 transition-colors flex items-center justify-between font-semibold text-slate-500 ${style.footerBtn}`}
                    >
                      <span className="flex items-center gap-1">
                        <Calendar className={`${style.footerIcon} text-slate-400`} />
                        本月账目变动记录 ({activeDays.length})
                      </span>
                      {isExpanded ? (
                        <ChevronUp className={`${style.footerIcon} text-slate-400`} />
                      ) : (
                        <ChevronDown className={`${style.footerIcon} text-slate-400`} />
                      )}
                    </button>

                    {/* Expanded activities details */}
                    {isExpanded && (
                      <div className={density === 'standard' ? style.timelineBox : `${style.timelineBox} border-t border-slate-100 px-1 animate-fade-in`}>
                        {activeDays.length > 0 ? (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto no-scrollbar pr-1">
                            {activeDays.map((act) => (
                              <div
                                key={act.day}
                                className={density === 'standard' ? style.timelineItem : `flex items-center justify-between bg-white border border-slate-100 shadow-3xs font-mono ${style.timelineItem}`}
                              >
                                <span className="text-slate-500 font-semibold">{act.day}号 统计变动</span>
                                <div className="flex items-center gap-2">
                                  {act.inQty > 0 && (
                                    <span className="text-emerald-600 font-bold flex items-center gap-0.5">
                                      <ArrowUpRight className="w-2.5 h-2.5" />
                                      入库 +{act.inQty}
                                    </span>
                                  )}
                                  {act.outQty > 0 && (
                                    <span className="text-rose-600 font-bold flex items-center gap-0.5">
                                      <ArrowDownRight className="w-2.5 h-2.5" />
                                      出库 -{act.outQty}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic text-center py-2">
                            本期除初始结转外无其它出入库记录
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progressive Load More Controls */}
          {batches.length > visibleLimit && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setVisibleLimit(prev => Math.min(prev + 24, batches.length))}
                className="w-full sm:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                id="load-more-cards-btn"
              >
                <span>显示下 24 个批次</span>
                <span className="bg-emerald-500/50 px-1.5 py-0.5 rounded text-[10px] text-white">
                  还剩 {batches.length - visibleLimit} 个
                </span>
              </button>
              <button
                onClick={() => setVisibleLimit(batches.length)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                id="load-all-cards-btn"
              >
                一次性加载全部 ({batches.length}个)
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center text-slate-400 max-w-md mx-auto flex flex-col items-center justify-center gap-3 shadow-3xs">
          <Inbox className="w-8 h-8 text-slate-300" />
          <div>
            <h4 className="text-sm font-bold text-slate-700">没有检索到任何库存批次</h4>
            <p className="text-xs text-slate-500 mt-1">
              请检查您的检索关键词，或者调整快捷过滤开关。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
