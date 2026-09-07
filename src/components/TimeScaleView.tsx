import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { InventoryBatch, TransactionHistory } from '../types';
import {
  Calendar,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Layers,
  MapPin,
  Database,
  Play,
  Pause,
  BarChart2,
  ChevronRight,
  Activity,
  Maximize2,
  Minimize2,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLocalStorageState } from '../hooks/useLocalStorageState';

interface TimeScaleViewProps {
  batches: InventoryBatch[];
  transactions: TransactionHistory[];
  currentMonth: string;
}

export default function TimeScaleView({ batches, transactions, currentMonth }: TimeScaleViewProps) {
  const [selectedDay, setSelectedDay] = useLocalStorageState<number>(
    'storage_foil_pref_v1_timeline_day',
    18,
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useLocalStorageState(
    'storage_foil_pref_v1_timeline_search',
    '',
  );
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [yearStr, monthStr] = useMemo(() => {
    if (!currentMonth || !currentMonth.includes('-')) return ['2026', '07'];
    return currentMonth.split('-');
  }, [currentMonth]);

  // Aggregate daily data (1 to 31) across ALL batches for the current month
  const dailyFlows = useMemo(() => {
    const flows = Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1;
      let totalIn = 0;
      let totalOut = 0;
      let batchCount = 0;

      batches.forEach((b) => {
        const act = b.dailyActivities.find((a) => a.day === dayNum);
        if (act) {
          totalIn += act.inQty;
          totalOut += act.outQty;
          if (act.inQty > 0 || act.outQty > 0) {
            batchCount++;
          }
        }
      });

      return {
        day: dayNum,
        inflow: totalIn,
        outflow: totalOut,
        net: totalIn - totalOut,
        activeBatches: batchCount,
      };
    });
    return flows;
  }, [batches]);

  // General monthly summary stats
  const stats = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let activeDaysCount = 0;
    let peakVolume = 0;
    let peakDay = 1;

    dailyFlows.forEach((f) => {
      totalIn += f.inflow;
      totalOut += f.outflow;
      const volume = f.inflow + f.outflow;
      if (volume > 0) activeDaysCount++;
      if (volume > peakVolume) {
        peakVolume = volume;
        peakDay = f.day;
      }
    });

    const netChange = totalIn - totalOut;

    return {
      totalIn,
      totalOut,
      netChange,
      activeDaysCount,
      peakDay,
      peakVolume,
    };
  }, [dailyFlows]);

  // Auto-play time-travel slider
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setSelectedDay((prev) => {
          if (prev >= 31) {
            setIsPlaying(false);
            return 1;
          }
          return prev + 1;
        });
      }, 700);
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    }

    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current);
      }
    };
  }, [isPlaying]);

  // Re-calculate inventory state of each batch at the END of selectedDay
  // Formula: cumulative starting balance + all inflows up to selectedDay - all outflows up to selectedDay
  const historicalStateAtSelectedDay = useMemo(() => {
    return batches.map((b) => {
      let cumulativeIn = 0;
      let cumulativeOut = 0;

      b.dailyActivities.forEach((act) => {
        if (act.day <= selectedDay) {
          cumulativeIn += act.inQty;
          cumulativeOut += act.outQty;
        }
      });

      const stockAtDay = Math.max(0, cumulativeIn - cumulativeOut);

      return {
        ...b,
        stockAtDay,
        cumulativeIn,
        cumulativeOut,
      };
    });
  }, [batches, selectedDay]);

  // Group and sort model stocks on the selected day
  const modelStocksAtDay = useMemo(() => {
    const modelMap: Record<string, { inQty: number; outQty: number; stock: number; count: number }> = {};

    historicalStateAtSelectedDay.forEach((b) => {
      if (!modelMap[b.productModel]) {
        modelMap[b.productModel] = { inQty: 0, outQty: 0, stock: 0, count: 0 };
      }
      modelMap[b.productModel].stock += b.stockAtDay;
      modelMap[b.productModel].count++;
      
      // Calculate selected day specific activity for models
      const currentDayAct = b.dailyActivities.find(a => a.day === selectedDay);
      if (currentDayAct) {
        modelMap[b.productModel].inQty += currentDayAct.inQty;
        modelMap[b.productModel].outQty += currentDayAct.outQty;
      }
    });

    return Object.entries(modelMap)
      .map(([model, data]) => ({
        model,
        ...data,
      }))
      .sort((a, b) => b.stock - a.stock);
  }, [historicalStateAtSelectedDay, selectedDay]);

  // Group shelf stock levels on the selected day
  const shelfStocksAtDay = useMemo(() => {
    const shelfMap: Record<string, { stock: number; batchesCount: number; activeToday: boolean }> = {};

    historicalStateAtSelectedDay.forEach((b) => {
      if (!shelfMap[b.shelf]) {
        shelfMap[b.shelf] = { stock: 0, batchesCount: 0, activeToday: false };
      }
      shelfMap[b.shelf].stock += b.stockAtDay;
      shelfMap[b.shelf].batchesCount++;

      const currentDayAct = b.dailyActivities.find(a => a.day === selectedDay);
      if (currentDayAct && (currentDayAct.inQty > 0 || currentDayAct.outQty > 0)) {
        shelfMap[b.shelf].activeToday = true;
      }
    });

    return Object.entries(shelfMap)
      .map(([shelf, data]) => ({
        shelf,
        ...data,
      }))
      .sort((a, b) => b.stock - a.stock);
  }, [historicalStateAtSelectedDay, selectedDay]);

  // Filter transactions for the selected day
  const transactionsAtDay = useMemo(() => {
    return transactions.filter((t) => t.day === selectedDay);
  }, [transactions, selectedDay]);

  // Generate SVG path coordinate points for the daily trend chart
  const chartCoordinates = useMemo(() => {
    const width = 1000;
    const height = 140;
    const padding = 20;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Find max value for scaling
    let maxValue = 10;
    dailyFlows.forEach((f) => {
      if (f.inflow > maxValue) maxValue = f.inflow;
      if (f.outflow > maxValue) maxValue = f.outflow;
    });
    maxValue = Math.ceil(maxValue * 1.15); // 15% head room

    const getX = (index: number) => padding + (index / 30) * graphWidth;
    const getY = (value: number) => height - padding - (value / maxValue) * graphHeight;

    let inflowPoints = '';
    let outflowPoints = '';
    let inflowArea = `M ${getX(0)} ${height - padding} `;
    let outflowArea = `M ${getX(0)} ${height - padding} `;

    dailyFlows.forEach((f, idx) => {
      const x = getX(idx);
      const yIn = getY(f.inflow);
      const yOut = getY(f.outflow);

      if (idx === 0) {
        inflowPoints += `M ${x} ${yIn} `;
        outflowPoints += `M ${x} ${yOut} `;
      } else {
        inflowPoints += `L ${x} ${yIn} `;
        outflowPoints += `L ${x} ${yOut} `;
      }

      inflowArea += `L ${x} ${yIn} `;
      outflowArea += `L ${x} ${yOut} `;
    });

    inflowArea += `L ${getX(30)} ${height - padding} Z`;
    outflowArea += `L ${getX(30)} ${height - padding} Z`;

    return {
      points: dailyFlows.map((f, idx) => ({
        x: getX(idx),
        yIn: getY(f.inflow),
        yOut: getY(f.outflow),
        day: f.day,
        inflow: f.inflow,
        outflow: f.outflow,
      })),
      inflowLine: inflowPoints,
      outflowLine: outflowPoints,
      inflowArea,
      outflowArea,
      maxValue,
      width,
      height,
      padding,
    };
  }, [dailyFlows]);

  // Compute overall current status of selected day
  const activeDayStats = dailyFlows[selectedDay - 1] || { inflow: 0, outflow: 0, net: 0, activeBatches: 0 };
  const totalStockAtSelectedDay = historicalStateAtSelectedDay.reduce((sum, b) => sum + b.stockAtDay, 0);

  // Filter historical batches based on query for inline list
  const filteredHistoricalBatches = useMemo(() => {
    return historicalStateAtSelectedDay.filter(b => {
      const query = searchQuery.toLowerCase();
      return !searchQuery || 
        b.batchCode.toLowerCase().includes(query) ||
        b.productModel.toLowerCase().includes(query) ||
        b.shelf.toLowerCase().includes(query) ||
        b.specification.toLowerCase().includes(query);
    });
  }, [historicalStateAtSelectedDay, searchQuery]);

  return (
    <div className="space-y-5 font-sans" id="time-scale-container">
      {/* Dynamic Title Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center border border-emerald-100 shadow-4xs flex-shrink-0">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
              <span>时间尺度出入库变动与库存回溯看板</span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-mono">
                {yearStr}年{monthStr}月
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              通过日历热力图、出入库走势和时间旅行滑块，动态回溯整月任意一天库存的精准快照
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${
              isPlaying
                ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-3xs'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600 shadow-xs'
            }`}
            id="timeline-play-btn"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-amber-800 text-amber-800" />
                <span>暂停模拟</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white text-white" />
                <span>自动播放整月 (Play)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Aggregate Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">月度总入库量</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black font-mono text-emerald-600 tracking-tight">{stats.totalIn}</span>
              <span className="text-xs font-semibold text-slate-400">支</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600">
            <ArrowUpRight className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">月度总出库量</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black font-mono text-rose-600 tracking-tight">{stats.totalOut}</span>
              <span className="text-xs font-semibold text-slate-400">支</span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
            <ArrowDownRight className="w-4.5 h-4.5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">净差变动 (Net)</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black font-mono tracking-tight ${
                stats.netChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                {stats.netChange >= 0 ? `+${stats.netChange}` : stats.netChange}
              </span>
              <span className="text-xs font-semibold text-slate-400">支</span>
            </div>
          </div>
          <div className={`p-2.5 rounded-xl ${
            stats.netChange >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
          }`}>
            {stats.netChange >= 0 ? <TrendingUp className="w-4.5 h-4.5" /> : <TrendingDown className="w-4.5 h-4.5" />}
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-100 shadow-3xs flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 block tracking-wider uppercase">活动频率与高峰</span>
            <div className="flex items-baseline gap-1">
              <span className="text-xs font-semibold text-slate-500">
                活跃 <span className="font-bold text-slate-800 font-mono">{stats.activeDaysCount}</span> 天 / Peak 
              </span>
              <span className="text-sm font-black text-emerald-700 font-mono bg-emerald-50 px-1 py-0.2 rounded">
                {stats.peakDay}号 ({stats.peakVolume}支)
              </span>
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 text-slate-500">
            <Activity className="w-4.5 h-4.5" />
          </div>
        </div>
      </div>

      {/* Main Timeline SVG Chart Component */}
      <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4.5 h-4.5 text-emerald-600" />
            <h3 className="text-xs font-bold text-slate-700">月度日出入库流量曲线走势 (1-31日)</h3>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold">
            <span className="flex items-center gap-1 text-emerald-600">
              <span className="w-2.5 h-1 bg-emerald-500 rounded"></span>
              当日入库
            </span>
            <span className="flex items-center gap-1 text-rose-500">
              <span className="w-2.5 h-1 bg-rose-400 rounded"></span>
              当日出库
            </span>
            <span className="text-slate-400 font-mono hidden sm:inline">
              上限: {chartCoordinates.maxValue}支
            </span>
          </div>
        </div>

        {/* Custom High-Fidelity SVG Graphic with Line Plot and Areas */}
        <div className="relative w-full overflow-x-auto scrollbar-none">
          <div className="min-w-[700px] select-none h-40">
            <svg
              viewBox={`0 0 ${chartCoordinates.width} ${chartCoordinates.height}`}
              className="w-full h-full overflow-visible"
            >
              {/* Grid Background Lines */}
              {Array.from({ length: 5 }).map((_, idx) => {
                const y = chartCoordinates.padding + (idx / 4) * (chartCoordinates.height - chartCoordinates.padding * 2);
                const val = Math.round(chartCoordinates.maxValue * (1 - idx / 4));
                return (
                  <g key={idx} className="opacity-30">
                    <line
                      x1={chartCoordinates.padding}
                      y1={y}
                      x2={chartCoordinates.width - chartCoordinates.padding}
                      y2={y}
                      stroke="#cbd5e1"
                      strokeWidth="1"
                      strokeDasharray="4,4"
                    />
                    <text
                      x={chartCoordinates.padding - 4}
                      y={y + 3}
                      textAnchor="end"
                      fill="#94a3b8"
                      className="text-[9px] font-mono font-bold"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* Day Coordinates Labels (Bottom axis) */}
              {chartCoordinates.points.map((pt, idx) => {
                if (idx % 2 === 0) { // every second label
                  return (
                    <text
                      key={idx}
                      x={pt.x}
                      y={chartCoordinates.height - 4}
                      textAnchor="middle"
                      fill={selectedDay === pt.day ? '#059669' : '#94a3b8'}
                      className={`text-[9px] font-mono font-bold ${
                        selectedDay === pt.day ? 'scale-110 font-black' : ''
                      }`}
                    >
                      {pt.day}日
                    </text>
                  );
                }
                return null;
              })}

              {/* Inflow Area & Stroke */}
              <path
                d={chartCoordinates.inflowArea}
                fill="url(#inflowGradient)"
                className="transition-all duration-300"
              />
              <path
                d={chartCoordinates.inflowLine}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-300"
              />

              {/* Outflow Area & Stroke */}
              <path
                d={chartCoordinates.outflowArea}
                fill="url(#outflowGradient)"
                className="transition-all duration-300"
              />
              <path
                d={chartCoordinates.outflowLine}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-all duration-300"
              />

              {/* Hover Trigger Vertical Highlight Bars */}
              {chartCoordinates.points.map((pt) => {
                const isActive = selectedDay === pt.day;
                return (
                  <g key={pt.day}>
                    {/* Interaction transparent hitbar */}
                    <rect
                      x={pt.x - 12}
                      y={chartCoordinates.padding}
                      width={24}
                      height={chartCoordinates.height - chartCoordinates.padding * 2}
                      fill="transparent"
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedDay(pt.day);
                        setIsPlaying(false);
                      }}
                    />
                    {/* Selected Day Indicator Vertical Line */}
                    {isActive && (
                      <line
                        x1={pt.x}
                        y1={chartCoordinates.padding}
                        x2={pt.x}
                        y2={chartCoordinates.height - chartCoordinates.padding}
                        stroke="#059669"
                        strokeWidth="1.5"
                        strokeDasharray="2,2"
                      />
                    )}
                    {/* Small circle data points on line */}
                    {(pt.inflow > 0 || pt.outflow > 0 || isActive) && (
                      <>
                        {pt.inflow > 0 && (
                          <circle
                            cx={pt.x}
                            cy={pt.yIn}
                            r={isActive ? 4.5 : 3}
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="1"
                            className="cursor-pointer"
                          />
                        )}
                        {pt.outflow > 0 && (
                          <circle
                            cx={pt.x}
                            cy={pt.yOut}
                            r={isActive ? 4.5 : 3}
                            fill="#f43f5e"
                            stroke="#ffffff"
                            strokeWidth="1"
                            className="cursor-pointer"
                          />
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {/* Definitions of Color Gradients */}
              <defs>
                <linearGradient id="inflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                </linearGradient>
                <linearGradient id="outflowGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.01" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Calendar Heatmap and Play Slider Control Block */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Heatmap Calendar Section */}
        <div className="xl:col-span-2 bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-600" />
                <span>整月出入库账目走势日历热力图</span>
              </h3>
              <p className="text-[10px] text-slate-400">
                单元格亮度根据当天累计流转量(入库+出库)渲染，点击任意日期锁定时间并回溯状态
              </p>
            </div>
            <div className="flex items-center gap-2.5 text-[9px] text-slate-500 font-semibold self-start sm:self-center">
              <span>热度等级:</span>
              <div className="flex items-center gap-1">
                <span className="w-3 h-3 bg-slate-50 border border-slate-100 rounded"></span>
                <span>无活动</span>
                <span className="w-3 h-3 bg-emerald-50 rounded"></span>
                <span>轻微</span>
                <span className="w-3 h-3 bg-emerald-100 rounded"></span>
                <span>温和</span>
                <span className="w-3 h-3 bg-emerald-500 rounded"></span>
                <span>密集</span>
                <span className="w-3 h-3 bg-amber-500 rounded"></span>
                <span>极度频繁</span>
              </div>
            </div>
          </div>

          {/* Grid Layout representing Month Days */}
          <div className="grid grid-cols-7 gap-2">
            {/* Header Labels */}
            {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
              <div key={w} className="text-center text-[10px] font-bold text-slate-400 py-1 bg-slate-50 rounded">
                周{w}
              </div>
            ))}

            {/* Days placeholder padding (for a clean visual offset to align days) */}
            {/* Suppose our month 2026-07 starts on Wednesday (2 offsets) */}
            {Array.from({ length: 2 }).map((_, idx) => (
              <div key={`offset-${idx}`} className="bg-slate-50/20 rounded-xl border border-dashed border-slate-100/40"></div>
            ))}

            {/* Calendar Days blocks */}
            {dailyFlows.map((flow) => {
              const isSelected = selectedDay === flow.day;
              const totalVolume = flow.inflow + flow.outflow;

              // Determine color class based on volume
              let bgClass = 'bg-slate-50 hover:bg-slate-100 border-slate-150 text-slate-600';
              if (totalVolume > 0) {
                if (totalVolume <= 10) bgClass = 'bg-emerald-50 text-emerald-800 border-emerald-100/80 hover:bg-emerald-100/60';
                else if (totalVolume <= 30) bgClass = 'bg-emerald-100 text-emerald-900 border-emerald-200/60 hover:bg-emerald-200/40';
                else if (totalVolume <= 70) bgClass = 'bg-emerald-500 text-white border-emerald-600 hover:bg-emerald-600';
                else bgClass = 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600';
              }

              return (
                <button
                  key={flow.day}
                  onClick={() => {
                    setSelectedDay(flow.day);
                    setIsPlaying(false);
                  }}
                  className={`relative p-2 h-14 rounded-xl border transition-all flex flex-col justify-between items-start text-left cursor-pointer ${bgClass} ${
                    isSelected
                      ? 'ring-2 ring-emerald-500 ring-offset-2 scale-102 font-black z-10 shadow-sm'
                      : ''
                  }`}
                >
                  <span className={`text-[11px] font-mono font-bold ${
                    isSelected ? 'underline' : ''
                  }`}>
                    {flow.day}
                  </span>

                  {/* Tiny values */}
                  {totalVolume > 0 && (
                    <div className="w-full flex flex-col text-[8px] leading-tight font-mono opacity-90 font-bold">
                      {flow.inflow > 0 && (
                        <span className={totalVolume <= 30 ? 'text-emerald-700' : 'text-emerald-100'}>
                          +{flow.inflow}
                        </span>
                      )}
                      {flow.outflow > 0 && (
                        <span className={totalVolume <= 30 ? 'text-rose-600' : 'text-rose-100'}>
                          -{flow.outflow}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Day Profile Card with Interactive Time Machine */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="space-y-0.5">
                <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider block">
                  时间旅行快照 (TIME TRAVEL)
                </span>
                <h3 className="text-sm font-bold text-slate-800 font-display">
                  {yearStr}年{monthStr}月{selectedDay}日 状态回溯
                </h3>
              </div>
              <span className="w-8.5 h-8.5 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black font-mono text-xs border border-emerald-100 shadow-4xs">
                {selectedDay}
              </span>
            </div>

            {/* Quick Metrics of the selected day */}
            <div className="space-y-2 bg-slate-50/50 p-3 rounded-xl border border-slate-100/60">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">当天在库总数(回溯值)</span>
                <span className="font-bold font-mono text-slate-800">{totalStockAtSelectedDay} 支</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">当日入库量 (In)</span>
                <span className="font-bold font-mono text-emerald-600">+{activeDayStats.inflow} 支</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">当日出库量 (Out)</span>
                <span className="font-bold font-mono text-rose-500">-{activeDayStats.outflow} 支</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400 font-medium">当日活跃批次数</span>
                <span className="font-bold font-mono text-slate-700">{activeDayStats.activeBatches} 个</span>
              </div>
            </div>

            {/* Simulated Stock Level Progress bar */}
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>1号 期初状态</span>
                <span>当前选中: {selectedDay}日</span>
                <span>31号 期末</span>
              </div>

              {/* Slider Input with modern thumb */}
              <div className="relative flex items-center">
                <input
                  type="range"
                  min="1"
                  max="31"
                  value={selectedDay}
                  onChange={(e) => {
                    setSelectedDay(Number(e.target.value));
                    setIsPlaying(false);
                  }}
                  className="w-full h-2 bg-slate-150 rounded-lg appearance-none cursor-pointer accent-emerald-600 outline-hidden focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Interactive Play Timeline Button Group */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={() => {
                setSelectedDay((prev) => Math.max(1, prev - 1));
                setIsPlaying(false);
              }}
              className="flex-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg text-center transition-all cursor-pointer"
            >
              前一日
            </button>
            <button
              onClick={() => {
                setSelectedDay((prev) => Math.min(31, prev + 1));
                setIsPlaying(false);
              }}
              className="flex-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg text-center transition-all cursor-pointer"
            >
              后一日
            </button>
            <button
              onClick={() => {
                setSelectedDay(new Date().getDate() <= 31 ? new Date().getDate() : 18);
                setIsPlaying(false);
              }}
              className="px-2.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
              title="回到今天"
            >
              今日
            </button>
          </div>
        </div>
      </div>

      {/* Historical Stock State breakdown on selectedDay */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Model breakdown at Day X */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>当日型号级在库回溯占比</span>
            </h3>
            <p className="text-[10px] text-slate-400">
              各产品型号在第 {selectedDay} 日结束时的总计囤放量与本日流水变动
            </p>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[280px] pr-1.5 scrollbar-none space-y-1 pt-2 flex-1">
            {modelStocksAtDay.map((m) => {
              const maxStock = Math.max(...modelStocksAtDay.map(md => md.stock)) || 1;
              const percent = (m.stock / maxStock) * 100;
              return (
                <div key={m.model} className="py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 font-mono">型号: {m.model}</span>
                    <div className="flex items-center gap-2">
                      {m.inQty > 0 && (
                        <span className="text-[9px] font-mono text-emerald-600 bg-emerald-50 px-1 py-0.2 rounded font-bold">
                          +{m.inQty}入
                        </span>
                      )}
                      {m.outQty > 0 && (
                        <span className="text-[9px] font-mono text-rose-600 bg-rose-50 px-1 py-0.2 rounded font-bold">
                          -{m.outQty}出
                        </span>
                      )}
                      <span className="font-semibold text-slate-400 text-[10px]">{m.count} 批次</span>
                      <span className="font-black text-slate-800 font-mono text-right min-w-[40px]">{m.stock} 支</span>
                    </div>
                  </div>
                  {/* Miniature visual bar */}
                  <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Shelf Capacity breakdown at Day X */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span>货架占用回溯分析</span>
            </h3>
            <p className="text-[10px] text-slate-400">
              各定置排位货架在第 {selectedDay} 日结束时的在库堆叠饱和度
            </p>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[280px] pr-1.5 scrollbar-none space-y-1 pt-2 flex-1">
            {shelfStocksAtDay.map((s) => {
              const maxStock = Math.max(...shelfStocksAtDay.map(sd => sd.stock)) || 1;
              const percent = (s.stock / maxStock) * 100;
              return (
                <div key={s.shelf} className="py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-800 font-mono">{s.shelf} 货位</span>
                      {s.activeToday && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" title="当日有流水" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-400 text-[10px]">{s.batchesCount} 个叠放批</span>
                      <span className="font-black text-slate-800 font-mono text-right min-w-[40px]">{s.stock} 支</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Transactions Logger on Day X */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-3 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-emerald-600" />
                <span>当日交易流水变动明细</span>
              </h3>
              <span className="text-[9px] bg-slate-100 text-slate-600 font-mono px-1.5 py-0.5 rounded">
                共 {transactionsAtDay.length} 笔交易
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              第 {selectedDay} 日发生的所有出入库手工统计变动和结转记录
            </p>
          </div>

          <div className="overflow-y-auto max-h-[280px] pr-1.5 scrollbar-none space-y-2 pt-2 flex-1">
            {transactionsAtDay.length > 0 ? (
              transactionsAtDay.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3 bg-slate-50/60 rounded-xl border border-slate-100/80 hover:bg-slate-50 transition-all text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-slate-800">{tx.batchCode}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                      tx.type === 'in'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {tx.type === 'in' ? '入库' : '出库'} +{tx.qty} 支
                    </span>
                  </div>
                  {tx.notes && <p className="text-[10px] text-slate-500 italic">{tx.notes}</p>}
                  <div className="flex justify-between text-[8px] text-slate-400 font-mono pt-1">
                    <span>型号: {tx.productModel}</span>
                    <span>操作: {tx.operator}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 italic text-[11px] gap-2">
                <Calendar className="w-8 h-8 stroke-1 text-slate-300" />
                <span>该日期当天无变动业务流水记录</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Inventory List under Time Travel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-xs overflow-hidden" id="historical-batches-section">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>第 {selectedDay} 日结束时 全库批次库存快照一览</span>
            </h3>
            <p className="text-[10px] text-slate-400">
              数据精准对应到指定日期结束时的快照，支持任意型号、货架和规格的检索过滤
            </p>
          </div>

          {/* Inline search bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索批次/型号/规格/货架..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8.5 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-hidden focus:ring-1 focus:ring-emerald-500/20 focus:border-emerald-500 font-sans transition-all"
            />
          </div>
        </div>

        {/* Dense Responsive Table view */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-400 tracking-wider font-sans">
                <th className="py-2.5 px-4 font-semibold">产品批次</th>
                <th className="py-2.5 px-4 font-semibold">产品型号</th>
                <th className="py-2.5 px-4 font-semibold">卷膜规格</th>
                <th className="py-2.5 px-4 font-semibold">定置货架</th>
                <th className="py-2.5 px-4 font-semibold text-right">本日初累计入</th>
                <th className="py-2.5 px-4 font-semibold text-right">本日初累计出</th>
                <th className="py-2.5 px-4 font-semibold text-right">回溯在库数</th>
                <th className="py-2.5 px-4 font-semibold text-center">状态说明</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-sans">
              {filteredHistoricalBatches.length > 0 ? (
                filteredHistoricalBatches.map((b) => {
                  const isZeroAtDay = b.stockAtDay === 0;
                  const isLowAtDay = b.stockAtDay > 0 && b.stockAtDay <= 5;

                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-slate-50/40 transition-colors font-mono ${
                        isZeroAtDay ? 'opacity-55 bg-slate-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-800">{b.batchCode}</td>
                      <td className="py-2.5 px-4">
                        <span className="px-1.5 py-0.5 rounded-md bg-slate-100 border border-slate-200/50 text-slate-600 font-bold text-[10px]">
                          {b.productModel}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500 font-semibold">{b.specification}</td>
                      <td className="py-2.5 px-4 font-bold text-emerald-700">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-emerald-500" />
                          <span>{b.shelf}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-600 font-medium">+{b.cumulativeIn} 支</td>
                      <td className="py-2.5 px-4 text-right text-rose-500 font-medium">-{b.cumulativeOut} 支</td>
                      <td className={`py-2.5 px-4 text-right font-black ${
                        isZeroAtDay ? 'text-slate-400' : isLowAtDay ? 'text-amber-600' : 'text-slate-800'
                      }`}>
                        {b.stockAtDay} 支
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          isZeroAtDay
                            ? 'bg-slate-100 text-slate-500'
                            : isLowAtDay
                              ? 'bg-amber-100 text-amber-800 border border-amber-200/30'
                              : 'bg-emerald-50 text-emerald-800 border border-emerald-100/50'
                        }`}>
                          {isZeroAtDay ? '无在库' : isLowAtDay ? '极低库存' : '库存充足'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 italic font-medium">
                    无匹配的历史快照数据批次项
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
